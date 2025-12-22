/*
  # Consolidate Asset Save Functions
  
  This migration ensures that save_assets_bulk_transactional is the primary
  function for all asset saves (single and bulk). The single asset save function
  is kept for backward compatibility but now wraps the bulk function.
  
  All distribution flag logic, audit logging, and transaction handling is
  centralized in the bulk function.
  
  Key features:
  - Single asset saves now use bulk function internally
  - Distribution flags set correctly for business/residence assets
  - Business distribution flag only set if business_shared_area > 0
  - Complete audit logging for all operations
  - Transaction integrity (all-or-nothing)
*/

-- ============================================================================
-- FUNCTION: save_asset_transactional (WRAPPER - uses bulk function)
-- ============================================================================
-- This function is kept for backward compatibility but now delegates to
-- save_assets_bulk_transactional to ensure consistency.

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
  v_result JSONB;
  v_asset_id BIGINT;
  v_building_number BIGINT;
BEGIN
  -- Extract asset_id and building_number for result
  v_asset_id := (p_asset_data->>'asset_id')::BIGINT;
  v_building_number := (p_asset_data->>'building_number')::BIGINT;
  
  -- Wrap single asset in array and call bulk function
  v_result := save_assets_bulk_transactional(
    ARRAY[p_asset_data],
    p_validation_passed,
    p_validation_errors,
    p_action_type,
    p_user_id,
    NULL, -- p_before_data
    NULL, -- p_after_data
    p_description
  );
  
  -- Check if bulk function succeeded
  IF COALESCE((v_result->>'success')::BOOLEAN, false) = false THEN
    -- Return error in expected format
    RETURN jsonb_build_object(
      'success', false,
      'asset_id', v_asset_id,
      'error', COALESCE(v_result->>'error', 'Unknown error during save')
    );
  END IF;
  
  -- Return result in the format expected by single asset save callers
  RETURN jsonb_build_object(
    'success', true,
    'asset_id', v_asset_id,
    'building_number', v_building_number,
    'operation', CASE 
      WHEN (v_result->>'count')::INTEGER > 0 THEN 'UPDATE'
      ELSE 'INSERT'
    END,
    'message', COALESCE(v_result->>'message', 'Asset saved successfully')
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Transaction failed and rolled back: %', SQLERRM
      USING HINT = 'All changes have been rolled back. No partial data was saved.';
END;
$$;

COMMENT ON FUNCTION save_asset_transactional IS 'Wrapper function that delegates to save_assets_bulk_transactional for consistency. Kept for backward compatibility. All single asset saves now use the bulk function internally.';

