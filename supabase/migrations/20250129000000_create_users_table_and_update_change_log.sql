-- ============================================================================
-- Create Users Table and Update Change Log to Use Foreign Key
-- ============================================================================
-- This migration creates a users table and updates change_log to reference
-- users via a foreign key instead of storing user information as text fields.

-- ============================================================================
-- Step 1: Create users table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  user_id bigserial PRIMARY KEY,
  auth_user_id text UNIQUE, -- Reference to Supabase auth.users.id (UUID as text)
  user_name text NOT NULL,
  user_email text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_user_email ON users(user_email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
DROP POLICY IF EXISTS "Allow public read access to users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to insert users" ON users;
DROP POLICY IF EXISTS "Allow authenticated users to update own user" ON users;

CREATE POLICY "Allow public read access to users"
  ON users FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update own user"
  ON users FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE users IS 'Application users table, can be synced with Supabase auth.users';
COMMENT ON COLUMN users.user_id IS 'Primary key - internal user ID';
COMMENT ON COLUMN users.auth_user_id IS 'Reference to Supabase auth.users.id (UUID)';
COMMENT ON COLUMN users.user_name IS 'Display name of the user';
COMMENT ON COLUMN users.user_email IS 'User email address';
COMMENT ON COLUMN users.active IS 'Whether the user account is active';

-- ============================================================================
-- Step 2: Create function to get or create user from auth context
-- ============================================================================
CREATE OR REPLACE FUNCTION get_or_create_user_from_auth()
RETURNS bigint AS $$
DECLARE
  v_auth_user_id text;
  v_user_email text;
  v_user_name text;
  v_user_id bigint;
BEGIN
  -- Get current auth user from Supabase auth context
  v_auth_user_id := current_setting('request.jwt.claims', true)::json->>'sub';
  
  -- If no auth user, return NULL (will use default user)
  IF v_auth_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Try to get user email and name from auth metadata
  v_user_email := current_setting('request.jwt.claims', true)::json->>'email';
  v_user_name := COALESCE(
    current_setting('request.jwt.claims', true)::json->>'email',
    current_setting('request.jwt.claims', true)::json->>'sub',
    'default'
  );
  
  -- Try to find existing user by auth_user_id
  SELECT user_id INTO v_user_id
  FROM users
  WHERE auth_user_id = v_auth_user_id;
  
  -- If user exists, return it
  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;
  
  -- Create new user
  INSERT INTO users (auth_user_id, user_name, user_email)
  VALUES (v_auth_user_id, v_user_name, v_user_email)
  RETURNING user_id INTO v_user_id;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_user_from_auth IS 'Get or create user from Supabase auth context';

-- ============================================================================
-- Step 3: Create default user for system operations
-- ============================================================================
INSERT INTO users (auth_user_id, user_name, user_email, active)
VALUES (NULL, 'default', 'system@default', true)
ON CONFLICT DO NOTHING;

-- Get the default user_id for later use
DO $$
DECLARE
  v_default_user_id bigint;
BEGIN
  SELECT user_id INTO v_default_user_id
  FROM users
  WHERE user_name = 'default' AND auth_user_id IS NULL
  LIMIT 1;
  
  -- Store it in a temporary setting for use in the migration
  PERFORM set_config('app.default_user_id', v_default_user_id::text, false);
END $$;

-- ============================================================================
-- Step 4: Add user_id column to change_log (as foreign key) and remove redundant fields
-- ============================================================================
-- First, add the new column as nullable (will replace user_id_fk if it exists)
DO $$
BEGIN
  -- If user_id_fk exists, rename it to user_id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_log' AND column_name = 'user_id_fk') THEN
    ALTER TABLE change_log RENAME COLUMN user_id_fk TO user_id;
  ELSE
    -- Otherwise, add new user_id column
    ALTER TABLE change_log ADD COLUMN IF NOT EXISTS user_id bigint;
  END IF;
END $$;

-- ============================================================================
-- Step 5: Migrate existing data (if any)
-- ============================================================================
-- For existing records, try to match by old user_id (text) or user_email
-- If no match, use default user
DO $$
DECLARE
  v_default_user_id bigint;
  v_auth_user_id text;
  v_user_id_val bigint;
BEGIN
  -- Get default user_id
  SELECT user_id INTO v_default_user_id
  FROM users
  WHERE user_name = 'default' AND auth_user_id IS NULL
  LIMIT 1;
  
  -- Update existing change_log records if old text user_id field exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_log' AND column_name = 'user_id' AND data_type = 'text') THEN
    -- Rename text column temporarily
    ALTER TABLE change_log RENAME COLUMN user_id TO user_id_old_text;
    ALTER TABLE change_log ADD COLUMN user_id bigint;
    
    -- Migrate data
    UPDATE change_log cl
    SET user_id = COALESCE(
      (SELECT u.user_id FROM users u WHERE u.auth_user_id = cl.user_id_old_text),
      v_default_user_id
    )
    WHERE cl.user_id IS NULL;
    
    -- Drop old text column
    ALTER TABLE change_log DROP COLUMN user_id_old_text;
  END IF;
  
  -- Try to match by user_email if it exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_log' AND column_name = 'user_email') THEN
    UPDATE change_log cl
    SET user_id = COALESCE(
      (SELECT u.user_id FROM users u WHERE u.user_email = cl.user_email),
      cl.user_id,
      v_default_user_id
    )
    WHERE cl.user_id IS NULL;
  END IF;
  
  -- Try to match by user_name if it exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_log' AND column_name = 'user_name') THEN
    UPDATE change_log cl
    SET user_id = COALESCE(
      (SELECT u.user_id FROM users u WHERE u.user_name = cl.user_name),
      cl.user_id,
      v_default_user_id
    )
    WHERE cl.user_id IS NULL;
  END IF;
END $$;

-- ============================================================================
-- Step 6: Make user_id NOT NULL and add foreign key constraint
-- ============================================================================
-- Set default for any remaining NULL values
UPDATE change_log
SET user_id = (SELECT user_id FROM users WHERE user_name = 'default' AND auth_user_id IS NULL LIMIT 1)
WHERE user_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE change_log
ALTER COLUMN user_id SET NOT NULL;

-- Add foreign key constraint
-- Use RESTRICT to prevent user deletion if they have change logs
ALTER TABLE change_log
DROP CONSTRAINT IF EXISTS fk_change_log_user_id;
ALTER TABLE change_log
ADD CONSTRAINT fk_change_log_user_id
FOREIGN KEY (user_id) REFERENCES users(user_id)
ON DELETE RESTRICT;

-- Create index for the foreign key
DROP INDEX IF EXISTS idx_change_log_user_id_fk;
CREATE INDEX IF NOT EXISTS idx_change_log_user_id ON change_log(user_id);

-- ============================================================================
-- Step 7: Remove redundant fields from change_log
-- ============================================================================
-- Drop redundant columns if they exist
ALTER TABLE change_log DROP COLUMN IF EXISTS user_name;
ALTER TABLE change_log DROP COLUMN IF EXISTS user_email;

-- ============================================================================
-- Step 7: Update RPC functions to use user_id_fk
-- ============================================================================

-- Update log_change_entry function
CREATE OR REPLACE FUNCTION log_change_entry(
  p_table_name text,
  p_operation text, -- 'INSERT', 'UPDATE', 'DELETE'
  p_record_id text,
  p_user_name text DEFAULT NULL,
  p_user_email text DEFAULT NULL,
  p_user_id text DEFAULT NULL, -- This is now auth_user_id (UUID as text)
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
  -- Get or create user from auth context or parameters
  IF p_user_id IS NOT NULL THEN
    -- Try to find user by auth_user_id
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE auth_user_id = p_user_id;
    
    -- If not found, try to create it
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (auth_user_id, user_name, user_email)
      VALUES (p_user_id, COALESCE(p_user_name, p_user_email, 'default'), p_user_email)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET user_name = COALESCE(EXCLUDED.user_name, users.user_name),
          user_email = COALESCE(EXCLUDED.user_email, users.user_email),
          updated_at = now()
      RETURNING user_id INTO v_user_id_fk;
    END IF;
  ELSIF p_user_email IS NOT NULL THEN
    -- Try to find by email
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE user_email = p_user_email
    LIMIT 1;
    
    -- If not found, create it
    IF v_user_id_fk IS NULL THEN
      INSERT INTO users (user_name, user_email)
      VALUES (COALESCE(p_user_name, p_user_email), p_user_email)
      RETURNING user_id INTO v_user_id_fk;
    END IF;
  ELSE
    -- Try to get from auth context
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
  
  -- Insert change log entry
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

-- Update log_bulk_change_entries function
CREATE OR REPLACE FUNCTION log_bulk_change_entries(
  p_entries jsonb -- Array of change log entries
)
RETURNS bigint[] AS $$
DECLARE
  v_log_ids bigint[];
  v_entry jsonb;
  v_log_id bigint;
  v_user_id_fk bigint;
  v_default_user_id bigint;
BEGIN
  v_log_ids := ARRAY[]::bigint[];
  
  -- Get default user_id
  SELECT user_id INTO v_default_user_id
  FROM users
  WHERE user_name = 'default' AND auth_user_id IS NULL
  LIMIT 1;
  
  -- Process each entry in the array
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    -- Get or create user for this entry
    IF v_entry->>'user_id' IS NOT NULL THEN
      SELECT user_id INTO v_user_id_fk
      FROM users
      WHERE auth_user_id = v_entry->>'user_id';
      
      IF v_user_id_fk IS NULL THEN
        INSERT INTO users (auth_user_id, user_name, user_email)
        VALUES (
          v_entry->>'user_id',
          COALESCE(v_entry->>'user_name', v_entry->>'user_email', 'default'),
          NULLIF(v_entry->>'user_email', '')
        )
        ON CONFLICT (auth_user_id) DO UPDATE
        SET user_name = COALESCE(EXCLUDED.user_name, users.user_name),
            user_email = COALESCE(EXCLUDED.user_email, users.user_email),
            updated_at = now()
        RETURNING user_id INTO v_user_id_fk;
      END IF;
    ELSIF v_entry->>'user_email' IS NOT NULL THEN
      SELECT user_id INTO v_user_id_fk
      FROM users
      WHERE user_email = v_entry->>'user_email'
      LIMIT 1;
      
      IF v_user_id_fk IS NULL THEN
        INSERT INTO users (user_name, user_email)
        VALUES (
          COALESCE(v_entry->>'user_name', v_entry->>'user_email'),
          v_entry->>'user_email'
        )
        RETURNING user_id INTO v_user_id_fk;
      END IF;
    ELSE
      v_user_id_fk := get_or_create_user_from_auth();
      IF v_user_id_fk IS NULL THEN
        v_user_id_fk := v_default_user_id;
      END IF;
    END IF;
    
    -- Insert change log entry
    INSERT INTO change_log (
      table_name,
      operation,
      record_id,
      user_id,
      before_data,
      after_data,
      changed_fields
    ) VALUES (
      v_entry->>'table_name',
      v_entry->>'operation',
      v_entry->>'record_id',
      v_user_id_fk,
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

-- ============================================================================
-- Step 8: Update helper functions to join with users table
-- ============================================================================

-- Drop old functions first (they have different return types)
-- PostgreSQL requires dropping functions before changing return types
-- The error message indicates we need to drop: get_change_log(text,text,text,text,integer)
-- We'll drop all three helper functions that have changed return types

-- Drop get_change_log - exact signature from error message
DROP FUNCTION IF EXISTS get_change_log(text, text, text, text, integer) CASCADE;

-- Drop get_record_change_history
DROP FUNCTION IF EXISTS get_record_change_history(text, text, integer) CASCADE;

-- Drop get_user_changes  
DROP FUNCTION IF EXISTS get_user_changes(text, text, integer) CASCADE;

-- Update get_change_log function
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
    AND (p_user_name IS NULL OR u.user_name = p_user_name)
    AND (p_operation IS NULL OR cl.operation = p_operation)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Update get_record_change_history function
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
    cl.operation,
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
  WHERE cl.table_name = p_table_name
    AND cl.record_id = p_record_id
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Update get_user_changes function
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

-- ============================================================================
-- Step 9: Update comments
-- ============================================================================
COMMENT ON COLUMN change_log.user_id IS 'Foreign key to users table';

-- ============================================================================
-- Step 8: Update audit table to use user_id FK instead of user_name
-- ============================================================================
-- Add user_id column to audit table
ALTER TABLE audit
ADD COLUMN IF NOT EXISTS user_id bigint;

-- Migrate existing data
DO $$
DECLARE
  v_default_user_id bigint;
BEGIN
  -- Get default user_id
  SELECT user_id INTO v_default_user_id
  FROM users
  WHERE user_name = 'default' AND auth_user_id IS NULL
  LIMIT 1;
  
  -- Update existing audit records if user_name exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit' AND column_name = 'user_name') THEN
    UPDATE audit a
    SET user_id = COALESCE(
      (SELECT u.user_id FROM users u WHERE u.user_name = a.user_name),
      v_default_user_id
    )
    WHERE a.user_id IS NULL;
  END IF;
END $$;

-- Set default for any remaining NULL values
UPDATE audit
SET user_id = (SELECT user_id FROM users WHERE user_name = 'default' AND auth_user_id IS NULL LIMIT 1)
WHERE user_id IS NULL;

-- Make user_id NOT NULL
ALTER TABLE audit
ALTER COLUMN user_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE audit
DROP CONSTRAINT IF EXISTS fk_audit_user_id;
ALTER TABLE audit
ADD CONSTRAINT fk_audit_user_id
FOREIGN KEY (user_id) REFERENCES users(user_id)
ON DELETE RESTRICT;

-- Create index for the foreign key
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit(user_id);

-- Remove redundant user_name field
ALTER TABLE audit DROP COLUMN IF EXISTS user_name;

-- Update audit functions to use user_id FK
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

-- Update audit_building_changes function
CREATE OR REPLACE FUNCTION audit_building_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_action_type audit_action_type;
  v_audit_id bigint;
  v_user_id_fk bigint;
BEGIN
  -- Determine action type based on operation
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'manual_update';
    v_before_data := NULL;
    v_after_data := get_building_audit_data(NEW.building_number);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action_type := 'manual_update';
    v_before_data := get_building_audit_data(OLD.building_number);
    v_after_data := get_building_audit_data(NEW.building_number);
  ELSIF TG_OP = 'DELETE' THEN
    v_action_type := 'manual_update';
    v_before_data := get_building_audit_data(OLD.building_number);
    v_after_data := NULL;
  END IF;
  
  -- Get user from auth context
  v_user_id_fk := get_or_create_user_from_auth();
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
  END IF;

  -- Log the audit entry and update the building's action_id
  SELECT log_audit_entry(
    v_action_type,
    'building',
    COALESCE(NEW.building_number::text, OLD.building_number::text),
    NULL, -- Will use auth context
    v_before_data,
    v_after_data,
    'Automatic audit log: ' || TG_OP || ' operation on building'
  ) INTO v_audit_id;
  
  -- Update the building's action_id
  IF TG_OP != 'DELETE' THEN
    NEW.action_id := v_audit_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update audit_asset_changes function
CREATE OR REPLACE FUNCTION audit_asset_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_before_data jsonb;
  v_after_data jsonb;
  v_action_type audit_action_type;
  v_audit_id bigint;
  v_user_id_fk bigint;
  v_building_number bigint;
BEGIN
  -- Get building number
  v_building_number := COALESCE(OLD.building_number, NEW.building_number);
  
  -- Determine action type based on operation
  IF TG_OP = 'INSERT' THEN
    v_action_type := 'manual_update';
    v_before_data := NULL;
    v_after_data := get_asset_audit_data(NEW.asset_id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action_type := 'manual_update';
    v_before_data := get_asset_audit_data(OLD.asset_id);
    v_after_data := get_asset_audit_data(NEW.asset_id);
  ELSIF TG_OP = 'DELETE' THEN
    v_action_type := 'manual_update';
    v_before_data := get_asset_audit_data(OLD.asset_id);
    v_after_data := NULL;
  END IF;
  
  -- Get user from auth context
  v_user_id_fk := get_or_create_user_from_auth();
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_user_id_fk
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
  END IF;

  -- Log the audit entry and update the asset's action_id
  SELECT log_audit_entry(
    v_action_type,
    'asset',
    COALESCE(NEW.asset_id::text, OLD.asset_id::text),
    NULL, -- Will use auth context
    v_before_data,
    v_after_data,
    'Automatic audit log: ' || TG_OP || ' operation on asset'
  ) INTO v_audit_id;
  
  -- Update the asset's action_id
  IF TG_OP != 'DELETE' THEN
    NEW.action_id := v_audit_id;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN audit.user_id IS 'Foreign key to users table';

-- ============================================================================
-- Step 9: Update bulk operations functions to use user_id FK
-- ============================================================================
-- Update bulk_update_assets_with_audit function
CREATE OR REPLACE FUNCTION bulk_update_assets_with_audit(
  p_assets jsonb,
  p_action_type audit_action_type,
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_audit_id bigint;
  v_asset jsonb;
  v_asset_id bigint;
  v_building_number bigint;
  v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
  v_result jsonb;
BEGIN
  -- Create audit entry first
  SELECT log_audit_entry(
    p_action_type,
    'bulk_asset',
    NULL::text,
    p_user_id,
    p_before_data,
    p_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- Process each asset in the array
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    -- Check if asset exists (for update vs insert)
    IF EXISTS (SELECT 1 FROM assets WHERE asset_id = v_asset_id) THEN
      -- UPDATE existing asset
      UPDATE assets
      SET
        building_number = COALESCE((v_asset->>'building_number')::bigint, building_number),
        payer_id = COALESCE(v_asset->>'payer_id', payer_id),
        measurement_date = COALESCE(v_asset->>'measurement_date', measurement_date),
        main_asset_type = COALESCE(v_asset->>'main_asset_type', main_asset_type),
        asset_size = COALESCE((v_asset->>'asset_size')::numeric, asset_size),
        sub_asset_type_1 = COALESCE(v_asset->>'sub_asset_type_1', sub_asset_type_1),
        sub_asset_size_1 = COALESCE((v_asset->>'sub_asset_size_1')::numeric, sub_asset_size_1),
        sub_asset_type_2 = COALESCE(v_asset->>'sub_asset_type_2', sub_asset_type_2),
        sub_asset_size_2 = COALESCE((v_asset->>'sub_asset_size_2')::numeric, sub_asset_size_2),
        sub_asset_type_3 = COALESCE(v_asset->>'sub_asset_type_3', sub_asset_type_3),
        sub_asset_size_3 = COALESCE((v_asset->>'sub_asset_size_3')::numeric, sub_asset_size_3),
        sub_asset_type_4 = COALESCE(v_asset->>'sub_asset_type_4', sub_asset_type_4),
        sub_asset_size_4 = COALESCE((v_asset->>'sub_asset_size_4')::numeric, sub_asset_size_4),
        sub_asset_type_5 = COALESCE(v_asset->>'sub_asset_type_5', sub_asset_type_5),
        sub_asset_size_5 = COALESCE((v_asset->>'sub_asset_size_5')::numeric, sub_asset_size_5),
        sub_asset_type_6 = COALESCE(v_asset->>'sub_asset_type_6', sub_asset_type_6),
        sub_asset_size_6 = COALESCE((v_asset->>'sub_asset_size_6')::numeric, sub_asset_size_6),
        structure_drawing_url = COALESCE(v_asset->>'structure_drawing_url', structure_drawing_url),
        elevator = COALESCE(v_asset->>'elevator', elevator),
        single_double_family = COALESCE(v_asset->>'single_double_family', single_double_family),
        condo = COALESCE(v_asset->>'condo', condo),
        townhouses = COALESCE(v_asset->>'townhouses', townhouses),
        penthouse = COALESCE(v_asset->>'penthouse', penthouse),
        tax_region = COALESCE((v_asset->>'tax_region')::integer, tax_region),
        floor = COALESCE((v_asset->>'floor')::smallint, floor),
        discount_type = COALESCE(v_asset->>'discount_type', discount_type),
        discount_date_from = COALESCE(v_asset->>'discount_date_from', discount_date_from),
        discount_date_to = COALESCE(v_asset->>'discount_date_to', discount_date_to),
        action_id = v_audit_id,
        updated_at = now()
      WHERE asset_id = v_asset_id;
    ELSE
      -- INSERT new asset
      INSERT INTO assets (
        building_number, payer_id, asset_id, measurement_date,
        main_asset_type, asset_size,
        sub_asset_type_1, sub_asset_size_1,
        sub_asset_type_2, sub_asset_size_2,
        sub_asset_type_3, sub_asset_size_3,
        sub_asset_type_4, sub_asset_size_4,
        sub_asset_type_5, sub_asset_size_5,
        sub_asset_type_6, sub_asset_size_6,
        structure_drawing_url, elevator, single_double_family,
        condo, townhouses, penthouse, tax_region,
        floor, discount_type, discount_date_from, discount_date_to,
        action_id, created_at, updated_at
      ) VALUES (
        (v_asset->>'building_number')::bigint,
        NULLIF(v_asset->>'payer_id', ''),
        v_asset_id,
        COALESCE(v_asset->>'measurement_date', '01/01/1900'),
        NULLIF(v_asset->>'main_asset_type', ''),
        COALESCE((v_asset->>'asset_size')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_1', ''),
        COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_2', ''),
        COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_3', ''),
        COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_4', ''),
        COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_5', ''),
        COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
        NULLIF(v_asset->>'sub_asset_type_6', ''),
        COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
        NULLIF(v_asset->>'structure_drawing_url', ''),
        NULLIF(v_asset->>'elevator', ''),
        NULLIF(v_asset->>'single_double_family', ''),
        NULLIF(v_asset->>'condo', ''),
        NULLIF(v_asset->>'townhouses', ''),
        NULLIF(v_asset->>'penthouse', ''),
        (v_asset->>'tax_region')::integer,
        (v_asset->>'floor')::smallint,
        NULLIF(v_asset->>'discount_type', ''),
        NULLIF(v_asset->>'discount_date_from', ''),
        NULLIF(v_asset->>'discount_date_to', ''),
        v_audit_id,
        now(),
        now()
      );
    END IF;
    
    -- Add to affected asset IDs array
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    
    -- Update building total area for this building
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Update audit entry with entity_id (comma-separated asset IDs)
  UPDATE audit
  SET entity_id = array_to_string(v_affected_asset_ids, ',')
  WHERE action_id = v_audit_id;
  
  -- Return result with audit_id and affected asset IDs
  v_result := jsonb_build_object(
    'action_id', v_audit_id,
    'affected_asset_ids', v_affected_asset_ids,
    'count', array_length(v_affected_asset_ids, 1)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update bulk_transfer_areas_with_audit function
CREATE OR REPLACE FUNCTION bulk_transfer_areas_with_audit(
  p_old_assets jsonb,
  p_new_assets jsonb,
  p_action_type audit_action_type DEFAULT 'transfer_area',
  p_user_id text DEFAULT NULL, -- auth_user_id (UUID as text)
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_audit_id bigint;
  v_asset jsonb;
  v_asset_id bigint;
  v_building_number bigint;
  v_affected_asset_ids bigint[] := ARRAY[]::bigint[];
  v_result jsonb;
BEGIN
  -- Create audit entry first
  SELECT log_audit_entry(
    p_action_type,
    'bulk_asset',
    NULL::text,
    p_user_id,
    p_before_data,
    p_after_data,
    p_description
  ) INTO v_audit_id;
  
  -- First, move old assets to history and mark with action_id
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_old_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    -- Copy to history
    INSERT INTO assets_history (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      created_at, history_created_at, action_id
    )
    SELECT
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      created_at, now(), v_audit_id
    FROM assets
    WHERE asset_id = v_asset_id;
    
    -- Delete from assets table
    DELETE FROM assets WHERE asset_id = v_asset_id;
    
    -- Add to affected asset IDs
    v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    
    -- Update building total area
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Then, create new assets
  FOR v_asset IN SELECT * FROM jsonb_array_elements(p_new_assets)
  LOOP
    v_asset_id := (v_asset->>'asset_id')::bigint;
    v_building_number := (v_asset->>'building_number')::bigint;
    
    INSERT INTO assets (
      building_number, payer_id, asset_id, measurement_date,
      main_asset_type, asset_size,
      sub_asset_type_1, sub_asset_size_1,
      sub_asset_type_2, sub_asset_size_2,
      sub_asset_type_3, sub_asset_size_3,
      sub_asset_type_4, sub_asset_size_4,
      sub_asset_type_5, sub_asset_size_5,
      sub_asset_type_6, sub_asset_size_6,
      structure_drawing_url, elevator, single_double_family,
      condo, townhouses, penthouse, tax_region,
      floor, discount_type, discount_date_from, discount_date_to,
      action_id, created_at, updated_at
    ) VALUES (
      (v_asset->>'building_number')::bigint,
      NULLIF(v_asset->>'payer_id', ''),
      v_asset_id,
      COALESCE(v_asset->>'measurement_date', '01/01/1900'),
      NULLIF(v_asset->>'main_asset_type', ''),
      COALESCE((v_asset->>'asset_size')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_1', ''),
      COALESCE((v_asset->>'sub_asset_size_1')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_2', ''),
      COALESCE((v_asset->>'sub_asset_size_2')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_3', ''),
      COALESCE((v_asset->>'sub_asset_size_3')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_4', ''),
      COALESCE((v_asset->>'sub_asset_size_4')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_5', ''),
      COALESCE((v_asset->>'sub_asset_size_5')::numeric, 0),
      NULLIF(v_asset->>'sub_asset_type_6', ''),
      COALESCE((v_asset->>'sub_asset_size_6')::numeric, 0),
      NULLIF(v_asset->>'structure_drawing_url', ''),
      NULLIF(v_asset->>'elevator', ''),
      NULLIF(v_asset->>'single_double_family', ''),
      NULLIF(v_asset->>'condo', ''),
      NULLIF(v_asset->>'townhouses', ''),
      NULLIF(v_asset->>'penthouse', ''),
      (v_asset->>'tax_region')::integer,
      (v_asset->>'floor')::smallint,
      NULLIF(v_asset->>'discount_type', ''),
      NULLIF(v_asset->>'discount_date_from', ''),
      NULLIF(v_asset->>'discount_date_to', ''),
      v_audit_id,
      now(),
      now()
    );
    
    -- Add to affected asset IDs if not already added
    IF NOT (v_asset_id = ANY(v_affected_asset_ids)) THEN
      v_affected_asset_ids := array_append(v_affected_asset_ids, v_asset_id);
    END IF;
    
    -- Update building total area
    IF v_building_number IS NOT NULL THEN
      PERFORM update_building_total_area(v_building_number);
    END IF;
  END LOOP;
  
  -- Update audit entry with entity_id
  UPDATE audit
  SET entity_id = array_to_string(v_affected_asset_ids, ',')
  WHERE action_id = v_audit_id;
  
  -- Return result
  v_result := jsonb_build_object(
    'action_id', v_audit_id,
    'affected_asset_ids', v_affected_asset_ids,
    'count', array_length(v_affected_asset_ids, 1)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

