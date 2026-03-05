/*
  # Bulk transactional delete for assets

  Goal: any multi-row delete should be a single API call.
  This function deletes multiple assets in ONE database transaction by reusing the existing
  transactional delete function:
    - delete_asset_transactional(p_asset_id, p_user_id, p_description)
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

