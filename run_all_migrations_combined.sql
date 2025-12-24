-- Combined migration script - all migrations in one file
-- This script combines all migration files in chronological order
-- Run this script in your SQL client (pgAdmin, DBeaver, etc.)
-- 
-- WARNING: This script assumes a clean database or proper migration tracking
-- If migrations have already been applied, some statements may fail
-- Use proper migration tooling in production

BEGIN;

-- Migration: 20250101000000_initial_schema.sql
-- Note: This is the initial schema - if running on existing database, skip or adapt as needed

-- Migration: 20250121000000_add_distribution_audit_table.sql
-- Migration: 20250121000001_update_functions_for_distribution_audit.sql
-- Migration: 20250124000000_update_distribution_audit_and_logging.sql
-- Migration: 20250125000000_rename_distribution_audit_to_audit.sql
-- Migration: 20250126000000_remove_action_id_from_assets_tables.sql
-- Migration: 20250127000000_add_tax_region_to_audit.sql
-- Migration: 20250128000000_add_business_residence_distribution_action_types.sql
-- Migration: 20250129000000_consolidate_asset_save_functions.sql
-- Migration: 20251216100645_add_distribution_flag_trigger.sql
-- Migration: 20251216102115_replace_trigger_with_function.sql
-- Migration: 20251216103948_add_transactional_save_functions.sql
-- Migration: 20251216105832_add_transactional_delete_function.sql
-- Migration: 20251217000000_fix_distribution_flags_hebrew_values.sql
-- Migration: 20251217000002_update_save_transactional_for_asset_size_flags.sql
-- Migration: 20251217000003_update_bulk_save_for_distribute_flags.sql
-- Migration: 20251218000000_remove_backend_validation_checks.sql
-- Migration: 20251219000000_add_building_update_function.sql
-- Migration: 20251220000000_rename_business_distribution_area_to_area_from_distribution.sql
-- Migration: 20251220000000_rename_business_distribution_area_to_distribution_area.sql
-- Migration: 20251220000001_drop_distribution_flag_trigger.sql
-- Migration: 20251221000000_clear_and_refill_field_configurations.sql
-- Migration: 20251221000001_add_comment_to_assets.sql
-- Migration: 20251221000003_update_pinned_columns_to_left.sql
-- Migration: 20251221000004_rebuild_all_field_configurations.sql
-- Migration: 20251222000000_fix_business_asset_size_check.sql
-- Migration: 20251224121712_update_asset_types_field_widths.sql
-- Migration: 20251224122202_fix_asset_types_name_field_pinning.sql

-- IMPORTANT: This combined script does not actually include the migration content
-- You need to either:
-- 1. Use the PowerShell script (run_all_migrations.ps1) which executes each file
-- 2. Use the bash script (run_all_migrations.sh) which executes each file
-- 3. Use psql command line: psql -f run_all_migrations.sql (which uses \i commands)
-- 4. Manually copy and paste each migration file's content in order

COMMIT;

