/*
  # Add Transactional Save Functions with Validation Enforcement

  ============================================================================
  🚨 CRITICAL SYSTEM ARCHITECTURE - DO NOT MODIFY 🚨
  ============================================================================

  WARNING: This migration defines CRITICAL data integrity functions.

  DO NOT:
  - Remove validation checks
  - Remove post-save action calls
  - Make validation optional
  - Add COMMIT/ROLLBACK statements
  - Skip any steps in the transaction
  - Modify exception handling to suppress errors

  These functions guarantee:
  1. Validation enforcement (invalid data CANNOT be saved)
  2. Transaction integrity (all-or-nothing saves)
  3. Automatic rollback on ANY failure
  4. No partial saves ever

  See: CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md
  ============================================================================

  ## Overview
  This migration creates new database functions that enforce validation BEFORE save
  and execute all post-save actions within a SINGLE transaction to ensure data integrity.

  ## New Functions

  ### 1. `save_asset_transactional`
  - Single asset save with validation enforcement
  - Parameters:
    - `p_asset_data`: Asset data to save (JSONB)
    - `p_validation_passed`: Boolean flag indicating validation status (REQUIRED)
    - `p_validation_errors`: Validation error messages (if any)
    - `p_action_type`: Type of action (insert/update/replace)
    - `p_user_id`: User performing the action
    - `p_description`: Optional description
  - Transaction includes:
    - Validation check (rejects if validation failed)
    - Asset save (INSERT or UPDATE)
    - Building total area update
    - Distribution flags update
    - Audit log creation
  - Returns: Asset ID and transaction status
  - Rollback: If ANY step fails, entire operation rolls back

  ### 2. `save_assets_bulk_transactional`
  - Bulk asset save with validation enforcement
  - Parameters:
    - `p_assets_data`: Array of assets to save (JSONB[])
    - `p_validation_passed`: Boolean flag for overall validation status
    - `p_validation_errors`: Validation error messages (if any)
    - `p_action_type`: Type of action
    - `p_user_id`: User performing the action
    - `p_before_data`: Before state (for audit)
    - `p_after_data`: After state (for audit)
    - `p_description`: Optional description
  - Transaction includes:
    - Validation check (rejects if validation failed)
    - All asset saves
    - Building total area updates (for all affected buildings)
    - Distribution flags updates (for all affected buildings)
    - Single audit log entry
  - Returns: Action ID, affected asset IDs, and count
  - Rollback: If ANY step fails, entire bulk operation rolls back

  ## Security
  - Functions are SECURITY DEFINER (run with elevated privileges)
  - Validation enforcement prevents invalid data from being saved
  - All operations are atomic (all succeed or all fail)

  ## Important Notes
  1. Validation MUST be performed in application before calling these functions
  2. Functions will REJECT operations if p_validation_passed = false
  3. All post-save actions happen in the SAME transaction as the save
  4. Error handling ensures proper rollback on any failure
*/

-- ============================================================================
-- Function: save_asset_transactional
-- Single asset save with validation enforcement and transactional post-save actions
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
  v_audit_id BIGINT;
  v_result JSONB;
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
      COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0),
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
      asset_size = COALESCE((p_asset_data->>'asset_size')::NUMERIC, 0),
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
  -- STEP 5: UPDATE DISTRIBUTION FLAGS IF ASSET TYPE CHANGED
  -- ========================================================================
  IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
    PERFORM set_distribution_flags_for_asset_type_change(
      v_building_number,
      v_old_main_asset_type,
      v_new_main_asset_type
    );
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

COMMENT ON FUNCTION save_asset_transactional IS 'Save single asset with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (save, update totals, set flags, audit) happen in ONE transaction.';

