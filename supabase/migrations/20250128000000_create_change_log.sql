-- ============================================================================
-- Change Log Table for Tracking All Database Updates
-- ============================================================================
-- This migration creates a comprehensive change log table that records
-- all INSERT, UPDATE, and DELETE operations on any table with user information.

-- Create change_log table
-- Note: user_id will be added in migration 20250129000000 after users table is created
CREATE TABLE IF NOT EXISTS change_log (
  log_id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id text, -- Primary key value of the affected record (as text for flexibility)
  before_data jsonb, -- Record data before the change (for UPDATE/DELETE)
  after_data jsonb, -- Record data after the change (for INSERT/UPDATE)
  changed_fields text[], -- Array of field names that changed (for UPDATE)
  ip_address inet, -- Client IP address if available
  user_agent text, -- User agent string if available
  session_id text, -- Session identifier
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_change_log_table_name ON change_log(table_name);
CREATE INDEX IF NOT EXISTS idx_change_log_operation ON change_log(operation);
CREATE INDEX IF NOT EXISTS idx_change_log_table_operation ON change_log(table_name, operation);
CREATE INDEX IF NOT EXISTS idx_change_log_record_id ON change_log(table_name, record_id);
-- Index for user_id will be created in migration 20250129000000 after FK is added
CREATE INDEX IF NOT EXISTS idx_change_log_created_at ON change_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_log_table_record ON change_log(table_name, record_id, created_at DESC);

-- GIN index for JSONB queries (if needed in future)
CREATE INDEX IF NOT EXISTS idx_change_log_before_data_gin ON change_log USING GIN (before_data);
CREATE INDEX IF NOT EXISTS idx_change_log_after_data_gin ON change_log USING GIN (after_data);

-- Enable RLS
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow public read access to change_log" ON change_log;
DROP POLICY IF EXISTS "Allow authenticated users to insert change_log" ON change_log;

CREATE POLICY "Allow public read access to change_log"
  ON change_log FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert change_log"
  ON change_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE change_log IS 'Comprehensive change log tracking all database operations with user information';
COMMENT ON COLUMN change_log.log_id IS 'Primary key - sequential log ID';
COMMENT ON COLUMN change_log.table_name IS 'Name of the table that was modified';
COMMENT ON COLUMN change_log.operation IS 'Type of operation: INSERT, UPDATE, or DELETE';
COMMENT ON COLUMN change_log.record_id IS 'Primary key value of the affected record (as text)';
-- user_id FK comment will be added in migration 20250129000000
COMMENT ON COLUMN change_log.before_data IS 'Record data before the change (JSONB)';
COMMENT ON COLUMN change_log.after_data IS 'Record data after the change (JSONB)';
COMMENT ON COLUMN change_log.changed_fields IS 'Array of field names that changed (for UPDATE operations)';
COMMENT ON COLUMN change_log.ip_address IS 'Client IP address if available';
COMMENT ON COLUMN change_log.user_agent IS 'User agent string if available';
COMMENT ON COLUMN change_log.session_id IS 'Session identifier';
COMMENT ON COLUMN change_log.created_at IS 'Timestamp when the change occurred';

-- ============================================================================
-- RPC Functions will be created in migration 20250129000000 after users table
-- ============================================================================
-- Functions will use user_id FK instead of user_name, user_email, user_id text fields

-- ============================================================================
-- Helper function to query change log by table and record
-- ============================================================================
-- Function will be updated in migration 20250129000000 to join with users table
-- Placeholder function for now (will be replaced)
CREATE OR REPLACE FUNCTION get_change_log(
  p_table_name text DEFAULT NULL,
  p_record_id text DEFAULT NULL,
  p_user_name text DEFAULT NULL,
  p_operation text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  log_id bigint,
  table_name text,
  operation text,
  record_id text,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[],
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cl.log_id,
    cl.table_name,
    cl.operation,
    cl.record_id,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  WHERE 
    (p_table_name IS NULL OR cl.table_name = p_table_name)
    AND (p_record_id IS NULL OR cl.record_id = p_record_id)
    AND (p_operation IS NULL OR cl.operation = p_operation)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_change_log IS 'Query change log with optional filters';

-- ============================================================================
-- Helper function to get change history for a specific record
-- ============================================================================
-- Function will be updated in migration 20250129000000 to join with users table
-- Placeholder function for now (will be replaced)
CREATE OR REPLACE FUNCTION get_record_change_history(
  p_table_name text,
  p_record_id text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  log_id bigint,
  operation text,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[],
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cl.log_id,
    cl.operation,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  WHERE cl.table_name = p_table_name
    AND cl.record_id = p_record_id
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_record_change_history IS 'Get change history for a specific record';

-- ============================================================================
-- Helper function to get changes by user
-- ============================================================================
-- Function will be updated in migration 20250129000000 to join with users table
-- Placeholder function for now (will be replaced)
CREATE OR REPLACE FUNCTION get_user_changes(
  p_user_name text,
  p_table_name text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  log_id bigint,
  table_name text,
  operation text,
  record_id text,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[],
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cl.log_id,
    cl.table_name,
    cl.operation,
    cl.record_id,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  -- Will join with users table in migration 20250129000000
  WHERE (p_table_name IS NULL OR cl.table_name = p_table_name)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_changes IS 'Get all changes made by a specific user';

