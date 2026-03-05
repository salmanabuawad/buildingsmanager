/*
  # Fix all database functions to use business_distribution_area
  
  1. Overview
    - Replace all references to area_from_distribution with business_distribution_area
    
  2. Functions Updated
    - save_assets_bulk_transactional
    - bulk_transfer_areas_with_audit
    - bulk_update_assets_with_audit
    - copy_asset_to_history_before_update
    - get_assets_by_ids
*/

-- Fix get_assets_by_ids function
CREATE OR REPLACE FUNCTION get_assets_by_ids(p_asset_ids BIGINT[])
RETURNS TABLE (
  asset_id BIGINT,
  building_number BIGINT,
  payer_id TEXT,
  measurement_date TEXT,
  main_asset_type TEXT,
  asset_size NUMERIC,
  tax_region INTEGER,
  sub_asset_type_1 TEXT,
  sub_asset_size_1 NUMERIC,
  sub_asset_type_2 TEXT,
  sub_asset_size_2 NUMERIC,
  sub_asset_type_3 TEXT,
  sub_asset_size_3 NUMERIC,
  sub_asset_type_4 TEXT,
  sub_asset_size_4 NUMERIC,
  sub_asset_type_5 TEXT,
  sub_asset_size_5 NUMERIC,
  sub_asset_type_6 TEXT,
  sub_asset_size_6 NUMERIC,
  elevator BOOLEAN,
  single_double_family BOOLEAN,
  condo BOOLEAN,
  townhouses BOOLEAN,
  penthouse BOOLEAN,
  structure_drawing_url TEXT,
  floor SMALLINT,
  discount_type TEXT,
  discount_date_from TEXT,
  discount_date_to TEXT,
  business_distribution_area NUMERIC,
  exported_to_automation BOOLEAN,
  comment TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.asset_id,
    a.building_number,
    a.payer_id,
    a.measurement_date,
    a.main_asset_type,
    a.asset_size,
    a.tax_region,
    a.sub_asset_type_1,
    a.sub_asset_size_1,
    a.sub_asset_type_2,
    a.sub_asset_size_2,
    a.sub_asset_type_3,
    a.sub_asset_size_3,
    a.sub_asset_type_4,
    a.sub_asset_size_4,
    a.sub_asset_type_5,
    a.sub_asset_size_5,
    a.sub_asset_type_6,
    a.sub_asset_size_6,
    a.elevator,
    a.single_double_family,
    a.condo,
    a.townhouses,
    a.penthouse,
    a.structure_drawing_url,
    a.floor,
    a.discount_type,
    a.discount_date_from,
    a.discount_date_to,
    a.business_distribution_area,
    a.exported_to_automation,
    a.comment,
    a.created_at,
    a.updated_at
  FROM assets a
  WHERE a.asset_id = ANY(p_asset_ids)
  ORDER BY a.asset_id;
END;
$$;

-- Fix save_assets_bulk_transactional function
CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
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
IF p_action_type IN ('distribute_shared', 'business_distribution', 'residence_distribution') THEN
FOR v_asset_record IN 
SELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
elevator, single_double_family, condo, townhouses, penthouse,
structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,
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
-- INSERT new asset
INSERT INTO assets (
asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,
sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3,
sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,
elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor,
discount_type, discount_date_from, discount_date_to, business_distribution_area, exported_to_automation, comment
)
VALUES (
v_asset_id, v_building_number, (v_asset_data->>'payer_id')::TEXT,
COALESCE((v_asset_data->>'measurement_date')::TEXT, '01/01/1900'), v_new_main_asset_type,
COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0), (v_asset_data->>'tax_region')::BIGINT,
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
(v_asset_data->>'structure_drawing_url')::TEXT, (v_asset_data->>'floor')::BIGINT,
(v_asset_data->>'discount_type')::TEXT, (v_asset_data->>'discount_date_from')::TEXT,
(v_asset_data->>'discount_date_to')::TEXT, (v_asset_data->>'business_distribution_area')::NUMERIC,
extract_boolean_from_jsonb(v_asset_data->'exported_to_automation', false), (v_asset_data->>'comment')::TEXT
);
ELSE
-- UPDATE existing asset
IF extract_boolean_from_jsonb(v_asset_data->'is_new_measurement', false) = true THEN
INSERT INTO assets_history SELECT * FROM assets WHERE asset_id = v_asset_id;
END IF;

UPDATE assets SET
building_number = COALESCE(v_building_number, building_number),
payer_id = COALESCE((v_asset_data->>'payer_id')::TEXT, payer_id),
measurement_date = COALESCE((v_asset_data->>'measurement_date')::TEXT, measurement_date),
main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, asset_size),
tax_region = COALESCE((v_asset_data->>'tax_region')::BIGINT, tax_region),
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
floor = COALESCE((v_asset_data->>'floor')::BIGINT, floor),
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