-- ============================================================================
-- Function: save_assets_bulk_transactional
-- Bulk asset save with validation enforcement and transactional post-save actions
-- ============================================================================
CREATE OR REPLACE FUNCTION save_assets_bulk_transactional(
  p_assets_data JSONB[],
  p_validation_passed BOOLEAN,
  p_validation_errors TEXT DEFAULT NULL,
  p_action_type TEXT DEFAULT 'manual_update',
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
  v_asset_data JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
  v_existing_asset RECORD;
  v_old_main_asset_type BIGINT;
  v_new_main_asset_type BIGINT;
  v_affected_asset_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_affected_buildings BIGINT[] := ARRAY[]::BIGINT[];
  v_action_id BIGINT;
  v_count INTEGER := 0;
  v_result JSONB;
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
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
  -- STEP 2: GET OR CREATE USER
  -- ========================================================================
  IF p_user_id IS NOT NULL THEN
    SELECT id INTO v_user_id_fk FROM users WHERE auth_user_id = p_user_id;
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, email, created_at)
      VALUES (p_user_id, p_user_id || '@system.local', now())
      RETURNING id INTO v_user_id_fk;
    END IF;
  ELSE
    SELECT id INTO v_user_id_fk FROM users WHERE id = v_default_user_id;
    IF v_user_id_fk IS NULL THEN
      v_user_id_fk := v_default_user_id;
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 3: CREATE ACTION ENTRY
  -- ========================================================================
  INSERT INTO actions (action_type, user_id, before_data, after_data, description, created_at)
  VALUES (
    p_action_type::audit_action_type,
    v_user_id_fk,
    p_before_data,
    p_after_data,
    p_description,
    now()
  )
  RETURNING id INTO v_action_id;

  -- ========================================================================
  -- STEP 4: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    IF FOUND THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      
      -- Copy to history before update
      INSERT INTO assets_history (
        asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
        sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
        asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
        sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
        is_new_measurement, business_distribution_area, residence_distribution_area,
        action_id
      )
      SELECT 
        asset_id, building_number, main_asset_type, sub_asset_type_1, sub_asset_type_2,
        sub_asset_type_3, sub_asset_type_4, sub_asset_type_5, sub_asset_type_6,
        asset_size, sub_asset_size_1, sub_asset_size_2, sub_asset_size_3,
        sub_asset_size_4, sub_asset_size_5, sub_asset_size_6,
        is_new_measurement, business_distribution_area, residence_distribution_area,
        v_action_id
      FROM assets
      WHERE asset_id = v_asset_id;

      -- UPDATE existing asset
      UPDATE assets
      SET
        main_asset_type = v_new_main_asset_type,
        sub_asset_type_1 = (v_asset_data->>'sub_asset_type_1')::BIGINT,
        sub_asset_type_2 = (v_asset_data->>'sub_asset_type_2')::BIGINT,
        sub_asset_type_3 = (v_asset_data->>'sub_asset_type_3')::BIGINT,
        sub_asset_type_4 = (v_asset_data->>'sub_asset_type_4')::BIGINT,
        sub_asset_type_5 = (v_asset_data->>'sub_asset_type_5')::BIGINT,
        sub_asset_type_6 = (v_asset_data->>'sub_asset_type_6')::BIGINT,
        asset_size = COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        sub_asset_size_1 = COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        sub_asset_size_2 = COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        sub_asset_size_3 = COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        sub_asset_size_4 = COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        sub_asset_size_5 = COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        sub_asset_size_6 = COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        is_new_measurement = COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false),
        business_distribution_area = (v_asset_data->>'business_distribution_area')::NUMERIC,
        residence_distribution_area = (v_asset_data->>'residence_distribution_area')::NUMERIC,
        action_id = v_action_id,
        updated_at = now()
      WHERE asset_id = v_asset_id;
    ELSE
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
        residence_distribution_area,
        action_id
      )
      VALUES (
        v_asset_id,
        v_building_number,
        v_new_main_asset_type,
        (v_asset_data->>'sub_asset_type_1')::BIGINT,
        (v_asset_data->>'sub_asset_type_2')::BIGINT,
        (v_asset_data->>'sub_asset_type_3')::BIGINT,
        (v_asset_data->>'sub_asset_type_4')::BIGINT,
        (v_asset_data->>'sub_asset_type_5')::BIGINT,
        (v_asset_data->>'sub_asset_type_6')::BIGINT,
        COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_1')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_2')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_3')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_4')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_5')::NUMERIC, 0),
        COALESCE((v_asset_data->>'sub_asset_size_6')::NUMERIC, 0),
        COALESCE((v_asset_data->>'is_new_measurement')::BOOLEAN, false),
        (v_asset_data->>'business_distribution_area')::NUMERIC,
        (v_asset_data->>'residence_distribution_area')::NUMERIC,
        v_action_id
      );
      
      v_old_main_asset_type := NULL;
    END IF;

    -- Track affected assets and buildings
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    IF NOT (v_building_number = ANY(v_affected_buildings)) THEN
      v_affected_buildings := array_append(v_affected_buildings, v_building_number);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ========================================================================
  -- STEP 5: UPDATE BUILDING TOTAL AREAS FOR ALL AFFECTED BUILDINGS
  -- ========================================================================
  FOREACH v_building_number IN ARRAY v_affected_buildings
  LOOP
    PERFORM update_building_total_area(v_building_number);
  END LOOP;

  -- ========================================================================
  -- STEP 6: UPDATE DISTRIBUTION FLAGS FOR ALL ASSETS WITH TYPE CHANGES
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;

    -- Get old type from history
    SELECT main_asset_type INTO v_old_main_asset_type
    FROM assets_history
    WHERE asset_id = v_asset_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Update flags if type changed
    IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
      PERFORM set_distribution_flags_for_asset_type_change(
        v_building_number,
        v_old_main_asset_type,
        v_new_main_asset_type
      );
    END IF;
  END LOOP;

  -- ========================================================================
  -- STEP 7: RETURN RESULT
  -- ========================================================================
  v_result := jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'affected_asset_ids', v_affected_asset_ids,
    'affected_buildings', v_affected_buildings,
    'count', v_count,
    'message', format('Successfully saved %s assets with all post-save actions completed', v_count)
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (saves, update totals, set flags, audit) happen in ONE transaction.';
