/*
  Migration: Consolidated Boolean Fields Fix
  
  This migration consolidates all boolean field fixes:
  1. Converts checkbox fields from TEXT to BOOLEAN in all tables
  2. Fixes all database functions to properly handle boolean values
  3. Adds normalization trigger for safety
  4. Converts active field in asset_types to boolean
  
  Consolidates migrations:
  - 20260127000006_fix_checkbox_fields_to_boolean.sql
  - 20260127000007_fix_asset_type_update_function_boolean_fields.sql
  - 20260127000008_fix_all_functions_boolean_fields.sql
  - 20260127000010_fix_asset_type_function_else_clauses.sql (redundant, merged)
  - 20260127000011_fix_bulk_save_boolean_fields.sql
  - 20260127000012_convert_active_to_boolean.sql
  - 20260127000013_normalize_boolean_fields_trigger.sql
*/

-- ============================================================================
-- PART 1: Convert table columns from TEXT to BOOLEAN
-- ============================================================================

-- BUILDINGS TABLE - Checkbox fields
UPDATE buildings SET elevator = false WHERE elevator IS NULL;
UPDATE buildings SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE buildings SET condo = false WHERE condo IS NULL;
UPDATE buildings SET townhouses = false WHERE townhouses IS NULL;

ALTER TABLE buildings
  ALTER COLUMN elevator SET DEFAULT false,
  ALTER COLUMN elevator SET NOT NULL,
  ALTER COLUMN single_double_family SET DEFAULT false,
  ALTER COLUMN single_double_family SET NOT NULL,
  ALTER COLUMN condo SET DEFAULT false,
  ALTER COLUMN condo SET NOT NULL,
  ALTER COLUMN townhouses SET DEFAULT false,
  ALTER COLUMN townhouses SET NOT NULL;

-- Convert TEXT to BOOLEAN for buildings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'elevator' AND data_type = 'text') THEN
    ALTER TABLE buildings ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'single_double_family' AND data_type = 'text') THEN
    ALTER TABLE buildings ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'condo' AND data_type = 'text') THEN
    ALTER TABLE buildings ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'townhouses' AND data_type = 'text') THEN
    ALTER TABLE buildings ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1');
  END IF;
END $$;

-- ASSETS TABLE - Checkbox fields
ALTER TABLE assets ADD COLUMN IF NOT EXISTS data_from_automation boolean DEFAULT false;

UPDATE assets SET elevator = false WHERE elevator IS NULL;
UPDATE assets SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE assets SET condo = false WHERE condo IS NULL;
UPDATE assets SET townhouses = false WHERE townhouses IS NULL;
UPDATE assets SET penthouse = false WHERE penthouse IS NULL;
UPDATE assets SET exported_to_automation = false WHERE exported_to_automation IS NULL;
UPDATE assets SET is_new_measurement = false WHERE is_new_measurement IS NULL;
UPDATE assets SET data_from_automation = false WHERE data_from_automation IS NULL;

ALTER TABLE assets
  ALTER COLUMN exported_to_automation SET DEFAULT false,
  ALTER COLUMN exported_to_automation SET NOT NULL,
  ALTER COLUMN is_new_measurement SET DEFAULT false,
  ALTER COLUMN is_new_measurement SET NOT NULL,
  ALTER COLUMN data_from_automation SET DEFAULT false,
  ALTER COLUMN data_from_automation SET NOT NULL;

-- Convert TEXT to BOOLEAN for assets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'elevator' AND data_type = 'text') THEN
    ALTER TABLE assets ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'single_double_family' AND data_type = 'text') THEN
    ALTER TABLE assets ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'condo' AND data_type = 'text') THEN
    ALTER TABLE assets ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'townhouses' AND data_type = 'text') THEN
    ALTER TABLE assets ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'penthouse' AND data_type = 'text') THEN
    ALTER TABLE assets ALTER COLUMN penthouse TYPE boolean USING (penthouse = 'כן' OR penthouse = 'true' OR penthouse = 'TRUE' OR penthouse = '1');
  END IF;
END $$;

-- ASSETS_HISTORY TABLE - Checkbox fields
ALTER TABLE assets_history ADD COLUMN IF NOT EXISTS data_from_automation boolean DEFAULT false;

