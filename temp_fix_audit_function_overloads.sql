-- ============================================================================
-- TEMP SQL: Fix log_audit_entry Function Overloads
-- ============================================================================
-- This fixes the issue where multiple overloads of log_audit_entry exist
-- and ensures only the correct one (with p_user_id) is used

-- Step 1: Drop ALL existing log_audit_entry function overloads
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
    RAISE NOTICE 'Dropped function: %', r.func_signature;
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error dropping functions: %', SQLERRM;
END $$;

-- Step 2: Recreate the correct log_audit_entry function with p_user_id
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
    -- Try to get user from auth context
    BEGIN
      v_user_id_fk := get_or_create_user_from_auth();
    EXCEPTION WHEN OTHERS THEN
      v_user_id_fk := NULL;
    END;
  END IF;
  
  -- If still no user, use default
  IF v_user_id_fk IS NULL THEN
    SELECT user_id INTO v_default_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
    
    -- If default user doesn't exist, create it
    IF v_default_user_id IS NULL THEN
      INSERT INTO users (user_name, auth_user_id, user_email)
      VALUES ('default', NULL, NULL)
      RETURNING user_id INTO v_default_user_id;
    END IF;
    
    v_user_id_fk := v_default_user_id;
  END IF;
  
  -- Ensure we have a valid user_id
  IF v_user_id_fk IS NULL THEN
    RAISE EXCEPTION 'Cannot create audit entry: no valid user_id available';
  END IF;
  
  -- Insert audit entry
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

COMMENT ON FUNCTION log_audit_entry IS 'Function to manually log an audit entry with user_id';

-- Step 3: Verify the function was created correctly
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments
FROM pg_proc
WHERE proname = 'log_audit_entry'
ORDER BY oid;

-- Step 4: Test the function
DO $$
DECLARE
  v_audit_id bigint;
BEGIN
  SELECT log_audit_entry(
    'distribute_shared'::audit_action_type,
    'bulk_asset',
    'TEST',
    NULL, -- p_user_id
    '{"test": "before"}'::jsonb,
    '{"test": "after"}'::jsonb,
    'Test audit entry after fix'
  ) INTO v_audit_id;
  
  RAISE NOTICE 'SUCCESS: log_audit_entry returned audit_id: %', v_audit_id;
  
  -- Verify it was inserted
  IF EXISTS (SELECT 1 FROM audit WHERE action_id = v_audit_id) THEN
    RAISE NOTICE 'SUCCESS: Audit entry found in database';
  ELSE
    RAISE NOTICE 'ERROR: Audit entry NOT found in database';
  END IF;
END $$;
