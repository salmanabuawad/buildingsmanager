-- ============================================================================
-- Migration: Prevent distribution flags from being set when shared area is zero
-- ============================================================================
-- This migration updates all functions that set distribution flags to check
-- if the building's relevant shared area is zero/null before setting flags.
-- This prevents unnecessary distribution flags when there's no shared area to distribute.
--
-- Updated functions:
-- 1. save_asset_transactional - check shared area before setting flags for size/type changes
-- 2. set_distribution_flags_for_asset_type_change - check shared area before setting flags
-- 3. auto_set_distribution_flags_on_change - check shared area before setting flags (residence)
-- 4. save_assets_bulk_transactional - check shared area in flag setting logic (residence)
-- 5. delete_asset_transactional - check shared area before setting flags on delete

-- ============================================================================
-- FUNCTION: save_asset_transactional - Update STEP 5 (residence asset size change)
-- ============================================================================
-- Update the residence asset size change logic to check residence_shared_area > 0

-- Note: The function is defined in 20251218000000_remove_backend_validation_checks.sql
-- We need to update only the residence distribution flag setting part
-- (Business already has the check)

-- This will be done by updating the specific UPDATE statement in STEP 5

-- ============================================================================
-- FUNCTION: set_distribution_flags_for_asset_type_change - Check shared area
-- ============================================================================