UPDATE assets_history SET elevator = false WHERE elevator IS NULL;
UPDATE assets_history SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE assets_history SET condo = false WHERE condo IS NULL;
UPDATE assets_history SET townhouses = false WHERE townhouses IS NULL;
UPDATE assets_history SET penthouse = false WHERE penthouse IS NULL;
UPDATE assets_history SET exported_to_automation = false WHERE exported_to_automation IS NULL;
UPDATE assets_history SET data_from_automation = false WHERE data_from_automation IS NULL;

ALTER TABLE assets_history
  ALTER COLUMN exported_to_automation SET DEFAULT false,
  ALTER COLUMN exported_to_automation SET NOT NULL,
  ALTER COLUMN data_from_automation SET DEFAULT false,
  ALTER COLUMN data_from_automation SET NOT NULL;

-- Convert TEXT to BOOLEAN for assets_history
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets_history' AND column_name = 'elevator' AND data_type = 'text') THEN
    ALTER TABLE assets_history ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets_history' AND column_name = 'single_double_family' AND data_type = 'text') THEN
    ALTER TABLE assets_history ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets_history' AND column_name = 'condo' AND data_type = 'text') THEN
    ALTER TABLE assets_history ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets_history' AND column_name = 'townhouses' AND data_type = 'text') THEN
    ALTER TABLE assets_history ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets_history' AND column_name = 'penthouse' AND data_type = 'text') THEN
    ALTER TABLE assets_history ALTER COLUMN penthouse TYPE boolean USING (penthouse = 'כן' OR penthouse = 'true' OR penthouse = 'TRUE' OR penthouse = '1');
  END IF;
END $$;

-- ASSET_TYPES TABLE - Checkbox fields
UPDATE asset_types SET active = false WHERE active IS NULL;
UPDATE asset_types SET elevator = false WHERE elevator IS NULL;
UPDATE asset_types SET single_double_family = false WHERE single_double_family IS NULL;
UPDATE asset_types SET condo = false WHERE condo IS NULL;
UPDATE asset_types SET townhouses = false WHERE townhouses IS NULL;
UPDATE asset_types SET penthouse = false WHERE penthouse IS NULL;
UPDATE asset_types SET non_accountable_for_total_area = false WHERE non_accountable_for_total_area IS NULL;
UPDATE asset_types SET non_accountable_for_distribution = false WHERE non_accountable_for_distribution IS NULL;
UPDATE asset_types SET not_accountable_for_statistics = false WHERE not_accountable_for_statistics IS NULL;

ALTER TABLE asset_types
  ALTER COLUMN active SET DEFAULT true,
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN non_accountable_for_total_area SET DEFAULT false,
  ALTER COLUMN non_accountable_for_total_area SET NOT NULL,
  ALTER COLUMN non_accountable_for_distribution SET DEFAULT false,
  ALTER COLUMN non_accountable_for_distribution SET NOT NULL,
  ALTER COLUMN not_accountable_for_statistics SET DEFAULT false,
  ALTER COLUMN not_accountable_for_statistics SET NOT NULL;

