-- Allow clearing asset types (main_asset_type, sub_asset_type_1..6) when user removes them in UI.
-- COALESCE(null, old) kept the old value; use key-existence check so null can clear.
-- Aligns with current DB: reads pg_get_functiondef and patches the UPDATE SET lines.
DO $$
DECLARE
  fdef text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  -- Skip if already patched (idempotent)
  IF fdef NOT LIKE '%v_asset_data ? ''main_asset_type''%' THEN
    fdef := replace(fdef,
      'main_asset_type = COALESCE(v_new_main_asset_type, main_asset_type),',
      'main_asset_type = CASE WHEN v_asset_data ? ''main_asset_type'' THEN (v_asset_data->>''main_asset_type'')::TEXT ELSE main_asset_type END,'
    );
    fdef := replace(fdef,
      'sub_asset_type_1 = COALESCE((v_asset_data->>''sub_asset_type_1'')::TEXT, sub_asset_type_1),',
      'sub_asset_type_1 = CASE WHEN v_asset_data ? ''sub_asset_type_1'' THEN (v_asset_data->>''sub_asset_type_1'')::TEXT ELSE sub_asset_type_1 END,'
    );
    fdef := replace(fdef,
      'sub_asset_type_2 = COALESCE((v_asset_data->>''sub_asset_type_2'')::TEXT, sub_asset_type_2),',
      'sub_asset_type_2 = CASE WHEN v_asset_data ? ''sub_asset_type_2'' THEN (v_asset_data->>''sub_asset_type_2'')::TEXT ELSE sub_asset_type_2 END,'
    );
    fdef := replace(fdef,
      'sub_asset_type_3 = COALESCE((v_asset_data->>''sub_asset_type_3'')::TEXT, sub_asset_type_3),',
      'sub_asset_type_3 = CASE WHEN v_asset_data ? ''sub_asset_type_3'' THEN (v_asset_data->>''sub_asset_type_3'')::TEXT ELSE sub_asset_type_3 END,'
    );
    fdef := replace(fdef,
      'sub_asset_type_4 = COALESCE((v_asset_data->>''sub_asset_type_4'')::TEXT, sub_asset_type_4),',
      'sub_asset_type_4 = CASE WHEN v_asset_data ? ''sub_asset_type_4'' THEN (v_asset_data->>''sub_asset_type_4'')::TEXT ELSE sub_asset_type_4 END,'
    );
    fdef := replace(fdef,
      'sub_asset_type_5 = COALESCE((v_asset_data->>''sub_asset_type_5'')::TEXT, sub_asset_type_5),',
      'sub_asset_type_5 = CASE WHEN v_asset_data ? ''sub_asset_type_5'' THEN (v_asset_data->>''sub_asset_type_5'')::TEXT ELSE sub_asset_type_5 END,'
    );
    fdef := replace(fdef,
      'sub_asset_type_6 = COALESCE((v_asset_data->>''sub_asset_type_6'')::TEXT, sub_asset_type_6),',
      'sub_asset_type_6 = CASE WHEN v_asset_data ? ''sub_asset_type_6'' THEN (v_asset_data->>''sub_asset_type_6'')::TEXT ELSE sub_asset_type_6 END,'
    );

    IF fdef = (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'save_assets_bulk_transactional') THEN
      RAISE EXCEPTION 'Replace had no effect - search strings not found. Current DB may have different formatting.';
    END IF;
    EXECUTE fdef;
  END IF;
END $$;
