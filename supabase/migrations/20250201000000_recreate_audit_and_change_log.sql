-- ============================================================================
-- Recreate Audit and Change Log Tables and Functions
-- ============================================================================
-- This migration recreates the audit and change_log tables with proper structure
-- and recreates all functions that replaced the triggers

-- ============================================================================
-- Step 1: Drop existing tables and dependent objects
-- ============================================================================
DROP TABLE IF EXISTS audit CASCADE;
DROP TABLE IF EXISTS change_log CASCADE;

-- ============================================================================
-- Step 2: Recreate audit table with user_id FK
-- ============================================================================
-- Create enum for action types if it doesn't exist
DO $$ BEGIN
  CREATE TYPE audit_action_type AS ENUM (
    'manual_update',
    'import_file',
    'transfer_area',
    'distribute_shared'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create audit table
CREATE TABLE audit (
  action_id bigserial PRIMARY KEY,
  user_id bigint NOT NULL,
  action_type audit_action_type NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('building', 'asset', 'bulk_building', 'bulk_asset')),
  entity_id text, -- Can be building_number, asset_id, or comma-separated IDs for bulk operations
  before_data jsonb, -- JSON containing all related building/asset data before the action
  after_data jsonb, -- JSON containing all related building/asset data after the action
  description text, -- Optional description of the action
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint to users table
ALTER TABLE audit
ADD CONSTRAINT fk_audit_user_id
FOREIGN KEY (user_id) REFERENCES users(user_id)
ON DELETE RESTRICT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id ON audit(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type_id ON audit(entity_type, entity_id);

-- Enable RLS
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow public read access to audit" ON audit;
DROP POLICY IF EXISTS "Allow authenticated users to insert audit" ON audit;

CREATE POLICY "Allow public read access to audit"
  ON audit FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert audit"
  ON audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

COMMENT ON TABLE audit IS 'Audit table tracking all changes to buildings and assets';
COMMENT ON COLUMN audit.action_id IS 'Primary key - sequential action ID';
COMMENT ON COLUMN audit.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN audit.action_type IS 'Type of action: manual_update, import_file, transfer_area, distribute_shared';
COMMENT ON COLUMN audit.entity_type IS 'Type of entity: building, asset, bulk_building, bulk_asset';
COMMENT ON COLUMN audit.entity_id IS 'ID of the entity (building_number, asset_id, or comma-separated IDs for bulk)';
COMMENT ON COLUMN audit.before_data IS 'JSON containing all related building/asset data before the action';
COMMENT ON COLUMN audit.after_data IS 'JSON containing all related building/asset data after the action';

-- ============================================================================
-- Step 3: Recreate change_log table with user_id FK
-- ============================================================================
CREATE TABLE change_log (
  log_id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id text, -- Primary key value of the affected record (as text for flexibility)
  user_id bigint NOT NULL,
  before_data jsonb, -- Record data before the change (for UPDATE/DELETE)
  after_data jsonb, -- Record data after the change (for INSERT/UPDATE)
  changed_fields text[], -- Array of field names that changed (for UPDATE)
  ip_address inet, -- Client IP address if available
  user_agent text, -- User agent string if available
  session_id text, -- Session identifier
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add foreign key constraint to users table
ALTER TABLE change_log
ADD CONSTRAINT fk_change_log_user_id
FOREIGN KEY (user_id) REFERENCES users(user_id)
ON DELETE RESTRICT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_change_log_user_id ON change_log(user_id);
CREATE INDEX IF NOT EXISTS idx_change_log_table_name ON change_log(table_name);
CREATE INDEX IF NOT EXISTS idx_change_log_operation ON change_log(operation);
CREATE INDEX IF NOT EXISTS idx_change_log_table_operation ON change_log(table_name, operation);
CREATE INDEX IF NOT EXISTS idx_change_log_record_id ON change_log(table_name, record_id);
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
COMMENT ON COLUMN change_log.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN change_log.before_data IS 'Record data before the change (JSONB)';
COMMENT ON COLUMN change_log.after_data IS 'Record data after the change (JSONB)';
COMMENT ON COLUMN change_log.changed_fields IS 'Array of field names that changed (for UPDATE operations)';
COMMENT ON COLUMN change_log.ip_address IS 'Client IP address if available';
COMMENT ON COLUMN change_log.user_agent IS 'User agent string if available';
COMMENT ON COLUMN change_log.session_id IS 'Session identifier';
COMMENT ON COLUMN change_log.created_at IS 'Timestamp when the change occurred';

-- ============================================================================
-- Step 4: Recreate helper functions for audit data
-- ============================================================================
-- Drop existing helper functions if they exist
DROP FUNCTION IF EXISTS get_building_audit_data(bigint) CASCADE;
DROP FUNCTION IF EXISTS get_asset_audit_data(bigint) CASCADE;

CREATE OR REPLACE FUNCTION get_building_audit_data(p_building_number bigint)
RETURNS jsonb AS $$
DECLARE
  v_building jsonb;
  v_assets jsonb;
  v_result jsonb;
BEGIN
  -- Get building data
  SELECT to_jsonb(b.*) INTO v_building
  FROM buildings b
  WHERE b.building_number = p_building_number;
  
  -- Get all assets for this building
  SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb) INTO v_assets
  FROM assets a
  WHERE a.building_number = p_building_number;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'building', v_building,
    'assets', v_assets
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_building_audit_data IS 'Get building data with all related assets for audit logging';

CREATE OR REPLACE FUNCTION get_asset_audit_data(p_asset_id bigint)
RETURNS jsonb AS $$
DECLARE
  v_asset jsonb;
  v_building jsonb;
  v_result jsonb;
BEGIN
  -- Get asset data
  SELECT to_jsonb(a.*) INTO v_asset
  FROM assets a
  WHERE a.asset_id = p_asset_id;
  
  -- Get building data if asset exists
  IF v_asset IS NOT NULL THEN
    SELECT to_jsonb(b.*) INTO v_building
    FROM buildings b
    WHERE b.building_number = (v_asset->>'building_number')::bigint;
  END IF;
  
  -- Combine into result
  v_result := jsonb_build_object(
    'asset', v_asset,
    'building', v_building
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_asset_audit_data IS 'Get asset data with building data for audit logging';

-- ============================================================================
-- Step 5: Recreate log_audit_entry function
-- ============================================================================
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'log_audit_entry'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors
    NULL;
END $$;

CREATE OR REPLACE FUNCTION log_audit_entry(
  p_action_type audit_action_type,
  p_entity_type text,
  p_entity_id text,
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_audit_id bigint;
  v_user_id_fk bigint;
  v_default_user_id bigint;
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
    v_user_id_fk := get_or_create_user_from_auth();
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;
  
  INSERT INTO audit (
    user_id,
    action_type,
    entity_type,
    entity_id,
    before_data,
    after_data,
    description
  ) VALUES (
    v_user_id_fk,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_before_data,
    p_after_data,
    p_description
  )
  RETURNING action_id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_entry IS 'Function to manually log an audit entry';

-- ============================================================================
-- Step 6: Recreate log_change_entry function
-- ============================================================================
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'log_change_entry'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors
    NULL;
END $$;

CREATE OR REPLACE FUNCTION log_change_entry(
  p_table_name text,
  p_operation text,
  p_record_id text,
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_changed_fields text[] DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_log_id bigint;
  v_user_id_fk bigint;
  v_default_user_id bigint;
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
    v_user_id_fk := get_or_create_user_from_auth();
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    v_user_id_fk := v_default_user_id;
  END IF;
  
  INSERT INTO change_log (
    table_name,
    operation,
    record_id,
    user_id,
    before_data,
    after_data,
    changed_fields
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    v_user_id_fk,
    p_before_data,
    p_after_data,
    p_changed_fields
  )
  RETURNING log_id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_change_entry IS 'Function to log a change entry';

-- ============================================================================
-- Step 7: Recreate log_audit_for_building function
-- ============================================================================
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'log_audit_for_building'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors
    NULL;
END $$;

CREATE OR REPLACE FUNCTION log_audit_for_building(
  p_building_number bigint,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_action_type audit_action_type DEFAULT 'manual_update',
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_audit_id bigint;
BEGIN
  IF p_operation = 'INSERT' THEN
    v_after_data := get_building_audit_data(p_building_number);
    v_before_data := NULL;
  ELSIF p_operation = 'UPDATE' THEN
    -- Note: This should be called AFTER the update, so v_before_data won't be accurate
    -- The calling code should pass before_data if needed
    v_after_data := get_building_audit_data(p_building_number);
    v_before_data := NULL; -- Will need to be passed in separately if needed
  ELSIF p_operation = 'DELETE' THEN
    v_before_data := NULL; -- Should be passed in before deletion
    v_after_data := NULL;
  END IF;
  
  SELECT log_audit_entry(
    p_action_type,
    'building',
    p_building_number::text,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Update building's action_id if not DELETE
  IF p_operation != 'DELETE' THEN
    UPDATE buildings
    SET action_id = v_audit_id
    WHERE building_number = p_building_number;
  END IF;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_building IS 'Log audit entry for building operation';

-- ============================================================================
-- Step 8: Recreate log_audit_for_asset function
-- ============================================================================
-- Drop existing function with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname = 'log_audit_for_asset'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors
    NULL;
END $$;

CREATE OR REPLACE FUNCTION log_audit_for_asset(
  p_asset_id bigint,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_action_type audit_action_type DEFAULT 'manual_update',
  p_copy_to_history boolean DEFAULT false,
  p_description text DEFAULT NULL
)
RETURNS bigint AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_audit_id bigint;
  v_old_asset jsonb;
  v_building_number bigint;
BEGIN
  IF p_operation = 'DELETE' THEN
    -- Get old asset before deletion (should have been copied to history already)
    SELECT to_jsonb(ah.*) INTO v_old_asset
    FROM assets_history ah
    WHERE ah.asset_id = p_asset_id
      AND ah.action_id IS NULL
    ORDER BY COALESCE(ah.history_created_at, ah.created_at) DESC NULLS LAST
    LIMIT 1;
    
    IF v_old_asset IS NOT NULL THEN
      v_building_number := (v_old_asset->>'building_number')::bigint;
      v_before_data := jsonb_build_object(
        'asset', v_old_asset,
        'building', get_building_audit_data(v_building_number)
      );
    END IF;
    
    v_after_data := jsonb_build_object(
      'asset', NULL,
      'building', get_building_audit_data(v_building_number)
    );
  ELSIF p_operation = 'UPDATE' THEN
    -- For UPDATE, get before data from history if it was copied
    IF p_copy_to_history THEN
      SELECT to_jsonb(ah.*) INTO v_old_asset
      FROM assets_history ah
      WHERE ah.asset_id = p_asset_id
        AND ah.action_id IS NULL
      ORDER BY COALESCE(ah.history_created_at, ah.created_at) DESC NULLS LAST
      LIMIT 1;
      
      IF v_old_asset IS NOT NULL THEN
        v_building_number := (v_old_asset->>'building_number')::bigint;
        v_before_data := jsonb_build_object(
          'asset', v_old_asset,
          'building', get_building_audit_data(v_building_number)
        );
      END IF;
    ELSE
      -- For regular UPDATE, before_data is not available
      -- Get building number from current asset
      SELECT building_number INTO v_building_number
      FROM assets
      WHERE asset_id = p_asset_id;
      
      IF v_building_number IS NOT NULL THEN
        v_before_data := jsonb_build_object(
          'asset', NULL,
          'building', get_building_audit_data(v_building_number)
        );
      END IF;
    END IF;
    
    -- Get after data
    v_after_data := get_asset_audit_data(p_asset_id);
  ELSIF p_operation = 'INSERT' THEN
    -- Get after data
    v_after_data := get_asset_audit_data(p_asset_id);
    
    -- Get building state for before_data (asset didn't exist before)
    SELECT building_number INTO v_building_number
    FROM assets
    WHERE asset_id = p_asset_id;
    
    IF v_building_number IS NOT NULL THEN
      v_before_data := jsonb_build_object(
        'asset', NULL,
        'building', get_building_audit_data(v_building_number)
      );
    END IF;
  END IF;
  
  -- Log audit entry
  SELECT log_audit_entry(
    p_action_type,
    'asset',
    p_asset_id::text,
    p_user_id,
    v_before_data,
    v_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Update asset's action_id if not DELETE
  IF p_operation != 'DELETE' THEN
    UPDATE assets
    SET action_id = v_audit_id
    WHERE asset_id = p_asset_id;
  END IF;
  
  -- Update history entry's action_id if one exists (for DELETE or UPDATE with copy_to_history)
  IF p_operation = 'DELETE' OR (p_operation = 'UPDATE' AND p_copy_to_history) THEN
    -- Update the most recent history entry without action_id
    -- Use a subquery in WHERE clause to identify the row
    UPDATE assets_history
    SET action_id = v_audit_id
    WHERE asset_id = p_asset_id
      AND action_id IS NULL
      AND (building_number, measurement_date, COALESCE(history_created_at, created_at)) = (
        SELECT building_number, measurement_date, COALESCE(history_created_at, created_at)
        FROM assets_history
        WHERE asset_id = p_asset_id
          AND action_id IS NULL
        ORDER BY COALESCE(history_created_at, created_at) DESC NULLS LAST
        LIMIT 1
      );
  END IF;
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_audit_for_asset IS 'Log audit entry for asset operation';

-- ============================================================================
-- Step 9: Recreate copy_asset_to_history_before_update function
-- ============================================================================
-- Drop existing function if it exists
DROP FUNCTION IF EXISTS copy_asset_to_history_before_update(bigint) CASCADE;

CREATE OR REPLACE FUNCTION copy_asset_to_history_before_update(
  p_asset_id bigint
)
RETURNS void AS $$
DECLARE
  v_old_asset jsonb;
BEGIN
  -- Get old asset data
  SELECT to_jsonb(a.*) INTO v_old_asset
  FROM assets a
  WHERE a.asset_id = p_asset_id;
  
  IF v_old_asset IS NOT NULL THEN
    -- Copy to history
    -- Note: history_created_at is set to now() to mark when this record was moved to history
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, created_at, updated_at,
      elevator, single_double_family, condo, townhouses, penthouse,
      tax_region, floor, discount_type, discount_date_from, discount_date_to,
      history_created_at,
      action_id
    ) VALUES (
      (v_old_asset->>'building_number')::bigint,
      v_old_asset->>'payer_id',
      (v_old_asset->>'asset_id')::bigint,
      v_old_asset->>'measurement_date',
      v_old_asset->>'main_asset_type',
      (v_old_asset->>'asset_size')::numeric,
      v_old_asset->>'sub_asset_type_1',
      (v_old_asset->>'sub_asset_size_1')::numeric,
      v_old_asset->>'sub_asset_type_2',
      (v_old_asset->>'sub_asset_size_2')::numeric,
      v_old_asset->>'sub_asset_type_3',
      (v_old_asset->>'sub_asset_size_3')::numeric,
      v_old_asset->>'sub_asset_type_4',
      (v_old_asset->>'sub_asset_size_4')::numeric,
      v_old_asset->>'sub_asset_type_5',
      (v_old_asset->>'sub_asset_size_5')::numeric,
      v_old_asset->>'sub_asset_type_6',
      (v_old_asset->>'sub_asset_size_6')::numeric,
      v_old_asset->>'structure_drawing_url',
      COALESCE((v_old_asset->>'created_at')::timestamptz, now()),
      COALESCE((v_old_asset->>'updated_at')::timestamptz, now()),
      v_old_asset->>'elevator',
      v_old_asset->>'single_double_family',
      v_old_asset->>'condo',
      v_old_asset->>'townhouses',
      v_old_asset->>'penthouse',
      (v_old_asset->>'tax_region')::integer,
      (v_old_asset->>'floor')::smallint,
      v_old_asset->>'discount_type',
      v_old_asset->>'discount_date_from',
      v_old_asset->>'discount_date_to',
      now(), -- history_created_at: timestamp when this record was moved to history
      NULL -- action_id will be set after audit entry is created
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION copy_asset_to_history_before_update IS 'Copy asset to history before update (for new measurements)';

-- ============================================================================
-- Step 10: Recreate update_building_total_area function
-- ============================================================================
-- Drop the old trigger function (no parameters, returns TRIGGER)
DROP FUNCTION IF EXISTS update_building_total_area();

-- Create new function with parameter (returns void)
CREATE OR REPLACE FUNCTION update_building_total_area(p_building_number bigint)
RETURNS void AS $$
BEGIN
  UPDATE buildings
  SET total_building_area = COALESCE((
    SELECT SUM(a.asset_size)
    FROM (
      SELECT DISTINCT ON (asset_id)
        asset_id,
        asset_size,
        main_asset_type
      FROM assets
      WHERE building_number = p_building_number
      ORDER BY asset_id, updated_at DESC
    ) a
    WHERE (
      a.main_asset_type IS NULL 
      OR EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = a.main_asset_type 
          AND at.active = 'כן'
          AND (at.not_accountable IS NULL OR at.not_accountable = false)
      )
    )
    -- Exclude residence assets where asset_id % 1000 = 0 (like 0, 1000, 2000, 3000, etc.)
    AND NOT (
      EXISTS (
        SELECT 1 
        FROM asset_types at 
        WHERE at.name = a.main_asset_type 
          AND at.business_residence = 'מגורים'
          AND a.asset_id % 1000 = 0
      )
    )
  ), 0)
  WHERE building_number = p_building_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_building_total_area IS 'Update building total area based on sum of asset sizes (excluding not_accountable assets and residence assets where asset_id % 1000 = 0)';

-- ============================================================================
-- Step 11: Recreate change_log query functions
-- ============================================================================
-- Drop existing functions with all possible signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc
    WHERE proname IN ('get_change_log', 'get_record_change_history', 'get_user_changes')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors
    NULL;
END $$;

CREATE OR REPLACE FUNCTION get_change_log(
  p_table_name text DEFAULT NULL,
  p_record_id text DEFAULT NULL,
  p_user_id bigint DEFAULT NULL,
  p_operation text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  log_id bigint,
  table_name text,
  operation text,
  record_id text,
  user_id bigint,
  user_name text,
  user_email text,
  auth_user_id text,
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
    cl.user_id,
    u.user_name,
    u.user_email,
    u.auth_user_id,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  LEFT JOIN users u ON cl.user_id = u.user_id
  WHERE 
    (p_table_name IS NULL OR cl.table_name = p_table_name)
    AND (p_record_id IS NULL OR cl.record_id = p_record_id)
    AND (p_user_id IS NULL OR cl.user_id = p_user_id)
    AND (p_operation IS NULL OR cl.operation = p_operation)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_change_log IS 'Query change log with optional filters';

CREATE OR REPLACE FUNCTION get_record_change_history(
  p_table_name text,
  p_record_id text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  log_id bigint,
  operation text,
  user_id bigint,
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
    cl.user_id,
    u.user_name,
    u.user_email,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  LEFT JOIN users u ON cl.user_id = u.user_id
  WHERE cl.table_name = p_table_name
    AND cl.record_id = p_record_id
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_record_change_history IS 'Get change history for a specific record';

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
  user_id bigint,
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
    cl.user_id,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  INNER JOIN users u ON cl.user_id = u.user_id
  WHERE u.user_name = p_user_name
    AND (p_table_name IS NULL OR cl.table_name = p_table_name)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_changes IS 'Get all changes made by a specific user';
