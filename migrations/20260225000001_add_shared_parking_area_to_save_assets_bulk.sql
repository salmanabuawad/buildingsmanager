-- Add shared_parking_area to save_assets_bulk_transactional INSERT/UPDATE (after operator_id). Idempotent.
DO $$
DECLARE
  fdef text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  IF fdef NOT LIKE '%shared_parking_area%' THEN
    fdef := replace(fdef,
      E'comment, operator_id,\r\napartment_number, apartment_floor, storage_number, storage_floor',
      E'comment, operator_id, shared_parking_area,\r\napartment_number, apartment_floor, storage_number, storage_floor'
    );
    fdef := replace(fdef,
      E'(v_asset_data->>''comment'')::TEXT,\r\n(CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END),\r\n(v_asset_data->>''apartment_number'')::TEXT',
      E'(v_asset_data->>''comment'')::TEXT,\r\n(CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE NULL END),\r\n(CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE NULL END),\r\n(v_asset_data->>''apartment_number'')::TEXT'
    );
    fdef := replace(fdef,
      E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\r\napartment_number = COALESCE',
      E'operator_id = CASE WHEN v_asset_data ? ''operator_id'' THEN (v_asset_data->>''operator_id'')::BIGINT ELSE operator_id END,\r\nshared_parking_area = CASE WHEN v_asset_data ? ''shared_parking_area'' THEN (v_asset_data->>''shared_parking_area'')::NUMERIC ELSE shared_parking_area END,\r\napartment_number = COALESCE'
    );

    IF fdef NOT LIKE '%shared_parking_area%' THEN
      RAISE EXCEPTION 'shared_parking_area patch had no effect - function format may have changed.';
    END IF;
    EXECUTE fdef;
  END IF;
END $$;
