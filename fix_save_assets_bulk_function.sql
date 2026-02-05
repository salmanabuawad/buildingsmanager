-- ============================================================================
-- Fix: Create/Refresh save_assets_bulk_transactional function in Supabase
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Open Supabase Dashboard -> SQL Editor
-- 2. Copy and paste ALL contents of this file
-- 3. Click "Run" to execute
-- 4. Wait 2-3 minutes for schema cache to refresh
-- 5. Restart your application
--
-- ============================================================================

-- Drop all existing versions of the function to ensure clean replacement
DROP FUNCTION IF EXISTS public.save_assets_bulk_transactional CASCADE;

-- Helper function to extract boolean from JSONB (used for boolean checkbox fields)
CREATE OR REPLACE FUNCTION public.extract_boolean_from_jsonb(p_value JSONB, p_default BOOLEAN DEFAULT false)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN p_default;
  END IF;
  
  IF jsonb_typeof(p_value) = 'boolean' THEN
    RETURN (p_value)::text::boolean;
  END IF;
  
  IF jsonb_typeof(p_value) = 'string' THEN
    RETURN CASE 
      WHEN LOWER((p_value)::text) IN ('true', '1') OR (p_value)::text = 'כן' THEN true 
      ELSE false 
    END;
  END IF;
  
  RETURN p_default;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Main function: save_assets_bulk_transactional
-- This is the complete function from migration: 20260126212018_fix_data_type_casts_in_save_bulk_transactional.sql

CREATE OR REPLACE FUNCTION public.save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_is_business_context BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_asset_data JSONB;
v_asset_id BIGINT;
v_building_number BIGINT;
v_existing_asset RECORD;
v_old_main_asset_type TEXT;
v_new_main_asset_type TEXT;
v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
v_count INTEGER := 0;
v_result JSONB;
v_user_id_fk BIGINT;
v_default_user_id BIGINT := 1;
v_building_num_for_flag BIGINT;
v_distribution_type TEXT;
v_asset_type_name TEXT;
v_business_residence TEXT;
v_business_dist_area NUMERIC;
v_old_asset_size NUMERIC;
v_new_asset_size NUMERIC;
v_asset_old_values RECORD;
v_before_data_collected JSONB := NULL;
v_after_data_collected JSONB := NULL;
v_before_assets JSONB[] := ARRAY[]::JSONB[];
v_after_assets JSONB[] := ARRAY[]::JSONB[];
v_building_data JSONB := NULL;
v_first_building_number BIGINT := NULL;
v_asset_record RECORD;
v_asset_jsonb JSONB;
v_entity_asset_ids BIGINT[];
v_overload_ratio NUMERIC := NULL;
v_type_changed BOOLEAN := FALSE;
v_size_changed BOOLEAN := FALSE;
v_tax_region_changed BOOLEAN := FALSE;
v_asset_found BOOLEAN := FALSE;
v_old_tax_region INTEGER;
v_new_tax_region INTEGER;
v_old_business_residence TEXT;
v_new_business_residence TEXT;
v_business_to_residence BOOLEAN := FALSE;
v_building_record RECORD;
v_shared_area_size NUMERIC := NULL;
v_audit_distribution_type TEXT := NULL;
v_audit_id BIGINT := NULL;
v_entity_id TEXT;
BEGIN
-- Get or create user
IF p_user_id IS NOT NULL THEN
SELECT user_id INTO v_user_id_fk
FROM users
WHERE auth_user_id = p_user_id;

IF v_user_id_fk IS NULL THEN
INSERT INTO users (auth_user_id, user_name, user_email)
VALUES (p_user_id, p_user_id, NULL)
ON CONFLICT (auth_user_id) DO NOTHING
RETURNING user_id INTO v_user_id_fk;

