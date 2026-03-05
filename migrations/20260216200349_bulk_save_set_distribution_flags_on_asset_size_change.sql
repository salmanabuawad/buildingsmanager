-- Set distribution flags when asset size or type changes in bulk save (same as save_asset_transactional).
-- The app uses save_assets_bulk_transactional for list saves; it was missing this logic.
--
-- ALIGN WITH CURRENT DB: This migration reads the current function from the database (pg_get_functiondef)
-- and patches it. It does not hardcode the full function body, so it stays valid regardless of prior
-- migrations. Idempotent: if the fix is already present, the migration does nothing and succeeds.
DO $$
DECLARE
  fdef text;
  search_str text := E'PERFORM update_building_total_area(v_building_number);\r\nv_count := v_count + 1;';
  replace_str text := E'PERFORM update_building_total_area(v_building_number);\r\n\r\n  v_new_asset_size := COALESCE((v_asset_data->>''asset_size'')::NUMERIC, COALESCE(v_old_asset_size, 0));\r\n  v_type_changed := (v_old_main_asset_type IS DISTINCT FROM v_new_main_asset_type);\r\n  v_size_changed := (v_asset_found AND v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL AND (v_old_asset_size IS DISTINCT FROM v_new_asset_size));\r\n\r\n  IF v_type_changed AND v_old_main_asset_type IS NOT NULL AND v_new_main_asset_type IS NOT NULL THEN\r\n    PERFORM set_distribution_flags_for_asset_type_change(v_building_number, v_old_main_asset_type, v_new_main_asset_type);\r\n  END IF;\r\n\r\n  IF v_size_changed AND v_old_asset_size IS NOT NULL AND v_new_asset_size IS NOT NULL AND v_new_main_asset_type IS NOT NULL THEN\r\n    SELECT business_residence INTO v_business_residence FROM asset_types WHERE name = v_new_main_asset_type;\r\n    IF v_business_residence = ''עסקים'' THEN\r\n      UPDATE buildings SET need_business_distribution = true WHERE building_number = v_building_number AND COALESCE(business_shared_area, 0) > 0;\r\n    ELSIF v_business_residence = ''מגורים'' THEN\r\n      UPDATE buildings SET need_residence_distribution = true WHERE building_number = v_building_number AND COALESCE(residence_shared_area, 0) > 0;\r\n    END IF;\r\n  END IF;\r\n\r\n  v_count := v_count + 1;';
BEGIN
  -- Read current function from DB (single source of truth)
  SELECT pg_get_functiondef(oid) INTO fdef FROM pg_proc WHERE proname = 'save_assets_bulk_transactional';
  IF fdef IS NULL THEN
    RAISE EXCEPTION 'save_assets_bulk_transactional not found';
  END IF;
  -- Skip if already patched (idempotent)
  IF fdef NOT LIKE '%v_new_asset_size := COALESCE((v_asset_data%' THEN
    fdef := replace(fdef, search_str, replace_str);
    IF fdef = (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'save_assets_bulk_transactional') THEN
      RAISE EXCEPTION 'Replace had no effect - search_str not found. Align with current DB (query function body) and adjust search_str if needed.';
    END IF;
    EXECUTE fdef;
  END IF;
END $$;