v_result := jsonb_build_object(
'success', true,
'affected_asset_ids', v_affected_asset_ids,
'affected_buildings', v_affected_buildings,
'count', v_count,
'message', format('Successfully saved %s assets', v_count)
);

RETURN v_result;

EXCEPTION
WHEN OTHERS THEN
RAISE EXCEPTION 'Bulk transaction failed: %', SQLERRM;
END;
$$;

-- Fix bulk_transfer_areas_with_audit function
CREATE OR REPLACE FUNCTION bulk_transfer_areas_with_audit(
  p_old_assets JSONB,
  p_new_assets JSONB,
  p_action_type audit_action_type DEFAULT 'transfer_area',
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_audit_id bigint;
v_asset jsonb;
v_asset_id bigint;
v_building_number bigint;
v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
v_result jsonb;
BEGIN
SELECT log_audit_entry(
p_action_type,
'bulk_asset',
NULL::text,
p_user_id,
p_before_data,
p_after_data,
p_description
) INTO v_audit_id;

FOR v_asset IN SELECT * FROM jsonb_array_elements(p_old_assets)
LOOP
v_asset_id := (v_asset->>'asset_id')::bigint;
v_building_number := (v_asset->>'building_number')::bigint;

INSERT INTO assets_history (
building_number, payer_id, asset_id, measurement_date,
main_asset_type, asset_size,
sub_asset_type_1, sub_asset_size_1,
sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3,
sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5,
sub_asset_type_6, sub_asset_size_6,
structure_drawing_url, elevator, single_double_family,
condo, townhouses, penthouse, tax_region,
floor, discount_type, discount_date_from, discount_date_to,
created_at, history_created_at, business_distribution_area, exported_to_automation
)
SELECT
building_number, payer_id, asset_id, measurement_date,
main_asset_type, asset_size,
sub_asset_type_1, sub_asset_size_1,
sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3,
sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5,
sub_asset_type_6, sub_asset_size_6,
structure_drawing_url, elevator, single_double_family,
condo, townhouses, penthouse, tax_region,
floor, discount_type, discount_date_from, discount_date_to,
created_at, now(), business_distribution_area, exported_to_automation
FROM assets
WHERE asset_id = v_asset_id;

DELETE FROM assets WHERE asset_id = v_asset_id;
v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);

IF v_building_number IS NOT NULL THEN
PERFORM update_building_total_area(v_building_number);
END IF;
END LOOP;

FOR v_asset IN SELECT * FROM jsonb_array_elements(p_new_assets)
LOOP
v_asset_id := (v_asset->>'asset_id')::bigint;
v_building_number := (v_asset->>'building_number')::bigint;