IF v_user_id_fk IS NULL THEN
SELECT user_id INTO v_user_id_fk FROM users WHERE auth_user_id = p_user_id;
END IF;
END IF;
ELSE
BEGIN
SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
EXCEPTION WHEN OTHERS THEN
SELECT user_id INTO v_default_user_id
FROM users
WHERE user_name = 'default' AND auth_user_id IS NULL
LIMIT 1;
v_user_id_fk := v_default_user_id;
END;
END IF;

IF v_user_id_fk IS NULL THEN
SELECT user_id INTO v_default_user_id
FROM users
WHERE user_name = 'default' AND auth_user_id IS NULL
LIMIT 1;
v_user_id_fk := v_default_user_id;
END IF;

-- Get first building number
IF array_length(p_assets_data, 1) > 0 THEN
v_first_building_number := (p_assets_data[1]->>'building_number')::BIGINT;
END IF;

-- Collect BEFORE data if needed
IF ((p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb) OR p_action_type = 'transfer_area')
AND v_first_building_number IS NOT NULL THEN
IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution', 'transfer_area') THEN
FOR v_asset_record IN 
SELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
elevator, single_double_family, condo, townhouses, penthouse,
structure_drawing_url, discount_type, discount_date_from, discount_date_to,
business_distribution_area, exported_to_automation, comment, created_at, updated_at, is_new_measurement
FROM assets 
WHERE building_number = v_first_building_number
ORDER BY asset_id
LOOP
v_asset_jsonb := to_jsonb(v_asset_record);
v_before_assets := array_append(v_before_assets, v_asset_jsonb);
END LOOP;
ELSE
FOREACH v_asset_data IN ARRAY p_assets_data
LOOP
v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
IF v_asset_id IS NOT NULL THEN
SELECT to_jsonb(a.*) INTO v_asset_jsonb
FROM assets a WHERE a.asset_id = v_asset_id;

IF v_asset_jsonb IS NOT NULL THEN
v_before_assets := array_append(v_before_assets, v_asset_jsonb);
END IF;
END IF;
END LOOP;
END IF;

SELECT jsonb_agg(elem) INTO v_before_data_collected FROM unnest(v_before_assets) AS elem;
v_before_data_collected := jsonb_build_object('assets', COALESCE(v_before_data_collected, '[]'::jsonb));
ELSE
v_before_data_collected := p_before_data;
END IF;

-- Process each asset
FOREACH v_asset_data IN ARRAY p_assets_data
LOOP
v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
v_building_number := (v_asset_data->>'building_number')::BIGINT;
v_new_main_asset_type := (v_asset_data->>'main_asset_type')::TEXT;

IF v_asset_id IS NULL OR v_building_number IS NULL THEN
RAISE EXCEPTION 'Asset ID and Building Number required';
END IF;

IF v_building_num_for_flag IS NULL THEN
v_building_num_for_flag := v_building_number;
END IF;

SELECT * INTO v_existing_asset FROM assets WHERE asset_id = v_asset_id;
v_asset_found := FOUND;

IF v_asset_found THEN
v_old_main_asset_type := v_existing_asset.main_asset_type;
v_old_asset_size := v_existing_asset.asset_size;
v_old_tax_region := v_existing_asset.tax_region;
ELSE
v_old_main_asset_type := NULL;
v_old_asset_size := NULL;
v_old_tax_region := NULL;
END IF;

