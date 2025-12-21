/*
  # Rename distribution_audit to audit
  
  This migration renames the distribution_audit table to audit
  and updates all related functions, indexes, and constraints.
*/

-- ============================================================================
-- RENAME ENUM (optional - keep distribution_audit_action_type or rename)
-- We'll keep the enum name as distribution_audit_action_type to avoid conflicts
-- ============================================================================

-- ============================================================================
-- RENAME TABLE: distribution_audit -> audit
-- ============================================================================

-- First, drop the old audit table if it exists and has the old structure
-- (This is safe if we already dropped it in a previous migration)
DO $$
BEGIN
  -- Check if old audit table exists with old structure (has action_id instead of id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit' AND column_name = 'action_id'
  ) THEN
    -- Drop old audit table if it exists with old structure
    DROP TABLE IF EXISTS audit CASCADE;
  END IF;
END $$;

-- Rename distribution_audit to audit
ALTER TABLE IF EXISTS distribution_audit RENAME TO audit;

-- ============================================================================
-- RENAME CONSTRAINTS
-- ============================================================================

-- Rename primary key constraint
ALTER TABLE audit RENAME CONSTRAINT distribution_audit_pkey TO audit_pkey;

-- Rename foreign key constraints
ALTER TABLE audit RENAME CONSTRAINT fk_distribution_audit_building TO fk_audit_building;
ALTER TABLE audit RENAME CONSTRAINT fk_distribution_audit_user TO fk_audit_user;
ALTER TABLE audit RENAME CONSTRAINT distribution_audit_building_created_action_unique TO audit_building_created_action_unique;

-- ============================================================================
-- RENAME INDEXES
-- ============================================================================

ALTER INDEX IF EXISTS idx_distribution_audit_building_number RENAME TO idx_audit_building_number;
ALTER INDEX IF EXISTS idx_distribution_audit_action_type RENAME TO idx_audit_action_type;
ALTER INDEX IF EXISTS idx_distribution_audit_created_at RENAME TO idx_audit_created_at;
ALTER INDEX IF EXISTS idx_distribution_audit_building_created RENAME TO idx_audit_building_created;

-- ============================================================================
-- DROP OLD RLS POLICIES AND CREATE NEW ONES
-- ============================================================================

DROP POLICY IF EXISTS "Allow public read access to distribution_audit" ON audit;
DROP POLICY IF EXISTS "Allow authenticated users to insert distribution_audit" ON audit;

CREATE POLICY "Allow public read access to audit"
  ON audit FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert audit"
  ON audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- UPDATE COMMENTS
-- ============================================================================

COMMENT ON TABLE audit IS 'Audit table for distribution and transfer operations, keyed by building_number';
COMMENT ON COLUMN audit.id IS 'Primary key - sequential ID';
COMMENT ON COLUMN audit.building_number IS 'Building number - the key for grouping operations';
COMMENT ON COLUMN audit.action_type IS 'Type of operation: distribution or transfer';
COMMENT ON COLUMN audit.affected_assets_before IS 'JSONB array of all affected assets before the operation';
COMMENT ON COLUMN audit.affected_assets_after IS 'JSONB array of all affected assets after the operation';
COMMENT ON COLUMN audit.overload_ratio IS 'Overload ratio for business distributions';
COMMENT ON COLUMN audit.shared_area_size IS 'Shared area size that was distributed';
COMMENT ON COLUMN audit.description IS 'Optional description of the operation';
COMMENT ON COLUMN audit.user_id IS 'Foreign key to users table - user who performed the operation';
COMMENT ON COLUMN audit.created_at IS 'Timestamp of the operation, used for ordering. Part of composite unique key with building_number and action_type';

-- ============================================================================
-- RENAME FUNCTION: log_distribution_audit -> log_audit
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit(
  p_building_number BIGINT,
  p_action_type distribution_audit_action_type,
  p_affected_assets_before JSONB,
  p_affected_assets_after JSONB,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id_fk BIGINT;
  v_default_user_id BIGINT := 1;
  v_audit_id BIGINT;
BEGIN
  -- Get or create user
  IF p_user_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE auth_user_id = p_user_id;
    
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, user_name, user_email)
      VALUES (p_user_id, p_user_id, NULL)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET updated_at = now()
      RETURNING user_id INTO v_user_id_fk;
    END IF;
  ELSE
    -- Use get_or_create_user_from_auth if it exists, otherwise default
    BEGIN
      SELECT get_or_create_user_from_auth() INTO v_user_id_fk;
    EXCEPTION WHEN OTHERS THEN
      SELECT user_id INTO v_default_user_id
      FROM users
      WHERE user_name = 'default' AND auth_user_id IS NULL
      LIMIT 1;
      v_user_id_fk := v_default_user_id;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;

  -- Insert audit record
  INSERT INTO audit (
    building_number,
    action_type,
    affected_assets_before,
    affected_assets_after,
    overload_ratio,
    shared_area_size,
    description,
    user_id,
    created_at
  )
  VALUES (
    p_building_number,
    p_action_type,
    p_affected_assets_before,
    p_affected_assets_after,
    p_overload_ratio,
    p_shared_area_size,
    p_description,
    v_user_id_fk,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION log_audit IS 'Logs a distribution or transfer operation to audit table. Returns the ID of the created audit record.';

-- Drop old function
DROP FUNCTION IF EXISTS log_distribution_audit(
  BIGINT,
  distribution_audit_action_type,
  JSONB,
  JSONB,
  NUMERIC,
  NUMERIC,
  TEXT,
  TEXT
);

-- ============================================================================
-- UPDATE save_assets_bulk_transactional to use log_audit instead of log_distribution_audit
-- ============================================================================

-- We need to update the function body to use log_audit
-- This will be done by recreating the function with the updated name
-- Note: The full function definition should be in the previous migration,
-- but we need to update the function call here

-- Create a helper function that will be called by save_assets_bulk_transactional
-- This ensures backward compatibility during migration
CREATE OR REPLACE FUNCTION log_distribution_audit(
  p_building_number BIGINT,
  p_action_type distribution_audit_action_type,
  p_affected_assets_before JSONB,
  p_affected_assets_after JSONB,
  p_overload_ratio NUMERIC DEFAULT NULL,
  p_shared_area_size NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simply call the new log_audit function
  RETURN log_audit(
    p_building_number,
    p_action_type,
    p_affected_assets_before,
    p_affected_assets_after,
    p_overload_ratio,
    p_shared_area_size,
    p_description,
    p_user_id
  );
END;
$$;

COMMENT ON FUNCTION log_distribution_audit IS 'Deprecated: Use log_audit instead. This is a wrapper for backward compatibility.';

