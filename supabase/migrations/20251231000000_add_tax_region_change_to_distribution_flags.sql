-- ============================================================================
-- Migration: Add tax_region change to distribution flag logic
-- ============================================================================
-- This migration updates the distribution flag logic to also set flags
-- when tax_region changes, in addition to asset type and size changes.
--
-- When tax_region or main_asset_type changes, the system should set
-- the appropriate distribution flag (business or residence) based on
-- the asset type's business_residence field, but only if the building
-- has the relevant shared area > 0.

-- ============================================================================
-- FUNCTION: save_asset_transactional - Add tax_region change detection
-- ============================================================================

CREATE OR REPLACE FUNCTION save_asset_transactional(
  p_asset_data JSONB,
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type TEXT;
  v_new_main_asset_type TEXT;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  v_old_tax_region INTEGER;
  v_new_tax_region INTEGER;
  v_audit_id BIGINT;
  v_result JSONB;
  v_business_residence TEXT;
  v_asset_type_changed BOOLEAN := FALSE;
  v_asset_size_changed BOOLEAN := FALSE;
  v_tax_region_changed BOOLEAN := FALSE;
  v_building_record buildings;
BEGIN
  -- ========================================================================
  -- STEP 1: EXTRACT DATA AND CHECK EXISTING ASSET
  -- ========================================================================
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  v_new_main_asset_type := (p_asset_data->>'main_asset_type')::TEXT;
  v_new_asset_size := COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0);
  v_new_tax_region := (p_asset_data->>'tax_region')::INTEGER;

  IF v_asset_id IS NULL OR v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset ID and Building Number are required'
      USING HINT = 'Ensure asset_id and building_number are provided in p_asset_data';
  END IF;

  -- Check if asset exists
  SELECT * INTO v_existing_asset
  FROM assets
  WHERE asset_id = v_asset_id;

  IF FOUND THEN
    v_old_main_asset_type := v_existing_asset.main_asset_type;
    v_old_asset_size := v_existing_asset.asset_size;
    v_old_tax_region := v_existing_asset.tax_region;
    v_asset_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
    v_asset_size_changed := (v_old_asset_size IS DISTINCT FROM v_new_asset_size);
    v_tax_region_changed := (v_old_tax_region IS DISTINCT FROM v_new_tax_region);
  END IF;

  -- Get building record for shared area checks
  SELECT * INTO v_building_record
  FROM buildings
  WHERE building_number = v_building_number;

  -- ========================================================================
  -- STEP 2: SAVE ASSET (INSERT or UPDATE)
  -- ========================================================================
  IF v_existing_asset IS NULL THEN
    -- INSERT new asset
    INSERT INTO assets (asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region, sub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2, sub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4, sub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6, elevator, single_double_family, condo, townhouses, penthouse, structure_drawing_url, floor, discount_type, discount_date_from, discount_date_to, area_from_distribution, exported_to_automation, comment)
    VALUES (
      v_asset_id,
      v_building_number,
      (p_asset_data->>'payer_id')::TEXT,
      COALESCE((p_asset_data->>'measurement_date')::TEXT, '01/01/1900'),
      v_new_main_asset_type,
      v_new_asset_size,
      v_new_tax_region,
      (p_asset_data->>'sub_asset_type_1')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_2')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_3')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_4')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_5')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      (p_asset_data->>'sub_asset_type_6')::TEXT,
      COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      (p_asset_data->>'elevator')::TEXT,
      (p_asset_data->>'single_double_family')::TEXT,
      (p_asset_data->>'condo')::TEXT,
      (p_asset_data->>'townhouses')::TEXT,
      (p_asset_data->>'penthouse')::TEXT,
      (p_asset_data->>'structure_drawing_url')::TEXT,
      (p_asset_data->>'floor')::BIGINT,
      (p_asset_data->>'discount_type')::TEXT,
      (p_asset_data->>'discount_date_from')::TEXT,
      (p_asset_data->>'discount_date_to')::TEXT,
      (p_asset_data->>'area_from_distribution')::NUMERIC,
      COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, false),
      (p_asset_data->>'comment')::TEXT
    );
  ELSE
    -- UPDATE existing asset
    UPDATE assets
    SET
      building_number = v_building_number,
      payer_id = CASE 
        WHEN p_asset_data->'payer_id' IS NULL THEN payer_id
        WHEN p_asset_data->'payer_id' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'payer_id'), '')::TEXT
      END,
      measurement_date = CASE 
        WHEN p_asset_data->'measurement_date' IS NULL THEN measurement_date
        WHEN p_asset_data->'measurement_date' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'measurement_date'), '')::TEXT
      END,
      main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),
      asset_size = COALESCE(v_new_asset_size, asset_size),
      tax_region = CASE 
        WHEN p_asset_data->'tax_region' IS NULL THEN tax_region
        ELSE (p_asset_data->>'tax_region')::BIGINT
      END,
      sub_asset_type_1 = CASE 
        WHEN p_asset_data->'sub_asset_type_1' IS NULL THEN sub_asset_type_1
        WHEN p_asset_data->'sub_asset_type_1' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_1'), '')::TEXT
      END,
      sub_asset_size_1 = CASE 
        WHEN p_asset_data->'sub_asset_size_1' IS NULL THEN sub_asset_size_1
        ELSE COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0)
      END,
      sub_asset_type_2 = CASE 
        WHEN p_asset_data->'sub_asset_type_2' IS NULL THEN sub_asset_type_2
        WHEN p_asset_data->'sub_asset_type_2' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_2'), '')::TEXT
      END,
      sub_asset_size_2 = CASE 
        WHEN p_asset_data->'sub_asset_size_2' IS NULL THEN sub_asset_size_2
        ELSE COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0)
      END,
      sub_asset_type_3 = CASE 
        WHEN p_asset_data->'sub_asset_type_3' IS NULL THEN sub_asset_type_3
        WHEN p_asset_data->'sub_asset_type_3' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_3'), '')::TEXT
      END,
      sub_asset_size_3 = CASE 
        WHEN p_asset_data->'sub_asset_size_3' IS NULL THEN sub_asset_size_3
        ELSE COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0)
      END,
      sub_asset_type_4 = CASE 
        WHEN p_asset_data->'sub_asset_type_4' IS NULL THEN sub_asset_type_4
        WHEN p_asset_data->'sub_asset_type_4' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_4'), '')::TEXT
      END,
      sub_asset_size_4 = CASE 
        WHEN p_asset_data->'sub_asset_size_4' IS NULL THEN sub_asset_size_4
        ELSE COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0)
      END,
      sub_asset_type_5 = CASE 
        WHEN p_asset_data->'sub_asset_type_5' IS NULL THEN sub_asset_type_5
        WHEN p_asset_data->'sub_asset_type_5' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_5'), '')::TEXT
      END,
      sub_asset_size_5 = CASE 
        WHEN p_asset_data->'sub_asset_size_5' IS NULL THEN sub_asset_size_5
        ELSE COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0)
      END,
      sub_asset_type_6 = CASE 
        WHEN p_asset_data->'sub_asset_type_6' IS NULL THEN sub_asset_type_6
        WHEN p_asset_data->'sub_asset_type_6' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'sub_asset_type_6'), '')::TEXT
      END,
      sub_asset_size_6 = CASE 
        WHEN p_asset_data->'sub_asset_size_6' IS NULL THEN sub_asset_size_6
        ELSE COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0)
      END,
      elevator = CASE 
        WHEN p_asset_data->'elevator' IS NULL THEN elevator
        WHEN p_asset_data->'elevator' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'elevator'), '')::TEXT
      END,
      single_double_family = CASE 
        WHEN p_asset_data->'single_double_family' IS NULL THEN single_double_family
        WHEN p_asset_data->'single_double_family' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'single_double_family'), '')::TEXT
      END,
      condo = CASE 
        WHEN p_asset_data->'condo' IS NULL THEN condo
        WHEN p_asset_data->'condo' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'condo'), '')::TEXT
      END,
      townhouses = CASE 
        WHEN p_asset_data->'townhouses' IS NULL THEN townhouses
        WHEN p_asset_data->'townhouses' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'townhouses'), '')::TEXT
      END,
      penthouse = CASE 
        WHEN p_asset_data->'penthouse' IS NULL THEN penthouse
        WHEN p_asset_data->'penthouse' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'penthouse'), '')::TEXT
      END,
      structure_drawing_url = CASE 
        WHEN p_asset_data->'structure_drawing_url' IS NULL THEN structure_drawing_url
        WHEN p_asset_data->'structure_drawing_url' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'structure_drawing_url'), '')::TEXT
      END,
      floor = CASE 
        WHEN p_asset_data->'floor' IS NULL THEN floor
        ELSE (p_asset_data->>'floor')::BIGINT
      END,
      discount_type = CASE 
        WHEN p_asset_data->'discount_type' IS NULL THEN discount_type
        WHEN p_asset_data->'discount_type' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'discount_type'), '')::TEXT
      END,
      discount_date_from = CASE 
        WHEN p_asset_data->'discount_date_from' IS NULL THEN discount_date_from
        WHEN p_asset_data->'discount_date_from' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'discount_date_from'), '')::TEXT
      END,
      discount_date_to = CASE 
        WHEN p_asset_data->'discount_date_to' IS NULL THEN discount_date_to
        WHEN p_asset_data->'discount_date_to' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'discount_date_to'), '')::TEXT
      END,
      area_from_distribution = CASE 
        WHEN p_asset_data->'area_from_distribution' IS NULL THEN area_from_distribution
        ELSE COALESCE((p_asset_data->>'area_from_distribution')::NUMERIC, 0)
      END,
      exported_to_automation = CASE 
        WHEN p_asset_data->'exported_to_automation' IS NULL THEN exported_to_automation
        ELSE COALESCE((p_asset_data->>'exported_to_automation')::BOOLEAN, false)
      END,
      comment = CASE 
        WHEN p_asset_data->'comment' IS NULL THEN comment
        WHEN p_asset_data->'comment' = 'null'::jsonb THEN NULL
        ELSE NULLIF((p_asset_data->>'comment'), '')::TEXT
      END,
      updated_at = NOW()
    WHERE asset_id = v_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 3: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 4: UPDATE DISTRIBUTION FLAGS IF ASSET TYPE CHANGED
  -- ========================================================================
  IF v_asset_type_changed AND v_old_main_asset_type IS NOT NULL AND v_new_main_asset_type IS NOT NULL THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
  END IF;

  -- ========================================================================
  -- STEP 5: UPDATE DISTRIBUTION FLAGS IF ASSET SIZE CHANGED
  -- ========================================================================
  IF v_asset_size_changed AND v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
     AND v_new_main_asset_type IS NOT NULL THEN
    -- Get business_residence for the asset type
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;

    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number
        AND COALESCE(business_shared_area, 0) > 0;
      
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset size changed → set residence distribution flag only
      -- BUT only if building has residence_shared_area > 0
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number
        AND COALESCE(residence_shared_area, 0) > 0;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 6: UPDATE DISTRIBUTION FLAGS IF TAX REGION CHANGED
  -- ========================================================================
  IF v_tax_region_changed AND v_new_main_asset_type IS NOT NULL THEN
    -- Get business_residence for the asset type
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;

    IF v_business_residence = 'עסקים' THEN
      -- Business asset tax_region changed → set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number
        AND COALESCE(business_shared_area, 0) > 0;
      
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset tax_region changed → set residence distribution flag only
      -- BUT only if building has residence_shared_area > 0
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number
        AND COALESCE(residence_shared_area, 0) > 0;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 7: CREATE AUDIT LOG
  -- ========================================================================
  v_audit_id := log_audit_for_asset(
    v_asset_id,
    CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_user_id,
    p_action_type::audit_action_type,
    false, -- p_copy_to_history
    p_description
  );

  -- ========================================================================
  -- STEP 8: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    'audit_id', v_audit_id,
    'message', 'Asset saved successfully with all post-save actions completed'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with transactional post-save actions. Sets distribution flags when asset type, size, or tax_region changes. Only sets flags if building has relevant shared area > 0.';