IF NOT v_asset_found THEN
-- INSERT new asset (fixed type casts: tax_region to INTEGER)
INSERT INTO assets (
asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3,
sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url,
discount_type, discount_date_from, discount_date_to, business_distribution_area, exported_to_automation, comment
)
VALUES (
v_asset_id, v_building_number, (v_asset_data->>'payer_id')::TEXT,
COALESCE((v_asset_data->>'measurement_date')::TEXT, '01/01/1900'), v_new_main_asset_type,
COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0), (v_asset_data->>'tax_region')::INTEGER,
(v_asset_data->>'sub_asset_type_1')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
(v_asset_data->>'sub_asset_type_2')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
(v_asset_data->>'sub_asset_type_3')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
(v_asset_data->>'sub_asset_type_4')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
(v_asset_data->>'sub_asset_type_5')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
(v_asset_data->>'sub_asset_type_6')::TEXT, COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
extract_boolean_from_jsonb(v_asset_data->'elevator', false),
extract_boolean_from_jsonb(v_asset_data->'single_double_family', false),
extract_boolean_from_jsonb(v_asset_data->'condo', false),
extract_boolean_from_jsonb(v_asset_data->'townhouses', false),
extract_boolean_from_jsonb(v_asset_data->'penthouse', false),
(v_asset_data->>'structure_drawing_url')::TEXT,
(v_asset_data->>'discount_type')::TEXT, (v_asset_data->>'discount_date_from')::TEXT,
(v_asset_data->>'discount_date_to')::TEXT, (v_asset_data->>'business_distribution_area')::NUMERIC,
extract_boolean_from_jsonb(v_asset_data->'exported_to_automation', false), (v_asset_data->>'comment')::TEXT
);
ELSE
-- UPDATE existing asset (fixed type casts: tax_region to INTEGER)
IF extract_boolean_from_jsonb(v_asset_data->'is_new_measurement', false) = true THEN
INSERT INTO assets_history (
  asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  elevator, single_double_family, condo, townhouses, penthouse,
  structure_drawing_url, discount_type, discount_date_from, discount_date_to,
  business_distribution_area, exported_to_automation, comment, created_at, updated_at,
  apartment_number, apartment_floor, storage_number, storage_floor,
  data_from_automation
)
SELECT 
  asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
  sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
  sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
  sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
  elevator, single_double_family, condo, townhouses, penthouse,
  structure_drawing_url, discount_type, discount_date_from, discount_date_to,
  business_distribution_area, exported_to_automation, comment, created_at, updated_at,
  apartment_number, apartment_floor, storage_number, storage_floor,
  data_from_automation
FROM assets WHERE asset_id = v_asset_id;
END IF;

UPDATE assets SET
building_number = COALESCE(v_building_number, building_number),
payer_id = COALESCE((v_asset_data->>'payer_id')::TEXT, payer_id),
measurement_date = COALESCE((v_asset_data->>'measurement_date')::TEXT, measurement_date),
main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, asset_size),
tax_region = COALESCE((v_asset_data->>'tax_region')::INTEGER, tax_region),
sub_asset_type_1 = COALESCE((v_asset_data->>'sub_asset_type_1')::TEXT, sub_asset_type_1),
sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, sub_asset_size_1),
sub_asset_type_2 = COALESCE((v_asset_data->>'sub_asset_type_2')::TEXT, sub_asset_type_2),
sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, sub_asset_size_2),
sub_asset_type_3 = COALESCE((v_asset_data->>'sub_asset_type_3')::TEXT, sub_asset_type_3),
sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, sub_asset_size_3),
sub_asset_type_4 = COALESCE((v_asset_data->>'sub_asset_type_4')::TEXT, sub_asset_type_4),
sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, sub_asset_size_4),
sub_asset_type_5 = COALESCE((v_asset_data->>'sub_asset_type_5')::TEXT, sub_asset_type_5),
sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, sub_asset_size_5),
sub_asset_type_6 = COALESCE((v_asset_data->>'sub_asset_type_6')::TEXT, sub_asset_type_6),
sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, sub_asset_size_6),
elevator = CASE WHEN v_asset_data ? 'elevator' THEN extract_boolean_from_jsonb(v_asset_data->'elevator', false) ELSE elevator END,
single_double_family = CASE WHEN v_asset_data ? 'single_double_family' THEN extract_boolean_from_jsonb(v_asset_data->'single_double_family', false) ELSE single_double_family END,
condo = CASE WHEN v_asset_data ? 'condo' THEN extract_boolean_from_jsonb(v_asset_data->'condo', false) ELSE condo END,
townhouses = CASE WHEN v_asset_data ? 'townhouses' THEN extract_boolean_from_jsonb(v_asset_data->'townhouses', false) ELSE townhouses END,
penthouse = CASE WHEN v_asset_data ? 'penthouse' THEN extract_boolean_from_jsonb(v_asset_data->'penthouse', false) ELSE penthouse END,
structure_drawing_url = COALESCE((v_asset_data->>'structure_drawing_url')::TEXT, structure_drawing_url),
discount_type = COALESCE((v_asset_data->>'discount_type')::TEXT, discount_type),
discount_date_from = COALESCE((v_asset_data->>'discount_date_from')::TEXT, discount_date_from),
discount_date_to = COALESCE((v_asset_data->>'discount_date_to')::TEXT, discount_date_to),
business_distribution_area = COALESCE((v_asset_data->>'business_distribution_area')::NUMERIC, business_distribution_area),
exported_to_automation = CASE WHEN v_asset_data ? 'exported_to_automation' THEN extract_boolean_from_jsonb(v_asset_data->'exported_to_automation', false) ELSE exported_to_automation END,
comment = COALESCE((v_asset_data->>'comment')::TEXT, comment),
updated_at = NOW()
WHERE asset_id = v_asset_id;
END IF;

