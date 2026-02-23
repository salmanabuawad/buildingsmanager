-- Include shared_parking_area and number_of_parking_units in distribution history (before/after audit).
-- Also: for distribution/transfer, always collect after_data from DB then merge p_after_data so
-- audit stores full assets (including parking) plus overload_ratio/building from client.

DO $$
DECLARE
  fdef text;
  orig text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;

  orig := fdef;

  -- 1) After SELECT (distribution): add shared_parking_area, number_of_parking_units before created_at
  --    Match the line that has "comment, created_at, updated_at" and "FROM assets" (no is_new_measurement)
  fdef := replace(fdef,
    'business_distribution_area, exported_to_automation, comment, created_at, updated_at' || E'\n' || 'FROM assets',
    'business_distribution_area, exported_to_automation, comment, shared_parking_area, number_of_parking_units, created_at, updated_at' || E'\n' || 'FROM assets');
  fdef := replace(fdef,
    'business_distribution_area, exported_to_automation, comment, created_at, updated_at' || E'\r\n' || 'FROM assets',
    'business_distribution_area, exported_to_automation, comment, shared_parking_area, number_of_parking_units, created_at, updated_at' || E'\r\n' || 'FROM assets');

  -- 2) Before SELECT: add shared_parking_area, number_of_parking_units before created_at
  fdef := replace(fdef,
    'business_distribution_area, exported_to_automation, comment, created_at, updated_at, is_new_measurement',
    'business_distribution_area, exported_to_automation, comment, shared_parking_area, number_of_parking_units, created_at, updated_at, is_new_measurement');

  -- 3) For distribution/transfer: always collect after_data from DB then merge p_after_data
  --    Replace the start of the "Collect AFTER data" block so distribution branch runs first
  fdef := replace(fdef,
    E'-- Collect AFTER data if needed\nIF p_after_data IS NULL OR p_after_data = ''null''::jsonb OR p_after_data = ''{}''::jsonb THEN\n-- Collect after data from saved assets\nIF v_first_building_number IS NOT NULL THEN\nIF p_action_type IN (''distribute_shared'', ''business_distribution'', ''residence_distribution'', ''transfer_area'') THEN',
    E'-- Collect AFTER data if needed\nIF v_first_building_number IS NOT NULL AND p_action_type IN (''distribute_shared'', ''business_distribution'', ''residence_distribution'', ''transfer_area'') THEN\nv_after_assets := ARRAY[]::jsonb[];\nFOR v_asset_record IN \nSELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,\nsub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,\nsub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,\nsub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,\nelevator, single_double_family, condo, townhouses, penthouse,\nstructure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,\nbusiness_distribution_area, exported_to_automation, comment, shared_parking_area, number_of_parking_units, created_at, updated_at\nFROM assets \nWHERE building_number = v_first_building_number\nORDER BY asset_id\nLOOP\nv_asset_jsonb := to_jsonb(v_asset_record);\nv_after_assets := array_append(v_after_assets, v_asset_jsonb);\nEND LOOP;\nSELECT jsonb_agg(elem) INTO v_after_data_collected FROM unnest(v_after_assets) AS elem;\nv_after_data_collected := jsonb_build_object(''assets'', COALESCE(v_after_data_collected, ''[]''::jsonb));\nIF p_after_data IS NOT NULL AND p_after_data <> ''null''::jsonb AND p_after_data <> ''{}''::jsonb THEN\nv_after_data_collected := v_after_data_collected || p_after_data;\nEND IF;\nELSIF p_after_data IS NULL OR p_after_data = ''null''::jsonb OR p_after_data = ''{}''::jsonb THEN\n-- Collect after data from saved assets\nIF v_first_building_number IS NOT NULL THEN\nIF p_action_type IN (''distribute_shared'', ''business_distribution'', ''residence_distribution'', ''transfer_area'') THEN');
  fdef := replace(fdef,
    E'-- Collect AFTER data if needed\r\nIF p_after_data IS NULL OR p_after_data = ''null''::jsonb OR p_after_data = ''{}''::jsonb THEN\r\n-- Collect after data from saved assets\r\nIF v_first_building_number IS NOT NULL THEN\r\nIF p_action_type IN (''distribute_shared'', ''business_distribution'', ''residence_distribution'', ''transfer_area'') THEN',
    E'-- Collect AFTER data if needed\r\nIF v_first_building_number IS NOT NULL AND p_action_type IN (''distribute_shared'', ''business_distribution'', ''residence_distribution'', ''transfer_area'') THEN\r\nv_after_assets := ARRAY[]::jsonb[];\r\nFOR v_asset_record IN \r\nSELECT asset_id, building_number, payer_id, measurement_date, main_asset_type, asset_size, tax_region,\r\nsub_asset_type_1, sub_asset_size_1, sub_asset_type_2, sub_asset_size_2,\r\nsub_asset_type_3, sub_asset_size_3, sub_asset_type_4, sub_asset_size_4,\r\nsub_asset_type_5, sub_asset_size_5, sub_asset_type_6, sub_asset_size_6,\r\nelevator, single_double_family, condo, townhouses, penthouse,\r\nstructure_drawing_url, floor, discount_type, discount_date_from, discount_date_to,\r\nbusiness_distribution_area, exported_to_automation, comment, shared_parking_area, number_of_parking_units, created_at, updated_at\r\nFROM assets \r\nWHERE building_number = v_first_building_number\r\nORDER BY asset_id\r\nLOOP\r\nv_asset_jsonb := to_jsonb(v_asset_record);\r\nv_after_assets := array_append(v_after_assets, v_asset_jsonb);\r\nEND LOOP;\r\nSELECT jsonb_agg(elem) INTO v_after_data_collected FROM unnest(v_after_assets) AS elem;\r\nv_after_data_collected := jsonb_build_object(''assets'', COALESCE(v_after_data_collected, ''[]''::jsonb));\r\nIF p_after_data IS NOT NULL AND p_after_data <> ''null''::jsonb AND p_after_data <> ''{}''::jsonb THEN\r\nv_after_data_collected := v_after_data_collected || p_after_data;\r\nEND IF;\r\nELSIF p_after_data IS NULL OR p_after_data = ''null''::jsonb OR p_after_data = ''{}''::jsonb THEN\r\n-- Collect after data from saved assets\r\nIF v_first_building_number IS NOT NULL THEN\r\nIF p_action_type IN (''distribute_shared'', ''business_distribution'', ''residence_distribution'', ''transfer_area'') THEN');

  IF fdef <> orig THEN
    EXECUTE fdef;
    RAISE NOTICE 'save_assets_bulk_transactional: added shared_parking_area/number_of_parking_units to audit SELECTs and distribution always-collect-then-merge for after_data';
  ELSE
    RAISE NOTICE 'save_assets_bulk_transactional: no change applied - check function body format';
  END IF;
END $$;