-- ============================================================================
-- FUNCTION: auto_set_distribution_flags_on_change - Add tax_region change detection
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;
DROP FUNCTION IF EXISTS auto_set_distribution_flags_on_change();

CREATE OR REPLACE FUNCTION auto_set_distribution_flags_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_business_residence TEXT;
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_tax_region_changed BOOLEAN := FALSE;
  v_old_type TEXT;
  v_new_type TEXT;
  v_building_record buildings;
BEGIN
  -- Only process INSERT or UPDATE
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Skip if no building_number or main_asset_type
  IF NEW.building_number IS NULL OR NEW.main_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get current building shared area values
  SELECT * INTO v_building_record FROM buildings WHERE building_number = NEW.building_number;

  -- Check if type, size, or tax_region changed (for UPDATE)
  IF TG_OP = 'UPDATE' THEN
    v_old_type := OLD.main_asset_type;
    v_new_type := NEW.main_asset_type;
    
    IF (v_old_type IS DISTINCT FROM v_new_type) THEN
      v_type_changed := TRUE;
    END IF;
    -- Check if asset_size changed (use IS DISTINCT FROM to handle NULLs correctly)
    IF (OLD.asset_size IS DISTINCT FROM NEW.asset_size) THEN
      v_size_changed := TRUE;
    END IF;
    -- Check if tax_region changed
    IF (OLD.tax_region IS DISTINCT FROM NEW.tax_region) THEN
      v_tax_region_changed := TRUE;
    END IF;
  ELSE
    -- For INSERT, check if asset_size is set
    IF NEW.asset_size IS NOT NULL AND NEW.asset_size > 0 THEN
      v_size_changed := TRUE;
    END IF;
    v_type_changed := TRUE; -- New asset always checks type
  END IF;

  -- Only proceed if something changed
  IF NOT v_type_changed AND NOT v_size_changed AND NOT v_tax_region_changed THEN
    RETURN NEW;
  END IF;

  -- Get business_residence for the asset type
  SELECT business_residence INTO v_business_residence
  FROM asset_types
  WHERE name = NEW.main_asset_type;

  -- Set appropriate distribution flag based on business_residence
  -- Handle size changes independently - if size changed, set flag based on current type
  IF v_size_changed THEN
    -- Size changed - set flag based on current type's business_residence
    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = true
        WHERE building_number = NEW.building_number;
      END IF;
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset size changed → set residence distribution flag only
      -- BUT only if building has residence_shared_area > 0
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = true
        WHERE building_number = NEW.building_number;
      END IF;
    END IF;
  END IF;

  -- If type changed, also set flags (only if relevant shared area > 0)
  IF v_type_changed THEN
    IF v_business_residence = 'עסקים' THEN
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = NEW.building_number;
      END IF;
    ELSIF v_business_residence = 'מגורים' THEN
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = NEW.building_number;
      END IF;
    END IF;
  END IF;

  -- If tax_region changed, also set flags (only if relevant shared area > 0)
  IF v_tax_region_changed THEN
    IF v_business_residence = 'עסקים' THEN
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = NEW.building_number;
      END IF;
    ELSIF v_business_residence = 'מגורים' THEN
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = NEW.building_number;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_set_distribution_flags_on_change IS 'Automatically sets building distribution flags when asset main_asset_type, asset_size, or tax_region changes. Only sets flags if building has relevant shared area > 0.';