v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
v_affected_buildings := array_append(v_affected_buildings, v_building_number);
END IF;

PERFORM update_building_total_area(v_building_number);
v_count := v_count + 1;
END LOOP;

-- Collect AFTER data if needed
IF p_after_data IS NULL OR p_after_data = 'null'::jsonb OR p_after_data = '{}'::jsonb THEN
-- Collect after data from saved assets
IF v_first_building_number IS NOT NULL THEN
IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution', 'transfer_area') THEN
-- For distribution and transfer actions, collect all assets in the building
FOR v_asset_record IN 
SELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
elevator, single_double_family, condo, townhouses, penthouse,
structure_drawing_url, discount_type, discount_date_from, discount_date_to,
business_distribution_area, exported_to_automation, comment, created_at, updated_at
FROM assets 
WHERE building_number = v_first_building_number
ORDER BY asset_id
LOOP
v_asset_jsonb := to_jsonb(v_asset_record);
v_after_assets := array_append(v_after_assets, v_asset_jsonb);
END LOOP;
ELSE
-- For other actions, collect only affected assets
FOREACH v_asset_id IN ARRAY v_affected_asset_ids
LOOP
SELECT to_jsonb(a.*) INTO v_asset_jsonb
FROM assets a WHERE a.asset_id = v_asset_id;

IF v_asset_jsonb IS NOT NULL THEN
v_after_assets := array_append(v_after_assets, v_asset_jsonb);
END IF;
END LOOP;
END IF;

SELECT jsonb_agg(elem) INTO v_after_data_collected FROM unnest(v_after_assets) AS elem;
v_after_data_collected := jsonb_build_object('assets', COALESCE(v_after_data_collected, '[]'::jsonb));
END IF;
ELSE
v_after_data_collected := p_after_data;
END IF;

-- Determine entity_id based on action type
-- For distribution and transfer operations, use building_number
-- For other operations, use comma-separated list of asset IDs
IF p_action_type IN ('business_distribution', 'residence_distribution', 'distribute_shared', 'transfer_area') THEN
v_entity_id := v_first_building_number::TEXT;
ELSE
v_entity_id := array_to_string(v_affected_asset_ids, ',');
END IF;

-- Create audit log entry
IF p_action_type IS NOT NULL THEN
BEGIN
v_audit_id := log_audit_entry(
p_action_type::audit_action_type,
'bulk_asset',
v_entity_id,
p_user_id,
v_before_data_collected,
v_after_data_collected,
p_description
);
EXCEPTION WHEN OTHERS THEN
-- Log warning but don't fail the transaction
RAISE WARNING 'Failed to create audit log: %', SQLERRM;
END;
END IF;

