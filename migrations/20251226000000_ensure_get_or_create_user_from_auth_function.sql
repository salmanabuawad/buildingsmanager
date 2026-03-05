-- ============================================================================
-- Migration: Ensure get_or_create_user_from_auth function exists
-- ============================================================================
-- This migration ensures the get_or_create_user_from_auth() function exists.
-- This function is used by log_change_entry and other audit functions to
-- get or create a user from the Supabase auth context.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_or_create_user_from_auth()
RETURNS bigint AS $$
DECLARE
  v_user_id bigint;
  v_auth_user_id text;
BEGIN
  -- Try to get current user from auth context (Supabase)
  v_auth_user_id := current_setting('request.jwt.claim.sub', true);
  
  IF v_auth_user_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id
    FROM users
    WHERE auth_user_id = v_auth_user_id;
    
    IF v_user_id IS NULL THEN
      INSERT INTO users (auth_user_id, user_name, user_email)
      VALUES (v_auth_user_id, v_auth_user_id, NULL)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET updated_at = now()
      RETURNING user_id INTO v_user_id;
    END IF;
  END IF;
  
  -- If still no user, use default
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM users
    WHERE user_name = 'default' AND auth_user_id IS NULL
    LIMIT 1;
  END IF;
  
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_user_from_auth IS 'Get or create user from Supabase auth context, fallback to default user';

