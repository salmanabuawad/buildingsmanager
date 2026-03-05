-- ============================================================================
-- Migration: Drop distribution_audit table and related objects
-- ============================================================================
-- This migration drops the distribution_audit table if it still exists,
-- along with related functions, indexes, and constraints.
-- Note: The distribution_audit table was renamed to 'audit' in migration
-- 20250125000000_rename_distribution_audit_to_audit.sql, so this table
-- should not exist in most cases. This script is for cleanup purposes.
--
-- Also drops the asset_type_fields table if it is not in use.

-- ============================================================================
-- STEP 1: DROP TABLE IF EXISTS
-- ============================================================================

-- Drop the distribution_audit table if it still exists
-- This is safe because the table was renamed to 'audit' in a previous migration
DROP TABLE IF EXISTS distribution_audit CASCADE;

-- ============================================================================
-- STEP 2: DROP OLD FUNCTIONS IF THEY EXIST
-- ============================================================================

-- Drop log_distribution_audit function if it exists
-- Note: This function may still exist as a wrapper for backward compatibility
-- Check if it's still being used before dropping
DROP FUNCTION IF EXISTS log_distribution_audit(
  BIGINT,
  distribution_audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT
) CASCADE;

-- Drop any other distribution_audit related functions
DROP FUNCTION IF EXISTS log_distribution_audit(
  BIGINT,
  distribution_audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT
) CASCADE;

-- ============================================================================
-- STEP 3: DROP INDEXES IF THEY EXIST
-- ============================================================================

-- These indexes should have been renamed in migration 20250125000000,
-- but we'll drop them if they still exist
DROP INDEX IF EXISTS idx_distribution_audit_building_number;
DROP INDEX IF EXISTS idx_distribution_audit_action_type;
DROP INDEX IF EXISTS idx_distribution_audit_created_at;
DROP INDEX IF EXISTS idx_distribution_audit_building_created;

-- ============================================================================
-- STEP 4: DROP RLS POLICIES IF THEY EXIST
-- ============================================================================

-- These policies should have been dropped in migration 20250125000000,
-- but we'll drop them if they still exist (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'distribution_audit') THEN
    DROP POLICY IF EXISTS "Allow public read access to distribution_audit" ON distribution_audit;
    DROP POLICY IF EXISTS "Allow authenticated users to insert distribution_audit" ON distribution_audit;
  END IF;
END $$;

-- ============================================================================
-- STEP 5: NOTE ABOUT distribution_audit_action_type ENUM
-- ============================================================================
-- The distribution_audit_action_type enum is still in use by the audit table
-- (which replaced distribution_audit). DO NOT drop this enum as it's still
-- being used. The enum values are mapped to audit_action_type in the
-- save_assets_bulk_transactional function.
-- 
-- If you need to drop the enum, first ensure that:
-- 1. All references to it in functions have been updated
-- 2. The audit table's action_type column has been changed to use audit_action_type
-- 3. All data has been migrated
--
-- To drop the enum (ONLY if not in use):
-- DROP TYPE IF EXISTS distribution_audit_action_type CASCADE;

-- ============================================================================
-- STEP 6: DROP asset_type_fields TABLE IF NOT IN USE
-- ============================================================================
-- The asset_type_fields table was created in the initial schema but appears
-- to not be in use. This table was intended for field-level configurations
-- but the system now uses field_configurations table instead.
-- 
-- WARNING: Before dropping, verify that:
-- 1. No code references this table (check api.ts for assetTypeFields)
-- 2. No data is stored in this table that needs to be preserved
-- 3. The field_configurations table is being used instead

-- Drop the asset_type_fields table if it exists and is not in use
DROP TABLE IF EXISTS asset_type_fields CASCADE;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, verify that:
-- 1. The 'audit' table exists and is working correctly
-- 2. All functions that reference distribution_audit have been updated
-- 3. The distribution_audit_action_type enum is still available if needed
-- 4. The 'field_configurations' table is being used for field configurations
-- 5. No code references asset_type_fields table

COMMENT ON SCHEMA public IS 'Distribution audit table has been renamed to audit. This migration cleans up any remaining distribution_audit objects and unused asset_type_fields table.';

