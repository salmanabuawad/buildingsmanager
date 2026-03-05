-- Drop app functions that have been moved to Python. Supabase = single source of truth.
-- KEEP: update_building_total_area, copy_asset_to_history_before_update (used by save_assets_bulk_transactional until it is ported).
-- KEEP: save_assets_bulk_transactional, update_buildings_bulk_with_distribution_flags, asset_type and user RPCs, auth_login (to be ported later).

DROP FUNCTION IF EXISTS public.get_assets_by_ids(bigint[]);
DROP FUNCTION IF EXISTS public.get_assets_with_history(bigint);
DROP FUNCTION IF EXISTS public.search_assets_by_range(bigint, bigint);
DROP FUNCTION IF EXISTS public.mark_assets_as_exported_to_automation();
DROP FUNCTION IF EXISTS public.get_tables_fields_types();

DROP FUNCTION IF EXISTS public.log_audit_entry(audit_action_type, text, text, text, jsonb, jsonb, text, bigint, numeric, numeric);
DROP FUNCTION IF EXISTS public.log_audit_entry(audit_action_type, text, text, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.log_audit_for_asset(bigint, text, text, audit_action_type, boolean, text);
DROP FUNCTION IF EXISTS public.log_audit_for_building(bigint, text, text, audit_action_type, text);
DROP FUNCTION IF EXISTS public.log_change_entry(text, text, text, text, jsonb, jsonb, text[]);
DROP FUNCTION IF EXISTS public.get_record_change_history(text, text, integer);

DROP FUNCTION IF EXISTS public.delete_asset_transactional(bigint, text, text);
DROP FUNCTION IF EXISTS public.delete_assets_bulk_transactional(bigint[], text, text);