INSERT INTO assets (
building_number, payer_id, asset_id, measurement_date,
main_asset_type, asset_size,
sub_asset_type_1, sub_asset_size_1,
sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3,
sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5,
sub_asset_type_6, sub_asset_size_6,
structure_drawing_url, elevator, single_double_family,
condo, townhouses, penthouse, tax_region,
floor, discount_type, discount_date_from, discount_date_to,
created_at, updated_at
) VALUES (
(v_asset->>'building_number')::bigint,
NULLIF(v_asset->>'payer_id', ''),
v_asset_id,
COALESCE(v_asset->>'measurement_date', '01/01/1900'),
NULLIF(v_asset->>'main_asset_type', ''),
COALESCE((v_asset->>'asset_size')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_1', ''),
COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_2', ''),
COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_3', ''),
COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_4', ''),
COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_5', ''),
COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_6', ''),
COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
NULLIF(v_asset->>'structure_drawing_url', ''),
NULLIF(v_asset->>'elevator', ''),
NULLIF(v_asset->>'single_double_family', ''),
NULLIF(v_asset->>'condo', ''),
NULLIF(v_asset->>'townhouses', ''),
NULLIF(v_asset->>'penthouse', ''),
(v_asset->>'tax_region')::integer,
(v_asset->>'floor')::smallint,
NULLIF(v_asset->>'discount_type', ''),
NULLIF(v_asset->>'discount_date_from', ''),
NULLIF(v_asset->>'discount_date_to', ''),
now(),
now()
);

IF NOT (v_asset_id = ANY(v_affected_asset_ids)) THEN
v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
END IF;

IF v_building_number IS NOT NULL THEN
PERFORM update_building_total_area(v_building_number);
END IF;
END LOOP;

UPDATE audit
SET entity_id = array_to_string(v_affected_asset_ids, ',')
WHERE action_id = v_audit_id;

v_result := jsonb_build_object(
'action_id', v_audit_id,
'affected_asset_ids', v_affected_asset_ids,
'count', array_length(v_affected_asset_ids, 1)
);

RETURN v_result;
END;
$$;

-- Fix bulk_update_assets_with_audit function
CREATE OR REPLACE FUNCTION bulk_update_assets_with_audit(
  p_assets JSONB,
  p_action_type audit_action_type,
  p_user_id TEXT DEFAULT NULL,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_audit_id bigint;
v_asset jsonb;
v_asset_id bigint;
v_building_number bigint;
v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
v_result jsonb;
v_before_assets jsonb[] := ARRAY[]::jsonb[];
v_after_assets jsonb[] := ARRAY[]::jsonb[];
v_before_data_collected jsonb;
v_after_data_collected jsonb;
v_asset_data jsonb;
v_building_data jsonb;
v_first_building_number bigint;
BEGIN
SELECT (elem->>'building_number')::bigint INTO v_first_building_number
FROM jsonb_array_elements(p_assets) AS elem
LIMIT 1;

IF p_before_data IS NULL OR p_before_data = 'null'::jsonb OR p_before_data = '{}'::jsonb THEN
IF v_first_building_number IS NOT NULL THEN
SELECT to_jsonb(b.*) INTO v_building_data
FROM buildings b
WHERE b.building_number = v_first_building_number;
END IF;

FOR v_asset IN SELECT * FROM jsonb_array_elements(p_assets)
LOOP
v_asset_id := (v_asset->>'asset_id')::bigint;
SELECT to_jsonb(a.*) INTO v_asset_data
FROM assets a
WHERE a.asset_id = v_asset_id;

IF v_asset_data IS NOT NULL THEN
v_before_assets := array_append(v_before_assets, v_asset_data);
END IF;
END LOOP;

SELECT jsonb_agg(elem) INTO v_before_data_collected
FROM unnest(v_before_assets) AS elem;

v_before_data_collected := jsonb_build_object(
'assets', COALESCE(v_before_data_collected, '[]'::jsonb),
'building', COALESCE(v_building_data, 'null'::jsonb)
);
ELSE
v_before_data_collected := p_before_data;
END IF;

SELECT log_audit_entry(
p_action_type,
'bulk_asset',
NULL::text,
p_user_id,
v_before_data_collected,
NULL::jsonb,
p_description
) INTO v_audit_id;

FOR v_asset IN SELECT * FROM jsonb_array_elements(p_assets)
LOOP
v_asset_id := (v_asset->>'asset_id')::bigint;
v_building_number := (v_asset->>'building_number')::bigint;

IF EXISTS (SELECT 1 FROM assets WHERE asset_id = v_asset_id) THEN
UPDATE assets
SET
building_number = COALESCE((v_asset->>'building_number')::bigint, building_number),
payer_id = COALESCE(v_asset->>'payer_id', payer_id),
measurement_date = COALESCE(v_asset->>'measurement_date', measurement_date),
main_asset_type = COALESCE(v_asset->>'main_asset_type', main_asset_type),
asset_size = COALESCE((v_asset->>'asset_size')::numeric, asset_size),
sub_asset_type_1 = COALESCE(v_asset->>'sub_asset_type_1', sub_asset_type_1),
sub_asset_size_1 = COALESCE((v_asset->>'sub_asset_size_1')::numeric, sub_asset_size_1),
sub_asset_type_2 = COALESCE(v_asset->>'sub_asset_type_2', sub_asset_type_2),
sub_asset_size_2 = COALESCE((v_asset->>'sub_asset_size_2')::numeric, sub_asset_size_2),
sub_asset_type_3 = COALESCE(v_asset->>'sub_asset_type_3', sub_asset_type_3),
sub_asset_size_3 = COALESCE((v_asset->>'sub_asset_size_3')::numeric, sub_asset_size_3),
sub_asset_type_4 = COALESCE(v_asset->>'sub_asset_type_4', sub_asset_type_4),
sub_asset_size_4 = COALESCE((v_asset->>'sub_asset_size_4')::numeric, sub_asset_size_4),
sub_asset_type_5 = COALESCE(v_asset->>'sub_asset_type_5', sub_asset_type_5),
sub_asset_size_5 = COALESCE((v_asset->>'sub_asset_size_5')::numeric, sub_asset_size_5),
sub_asset_type_6 = COALESCE(v_asset->>'sub_asset_type_6', sub_asset_type_6),
sub_asset_size_6 = COALESCE((v_asset->>'sub_asset_size_6')::numeric, sub_asset_size_6),
structure_drawing_url = COALESCE(v_asset->>'structure_drawing_url', structure_drawing_url),
elevator = COALESCE(v_asset->>'elevator', elevator),
single_double_family = COALESCE(v_asset->>'single_double_family', single_double_family),
condo = COALESCE(v_asset->>'condo', condo),
townhouses = COALESCE(v_asset->>'townhouses', townhouses),
penthouse = COALESCE(v_asset->>'penthouse', penthouse),
tax_region = COALESCE((v_asset->>'tax_region')::integer, tax_region),
floor = COALESCE((v_asset->>'floor')::smallint, floor),
discount_type = COALESCE(v_asset->>'discount_type', discount_type),
discount_date_from = COALESCE(v_asset->>'discount_date_from', discount_date_from),
discount_date_to = COALESCE(v_asset->>'discount_date_to', discount_date_to),
business_distribution_area = COALESCE((v_asset->>'business_distribution_area')::numeric, business_distribution_area),
updated_at = now()
WHERE asset_id = v_asset_id;
ELSE
INSERT INTO assets (
building_number, payer_id, asset_id, measurement_date,
main_asset_type, asset_size,
sub_asset_type_1, sub_asset_size_1,
sub_asset_type_2, sub_asset_size_2,
sub_asset_type_3, sub_asset_size_3,
sub_asset_type_4, sub_asset_size_4,
sub_asset_type_5, sub_asset_size_5,
sub_asset_type_6, sub_asset_size_6,
structure_drawing_url,
elevator, single_double_family, condo, townhouses, penthouse,
tax_region, floor,
discount_type, discount_date_from, discount_date_to,
business_distribution_area,
created_at, updated_at
) VALUES (
(v_asset->>'building_number')::bigint,
NULLIF(v_asset->>'payer_id', ''),
v_asset_id,
COALESCE(v_asset->>'measurement_date', '01/01/1900'),
NULLIF(v_asset->>'main_asset_type', ''),
COALESCE((v_asset->>'asset_size')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_1', ''),
COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_2', ''),
COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_3', ''),
COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_4', ''),
COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_5', ''),
COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
NULLIF(v_asset->>'sub_asset_type_6', ''),
COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
NULLIF(v_asset->>'structure_drawing_url', ''),
NULLIF(v_asset->>'elevator', ''),
NULLIF(v_asset->>'single_double_family', ''),
NULLIF(v_asset->>'condo', ''),
NULLIF(v_asset->>'townhouses', ''),
NULLIF(v_asset->>'penthouse', ''),
(v_asset->>'tax_region')::integer,
(v_asset->>'floor')::smallint,
NULLIF(v_asset->>'discount_type', ''),
NULLIF(v_asset->>'discount_date_from', ''),
NULLIF(v_asset->>'discount_date_to', ''),
(v_asset->>'business_distribution_area')::numeric,
now(),
now()
);
END IF;

v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);

IF v_building_number IS NOT NULL THEN
PERFORM update_building_total_area(v_building_number);
END IF;
END LOOP;

IF p_after_data IS NULL OR p_after_data = 'null'::jsonb OR p_after_data = '{}'::jsonb THEN
IF v_first_building_number IS NOT NULL THEN
SELECT to_jsonb(b.*) INTO v_building_data
FROM buildings b
WHERE b.building_number = v_first_building_number;
END IF;

FOR v_asset_id IN SELECT unnest(v_affected_asset_ids)
LOOP
SELECT to_jsonb(a.*) INTO v_asset_data
FROM assets a
WHERE a.asset_id = v_asset_id;

IF v_asset_data IS NOT NULL THEN
v_after_assets := array_append(v_after_assets, v_asset_data);
END IF;
END LOOP;

SELECT jsonb_agg(elem) INTO v_after_data_collected
FROM unnest(v_after_assets) AS elem;

v_after_data_collected := jsonb_build_object(
'assets', COALESCE(v_after_data_collected, '[]'::jsonb),
'building', COALESCE(v_building_data, 'null'::jsonb)
);
ELSE
v_after_data_collected := p_after_data;
END IF;

UPDATE audit
SET 
after_data = v_after_data_collected,
entity_id = array_to_string(v_affected_asset_ids, ',')
WHERE action_id = v_audit_id;

v_result := jsonb_build_object(
'action_id', v_audit_id,
'affected_asset_ids', v_affected_asset_ids,
'count', array_length(v_affected_asset_ids, 1)
);

RETURN v_result;
END;
$$;

-- Fix copy_asset_to_history_before_update function
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
tax_region, floor, discount_type, discount_date_from, discount_date_to,
history_created_at, business_distribution_area, exported_to_automation
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
v_old_asset->>'elevator',
v_old_asset->>'single_double_family',
v_old_asset->>'condo',
v_old_asset->>'townhouses',
v_old_asset->>'penthouse',
(v_old_asset->>'tax_region')::integer,
(v_old_asset->>'floor')::smallint,
v_old_asset->>'discount_type',
v_old_asset->>'discount_date_from',
v_old_asset->>'discount_date_to',
now(),
(v_old_asset->>'business_distribution_area')::numeric,
COALESCE((v_old_asset->>'exported_to_automation')::boolean, false)
);
END IF;
END;
$$;