-- Recreate trigger
CREATE TRIGGER trigger_auto_set_distribution_flags_on_change
  AFTER INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_distribution_flags_on_change();

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional - Add tax_region change detection
-- ============================================================================
-- Note: This function is too large to recreate here. The changes need to be made
-- directly in the main migration file (20251218000000_remove_backend_validation_checks.sql).
--
-- Required changes in save_assets_bulk_transactional:
--
-- 1. In DECLARE section (around line 760), add:
--    v_old_tax_region INTEGER;
--    v_new_tax_region INTEGER;
--    v_tax_region_changed BOOLEAN := FALSE;
--
-- 2. In the loop where existing asset is fetched (around line 950-956), add:
--    IF v_asset_found THEN
--      v_old_main_asset_type := v_existing_asset.main_asset_type;
--      v_old_asset_size := v_existing_asset.asset_size;
--      v_old_tax_region := v_existing_asset.tax_region;  -- ADD THIS LINE
--    ELSE
--      v_old_main_asset_type := NULL;
--      v_old_asset_size := NULL;
--      v_old_tax_region := NULL;  -- ADD THIS LINE
--    END IF;
--
-- 3. In the section where changes are detected (around line 1177-1186), add:
--    -- Determine if type changed
--    v_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
--    
--    -- Determine if size changed
--    v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, v_old_asset_size);
--    IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL THEN
--      v_size_changed := (ABS(v_old_asset_size - v_new_asset_size) > 0.0001);
--    ELSE
--      v_size_changed := FALSE;
--    END IF;
--    
--    -- Determine if tax_region changed  -- ADD THIS SECTION
--    v_new_tax_region := (v_asset_data->>'tax_region')::INTEGER;
--    v_tax_region_changed := (v_old_tax_region IS DISTINCT FROM v_new_tax_region);
--
-- 4. Change the condition (around line 1189) from:
--    IF v_type_changed OR v_size_changed THEN
--    to:
--    IF v_type_changed OR v_size_changed OR v_tax_region_changed THEN
--
-- These changes will ensure that tax_region changes also trigger distribution flags.

