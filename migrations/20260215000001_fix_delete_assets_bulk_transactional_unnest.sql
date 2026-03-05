-- Fix "column unnest does not exist" in bulk asset delete.
-- Cause: WHERE unnest IS NOT NULL references unnest as a column name;
-- unnest() is a function and must be used in FROM with an alias.
-- Fix: use FROM unnest(v_ids) AS u and WHERE u IS NOT NULL.

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
  -- Normalize: remove NULLs and duplicates (use alias for unnest result)
  SELECT ARRAY(
    SELECT DISTINCT u
    FROM unnest(v_ids) AS u
    WHERE u IS NOT NULL
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
