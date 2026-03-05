-- Temporary script to run all migrations in order
-- This script uses psql meta-commands (\i) to include migration files
-- 
-- USAGE:
--   Run this script with psql command line:
--   psql -U postgres -d your_database -f run_all_migrations.sql
--
--   Or with connection string:
--   psql "postgresql://user:pass@host:port/dbname" -f run_all_migrations.sql
--
-- NOTE: This script will NOT work in standard SQL clients (pgAdmin, DBeaver, etc.)
--       For those, use the PowerShell script (run_all_migrations.ps1) instead

-- ============================================================================
-- IMPORTANT: This script assumes you're running in a clean database
-- If migrations have already been applied, some statements may fail
-- Use proper migration tracking in production
-- ============================================================================

\echo Starting migration execution...
\echo ''

-- Migration files (in chronological order):
-- 1. 20250101000000_initial_schema.sql
\echo Loading: 20250101000000_initial_schema.sql
\i migrations/20250101000000_initial_schema.sql

-- 2. 20250121000000_add_distribution_audit_table.sql
\echo Loading: 20250121000000_add_distribution_audit_table.sql
\i migrations/20250121000000_add_distribution_audit_table.sql

-- 3. 20250121000001_update_functions_for_distribution_audit.sql
\echo 'Loading: 20250121000001_update_functions_for_distribution_audit.sql'
\i migrations/20250121000001_update_functions_for_distribution_audit.sql

-- 4. 20250124000000_update_distribution_audit_and_logging.sql
\echo 'Loading: 20250124000000_update_distribution_audit_and_logging.sql'
\i migrations/20250124000000_update_distribution_audit_and_logging.sql

-- 5. 20250125000000_rename_distribution_audit_to_audit.sql
\echo 'Loading: 20250125000000_rename_distribution_audit_to_audit.sql'
\i migrations/20250125000000_rename_distribution_audit_to_audit.sql

-- 6. 20250126000000_remove_action_id_from_assets_tables.sql
\echo 'Loading: 20250126000000_remove_action_id_from_assets_tables.sql'
\i migrations/20250126000000_remove_action_id_from_assets_tables.sql

-- 7. 20250127000000_add_tax_region_to_audit.sql
\echo 'Loading: 20250127000000_add_tax_region_to_audit.sql'
\i migrations/20250127000000_add_tax_region_to_audit.sql

-- 8. 20250128000000_add_business_residence_distribution_action_types.sql
\echo 'Loading: 20250128000000_add_business_residence_distribution_action_types.sql'
\i migrations/20250128000000_add_business_residence_distribution_action_types.sql

-- 9. 20250129000000_consolidate_asset_save_functions.sql
\echo 'Loading: 20250129000000_consolidate_asset_save_functions.sql'
\i migrations/20250129000000_consolidate_asset_save_functions.sql

-- 10. 20251216100645_add_distribution_flag_trigger.sql
\echo 'Loading: 20251216100645_add_distribution_flag_trigger.sql'
\i migrations/20251216100645_add_distribution_flag_trigger.sql

-- 11. 20251216102115_replace_trigger_with_function.sql
\echo 'Loading: 20251216102115_replace_trigger_with_function.sql'
\i migrations/20251216102115_replace_trigger_with_function.sql

-- 12. 20251216103948_add_transactional_save_functions.sql
\echo 'Loading: 20251216103948_add_transactional_save_functions.sql'
\i migrations/20251216103948_add_transactional_save_functions.sql

-- 13. 20251216105832_add_transactional_delete_function.sql
\echo 'Loading: 20251216105832_add_transactional_delete_function.sql'
\i migrations/20251216105832_add_transactional_delete_function.sql

-- 14. 20251217000000_fix_distribution_flags_hebrew_values.sql
\echo 'Loading: 20251217000000_fix_distribution_flags_hebrew_values.sql'
\i migrations/20251217000000_fix_distribution_flags_hebrew_values.sql

-- 15. 20251217000002_update_save_transactional_for_asset_size_flags.sql
\echo 'Loading: 20251217000002_update_save_transactional_for_asset_size_flags.sql'
\i migrations/20251217000002_update_save_transactional_for_asset_size_flags.sql

-- 16. 20251217000003_update_bulk_save_for_distribute_flags.sql
\echo 'Loading: 20251217000003_update_bulk_save_for_distribute_flags.sql'
\i migrations/20251217000003_update_bulk_save_for_distribute_flags.sql

-- 17. 20251218000000_remove_backend_validation_checks.sql
\echo 'Loading: 20251218000000_remove_backend_validation_checks.sql'
\i migrations/20251218000000_remove_backend_validation_checks.sql

-- 18. 20251219000000_add_building_update_function.sql
\echo 'Loading: 20251219000000_add_building_update_function.sql'
\i migrations/20251219000000_add_building_update_function.sql

-- 19. 20251220000000_rename_business_distribution_area_to_area_from_distribution.sql
\echo 'Loading: 20251220000000_rename_business_distribution_area_to_area_from_distribution.sql'
\i migrations/20251220000000_rename_business_distribution_area_to_area_from_distribution.sql

-- 20. 20251220000000_rename_business_distribution_area_to_distribution_area.sql
\echo 'Loading: 20251220000000_rename_business_distribution_area_to_distribution_area.sql'
\i migrations/20251220000000_rename_business_distribution_area_to_distribution_area.sql

-- 21. 20251220000001_drop_distribution_flag_trigger.sql
\echo 'Loading: 20251220000001_drop_distribution_flag_trigger.sql'
\i migrations/20251220000001_drop_distribution_flag_trigger.sql

-- 22. 20251221000000_clear_and_refill_field_configurations.sql
\echo 'Loading: 20251221000000_clear_and_refill_field_configurations.sql'
\i migrations/20251221000000_clear_and_refill_field_configurations.sql

-- 23. 20251221000001_add_comment_to_assets.sql
\echo 'Loading: 20251221000001_add_comment_to_assets.sql'
\i migrations/20251221000001_add_comment_to_assets.sql

-- 24. 20251221000003_update_pinned_columns_to_left.sql
\echo 'Loading: 20251221000003_update_pinned_columns_to_left.sql'
\i migrations/20251221000003_update_pinned_columns_to_left.sql

-- 25. 20251221000004_rebuild_all_field_configurations.sql
\echo 'Loading: 20251221000004_rebuild_all_field_configurations.sql'
\i migrations/20251221000004_rebuild_all_field_configurations.sql

-- 26. 20251222000000_fix_business_asset_size_check.sql
\echo 'Loading: 20251222000000_fix_business_asset_size_check.sql'
\i migrations/20251222000000_fix_business_asset_size_check.sql

-- 27. 20251224121712_update_asset_types_field_widths.sql
\echo 'Loading: 20251224121712_update_asset_types_field_widths.sql'
\i migrations/20251224121712_update_asset_types_field_widths.sql

-- 28. 20251224122202_fix_asset_types_name_field_pinning.sql
\echo 'Loading: 20251224122202_fix_asset_types_name_field_pinning.sql'
\i migrations/20251224122202_fix_asset_types_name_field_pinning.sql

\echo ''
\echo 'All migrations completed!'

