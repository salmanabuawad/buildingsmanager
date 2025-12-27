/*
  # Buildings Manager - Fresh Database Installation
  
  This script creates a complete, fresh database installation by combining
  the consolidated schema with any subsequent migrations.
  
  USAGE:
  
  For PostgreSQL command line:
    psql -U postgres -d buildings_manager -f install_fresh_database.sql
    
  For Supabase SQL Editor:
    Copy and paste this entire file into the SQL Editor and run it.
    
  For local PostgreSQL (creates database first):
    createdb -U postgres buildings_manager
    psql -U postgres -d buildings_manager -f install_fresh_database.sql
  
  PREREQUISITES:
  - PostgreSQL 12 or higher
  - Database should be empty or not exist (for fresh install)
  
  WARNING:
  This script is for FRESH INSTALLATIONS only.
  Do NOT run on existing databases with data.
  For existing databases, use individual migration files instead.
*/

-- ============================================================================
-- STEP 1: Run consolidated initial schema
-- This includes all tables, functions, indexes, and RLS policies up to 2026-01-01
-- ============================================================================

\i supabase/migrations/20260101000000_consolidated_initial_schema.sql

-- ============================================================================
-- STEP 2: Add large transactional functions
-- These functions are too large to include in the consolidated schema
-- They are loaded from specific migration files as mentioned in the schema
-- ============================================================================

\i supabase/migrations/20251218000000_remove_backend_validation_checks.sql
\i supabase/migrations/20251219000000_add_building_update_function.sql
\i supabase/migrations/20251229000000_prevent_distribution_flag_when_shared_area_zero.sql

-- ============================================================================
-- STEP 3: Apply any migrations that came after the consolidated schema
-- (Currently none, but this is where they would go)
-- ============================================================================

-- No migrations exist after the consolidated schema as of 2026-01-01

-- ============================================================================
-- VERIFICATION QUERIES (Optional - run these to verify installation)
-- ============================================================================

-- Check that key tables exist
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    AND table_name IN (
      'address_list',
      'asset_types',
      'buildings',
      'assets',
      'assets_history',
      'validation_rules',
      'field_configurations',
      'audit_log',
      'users'
    );
    
  IF table_count >= 8 THEN
    RAISE NOTICE '✓ Tables check passed: % tables found', table_count;
  ELSE
    RAISE WARNING '⚠ Tables check: Only % tables found (expected at least 8)', table_count;
  END IF;
END $$;

-- Check that key functions exist
DO $$
DECLARE
  func_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO func_count
  FROM pg_proc 
  WHERE proname IN (
    'save_asset_transactional',
    'save_assets_bulk_transactional',
    'delete_asset_transactional',
    'log_audit_entry',
    'update_buildings_bulk_with_distribution_flags',
    'get_or_create_user_from_auth'
  );
  
  IF func_count >= 6 THEN
    RAISE NOTICE '✓ Functions check passed: % functions found', func_count;
  ELSE
    RAISE WARNING '⚠ Functions check: Only % functions found (expected at least 6)', func_count;
  END IF;
END $$;

-- Success message
SELECT 'Fresh database installation completed successfully!' as status;
