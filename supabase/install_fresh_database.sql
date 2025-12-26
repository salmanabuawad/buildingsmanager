/*
  # Complete Fresh Database Installation Script
  
  This script sets up a complete database schema for a fresh installation.
  It consolidates all migrations into a single installation process.
  
  Usage:
    psql -U postgres -d your_database -f supabase/install_fresh_database.sql
  
  Or in Supabase SQL Editor, run this entire script.
  
  This script:
  1. Creates all tables with latest structure
  2. Creates all enums with latest values
  3. Creates all functions
  4. Sets up all triggers and RLS policies
  5. Creates default data (default user)
  
  Note: This script is idempotent - it can be run multiple times safely.
*/

-- ============================================================================
-- BEGIN TRANSACTION
-- ============================================================================
BEGIN;

-- ============================================================================
-- STEP 1: Run consolidated initial schema
-- ============================================================================
\i supabase/migrations/20260101000000_consolidated_initial_schema.sql

-- ============================================================================
-- STEP 2: Add large transactional functions
-- ============================================================================
-- These functions are too large to include in the consolidated schema
-- They are loaded from the main migration file

\i supabase/migrations/20251218000000_remove_backend_validation_checks.sql

-- ============================================================================
-- STEP 3: Add building update function
-- ============================================================================
\i supabase/migrations/20251219000000_add_building_update_function.sql

-- ============================================================================
-- STEP 4: Update distribution flag functions
-- ============================================================================
\i supabase/migrations/20251229000000_prevent_distribution_flag_when_shared_area_zero.sql

-- ============================================================================
-- STEP 5: Add field configurations
-- ============================================================================
\i supabase/migrations/20251221000000_clear_and_refill_field_configurations.sql

-- ============================================================================
-- STEP 6: Add use_shared_area to asset_types (if not already in consolidated schema)
-- ============================================================================
\i supabase/migrations/20251227000000_add_use_shared_area_to_asset_types.sql

-- ============================================================================
-- STEP 7: Ensure get_or_create_user_from_auth function exists
-- ============================================================================
\i supabase/migrations/20251226000000_ensure_get_or_create_user_from_auth_function.sql

-- ============================================================================
-- COMMIT TRANSACTION
-- ============================================================================
COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these queries to verify installation:

-- Check tables
SELECT 'Tables' as check_type, COUNT(*) as count 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Check enums
SELECT 'Enums' as check_type, COUNT(*) as count 
FROM pg_type WHERE typtype = 'e';

-- Check key functions
SELECT 'Functions' as check_type, COUNT(*) as count 
FROM pg_proc 
WHERE proname IN (
  'save_asset_transactional',
  'save_assets_bulk_transactional',
  'delete_asset_transactional',
  'log_audit_entry',
  'update_buildings_bulk_with_distribution_flags',
  'get_or_create_user_from_auth'
);

-- Check default user
SELECT 'Default User' as check_type, 
       CASE WHEN EXISTS (SELECT 1 FROM users WHERE user_name = 'default') 
            THEN 'EXISTS' 
            ELSE 'MISSING' 
       END as status;

