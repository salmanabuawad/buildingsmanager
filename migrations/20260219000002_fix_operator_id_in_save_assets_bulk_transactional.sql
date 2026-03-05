-- Ensure operator_id is written on INSERT and UPDATE in save_assets_bulk_transactional.
-- Matches current DB format (apartment_number, storage_floor, \r\n). Idempotent.
DO $$
DECLARE
  fdef text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  IF fdef NOT LIKE '%operator_id%' THEN
    -- INSERT column list: add operator_id after comment (before apartment_number)
    fdef := replace(fdef,
      E'discount_type, discount_date_from, discount_date_to, business_distribution_area, exported_to_automation, comment,\r\napartment_number, apartment_floor, storage_number, storage_floor',
      E'discount_type, discount_date_from, discount_date_to, business_distribution_area, exported_to_automation, comment, operator_id,\r\napartment_number, apartment_floor, storage_number, storage_floor'
    );
    -- INSERT values: add operator_id after (v_asset_data->>'comment')::TEXT
    fdef := replace(fdef,
      E'extract_boolean_from_jsonb(v_asset_data->''exported_to_automation'', false), (v_asset_data->>''comment'')::TEXT,\r\n(v_asset_data->>''apartment_number'')::TEXT',
      E'extract_boolean_from_jsonb(v_asset_data->''exported_to_automation'', false), (v_asset_data->>''comment'')::TEXT,\r\n(CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END),\r\n(v_asset_data->>''apartment_number'')::TEXT'
    );
    -- UPDATE: add operator_id set before apartment_number
    fdef := replace(fdef,
      E'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),\r\napartment_number = COALESCE',
      E'comment = COALESCE((v_asset_data->>''comment'')::TEXT, comment),\r\noperator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\r\napartment_number = COALESCE'
    );

    IF fdef NOT LIKE '%operator_id%' THEN
      RAISE EXCEPTION 'operator_id patch had no effect - function format may have changed.';
    END IF;
    EXECUTE fdef;
  END IF;
END $$;
