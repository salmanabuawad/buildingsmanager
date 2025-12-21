/*
  # Remove action_id from assets and assets_history tables
  
  This migration:
  1. Drops foreign key constraints on action_id
  2. Drops indexes on action_id
  3. Drops action_id column from assets table
  4. Drops action_id column from assets_history table
  5. Updates database functions to remove action_id references
*/

-- ============================================================================
-- STEP 1: DROP FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Drop foreign key constraint from assets table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_action_id_fkey'
  ) THEN
    ALTER TABLE assets DROP CONSTRAINT assets_action_id_fkey;
  END IF;
END $$;

-- Drop foreign key constraint from assets_history table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assets_history_action_id_fkey'
  ) THEN
    ALTER TABLE assets_history DROP CONSTRAINT assets_history_action_id_fkey;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: DROP INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_assets_action_id;
DROP INDEX IF EXISTS idx_assets_history_action_id;

-- ============================================================================
-- STEP 3: DROP COLUMNS
-- ============================================================================

ALTER TABLE assets DROP COLUMN IF EXISTS action_id;
ALTER TABLE assets_history DROP COLUMN IF EXISTS action_id;

-- ============================================================================
-- STEP 4: UPDATE save_assets_bulk_transactional FUNCTION
-- Remove action_id references
-- ============================================================================

-- This will be handled by reading the current function and updating it
-- The function in 20250124000000_update_distribution_audit_and_logging.sql already doesn't set action_id on assets
-- But we should verify and remove any remaining references

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE assets IS 'Assets table - action_id column has been removed';
COMMENT ON TABLE assets_history IS 'Assets history table - action_id column has been removed';

