/*
  # Add Audit Table
  
  This migration creates a new audit table for tracking
  distribution and transfer operations. It includes:
  - building_number as the key field
  - action_type (distribution or transfer)
  - affected_assets_before and affected_assets_after (JSONB)
  - overload_ratio for business distributions
  - shared_area_size
  - created_at for ordering
*/

-- ============================================================================
-- CREATE ENUM FOR ACTION TYPE
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE distribution_audit_action_type AS ENUM ('distribution', 'transfer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- CREATE AUDIT TABLE (for distribution and transfer operations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit (
  id BIGSERIAL PRIMARY KEY,
  building_number BIGINT NOT NULL,
  action_type distribution_audit_action_type NOT NULL,
  affected_assets_before JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_assets_after JSONB NOT NULL DEFAULT '[]'::jsonb,
  overload_ratio NUMERIC,
  shared_area_size NUMERIC,
  description TEXT,
  user_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT fk_audit_building FOREIGN KEY (building_number) REFERENCES buildings(building_number) ON DELETE CASCADE,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT audit_building_created_action_unique UNIQUE (building_number, created_at, action_type)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_building_number ON audit(building_number);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_building_created ON audit(building_number, created_at DESC);

-- Enable RLS
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public read access to audit"
  ON audit FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert audit"
  ON audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

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
-- FUNCTION: log_audit (for distribution and transfer operations)
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