-- Clear distribution flags if this is a distribution operation
IF p_action_type IN ('business_distribution', 'residence_distribution', 'distribute_shared') AND v_first_building_number IS NOT NULL THEN
IF p_action_type = 'business_distribution' THEN
UPDATE buildings
SET need_business_distribution = false
WHERE building_number = v_first_building_number;
ELSIF p_action_type = 'residence_distribution' THEN
UPDATE buildings
SET need_residence_distribution = false
WHERE building_number = v_first_building_number;
ELSIF p_action_type = 'distribute_shared' THEN
-- For distribute_shared, clear both flags
UPDATE buildings
SET need_business_distribution = false,
    need_residence_distribution = false
WHERE building_number = v_first_building_number;
END IF;
END IF;

v_result := jsonb_build_object(
'success', true,
'affected_asset_ids', v_affected_asset_ids,
'affected_buildings', v_affected_buildings,
'count', v_count,
'audit_id', v_audit_id,
'message', format('Successfully saved %s assets', v_count)
);

RETURN v_result;

EXCEPTION
WHEN OTHERS THEN
RAISE EXCEPTION 'Bulk transaction failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.save_assets_bulk_transactional IS 'Bulk save assets with transactional operations including validation, distribution flags, and audit logging. All operations are atomic.';

-- Fix trigger function reset_export_flags_on_change to remove floor reference
CREATE OR REPLACE FUNCTION reset_export_flags_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
-- Only reset flags if actual data changed (not just metadata or the export flags themselves)
-- Check if any field other than exported_to_automation, export_to_automation_at, updated_at, or updated_by changed
IF (
NEW.building_number IS DISTINCT FROM OLD.building_number OR
NEW.asset_id IS DISTINCT FROM OLD.asset_id OR
NEW.payer_id IS DISTINCT FROM OLD.payer_id OR
NEW.main_asset_type IS DISTINCT FROM OLD.main_asset_type OR
NEW.asset_size IS DISTINCT FROM OLD.asset_size OR
NEW.measurement_date IS DISTINCT FROM OLD.measurement_date OR
NEW.tax_region IS DISTINCT FROM OLD.tax_region OR
NEW.sub_asset_type_1 IS DISTINCT FROM OLD.sub_asset_type_1 OR
NEW.sub_asset_size_1 IS DISTINCT FROM OLD.sub_asset_size_1 OR
NEW.sub_asset_type_2 IS DISTINCT FROM OLD.sub_asset_type_2 OR
NEW.sub_asset_size_2 IS DISTINCT FROM OLD.sub_asset_size_2 OR
NEW.sub_asset_type_3 IS DISTINCT FROM OLD.sub_asset_type_3 OR
NEW.sub_asset_size_3 IS DISTINCT FROM OLD.sub_asset_size_3 OR
NEW.sub_asset_type_4 IS DISTINCT FROM OLD.sub_asset_type_4 OR
NEW.sub_asset_size_4 IS DISTINCT FROM OLD.sub_asset_size_4 OR
NEW.sub_asset_type_5 IS DISTINCT FROM OLD.sub_asset_type_5 OR
NEW.sub_asset_size_5 IS DISTINCT FROM OLD.sub_asset_size_5 OR
NEW.sub_asset_type_6 IS DISTINCT FROM OLD.sub_asset_type_6 OR
NEW.sub_asset_size_6 IS DISTINCT FROM OLD.sub_asset_size_6 OR
NEW.business_distribution_area IS DISTINCT FROM OLD.business_distribution_area OR
NEW.elevator IS DISTINCT FROM OLD.elevator OR
NEW.single_double_family IS DISTINCT FROM OLD.single_double_family OR
NEW.condo IS DISTINCT FROM OLD.condo OR
NEW.townhouses IS DISTINCT FROM OLD.townhouses OR
NEW.penthouse IS DISTINCT FROM OLD.penthouse OR
NEW.structure_drawing_url IS DISTINCT FROM OLD.structure_drawing_url OR
NEW.discount_type IS DISTINCT FROM OLD.discount_type OR
NEW.discount_date_from IS DISTINCT FROM OLD.discount_date_from OR
NEW.discount_date_to IS DISTINCT FROM OLD.discount_date_to OR
NEW.comment IS DISTINCT FROM OLD.comment OR
NEW.apartment_number IS DISTINCT FROM OLD.apartment_number OR
NEW.apartment_floor IS DISTINCT FROM OLD.apartment_floor OR
NEW.storage_number IS DISTINCT FROM OLD.storage_number OR
NEW.storage_floor IS DISTINCT FROM OLD.storage_floor
) THEN
-- Reset export flags
NEW.exported_to_automation := false;
NEW.export_to_automation_at := NULL;
END IF;

