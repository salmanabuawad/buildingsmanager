/*
  # Bulk Transactional Delete for Assets

  ## Overview
  This migration creates a database function that handles bulk asset deletion
  within a SINGLE transaction to ensure data integrity.

  ## New Function

  ### `delete_assets_bulk_transactional`
  - Bulk asset delete with automatic post-delete actions
  - Parameters:
    - `p_asset_ids`: Array of asset IDs to delete
    - `p_user_id`: User performing the deletion (optional)
    - `p_description`: Optional description for audit log
  - Transaction includes:
    - Calls delete_asset_transactional for each asset
    - All deletions in ONE transaction
    - Complete rollback if ANY deletion fails
  - Returns: Success status, count of deleted assets, and asset IDs

  ## Implementation
  - Normalizes input array (removes NULLs and duplicates)
  - Iterates through each asset ID
  - Calls delete_asset_transactional for each asset
  - If any deletion fails, entire batch is rolled back
*/

CREATE OR REPLACE FUNCTION delete_assets_bulk_transactional(
  p_asset_ids BIGINT[],
  p_user_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ids BIGINT[] := COALESCE(p_asset_ids, ARRAY[]::BIGINT[]);
  v_id BIGINT;
  v_count INTEGER := 0;
BEGIN
  -- Normalize: remove NULLs and duplicates
  SELECT ARRAY(
    SELECT DISTINCT unnest(v_ids)
    WHERE unnest IS NOT NULL
  ) INTO v_ids;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'count', 0,
      'asset_ids', ARRAY[]::BIGINT[]
    );
  END IF;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    -- Reuse existing transactional delete logic (history, total area, flags, etc.)
    PERFORM delete_asset_transactional(
      p_asset_id := v_id,
      p_user_id := p_user_id,
      p_description := COALESCE(p_description, 'Bulk asset delete')
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'asset_ids', v_ids
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Bulk asset delete failed and rolled back: %', SQLERRM
      USING HINT = 'All deletions have been rolled back. No partial data was deleted.';
END;
$$;

COMMENT ON FUNCTION delete_assets_bulk_transactional IS 'Delete multiple assets in one transaction by calling delete_asset_transactional for each asset_id.';