/*
  # Update save_assets_bulk_transactional to Handle Distribution Flag Removal
  
  This migration updates the save_assets_bulk_transactional function to remove
  distribution flags when action_type is 'distribute_shared', as part of the
  same transaction as the asset updates.
  
  This ensures that:
  1. Flags are only removed after successful save
  2. If save fails, flags remain set (transaction rollback)
  3. Only the relevant flag is removed (business OR residence, not both)
  4. Flag removal is atomic with asset updates
*/

-- ============================================================================
-- FUNCTION: save_assets_bulk_transactional (UPDATED)
-- Purpose: Bulk save assets with all post-save actions in ONE transaction
-- Now also removes distribution flags for distribute_shared actions
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
  v_building_num_for_flag BIGINT;
  v_distribution_type TEXT; -- 'residence' or 'business'
  v_asset_type_name TEXT;
  v_business_residence TEXT;
  v_business_dist_area NUMERIC;
  v_old_asset_size NUMERIC;
  v_new_asset_size NUMERIC;
  -- Store old values for each asset to use in STEP 6
  v_asset_old_values RECORD;
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
  INSERT INTO audit (action_type, user_id, entity_type, entity_id, before_data, after_data, description, created_at)
  VALUES (
    p_action_type::audit_action_type,
    v_user_id_fk,
    'bulk_asset', -- entity_type for bulk operations
    NULL, -- entity_id will be set after we know all affected asset IDs
    p_before_data,
    p_after_data,
    p_description,
    now()
  )
  RETURNING action_id INTO v_action_id;

  -- ========================================================================
  -- STEP 4: PROCESS EACH ASSET
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    -- Remove any fields that don't exist in assets table to prevent errors
    -- This includes 'id' (AG Grid internal field) and other non-database fields
    -- Use jsonb subtraction operator to remove multiple keys at once
    -- Note: PostgreSQL jsonb subtraction operator can remove multiple keys
    v_asset_data := v_asset_data - 'id' - '_isNew' - '_isDirty' - '_validationErrors' - '_isMasterRow';
    
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;

    IF v_asset_id IS NULL OR v_building_number IS NULL THEN
      RAISE EXCEPTION 'Asset ID and Building Number are required for all assets'
        USING HINT = 'Ensure all assets in p_assets_data have asset_id and building_number';
    END IF;

    -- Store building number for flag removal (use first building if multiple)
    IF v_building_num_for_flag IS NULL THEN
      v_building_num_for_flag := v_building_number;
    END IF;

    -- Check if asset exists
    SELECT * INTO v_existing_asset
    FROM assets
    WHERE asset_id = v_asset_id;

    IF FOUND THEN
      v_old_main_asset_type := v_existing_asset.main_asset_type;
      v_old_asset_size := v_existing_asset.asset_size;
      
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
  -- STEP 6: UPDATE DISTRIBUTION FLAGS FOR ALL ASSETS WITH TYPE OR SIZE CHANGES
  -- Note: During distribution, asset types are updated (e.g., to 199 for residence)
  -- We need to set flags for these type changes, then remove them after successful distribution
  -- ========================================================================
  FOREACH v_asset_data IN ARRAY p_assets_data
  LOOP
    v_asset_id := (v_asset_data->>'asset_id')::BIGINT;
    v_building_number := (v_asset_data->>'building_number')::BIGINT;
    v_new_main_asset_type := (v_asset_data->>'main_asset_type')::BIGINT;
    v_new_asset_size := COALESCE((v_asset_data->>'asset_size')::NUMERIC, 0);

    -- Get old type and size from the history entry we just created in STEP 4
    -- This represents the state BEFORE the current update
    -- We use action_id to get the specific history entry for this transaction
    SELECT main_asset_type, asset_size 
    INTO v_asset_old_values
    FROM assets_history
    WHERE asset_id = v_asset_id
      AND action_id = v_action_id  -- Only get the history entry we just created in this transaction
    ORDER BY history_created_at DESC NULLS LAST, created_at DESC
    LIMIT 1;
    
    -- Extract old values if found
    IF FOUND THEN
      v_old_main_asset_type := v_asset_old_values.main_asset_type;
      v_old_asset_size := v_asset_old_values.asset_size;
    ELSE
      -- New asset - no old values to compare
      v_old_main_asset_type := NULL;
      v_old_asset_size := NULL;
    END IF;

    -- Update flags if type changed (using existing function)
    IF v_old_main_asset_type IS NOT NULL AND v_old_main_asset_type != v_new_main_asset_type THEN
      PERFORM set_distribution_flags_for_asset_type_change(
        v_building_number,
        v_old_main_asset_type,
        v_new_main_asset_type
      );
    END IF;

    -- Also set flags if asset_size changed (for business/residence assets)
    IF v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL 
       AND v_old_asset_size != v_new_asset_size 
       AND v_new_main_asset_type IS NOT NULL THEN
      -- Get business_residence for the asset type
      SELECT business_residence INTO v_business_residence
      FROM asset_types
      WHERE name = v_new_main_asset_type;

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
  END LOOP;

  -- ========================================================================
  -- STEP 7: REMOVE DISTRIBUTION FLAGS FOR distribute_shared ACTIONS
  -- Only after successful save, and only the relevant flag
  -- ========================================================================
  IF p_action_type = 'distribute_shared' AND v_building_num_for_flag IS NOT NULL THEN
    -- Determine distribution type by checking description first (most reliable)
    -- Then check asset data fields as fallback
    v_distribution_type := NULL;
    
    -- STEP 7a: Check description (most reliable method)
    IF p_description IS NOT NULL THEN
      IF LOWER(p_description) LIKE '%residence%' OR LOWER(p_description) LIKE '%מגורים%' THEN
        v_distribution_type := 'residence';
      ELSIF LOWER(p_description) LIKE '%business%' OR LOWER(p_description) LIKE '%עסקים%' THEN
        v_distribution_type := 'business';
      END IF;
    END IF;
    
    -- STEP 7b: If description didn't help, check asset data
    IF v_distribution_type IS NULL AND array_length(p_assets_data, 1) > 0 THEN
      -- Check if business_distribution_area is being updated (business distribution)
      FOREACH v_asset_data IN ARRAY p_assets_data
      LOOP
        -- Check if business_distribution_area is set and non-zero
        BEGIN
          IF (v_asset_data->>'business_distribution_area') IS NOT NULL THEN
            v_business_dist_area := (v_asset_data->>'business_distribution_area')::NUMERIC;
            IF v_business_dist_area IS NOT NULL AND v_business_dist_area > 0 THEN
              v_distribution_type := 'business';
              EXIT; -- Found business distribution, no need to check more
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore conversion errors, continue checking
          NULL;
        END;
      END LOOP;
      
      -- If still not determined, check if main_asset_type is 199 (residence distribution)
      IF v_distribution_type IS NULL THEN
        v_asset_type_name := (p_assets_data[1]->>'main_asset_type');
        -- Check both string and numeric comparison
        IF v_asset_type_name = '199' OR v_asset_type_name::BIGINT = 199 THEN
          v_distribution_type := 'residence';
        END IF;
      END IF;
    END IF;
    
    -- STEP 7c: Remove the relevant flag only
    IF v_distribution_type = 'residence' THEN
      -- Residence distribution → remove residence flag
      UPDATE buildings
      SET need_residence_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
      RAISE NOTICE 'Removed need_residence_distribution flag for building % (residence distribution completed)', v_building_num_for_flag;
      
    ELSIF v_distribution_type = 'business' THEN
      -- Business distribution → remove business flag
      UPDATE buildings
      SET need_business_distribution = false
      WHERE building_number = v_building_num_for_flag;
      
      RAISE NOTICE 'Removed need_business_distribution flag for building % (business distribution completed)', v_building_num_for_flag;
    ELSE
      -- Could not determine type - log warning but don't fail
      RAISE WARNING 'Could not determine distribution type for building %. Description: %, Flags not removed.', 
        v_building_num_for_flag, 
        COALESCE(p_description, 'NULL');
    END IF;
  END IF;

  -- ========================================================================
  -- STEP 8: UPDATE AUDIT ENTRY WITH ENTITY_ID (comma-separated asset IDs)
  -- ========================================================================
  IF array_length(v_affected_asset_ids, 1) > 0 THEN
    UPDATE audit
    SET entity_id = array_to_string(v_affected_asset_ids, ',')
    WHERE action_id = v_action_id;
  END IF;

  -- ========================================================================
  -- STEP 9: RETURN RESULT
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
    -- This includes asset updates AND flag removal
    RAISE EXCEPTION 'Bulk transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved. Distribution flags remain set.';
END;
$$;

-- Update comment
COMMENT ON FUNCTION save_assets_bulk_transactional IS 'Bulk save assets with validation enforcement and transactional post-save actions. Rejects if validation failed. All operations (saves, update totals, set flags, remove flags for distribute_shared, audit) happen in ONE transaction. For distribute_shared actions, removes the relevant distribution flag (business OR residence) only after successful save.';

