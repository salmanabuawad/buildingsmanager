-- Fix: Asset type change from Assets List was not setting distribution flag despite type being updated in DB.
-- Root cause: v_type_changed used v_new_main_asset_type which can diverge from what the UPDATE actually writes.
-- The UPDATE uses: CASE WHEN v_asset_data ? 'main_asset_type' THEN (v_asset_data->>'main_asset_type')::TEXT ELSE main_asset_type END
-- So change detection must use the same key-existence check for consistency.
DO $$
DECLARE
  fdef text;
  orig text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  -- Skip if already patched (idempotent)
  IF fdef LIKE '%v_type_changed := (v_asset_data ? ''main_asset_type'' AND%' THEN
    RAISE NOTICE 'Type change detection already patched';
    RETURN;
  END IF;

  orig := fdef;

  -- Replace v_type_changed detection to use payload directly (consistent with UPDATE)
  -- When main_asset_type is NOT in payload, treat as no change (key-existence check).
  -- Pattern 1: full assignment line (handles common formatting)
  fdef := regexp_replace(fdef,
    'v_type_changed\s*:=\s*\(\s*v_old_main_asset_type\s+IS\s+DISTINCT\s+FROM\s+v_new_main_asset_type\s*\)\s*;',
    E'v_type_changed := (v_asset_data ? ''main_asset_type'' AND (v_old_main_asset_type IS DISTINCT FROM NULLIF(TRIM((v_asset_data->>''main_asset_type'')::TEXT), ''''))) ;',
    'g'
  );
  -- Pattern 2 (fallback): just the comparison expression
  IF fdef = orig THEN
    fdef := regexp_replace(fdef,
      '\(\s*v_old_main_asset_type\s+IS\s+DISTINCT\s+FROM\s+v_new_main_asset_type\s*\)',
      E'(v_asset_data ? ''main_asset_type'' AND (v_old_main_asset_type IS DISTINCT FROM NULLIF(TRIM((v_asset_data->>''main_asset_type'')::TEXT), '''')))',
      'g'
    );
  END IF;

  IF fdef = orig THEN
    RAISE EXCEPTION '20260306140000: pattern not found in function - run SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = ''save_assets_bulk_transactional'' and check v_type_changed line';
  END IF;
  EXECUTE fdef;
  RAISE NOTICE 'Fixed v_type_changed detection for distribution flag';
  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