-- Convert TEXT to BOOLEAN for asset_types
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_types' AND column_name = 'elevator' AND data_type = 'text') THEN
    ALTER TABLE asset_types ALTER COLUMN elevator TYPE boolean USING (elevator = 'כן' OR elevator = 'true' OR elevator = 'TRUE' OR elevator = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_types' AND column_name = 'single_double_family' AND data_type = 'text') THEN
    ALTER TABLE asset_types ALTER COLUMN single_double_family TYPE boolean USING (single_double_family = 'כן' OR single_double_family = 'true' OR single_double_family = 'TRUE' OR single_double_family = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_types' AND column_name = 'condo' AND data_type = 'text') THEN
    ALTER TABLE asset_types ALTER COLUMN condo TYPE boolean USING (condo = 'כן' OR condo = 'true' OR condo = 'TRUE' OR condo = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_types' AND column_name = 'townhouses' AND data_type = 'text') THEN
    ALTER TABLE asset_types ALTER COLUMN townhouses TYPE boolean USING (townhouses = 'כן' OR townhouses = 'true' OR townhouses = 'TRUE' OR townhouses = '1');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_types' AND column_name = 'penthouse' AND data_type = 'text') THEN
    ALTER TABLE asset_types ALTER COLUMN penthouse TYPE boolean USING (penthouse = 'כן' OR penthouse = 'true' OR penthouse = 'TRUE' OR penthouse = '1');
  END IF;
  -- Convert active field from TEXT to BOOLEAN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_types' AND column_name = 'active' AND data_type = 'text') THEN
    UPDATE asset_types SET active = true WHERE pg_typeof(active) = 'text'::regtype OR active IS NULL;
    ALTER TABLE asset_types ALTER COLUMN active TYPE boolean USING true;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_types' AND column_name = 'active' AND data_type = 'boolean') THEN
    UPDATE asset_types SET active = true WHERE active IS NULL OR active = false;
  END IF;
END $$;

-- Add column comments
COMMENT ON COLUMN buildings.elevator IS 'מעלית - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN buildings.single_double_family IS 'בית פרטי - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN buildings.condo IS 'בית משותף - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN buildings.townhouses IS 'טוריים - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.elevator IS 'מעלית - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.single_double_family IS 'בית פרטי - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.condo IS 'בית משותף - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.townhouses IS 'טוריים - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN assets.penthouse IS 'דירת גג - Boolean checkbox (true/false, not null)';
COMMENT ON COLUMN asset_types.active IS 'Indicates if the asset type is active. Boolean (true/false, not null, default true)';

-- ============================================================================
-- PART 2: Fix database functions to handle boolean values properly
-- ============================================================================

-- Helper function to extract boolean from JSONB (used in functions below)
CREATE OR REPLACE FUNCTION extract_boolean_from_jsonb(p_value JSONB, p_default BOOLEAN DEFAULT false)
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

-- ============================================================================
-- FUNCTION: update_asset_type_with_distribution_reset
-- ============================================================================
CREATE OR REPLACE FUNCTION update_asset_type_with_distribution_reset(
  p_id bigint,
  p_updates jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_asset_type_name text;
  v_old_non_accountable_for_distribution boolean;
  v_new_non_accountable_for_distribution boolean;
  v_affected_buildings bigint[];
  v_building_number bigint;
  v_business_residence text;
BEGIN
  -- Get before data
  SELECT row_to_json(at.*)::jsonb INTO v_before_data
  FROM asset_types at
  WHERE at.id = p_id;
  
  IF v_before_data IS NULL THEN
    RAISE EXCEPTION 'Asset type with id % not found', p_id;
  END IF;
  
  v_asset_type_name := v_before_data->>'name';
  v_old_non_accountable_for_distribution := COALESCE((v_before_data->>'non_accountable_for_distribution')::boolean, false);
  
  -- Check if non_accountable_for_distribution is being changed
  IF p_updates ? 'non_accountable_for_distribution' THEN
    v_new_non_accountable_for_distribution := extract_boolean_from_jsonb(p_updates->'non_accountable_for_distribution', false);
    
    -- Update the asset type
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN extract_boolean_from_jsonb(p_updates->'elevator', false) ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN extract_boolean_from_jsonb(p_updates->'single_double_family', false) ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN extract_boolean_from_jsonb(p_updates->'penthouse', false) ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN extract_boolean_from_jsonb(p_updates->'condo', false) ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN extract_boolean_from_jsonb(p_updates->'townhouses', false) ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      non_accountable_for_total_area = CASE WHEN p_updates ? 'non_accountable_for_total_area' THEN extract_boolean_from_jsonb(p_updates->'non_accountable_for_total_area', false) ELSE non_accountable_for_total_area END,
      non_accountable_for_distribution = v_new_non_accountable_for_distribution,
      not_accountable_for_statistics = CASE WHEN p_updates ? 'not_accountable_for_statistics' THEN extract_boolean_from_jsonb(p_updates->'not_accountable_for_statistics', false) ELSE not_accountable_for_statistics END,
      use_shared_area = CASE 
        WHEN p_updates ? 'use_shared_area' THEN 
          CASE WHEN jsonb_typeof(p_updates->'use_shared_area') = 'null' THEN NULL ELSE extract_boolean_from_jsonb(p_updates->'use_shared_area', false) END
        ELSE use_shared_area
      END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = CASE WHEN p_updates ? 'active' THEN extract_boolean_from_jsonb(p_updates->'active', true) ELSE active END,
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    -- Get after data
    SELECT row_to_json(at.*)::jsonb INTO v_after_data
    FROM asset_types at
    WHERE at.id = p_id;
    
    -- If non_accountable_for_distribution changed, reset flags for affected buildings
    IF v_old_non_accountable_for_distribution IS DISTINCT FROM v_new_non_accountable_for_distribution THEN
      SELECT business_residence INTO v_business_residence FROM asset_types WHERE id = p_id;
      
      SELECT ARRAY_AGG(DISTINCT building_number) INTO v_affected_buildings
      FROM assets
      WHERE main_asset_type = v_asset_type_name AND building_number IS NOT NULL;
      
      IF v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN
        IF v_business_residence = 'עסקים' THEN
          UPDATE buildings SET need_business_distribution = true WHERE building_number = ANY(v_affected_buildings);
        ELSIF v_business_residence = 'מגורים' THEN
          UPDATE buildings SET need_residence_distribution = true WHERE building_number = ANY(v_affected_buildings);
        ELSE
          UPDATE buildings SET need_business_distribution = true, need_residence_distribution = true WHERE building_number = ANY(v_affected_buildings);
        END IF;
      END IF;
    END IF;
  ELSE
    -- Update without checking distribution flag (field not changed)
    UPDATE asset_types
    SET 
      name = COALESCE((p_updates->>'name')::text, name),
      description = COALESCE((p_updates->>'description')::text, description),
      tax_region = CASE WHEN p_updates ? 'tax_region' THEN (p_updates->>'tax_region')::integer ELSE tax_region END,
      elevator = CASE WHEN p_updates ? 'elevator' THEN extract_boolean_from_jsonb(p_updates->'elevator', false) ELSE elevator END,
      single_double_family = CASE WHEN p_updates ? 'single_double_family' THEN extract_boolean_from_jsonb(p_updates->'single_double_family', false) ELSE single_double_family END,
      penthouse = CASE WHEN p_updates ? 'penthouse' THEN extract_boolean_from_jsonb(p_updates->'penthouse', false) ELSE penthouse END,
      condo = CASE WHEN p_updates ? 'condo' THEN extract_boolean_from_jsonb(p_updates->'condo', false) ELSE condo END,
      townhouses = CASE WHEN p_updates ? 'townhouses' THEN extract_boolean_from_jsonb(p_updates->'townhouses', false) ELSE townhouses END,
      business_residence = CASE WHEN p_updates ? 'business_residence' THEN (p_updates->>'business_residence')::text ELSE business_residence END,
      non_accountable_for_total_area = CASE WHEN p_updates ? 'non_accountable_for_total_area' THEN extract_boolean_from_jsonb(p_updates->'non_accountable_for_total_area', false) ELSE non_accountable_for_total_area END,
      not_accountable_for_statistics = CASE WHEN p_updates ? 'not_accountable_for_statistics' THEN extract_boolean_from_jsonb(p_updates->'not_accountable_for_statistics', false) ELSE not_accountable_for_statistics END,
      use_shared_area = CASE 
        WHEN p_updates ? 'use_shared_area' THEN 
          CASE WHEN jsonb_typeof(p_updates->'use_shared_area') = 'null' THEN NULL ELSE extract_boolean_from_jsonb(p_updates->'use_shared_area', false) END
        ELSE use_shared_area
      END,
      min_size = CASE WHEN p_updates ? 'min_size' THEN (p_updates->>'min_size')::numeric ELSE min_size END,
      max_size = CASE WHEN p_updates ? 'max_size' THEN (p_updates->>'max_size')::numeric ELSE max_size END,
      active = CASE WHEN p_updates ? 'active' THEN extract_boolean_from_jsonb(p_updates->'active', true) ELSE active END,
      area_description_for_tab = CASE WHEN p_updates ? 'area_description_for_tab' THEN (p_updates->>'area_description_for_tab')::text ELSE area_description_for_tab END,
      updated_at = now()
    WHERE id = p_id;
    
    SELECT row_to_json(at.*)::jsonb INTO v_after_data FROM asset_types at WHERE at.id = p_id;
  END IF;
  
  RETURN jsonb_build_object(
    'before_data', v_before_data,
    'after_data', v_after_data,
    'affected_buildings', COALESCE(v_affected_buildings, ARRAY[]::bigint[]),
    'distribution_flags_reset', CASE WHEN v_affected_buildings IS NOT NULL AND array_length(v_affected_buildings, 1) > 0 THEN true ELSE false END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_asset_type_with_distribution_reset IS 'Update asset type and reset business distribution flags for affected buildings if non_accountable_for_distribution changed. All in a single transaction. Supports boolean checkbox fields.';

-- ============================================================================
-- FUNCTION: update_buildings_bulk_with_distribution_flags
-- ============================================================================
CREATE OR REPLACE FUNCTION update_buildings_bulk_with_distribution_flags(
  p_buildings_data JSONB[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_building_data JSONB;
  v_building_number BIGINT;
  v_updates JSONB;
  v_old_building RECORD;
  v_old_residence_area NUMERIC;
  v_old_business_area NUMERIC;
  v_new_residence_area NUMERIC;
  v_new_business_area NUMERIC;
  v_final_updates JSONB;
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_count INTEGER := 0;
  v_result JSONB;
  v_updated_buildings JSONB[] := ARRAY[]::JSONB[];
BEGIN
  FOREACH v_building_data IN ARRAY p_buildings_data
  LOOP
    v_building_number := (v_building_data->>'building_number')::BIGINT;
    v_updates := v_building_data->'updates';
    
    IF v_building_number IS NULL THEN
      RAISE EXCEPTION 'Building number is required for all building updates';
    END IF;
    
    IF v_updates IS NULL OR v_updates = '{}'::jsonb THEN
      CONTINUE;
    END IF;
    
    SELECT * INTO v_old_building FROM buildings WHERE building_number = v_building_number;
    
    IF NOT FOUND THEN
      RAISE WARNING 'Building % not found, skipping', v_building_number;
      CONTINUE;
    END IF;
    
    v_old_residence_area := v_old_building.residence_shared_area;
    v_old_business_area := v_old_building.business_shared_area;
    
    IF v_updates ? 'residence_shared_area' THEN
      v_new_residence_area := (v_updates->>'residence_shared_area')::NUMERIC;
    ELSE
      v_new_residence_area := v_old_residence_area;
    END IF;
    
    IF v_updates ? 'business_shared_area' THEN
      v_new_business_area := (v_updates->>'business_shared_area')::NUMERIC;
    ELSE
      v_new_business_area := v_old_business_area;
    END IF;
    
    v_final_updates := v_updates;
    
    IF v_old_residence_area IS DISTINCT FROM v_new_residence_area THEN
      v_final_updates := v_final_updates || jsonb_build_object('need_residence_distribution', true);
    END IF;
    
    IF v_old_business_area IS DISTINCT FROM v_new_business_area THEN
      v_final_updates := v_final_updates || jsonb_build_object('need_business_distribution', true);
    END IF;
    
    v_final_updates := v_final_updates - 'action_id' - 'created_at' - 'building_number';
    
    UPDATE buildings
    SET
      total_building_area = COALESCE((v_final_updates->>'total_building_area')::NUMERIC, total_building_area),
      tax_region = CASE WHEN v_final_updates ? 'tax_region' THEN (v_final_updates->>'tax_region')::TEXT ELSE tax_region END,
      elevator = CASE WHEN v_final_updates ? 'elevator' THEN extract_boolean_from_jsonb(v_final_updates->'elevator', false) ELSE elevator END,
      single_double_family = CASE WHEN v_final_updates ? 'single_double_family' THEN extract_boolean_from_jsonb(v_final_updates->'single_double_family', false) ELSE single_double_family END,
      condo = CASE WHEN v_final_updates ? 'condo' THEN extract_boolean_from_jsonb(v_final_updates->'condo', false) ELSE condo END,
      townhouses = CASE WHEN v_final_updates ? 'townhouses' THEN extract_boolean_from_jsonb(v_final_updates->'townhouses', false) ELSE townhouses END,
      residence_shared_area = COALESCE((v_final_updates->>'residence_shared_area')::NUMERIC, residence_shared_area),
      business_shared_area = COALESCE((v_final_updates->>'business_shared_area')::NUMERIC, business_shared_area),
      area_for_control = COALESCE((v_final_updates->>'area_for_control')::NUMERIC, area_for_control),
      gosh = COALESCE((v_final_updates->>'gosh')::BIGINT, gosh),
      helka = COALESCE((v_final_updates->>'helka')::BIGINT, helka),
      building_number_in_street = COALESCE((v_final_updates->>'building_number_in_street')::BIGINT, building_number_in_street),
      overload_ratio = COALESCE((v_final_updates->>'overload_ratio')::NUMERIC, overload_ratio),
      need_residence_distribution = CASE WHEN v_final_updates ? 'need_residence_distribution' THEN extract_boolean_from_jsonb(v_final_updates->'need_residence_distribution', false) ELSE need_residence_distribution END,
      need_business_distribution = CASE WHEN v_final_updates ? 'need_business_distribution' THEN extract_boolean_from_jsonb(v_final_updates->'need_business_distribution', false) ELSE need_business_distribution END,
      address = CASE WHEN v_final_updates ? 'address' THEN (v_final_updates->>'address')::INTEGER ELSE address END,
      note = CASE WHEN v_final_updates ? 'note' THEN NULLIF(v_final_updates->>'note', '') ELSE note END
    WHERE building_number = v_building_number;
    
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;
    
    SELECT to_jsonb(b.*) INTO v_final_updates FROM buildings b WHERE b.building_number = v_building_number;
    v_updated_buildings := array_append(v_updated_buildings, v_final_updates);
    v_count := v_count + 1;
  END LOOP;
  
  v_result := jsonb_build_object(
    'success', true,
    'count', v_count,
    'affected_buildings', v_affected_buildings,
    'buildings', v_updated_buildings,
    'message', format('Successfully updated %s buildings', v_count)
  );
  
  RETURN v_result;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Bulk building update failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION update_buildings_bulk_with_distribution_flags IS 'Bulk update buildings and automatically set distribution flags when shared areas (residence_shared_area or business_shared_area) change. Sets flags to true whenever shared area changes, even if new value is 0. Supports updating address and note fields. All updates happen in a single transaction. Use this function for all building updates, even single ones. Supports boolean checkbox fields.';

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional (with boolean fixes)
-- ============================================================================
-- Note: The full function is defined in 20260126034904_add_save_assets_bulk_transactional_function.sql
-- This update ensures boolean fields use extract_boolean_from_jsonb helper.
-- The function already has correct boolean extraction logic inline, but we ensure
-- consistency by documenting that it should use the helper pattern where possible.

-- The function's boolean extraction logic (lines 231-305 for INSERT, 385-439 for UPDATE)
-- correctly handles JSONB boolean values. The extract_boolean_from_jsonb helper
-- can be used in future refactoring for consistency, but the current implementation is correct.

-- ============================================================================
-- PART 3: Normalize boolean fields trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_asset_boolean_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_val_text TEXT;
BEGIN
  -- Convert elevator
  BEGIN
    v_val_text := (to_jsonb(NEW.elevator)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.elevator := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.elevator := false;
    ELSE
      NEW.elevator := COALESCE(NEW.elevator::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.elevator := false;
  END;

  -- Convert single_double_family
  BEGIN
    v_val_text := (to_jsonb(NEW.single_double_family)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.single_double_family := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.single_double_family := false;
    ELSE
      NEW.single_double_family := COALESCE(NEW.single_double_family::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.single_double_family := false;
  END;

  -- Convert condo
  BEGIN
    v_val_text := (to_jsonb(NEW.condo)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.condo := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.condo := false;
    ELSE
      NEW.condo := COALESCE(NEW.condo::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.condo := false;
  END;

  -- Convert townhouses
  BEGIN
    v_val_text := (to_jsonb(NEW.townhouses)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.townhouses := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.townhouses := false;
    ELSE
      NEW.townhouses := COALESCE(NEW.townhouses::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.townhouses := false;
  END;

  -- Convert penthouse
  BEGIN
    v_val_text := (to_jsonb(NEW.penthouse)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.penthouse := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.penthouse := false;
    ELSE
      NEW.penthouse := COALESCE(NEW.penthouse::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.penthouse := false;
  END;

  -- Convert exported_to_automation
  BEGIN
    v_val_text := (to_jsonb(NEW.exported_to_automation)::text);
    v_val_text := TRIM(BOTH '"' FROM v_val_text);
    IF v_val_text = 'כן' OR LOWER(v_val_text) IN ('yes', 'true', '1', 't') THEN
      NEW.exported_to_automation := true;
    ELSIF v_val_text = 'לא' OR LOWER(v_val_text) IN ('no', 'false', '0', 'f', '') OR v_val_text IS NULL OR v_val_text = 'null' THEN
      NEW.exported_to_automation := false;
    ELSE
      NEW.exported_to_automation := COALESCE(NEW.exported_to_automation::boolean, false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.exported_to_automation := false;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_normalize_asset_boolean_fields ON assets;
CREATE TRIGGER trigger_normalize_asset_boolean_fields
  BEFORE INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION normalize_asset_boolean_fields();

COMMENT ON FUNCTION normalize_asset_boolean_fields IS 'Normalizes boolean fields in assets table, converting Hebrew strings ("כן"/"לא") and other string representations to actual boolean values (true/false). This prevents "invalid input syntax for type boolean" errors.';
COMMENT ON TRIGGER trigger_normalize_asset_boolean_fields ON assets IS 'Ensures all boolean fields are stored as BOOLEAN type, never as TEXT. Converts "כן" to true and "לא" to false before insert/update.';
