-- Supabase is the single source of truth. This migration removes local triggers
-- and trigger-only functions; equivalent behavior is implemented in Python.
-- RPCs that depend on update_building_total_area / copy_asset_to_history_before_update
-- are still used; Python implements those when called directly and will be used
-- once backend is wired to Python.

-- =============================================================================
-- 1. DROP TRIGGERS (order: by table, no dependency between triggers)
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_auto_set_distribution_flags_on_change ON assets;
DROP TRIGGER IF EXISTS trigger_copy_asset_to_history ON assets;
DROP TRIGGER IF EXISTS trigger_normalize_asset_boolean_fields ON assets;
DROP TRIGGER IF EXISTS trigger_reset_export_flags_on_change ON assets;
DROP TRIGGER IF EXISTS trigger_update_asset_business_total_area ON assets;
DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;

DROP TRIGGER IF EXISTS trigger_auto_update_building_total_area ON assets;

DROP TRIGGER IF EXISTS trigger_normalize_assets_history_boolean_fields ON assets_history;

DROP TRIGGER IF EXISTS update_asset_types_updated_at ON asset_types;
DROP TRIGGER IF EXISTS trigger_update_field_configurations_updated_at ON field_configurations;
DROP TRIGGER IF EXISTS trigger_update_managers_updated_at ON managers;
DROP TRIGGER IF EXISTS trigger_update_operators_updated_at ON operators;
DROP TRIGGER IF EXISTS trigger_update_system_configuration_updated_at ON system_configuration;
DROP TRIGGER IF EXISTS validation_rules_updated_at ON validation_rules;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;

DROP TRIGGER IF EXISTS trigger_set_data_from_automation_false_on_asset_change ON assets;

-- Mailing list / tax_regions_mailing_list if they exist
DROP TRIGGER IF EXISTS trigger_update_mailing_list_updated_at ON mailing_list;
DROP TRIGGER IF EXISTS trigger_update_tax_regions_mailing_list_updated_at ON tax_regions_mailing_list;

-- =============================================================================
-- 2. DROP TRIGGER-HANDLER FUNCTIONS (no longer used after triggers removed)
-- =============================================================================

DROP FUNCTION IF EXISTS public.auto_update_building_total_area();
DROP FUNCTION IF EXISTS public.auto_set_distribution_flags_on_change();
DROP FUNCTION IF EXISTS public.copy_asset_to_history();
DROP FUNCTION IF EXISTS public.normalize_asset_boolean_fields();
DROP FUNCTION IF EXISTS public.normalize_assets_history_boolean_fields();
DROP FUNCTION IF EXISTS public.reset_export_flags_on_change();
DROP FUNCTION IF EXISTS public.update_asset_business_total_area();
DROP FUNCTION IF EXISTS public.set_data_from_automation_false_on_asset_change();
-- CASCADE so any remaining triggers that use this generic function are dropped
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.update_field_configurations_updated_at();
DROP FUNCTION IF EXISTS public.update_managers_updated_at();
DROP FUNCTION IF EXISTS public.update_operators_updated_at();
DROP FUNCTION IF EXISTS public.update_system_configuration_updated_at();
DROP FUNCTION IF EXISTS public.update_validation_rules_updated_at();

-- NOTE: update_building_total_area(bigint) and copy_asset_to_history_before_update(bigint)
--       are NOT dropped: save_assets_bulk_transactional and delete_asset_transactional
--       call them. Python implements the same logic for direct API use; backend
--       can call Python for update_total_area and copy_to_history_before_update.
