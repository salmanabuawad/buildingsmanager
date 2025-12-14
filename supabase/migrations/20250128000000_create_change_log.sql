-- ============================================================================
-- Change Log Table for Tracking All Database Updates
-- ============================================================================
-- This migration creates a comprehensive change log table that records
-- all INSERT, UPDATE, and DELETE operations on any table with user information.

-- Create change_log table
CREATE TABLE IF NOT EXISTS change_log (
  log_id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id text, -- Primary key value of the affected record (as text for flexibility)
  user_name text NOT NULL DEFAULT 'default',
  user_email text, -- User email if available
  user_id text, -- User ID if available
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
CREATE INDEX IF NOT EXISTS idx_change_log_user_name ON change_log(user_name);
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
COMMENT ON COLUMN change_log.user_name IS 'User who performed the operation';
COMMENT ON COLUMN change_log.user_email IS 'User email if available from auth context';
COMMENT ON COLUMN change_log.user_id IS 'User ID if available from auth context';
COMMENT ON COLUMN change_log.before_data IS 'Record data before the change (JSONB)';
COMMENT ON COLUMN change_log.after_data IS 'Record data after the change (JSONB)';
COMMENT ON COLUMN change_log.changed_fields IS 'Array of field names that changed (for UPDATE operations)';
COMMENT ON COLUMN change_log.ip_address IS 'Client IP address if available';
COMMENT ON COLUMN change_log.user_agent IS 'User agent string if available';
COMMENT ON COLUMN change_log.session_id IS 'Session identifier';
COMMENT ON COLUMN change_log.created_at IS 'Timestamp when the change occurred';

-- ============================================================================
-- RPC Function to log changes (called asynchronously from API)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_change_entry(
  p_table_name text,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_record_id text,
  p_user_name text DEFAULT 'default',
  p_user_email text DEFAULT NULL,
  p_user_id text DEFAULT NULL,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_changed_fields text[] DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_log_id bigint;
BEGIN
  INSERT INTO change_log (
    table_name,
    operation,
    record_id,
    user_name,
    user_email,
    user_id,
    before_data,
    after_data,
    changed_fields
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    p_user_name,
    p_user_email,
    p_user_id,
    p_before_data,
    p_after_data,
    p_changed_fields
  )
  RETURNING log_id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_change_entry IS 'Log a change entry to the change_log table (called from API)';

-- ============================================================================
-- RPC Function to log multiple changes in bulk (for bulk operations)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_bulk_change_entries(
  p_entries jsonb -- Array of change log entries
)
RETURNS bigint[] AS $$
DECLARE
  v_log_ids bigint[];
  v_entry jsonb;
  v_log_id bigint;
BEGIN
  v_log_ids := ARRAY[]::bigint[];
  
  -- Process each entry in the array
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO change_log (
      table_name,
      operation,
      record_id,
      user_name,
      user_email,
      user_id,
      before_data,
      after_data,
      changed_fields
    ) VALUES (
      v_entry->>'table_name',
      v_entry->>'operation',
      v_entry->>'record_id',
      COALESCE(v_entry->>'user_name', 'default'),
      NULLIF(v_entry->>'user_email', ''),
      NULLIF(v_entry->>'user_id', ''),
      CASE WHEN v_entry->'before_data' IS NOT NULL THEN v_entry->'before_data' ELSE NULL END,
      CASE WHEN v_entry->'after_data' IS NOT NULL THEN v_entry->'after_data' ELSE NULL END,
      CASE WHEN v_entry->'changed_fields' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(v_entry->'changed_fields')) ELSE NULL END
    )
    RETURNING log_id INTO v_log_id;
    
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;
  
  RETURN v_log_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_bulk_change_entries IS 'Log multiple change entries in a single transaction (for bulk operations)';

-- ============================================================================
-- RPC Function to log changes (called asynchronously from API)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_change_entry(
  p_table_name text,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_record_id text,
  p_user_name text DEFAULT 'default',
  p_user_email text DEFAULT NULL,
  p_user_id text DEFAULT NULL,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_changed_fields text[] DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_log_id bigint;
BEGIN
  INSERT INTO change_log (
    table_name,
    operation,
    record_id,
    user_name,
    user_email,
    user_id,
    before_data,
    after_data,
    changed_fields
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    p_user_name,
    p_user_email,
    p_user_id,
    p_before_data,
    p_after_data,
    p_changed_fields
  )
  RETURNING log_id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_change_entry IS 'Log a change entry to the change_log table (called from API)';

-- ============================================================================
-- RPC Function to log multiple changes in bulk (for bulk operations)
-- ============================================================================
CREATE OR REPLACE FUNCTION log_bulk_change_entries(
  p_entries jsonb -- Array of change log entries
)
RETURNS bigint[] AS $$
DECLARE
  v_log_ids bigint[];
  v_entry jsonb;
  v_log_id bigint;
BEGIN
  v_log_ids := ARRAY[]::bigint[];
  
  -- Process each entry in the array
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO change_log (
      table_name,
      operation,
      record_id,
      user_name,
      user_email,
      user_id,
      before_data,
      after_data,
      changed_fields
    ) VALUES (
      v_entry->>'table_name',
      v_entry->>'operation',
      v_entry->>'record_id',
      COALESCE(v_entry->>'user_name', 'default'),
      NULLIF(v_entry->>'user_email', ''),
      NULLIF(v_entry->>'user_id', ''),
      CASE WHEN v_entry->'before_data' IS NOT NULL THEN v_entry->'before_data' ELSE NULL END,
      CASE WHEN v_entry->'after_data' IS NOT NULL THEN v_entry->'after_data' ELSE NULL END,
      CASE WHEN v_entry->'changed_fields' IS NOT NULL THEN ARRAY(SELECT jsonb_array_elements_text(v_entry->'changed_fields')) ELSE NULL END
    )
    RETURNING log_id INTO v_log_id;
    
    v_log_ids := array_append(v_log_ids, v_log_id);
  END LOOP;
  
  RETURN v_log_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_bulk_change_entries IS 'Log multiple change entries in a single transaction (for bulk operations)';

-- ============================================================================
-- Helper function to query change log by table and record
-- ============================================================================
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
  user_name text,
  user_email text,
  user_id text,
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
    cl.user_name,
    cl.user_email,
    cl.user_id,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  WHERE 
    (p_table_name IS NULL OR cl.table_name = p_table_name)
    AND (p_record_id IS NULL OR cl.record_id = p_record_id)
    AND (p_user_name IS NULL OR cl.user_name = p_user_name)
    AND (p_operation IS NULL OR cl.operation = p_operation)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_change_log IS 'Query change log with optional filters';

-- ============================================================================
-- Helper function to get change history for a specific record
-- ============================================================================
CREATE OR REPLACE FUNCTION get_record_change_history(
  p_table_name text,
  p_record_id text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  log_id bigint,
  operation text,
  user_name text,
  user_email text,
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
    cl.user_name,
    cl.user_email,
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
  WHERE cl.user_name = p_user_name
    AND (p_table_name IS NULL OR cl.table_name = p_table_name)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_changes IS 'Get all changes made by a specific user';