-- Drop existing function first to avoid return type change error
DROP FUNCTION IF EXISTS set_distribution_flags_for_asset_type_change(BIGINT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION set_distribution_flags_for_asset_type_change(
  p_building_number BIGINT,
  p_old_main_asset_type TEXT,
  p_new_main_asset_type TEXT
)
RETURNS TABLE (
  business_flag_set BOOLEAN,
  residence_flag_set BOOLEAN
) AS $$
DECLARE
  v_old_type_data RECORD;
  v_new_type_data RECORD;
  v_old_is_non_accountable BOOLEAN;
  v_new_is_non_accountable BOOLEAN;
  v_business_residence TEXT;
  v_business_flag_set BOOLEAN := FALSE;
  v_residence_flag_set BOOLEAN := FALSE;
  v_building_record RECORD;
BEGIN
  -- Skip if no building_number
  IF p_building_number IS NULL THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;

  -- Get building's shared area values
  SELECT business_shared_area, residence_shared_area
  INTO v_building_record
  FROM buildings
  WHERE building_number = p_building_number;

  -- Exit early if type didn't change
  IF p_old_main_asset_type = p_new_main_asset_type 
     OR p_old_main_asset_type IS NOT DISTINCT FROM p_new_main_asset_type THEN
    RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
    RETURN;
  END IF;

  -- Lookup old asset type data
  IF p_old_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_old_type_data
    FROM asset_types
    WHERE name = p_old_main_asset_type;

    v_old_is_non_accountable := COALESCE(v_old_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_old_is_non_accountable := FALSE;
  END IF;

  -- Lookup new asset type data
  IF p_new_main_asset_type IS NOT NULL THEN
    SELECT business_residence, non_accountable_for_distribution
    INTO v_new_type_data
    FROM asset_types
    WHERE name = p_new_main_asset_type;

    v_new_is_non_accountable := COALESCE(v_new_type_data.non_accountable_for_distribution, FALSE);
  ELSE
    v_new_is_non_accountable := FALSE;
  END IF;

  -- Only set flags if changing to/from non_accountable type
  IF v_old_is_non_accountable OR v_new_is_non_accountable THEN
    -- Use the new type's business_residence, fall back to old type
    v_business_residence := COALESCE(v_new_type_data.business_residence, v_old_type_data.business_residence);

    -- Set appropriate distribution flag(s) - only if relevant shared area > 0
    IF v_business_residence = 'עסקים' THEN
      -- Business type - only set flag if building has business_shared_area > 0
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = p_building_number;
        
        v_business_flag_set := TRUE;
      END IF;

    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence type - only set flag if building has residence_shared_area > 0
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = p_building_number;
        
        v_residence_flag_set := TRUE;
      END IF;

    ELSE
      -- Unknown type or NULL: set both flags to be safe, but only if relevant shared area > 0
      IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_business_distribution = TRUE
        WHERE building_number = p_building_number;
        v_business_flag_set := TRUE;
      END IF;
      
      IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
        UPDATE buildings
        SET need_residence_distribution = TRUE
        WHERE building_number = p_building_number;
        v_residence_flag_set := TRUE;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_business_flag_set, v_residence_flag_set;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_distribution_flags_for_asset_type_change IS 'Explicitly sets building distribution flags when asset main_asset_type changes to/from non_accountable_for_distribution types. Only sets flags if building has relevant shared area > 0.';

-- ============================================================================
-- FUNCTION: auto_set_distribution_flags_on_change - Check shared area for residence
-- ============================================================================

-- Drop trigger first (it depends on the function)
DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;

-- Drop existing function
DROP FUNCTION IF EXISTS auto_set_distribution_flags_on_change();

CREATE OR REPLACE FUNCTION auto_set_distribution_flags_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_business_residence TEXT;
  v_type_changed BOOLEAN := FALSE;
  v_size_changed BOOLEAN := FALSE;
  v_old_type TEXT;
  v_new_type TEXT;
  v_building_record RECORD;
BEGIN
  -- Only process INSERT or UPDATE
  IF TG_OP = 'DELETE' THEN
    -- For DELETE, distribution flags should be set via delete_asset_transactional
    -- But we can still update building total area (handled above)
    RETURN OLD;
  END IF;

  -- Skip if no building_number or main_asset_type
  IF NEW.building_number IS NULL OR NEW.main_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get building's shared area values
  SELECT business_shared_area, residence_shared_area
  INTO v_building_record
  FROM buildings
  WHERE building_number = NEW.building_number;

  -- Check if type or size changed (for UPDATE)
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
  ELSE
    -- For INSERT, check if asset_size is set
    IF NEW.asset_size IS NOT NULL AND NEW.asset_size > 0 THEN
      v_size_changed := TRUE;
    END IF;
    v_type_changed := TRUE; -- New asset always checks type
  END IF;

  -- Only proceed if something changed
  IF NOT v_type_changed AND NOT v_size_changed THEN
    RETURN NEW;
  END IF;

  -- Get business_residence for the asset type
  SELECT business_residence INTO v_business_residence
  FROM asset_types
  WHERE name = NEW.main_asset_type;

  -- Set appropriate distribution flag based on business_residence
  -- Handle size changes independently - if size changed, set flag based on current type
  -- Only set flag if building has relevant shared area > 0
  IF v_size_changed THEN
    -- Size changed - set flag based on current type's business_residence
    IF v_business_residence = 'עסקים' THEN
      -- Business asset size changed → set business distribution flag only
      -- BUT only if building has business_shared_area > 0
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = NEW.building_number
        AND COALESCE(business_shared_area, 0) > 0;
    ELSIF v_business_residence = 'מגורים' THEN
      -- Residence asset size changed → set residence distribution flag only
      -- BUT only if building has residence_shared_area > 0
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = NEW.building_number
        AND COALESCE(residence_shared_area, 0) > 0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_set_distribution_flags_on_change IS 'Automatically sets building distribution flags when asset main_asset_type or asset_size changes. Only sets flags if building has relevant shared area > 0.';

-- Recreate the trigger
CREATE TRIGGER trigger_auto_set_distribution_flags_on_change
  AFTER INSERT OR UPDATE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_distribution_flags_on_change();

-- ============================================================================
-- FUNCTION: delete_asset_transactional - Check shared area before setting flags
-- ============================================================================

-- Drop existing function first to avoid return type change error
DROP FUNCTION IF EXISTS delete_asset_transactional(BIGINT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION delete_asset_transactional(
  p_asset_id BIGINT,
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_building_number INTEGER;
  v_asset_type TEXT;
  v_business_residence TEXT;
  v_before_data JSONB;
  v_action_id BIGINT;
  v_building_record RECORD;
BEGIN
  -- ========================================================================
  -- STEP 1: GET ASSET DATA (for audit and distribution flag logic)
  -- ========================================================================
  SELECT
    building_number,
    main_asset_type,
    row_to_json(assets.*)::JSONB
  INTO
    v_building_number,
    v_asset_type,
    v_before_data
  FROM assets
  WHERE asset_id = p_asset_id;

  IF v_building_number IS NULL THEN
    RAISE EXCEPTION 'Asset not found: %', p_asset_id;
  END IF;

  -- Get building's shared area values
  SELECT business_shared_area, residence_shared_area
  INTO v_building_record
  FROM buildings
  WHERE building_number = v_building_number;

  -- ========================================================================
  -- STEP 2: COPY ASSET TO HISTORY (for audit trail)
  -- ========================================================================
  BEGIN
    PERFORM copy_asset_to_history_before_update(p_asset_id);
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but continue (history copy is not critical)
    RAISE WARNING 'Failed to copy asset to history before deletion: %', SQLERRM;
  END;

  -- ========================================================================
  -- STEP 3: DELETE ASSET
  -- ========================================================================
  DELETE FROM assets WHERE asset_id = p_asset_id;

  -- ========================================================================
  -- STEP 4: UPDATE BUILDING TOTAL AREA
  -- ========================================================================
  PERFORM update_building_total_area(v_building_number);

  -- ========================================================================
  -- STEP 5: SET DISTRIBUTION FLAGS
  -- Asset deletion always requires redistribution
  -- Only set the relevant flag (business OR residence, not both)
  -- Only set flag if building has relevant shared area > 0
  -- ========================================================================

  -- Get asset type's business/residence classification
  SELECT business_residence
  INTO v_business_residence
  FROM asset_types
  WHERE name = v_asset_type;

  -- Set distribution flags based on asset type (using Hebrew values)
  -- Only set flag if building has relevant shared area > 0
  IF v_business_residence = 'עסקים' THEN
    -- Business asset deleted → need business redistribution only
    -- BUT only if building has business_shared_area > 0
    IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number;

      RAISE NOTICE 'Set need_business_distribution=true for building % (business asset deleted)', v_building_number;
    END IF;

  ELSIF v_business_residence = 'מגורים' THEN
    -- Residence asset deleted → need residence redistribution only
    -- BUT only if building has residence_shared_area > 0
    IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number;

      RAISE NOTICE 'Set need_residence_distribution=true for building % (residence asset deleted)', v_building_number;
    END IF;

  ELSE
    -- Unknown type → set both flags (safe default), but only if relevant shared area > 0
    -- This should only happen if business_residence is NULL or an unexpected value
    IF COALESCE(v_building_record.business_shared_area, 0) > 0 THEN
      UPDATE buildings
      SET need_business_distribution = true
      WHERE building_number = v_building_number;
    END IF;
    
    IF COALESCE(v_building_record.residence_shared_area, 0) > 0 THEN
      UPDATE buildings
      SET need_residence_distribution = true
      WHERE building_number = v_building_number;
    END IF;

    RAISE NOTICE 'Set distribution flags for building % (unknown asset type: %, business_residence: %)', v_building_number, v_asset_type, v_business_residence;
  END IF;

  -- ========================================================================
  -- STEP 6: CREATE AUDIT LOG ENTRY
  -- ========================================================================
  BEGIN
    -- Create audit action record
    INSERT INTO audit_log (
      operation,
      user_id,
      action_type,
      description,
      before_data
    )
    VALUES (
      'DELETE',
      p_user_id,
      'delete_asset',
      COALESCE(p_description, 'Asset deleted'),
      v_before_data
    )
    RETURNING action_id INTO v_action_id;

  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the transaction
    RAISE WARNING 'Failed to create audit log for asset deletion: %', SQLERRM;
  END;

  -- ========================================================================
  -- RETURN SUCCESS
  -- ========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'building_number', v_building_number,
    'action_id', v_action_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any error will cause automatic rollback of the entire transaction
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION delete_asset_transactional IS 'Delete an asset with all post-delete actions in ONE transaction. Only sets distribution flags if building has relevant shared area > 0.';

-- ============================================================================
-- Note: The save_asset_transactional and save_assets_bulk_transactional functions
-- are defined in 20251218000000_remove_backend_validation_checks.sql and will
-- be updated directly in that file to add the residence_shared_area check.
-- ============================================================================