RETURN NEW;
END;
$$;

-- Fix copy_asset_to_history_before_update function to remove floor reference
CREATE OR REPLACE FUNCTION copy_asset_to_history_before_update(p_asset_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_old_asset jsonb;
BEGIN
SELECT to_jsonb(a.*) INTO v_old_asset
FROM assets a
WHERE a.asset_id = p_asset_id;

IF v_old_asset IS NOT NULL THEN
INSERT INTO assets_history (
building_number, payer_id, asset_id, measurement_date,
main_asset_type, asset_size,
sub_asset_type_1, sub_asset_size_1,
sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3,
sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5,
sub_asset_type_6, sub_asset_size_6,
structure_drawing_url, created_at, updated_at,
elevator, single_double_family, condo, townhouses, penthouse,
tax_region, discount_type, discount_date_from, discount_date_to,
business_distribution_area, exported_to_automation, comment,
apartment_number, apartment_floor, storage_number, storage_floor, data_from_automation
) VALUES (
(v_old_asset->>'building_number')::bigint,
v_old_asset->>'payer_id',
(v_old_asset->>'asset_id')::bigint,
v_old_asset->>'measurement_date',
v_old_asset->>'main_asset_type',
(v_old_asset->>'asset_size')::numeric,
v_old_asset->>'sub_asset_type_1',
(v_old_asset->>'sub_asset_size_1')::numeric,
v_old_asset->>'sub_asset_type_2',
(v_old_asset->>'sub_asset_size_2')::numeric,
v_old_asset->>'sub_asset_type_3',
(v_old_asset->>'sub_asset_size_3')::numeric,
v_old_asset->>'sub_asset_type_4',
(v_old_asset->>'sub_asset_size_4')::numeric,
v_old_asset->>'sub_asset_type_5',
(v_old_asset->>'sub_asset_size_5')::numeric,
v_old_asset->>'sub_asset_type_6',
(v_old_asset->>'sub_asset_size_6')::numeric,
v_old_asset->>'structure_drawing_url',
COALESCE((v_old_asset->>'created_at')::timestamptz, now()),
COALESCE((v_old_asset->>'updated_at')::timestamptz, now()),
COALESCE((v_old_asset->>'elevator')::boolean, false),
COALESCE((v_old_asset->>'single_double_family')::boolean, false),
COALESCE((v_old_asset->>'condo')::boolean, false),
COALESCE((v_old_asset->>'townhouses')::boolean, false),
COALESCE((v_old_asset->>'penthouse')::boolean, false),
(v_old_asset->>'tax_region')::integer,
v_old_asset->>'discount_type',
v_old_asset->>'discount_date_from',
v_old_asset->>'discount_date_to',
COALESCE((v_old_asset->>'business_distribution_area')::numeric, 0),
COALESCE((v_old_asset->>'exported_to_automation')::boolean, false),
v_old_asset->>'comment',
v_old_asset->>'apartment_number',
v_old_asset->>'apartment_floor',
v_old_asset->>'storage_number',
v_old_asset->>'storage_floor',
COALESCE((v_old_asset->>'data_from_automation')::boolean, false)
);
END IF;
END;
$$;

COMMENT ON FUNCTION copy_asset_to_history_before_update IS 'Copy asset to history before update (for new measurements). Updated to remove floor field and add apartment/storage fields.';

-- Fix copy_asset_to_history trigger function to remove floor reference
CREATE OR REPLACE FUNCTION copy_asset_to_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_new_measurement, false) = true THEN
      INSERT INTO assets_history (
        building_number, payer_id, asset_id, measurement_date,
        main_asset_type, asset_size,
        sub_asset_type_1, sub_asset_size_1,
        sub_asset_type_2, sub_asset_size_2,
        sub_asset_type_3, sub_asset_size_3,
        sub_asset_type_4, sub_asset_size_4,
        sub_asset_type_5, sub_asset_size_5,
        sub_asset_type_6, sub_asset_size_6,
        structure_drawing_url, created_at, updated_at,
        elevator, single_double_family, condo, townhouses, penthouse,
        tax_region, discount_type, discount_date_from, discount_date_to,
        business_distribution_area, exported_to_automation, comment,
        apartment_number, apartment_floor, storage_number, storage_floor, data_from_automation
      ) VALUES (
        OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
        OLD.main_asset_type, OLD.asset_size,
        OLD.sub_asset_type_1, OLD.sub_asset_size_1,
        OLD.sub_asset_type_2, OLD.sub_asset_size_2,
        OLD.sub_asset_type_3, OLD.sub_asset_size_3,
        OLD.sub_asset_type_4, OLD.sub_asset_size_4,
        OLD.sub_asset_type_5, OLD.sub_asset_size_5,
        OLD.sub_asset_type_6, OLD.sub_asset_size_6,
        OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
        OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
        OLD.tax_region, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
        OLD.business_distribution_area, OLD.exported_to_automation, OLD.comment,
        OLD.apartment_number, OLD.apartment_floor, OLD.storage_number, OLD.storage_floor, OLD.data_from_automation
      );
      NEW.is_new_measurement = false;
    END IF;
    RETURN NEW;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, penthouse,
      tax_region, discount_type, discount_date_from, discount_date_to,
      business_distribution_area, exported_to_automation, comment,
      apartment_number, apartment_floor, storage_number, storage_floor, data_from_automation
    ) VALUES (
      OLD.building_number, OLD.payer_id, OLD.asset_id, OLD.measurement_date,
      OLD.main_asset_type, OLD.asset_size,
      OLD.sub_asset_type_1, OLD.sub_asset_size_1,
      OLD.sub_asset_type_2, OLD.sub_asset_size_2,
      OLD.sub_asset_type_3, OLD.sub_asset_size_3,
      OLD.sub_asset_type_4, OLD.sub_asset_size_4,
      OLD.sub_asset_type_5, OLD.sub_asset_size_5,
      OLD.sub_asset_type_6, OLD.sub_asset_size_6,
      OLD.structure_drawing_url, OLD.created_at, OLD.updated_at,
      OLD.elevator, OLD.single_double_family, OLD.condo, OLD.townhouses, OLD.penthouse,
      OLD.tax_region, OLD.discount_type, OLD.discount_date_from, OLD.discount_date_to,
      OLD.business_distribution_area, OLD.exported_to_automation, OLD.comment,
      OLD.apartment_number, OLD.apartment_floor, OLD.storage_number, OLD.storage_floor, OLD.data_from_automation
    );
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION copy_asset_to_history IS 'Trigger function to copy asset to history before update (when is_new_measurement=true) or on delete. Updated to remove floor field and add apartment/storage fields.';

SELECT 'Functions save_assets_bulk_transactional, reset_export_flags_on_change, copy_asset_to_history_before_update, and copy_asset_to_history trigger function created successfully!' as status;
