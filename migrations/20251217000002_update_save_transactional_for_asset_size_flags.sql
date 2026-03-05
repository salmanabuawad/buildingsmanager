/*
  # Update save_asset_transactional to Handle Asset Size Changes for Distribution Flags
  
  This migration updates the save_asset_transactional function to also set
  distribution flags when asset_size changes (for business/residence assets),
  not just when asset type changes.
  
  Flags are set as part of the save transaction, ensuring they are only
  updated after successful saves and only the relevant flag is set.
*/

-- ============================================================================
-- FUNCTION: save_asset_transactional (UPDATED)
-- Purpose: Save asset with all post-save actions in ONE transaction
-- Now also handles asset_size changes for distribution flags
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
  v_old_main_asset_type BIGINT;
  v_new_main_asset_type BIGINT;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  v_audit_id BIGINT;
  v_result JSONB;
  v_business_residence TEXT;
  v_asset_type_changed BOOLEAN := FALSE;
  v_asset_size_changed BOOLEAN := FALSE;
BEGIN
  -- ========================================================================
  -- STEP 1: ENFORCE VALIDATION
  -- ========================================================================
  IF p_validation_passed IS NULL THEN
    RAISE EXCEPTION 'Validation status is required. Operations cannot proceed without validation.'
      USING HINT = 'Ensure validation is performed before calling this function';
  END IF;

  IF p_validation_passed = FALSE THEN
    RAISE EXCEPTION 'Validation failed: %', COALESCE(p_validation_errors, 'Unknown validation errors')
      USING HINT = 'Fix validation errors before attempting to save';
  END IF;

  -- ========================================================================
  -- STEP 2: EXTRACT DATA AND CHECK EXISTING ASSET
  -- ========================================================================
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  v_new_main_asset_type := (p_asset_data->>'main_asset_type')::BIGINT;
  v_new_asset_size := COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0);

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
    v_asset_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);
    v_asset_size_changed := (v_old_asset_size IS DISTINCT FROM v_new_asset_size);
  END IF;

  -- ========================================================================
  -- STEP 3: SAVE ASSET (INSERT OR UPDATE)
  -- ========================================================================
  IF v_existing_asset IS NULL THEN
    -- INSERT new asset
    INSERT INTO assets (
      asset_id,
      building_number,
      main_asset_type,
      sub_asset_type_1,
      sub_asset_type_2,
      sub_asset_type_3,
      sub_asset_type_4,
      sub_asset_type_5,
      sub_asset_type_6,
      asset_size,
      sub_asset_size_1,
      sub_asset_size_2,
      sub_asset_size_3,
      sub_asset_size_4,
      sub_asset_size_5,
      sub_asset_size_6,
      is_new_measurement,
      business_distribution_area,
      residence_distribution_area
    )
    VALUES (
      v_asset_id,
      v_building_number,
      v_new_main_asset_type,
      (p_asset_data->>'sub_asset_type_1')::BIGINT,
      (p_asset_data->>'sub_asset_type_2')::BIGINT,
      (p_asset_data->>'sub_asset_type_3')::BIGINT,
      (p_asset_data->>'sub_asset_type_4')::BIGINT,
      (p_asset_data->>'sub_asset_type_5')::BIGINT,
      (p_asset_data->>'sub_asset_type_6')::BIGINT,
      v_new_asset_size,
      COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      COALESCE((p_asset_data->>'is_new_measurement')::BOOLEAN, false),
      (p_asset_data->>'business_distribution_area')::NUMERIC,
      (p_asset_data->>'residence_distribution_area')::NUMERIC
    );
  ELSE
    -- Copy to history before update
    INSERT INTO assets_history (
      asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
      sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
      asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
      sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
      is_new_measurement, business_distribution_area, residence_distribution_area
    )
    SELECT 
      asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
      sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
      asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
      sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
      is_new_measurement, business_distribution_area, residence_distribution_area
    FROM assets
    WHERE asset_id = v_asset_id;

    -- UPDATE existing asset
    UPDATE assets
    SET
      main_asset_type = v_new_main_asset_type,
      sub_asset_type_1 = (p_asset_data->>'sub_asset_type_1')::BIGINT,
      sub_asset_type_2 = (p_asset_data->>'sub_asset_type_2')::BIGINT,
      sub_asset_type_3 = (p_asset_data->>'sub_asset_type_3')::BIGINT,
      sub_asset_type_4 = (p_asset_data->>'sub_asset_type_4')::BIGINT,
      sub_asset_type_5 = (p_asset_data->>'sub_asset_type_5')::BIGINT,
      sub_asset_type_6 = (p_asset_data->>'sub_asset_type_6')::BIGINT,
      asset_size = v_new_asset_size,
      sub_asset_size_1 = COALESCE((p_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
      sub_asset_size_2 = COALESCE((p_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
      sub_asset_size_3 = COALESCE((p_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
      sub_asset_size_4 = COALESCE((p_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
      sub_asset_size_5 = COALESCE((p_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
      sub_asset_size_6 = COALESCE((p_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
      is_new_measurement = COALESCE((p_asset_data->>'is_new_measurement')::BOOLEAN, false),
      business_distribution_area = (p_asset_data->>'business_distribution_area')::NUMERIC,
      residence_distribution_area = (p_asset_data->>'residence_distribution_area')::NUMERIC,
      updated_at = now()
    WHERE asset_id = v_asset_id;
  END IF;

  -- ========================================================================
  -- STEP 4: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 5: UPDATE DISTRIBUTION FLAGS (if type changed OR asset_size changed)
  -- Only set the relevant flag (business OR residence, not both)
  -- ========================================================================
  
  -- Get business_residence for the asset type
  IF v_new_main_asset_type IS NOT NULL THEN
    SELECT business_residence INTO v_business_residence
    FROM asset_types
    WHERE name = v_new_main_asset_type;
  END IF;
  
  -- Set flags if type changed (using existing function)
  IF v_asset_type_changed AND v_old_main_asset_type IS NOT NULL THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
  END IF;
  
  -- Also set flags if asset_size changed (for business/residence assets)
  IF v_asset_size_changed AND v_business_residence IS NOT NULL THEN
    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number;
      
      RAISE NOTICE 'Set need_business_distribution=true for building % (business asset size changed)', v_building_number;
      
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset size changed → set residence distribution flag only
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number;
      
      RAISE NOTICE 'Set need_residence_distribution=true for building % (residence asset size changed)', v_building_number;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG
  -- ========================================================================
  v_audit_id := log_audit_for_asset(
    v_asset_id,
    CASE WHEN v_existing_asset IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    p_action_type::audit_action_type,
    p_user_id,
    p_description
  );

  -- ========================================================================
  -- STEP 7: RETURN RESULT
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

-- Update comment
COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (save, update totals, set flags, audit) happen in ONE transaction. Sets distribution flags when asset type OR asset_size changes, only setting the relevant flag (business OR residence).';

