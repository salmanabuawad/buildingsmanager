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
-- Step 4: Add user_id column to change_log (as foreign key)
-- ============================================================================
-- First, add the new column as nullable
ALTER TABLE change_log
ADD COLUMN IF NOT EXISTS user_id_fk bigint;

-- ============================================================================
-- Step 5: Migrate existing data (if any)
-- ============================================================================
-- For existing records, try to match by user_id (text) or user_email
-- If no match, use default user
DO $$
DECLARE
  v_default_user_id bigint;
  v_auth_user_id text;
  v_user_id bigint;
BEGIN
  -- Get default user_id
  SELECT user_id INTO v_default_user_id
  FROM users
  WHERE user_name = 'default' AND auth_user_id IS NULL
  LIMIT 1;
  
  -- Update existing change_log records
  -- Try to match by auth_user_id (if user_id text column contains UUID)
  UPDATE change_log cl
  SET user_id_fk = COALESCE(
    (SELECT u.user_id FROM users u WHERE u.auth_user_id = cl.user_id),
    v_default_user_id
  )
  WHERE cl.user_id_fk IS NULL;
  
  -- For records with user_email but no matching user, create users if needed
  -- (This is optional - you might want to handle this differently)
END $$;

-- ============================================================================
-- Step 6: Make user_id_fk NOT NULL and add foreign key constraint
-- ============================================================================
-- Set default for any remaining NULL values
UPDATE change_log
SET user_id_fk = (SELECT user_id FROM users WHERE user_name = 'default' AND auth_user_id IS NULL LIMIT 1)
WHERE user_id_fk IS NULL;

-- Now make it NOT NULL
ALTER TABLE change_log
ALTER COLUMN user_id_fk SET NOT NULL;

-- Add foreign key constraint
-- Use RESTRICT to prevent user deletion if they have change logs
ALTER TABLE change_log
ADD CONSTRAINT fk_change_log_user_id
FOREIGN KEY (user_id_fk) REFERENCES users(user_id)
ON DELETE RESTRICT;

-- Create index for the foreign key
CREATE INDEX IF NOT EXISTS idx_change_log_user_id_fk ON change_log(user_id_fk);

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
    user_id_fk,
    user_name, -- Keep for backward compatibility
    user_email, -- Keep for backward compatibility
    before_data,
    after_data,
    changed_fields
  ) VALUES (
    p_table_name,
    p_operation,
    p_record_id,
    v_user_id_fk,
    COALESCE(p_user_name, 'default'),
    p_user_email,
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
      user_id_fk,
      user_name,
      user_email,
      before_data,
      after_data,
      changed_fields
    ) VALUES (
      v_entry->>'table_name',
      v_entry->>'operation',
      v_entry->>'record_id',
      v_user_id_fk,
      COALESCE(v_entry->>'user_name', 'default'),
      NULLIF(v_entry->>'user_email', ''),
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
  user_id_fk bigint,
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
    cl.user_id_fk,
    u.user_name,
    u.user_email,
    u.auth_user_id,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  LEFT JOIN users u ON cl.user_id_fk = u.user_id
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
  user_id_fk bigint,
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
    cl.user_id_fk,
    u.user_name,
    u.user_email,
    u.auth_user_id,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  LEFT JOIN users u ON cl.user_id_fk = u.user_id
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
  user_id_fk bigint,
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
    cl.user_id_fk,
    cl.before_data,
    cl.after_data,
    cl.changed_fields,
    cl.created_at
  FROM change_log cl
  INNER JOIN users u ON cl.user_id_fk = u.user_id
  WHERE u.user_name = p_user_name
    AND (p_table_name IS NULL OR cl.table_name = p_table_name)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Step 9: Update comments
-- ============================================================================
COMMENT ON COLUMN change_log.user_id_fk IS 'Foreign key to users table';
COMMENT ON COLUMN change_log.user_name IS 'User name (kept for backward compatibility, can be obtained from users table)';
COMMENT ON COLUMN change_log.user_email IS 'User email (kept for backward compatibility, can be obtained from users table)';

