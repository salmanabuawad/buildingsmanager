-- Drop remaining PostgreSQL functions. All business logic lives in Python.
-- Backend uses Python transactions (save_assets_bulk.py, building_assets.py, etc.).
-- Safe to run: DROP IF EXISTS does nothing when object is already gone.

-- RPC-style functions (Python implements equivalent)
DROP FUNCTION IF EXISTS public.update_building_total_area(bigint);
DROP FUNCTION IF EXISTS public.copy_asset_to_history_before_update(bigint);
DROP FUNCTION IF EXISTS public.save_asset_transactional(jsonb, boolean, text, text, text, text);
DROP FUNCTION IF EXISTS public.save_assets_bulk_transactional(jsonb[], boolean, text, text, text, jsonb, jsonb, text, boolean);
DROP FUNCTION IF EXISTS public.delete_asset_transactional(bigint, text, text);
DROP FUNCTION IF EXISTS public.delete_assets_bulk_transactional(bigint[], text, text);
DROP FUNCTION IF EXISTS public.get_assets_by_ids(bigint[]);
DROP FUNCTION IF EXISTS public.get_assets_by_ids(integer[]);
DROP FUNCTION IF EXISTS public.update_buildings_bulk_with_distribution_flags(jsonb[]);
DROP FUNCTION IF EXISTS public.update_asset_type_with_distribution_reset(bigint, jsonb);
DROP FUNCTION IF EXISTS public.update_asset_types_bulk_with_distribution_reset(jsonb[]);
DROP FUNCTION IF EXISTS public.set_distribution_flags_for_asset_type_change(bigint, text, text);
DROP FUNCTION IF EXISTS public.mark_assets_as_exported_to_automation();
DROP FUNCTION IF EXISTS public.bulk_update_assets(jsonb);
DROP FUNCTION IF EXISTS public.bulk_update_assets_with_audit(jsonb);
DROP FUNCTION IF EXISTS public.bulk_transfer_areas(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.bulk_transfer_areas_with_audit(jsonb);
DROP FUNCTION IF EXISTS public.soft_delete_building(bigint);
DROP FUNCTION IF EXISTS public.get_or_create_user_from_auth();
DROP FUNCTION IF EXISTS public.auth_login(text, text);
DROP FUNCTION IF EXISTS public.users_set_password(bigint, text);
DROP FUNCTION IF EXISTS public.users_create_internal(text, text, text, text);
DROP FUNCTION IF EXISTS public.users_ensure_defaults();
DROP FUNCTION IF EXISTS public.log_audit(bigint, distribution_audit_action_type, jsonb, jsonb, numeric, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.log_audit(bigint, distribution_audit_action_type, jsonb, jsonb, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.log_audit_entry(audit_action_type, text, text, text, jsonb, jsonb, text[]);
DROP FUNCTION IF EXISTS public.log_change_entry(text, text, text, text, jsonb, jsonb, text[]);
DROP FUNCTION IF EXISTS public.log_audit_for_asset(bigint, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.log_audit_for_building(bigint, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.log_distribution_audit(bigint, distribution_audit_action_type, numeric, jsonb, jsonb, numeric, text, bigint, timestamptz);
DROP FUNCTION IF EXISTS public.log_distribution_audit(bigint, distribution_audit_action_type, numeric, jsonb, jsonb, numeric, text, bigint);
DROP FUNCTION IF EXISTS public.log_bulk_change_entries(jsonb);
DROP FUNCTION IF EXISTS public.get_asset_audit_data(bigint);
DROP FUNCTION IF EXISTS public.get_building_audit_data(bigint);
DROP FUNCTION IF EXISTS public.get_change_log(text, text, bigint, text, integer);
DROP FUNCTION IF EXISTS public.get_record_change_history(text, text, integer);
DROP FUNCTION IF EXISTS public.get_user_changes(text, text, integer);
DROP FUNCTION IF EXISTS public.get_tables_fields_types();
DROP FUNCTION IF EXISTS public.search_assets_by_range(bigint, bigint);
DROP FUNCTION IF EXISTS public.get_building_stats(bigint);
DROP FUNCTION IF EXISTS public.parse_measurement_date(text);
DROP FUNCTION IF EXISTS public.reset_new_measurement_flag();
DROP FUNCTION IF EXISTS public.calculate_asset_business_total_area(numeric, numeric, text);
DROP FUNCTION IF EXISTS public.update_business_total_area(bigint);
DROP FUNCTION IF EXISTS public.trigger_update_business_total_area();
DROP FUNCTION IF EXISTS public.update_asset_types_updated_at();
DROP FUNCTION IF EXISTS public.update_unit_types_updated_at();
DROP FUNCTION IF EXISTS public.update_user_preferences_updated_at();
DROP FUNCTION IF EXISTS public.update_validation_rules_updated_at();
DROP FUNCTION IF EXISTS public.update_mailing_list_updated_at();
DROP FUNCTION IF EXISTS public.update_tax_regions_mailing_list_updated_at();
DROP FUNCTION IF EXISTS public.update_asset_type_fields_updated_at();
