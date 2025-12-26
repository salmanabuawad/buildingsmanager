# Database Installation Guide

This guide explains how to set up the database schema for a fresh installation.

## Option 1: Consolidated Schema (Recommended for Fresh Installations)

For new installations, use the consolidated schema file:

```
supabase/migrations/20260101000000_consolidated_initial_schema.sql
```

This file includes:
- All tables with their latest structure
- All enums with latest values
- Basic helper functions
- Triggers and RLS policies

**However**, this file does NOT include the large transactional functions due to size. You must also run:

1. `20251218000000_remove_backend_validation_checks.sql` - Contains:
   - `log_audit_entry` function
   - `save_asset_transactional` function
   - `save_assets_bulk_transactional` function
   - `delete_asset_transactional` function

2. `20251219000000_add_building_update_function.sql` - Contains:
   - `update_buildings_bulk_with_distribution_flags` function

3. `20251229000000_prevent_distribution_flag_when_shared_area_zero.sql` - Contains:
   - Updated `set_distribution_flags_for_asset_type_change` function
   - Updated `auto_set_distribution_flags_on_change` function
   - Updated `delete_asset_transactional` function

## Option 2: Sequential Migrations (For Existing Installations)

For existing installations or to track migration history, run migrations in chronological order:

1. `20250101000000_initial_schema.sql`
2. All subsequent migrations in chronological order
3. `20251230000000_drop_distribution_audit_table.sql` (cleanup)

## Installation Steps

### Fresh Installation

```sql
-- Step 1: Run consolidated schema
\i supabase/migrations/20260101000000_consolidated_initial_schema.sql

-- Step 2: Run large function definitions
\i supabase/migrations/20251218000000_remove_backend_validation_checks.sql
\i supabase/migrations/20251219000000_add_building_update_function.sql
\i supabase/migrations/20251229000000_prevent_distribution_flag_when_shared_area_zero.sql

-- Step 3: Run any additional configuration migrations
\i supabase/migrations/20251221000000_clear_and_refill_field_configurations.sql
\i supabase/migrations/20251227000000_add_use_shared_area_to_asset_types.sql
```

### Verification

After installation, verify:

1. All tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   ORDER BY table_name;
   ```

2. All enums exist:
   ```sql
   SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;
   ```

3. Key functions exist:
   ```sql
   SELECT proname FROM pg_proc 
   WHERE proname IN (
     'save_asset_transactional',
     'save_assets_bulk_transactional',
     'delete_asset_transactional',
     'log_audit_entry',
     'update_buildings_bulk_with_distribution_flags'
   );
   ```

4. Default user exists:
   ```sql
   SELECT * FROM users WHERE user_name = 'default';
   ```

## Deprecated Tables

The following tables are NOT included in the consolidated schema (they are deprecated):

- `distribution_audit` - Renamed to `audit`
- `asset_type_fields` - Not in use, replaced by `field_configurations`

## Notes

- The consolidated schema sets `need_residence_distribution` and `need_business_distribution` to `false` by default
- The `audit` table uses `audit_action_type` enum with values: `manual_update`, `import_file`, `transfer_area`, `distribute_shared`, `business_distribution`, `residence_distribution`
- All asset saves should use transactional functions (`save_asset_transactional` or `save_assets_bulk_transactional`)
- The `exported_to_automation` field is automatically set to `false` when assets are updated

