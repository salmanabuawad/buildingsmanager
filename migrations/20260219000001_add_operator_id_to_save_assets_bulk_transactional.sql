-- Add operator_id to save_assets_bulk_transactional so operator is persisted on insert/update.
-- Frontend now sends operator_id in p_assets_data (sanitizeAssetInput includes it).
DO $$
DECLARE
  fdef text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  -- Skip if already patched (idempotent)
  IF fdef NOT LIKE '%operator_id%' THEN
    -- INSERT: add operator_id to column list
    fdef := replace(fdef,
      'exported_to_automation, comment
)',
      'exported_to_automation, comment, operator_id
)'
    );
    -- INSERT: add operator_id value (nullable)
    fdef := replace(fdef,
      'extract_boolean_from_jsonb(v_asset_data->''exported_to_automation'', false), (v_asset_data->>''comment'')::TEXT
);',
      'extract_boolean_from_jsonb(v_asset_data->''exported_to_automation'', false), (v_asset_data->>''comment'')::TEXT,
 (CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END)
);'
    );
    -- UPDATE: add operator_id set (allow null to clear)
    fdef := replace(fdef,
      'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),
updated_at = NOW()',
      'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),
operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,
updated_at = NOW()'
    );

    EXECUTE fdef;
  END IF;
END $$;
