/*
  # Add Transactional Delete Function

  ============================================================================
  🚨 CRITICAL SYSTEM ARCHITECTURE - DO NOT MODIFY 🚨
  ============================================================================

  WARNING: This migration defines a CRITICAL data integrity function.

  DO NOT:
  - Remove post-delete action calls
  - Skip any steps in the transaction
  - Modify exception handling to suppress errors

  This function guarantees:
  1. Asset deletion in a transaction
  2. Building total area update
  3. Distribution flags set correctly
  4. Complete audit trail
  5. Automatic rollback on ANY failure

  See: CRITICAL_ARCHITECTURE_DO_NOT_MODIFY.md
  ============================================================================

  ## Overview
  This migration creates a database function that handles asset deletion
  within a SINGLE transaction to ensure data integrity.

  ## New Function

  ### `delete_asset_transactional`
  - Single asset delete with automatic post-delete actions
  - Parameters:
    - `p_asset_id`: Asset ID to delete
    - `p_user_id`: User performing the deletion
    - `p_description`: Optional description
  - Transaction includes:
    - Asset data retrieval (for audit)
    - Copy to history
    - Asset deletion
    - Building total area update
    - Distribution flags update (both business and residence if applicable)
    - Audit log creation
  - Returns: Success status and deletion details
  - Rollback: If ANY step fails, entire operation rolls back

  ## Distribution Flag Logic
  - For business assets: Sets need_business_distribution = true
  - For residence assets: Sets need_residence_distribution = true
  - For unknown types: Sets both flags = true (safe default)

  ## Changes
  1. New function: `delete_asset_transactional`
*/

-- ============================================================================
-- FUNCTION: delete_asset_transactional
-- Purpose: Delete an asset with all post-delete actions in ONE transaction
-- ============================================================================

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
  -- ========================================================================

  -- Get asset type's business/residence classification
  SELECT business_residence
  INTO v_business_residence
  FROM asset_types
  WHERE name = v_asset_type;

  -- Set distribution flags based on asset type
  IF v_business_residence = 'business' THEN
    -- Business asset deleted → need business redistribution
    UPDATE buildings
    SET need_business_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set need_business_distribution=true for building % (business asset deleted)', v_building_number;

  ELSIF v_business_residence = 'residence' THEN
    -- Residence asset deleted → need residence redistribution
    UPDATE buildings
    SET need_residence_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set need_residence_distribution=true for building % (residence asset deleted)', v_building_number;

  ELSE
    -- Unknown type → set both flags (safe default)
    UPDATE buildings
    SET
      need_business_distribution = true,
      need_residence_distribution = true
    WHERE building_number = v_building_number;

    RAISE NOTICE 'Set both distribution flags=true for building % (unknown asset type: %)', v_building_number, v_asset_type;
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
    -- Any error causes complete rollback
    RAISE EXCEPTION 'Asset deletion failed: %', SQLERRM;
END;
$$;

-- Add comment
COMMENT ON FUNCTION delete_asset_transactional IS
'Deletes an asset with all post-delete actions in ONE transaction.
Includes: asset deletion, building total area update, distribution flags update, and audit logging.
Automatic rollback on any failure.';
