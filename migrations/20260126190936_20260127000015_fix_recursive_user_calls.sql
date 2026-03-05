/*
  # Fix "too many calls to user" error
  
  1. Changes
    - Simplify get_or_create_user_from_auth to avoid UPDATE on conflict
    - Only INSERT if user doesn't exist, don't update existing users
    - This prevents recursive loops from triggers or RLS policies
  
  2. Security
    - Maintains SECURITY DEFINER for controlled access
    - No changes to RLS policies
*/

CREATE OR REPLACE FUNCTION get_or_create_user_from_auth()
RETURNS bigint AS $$
DECLARE
  v_user_id bigint;
  v_auth_user_id text;
BEGIN
  -- Try to get current user from auth context (Supabase)
  v_auth_user_id := current_setting('request.jwt.claim.sub', true);
  
  IF v_auth_user_id IS NOT NULL THEN
    -- First try to find existing user
    SELECT user_id INTO v_user_id
    FROM users
    WHERE auth_user_id = v_auth_user_id;
    
    -- Only insert if not found (no UPDATE to avoid recursion)
    IF v_user_id IS NULL THEN
      BEGIN
        INSERT INTO users (auth_user_id, user_name, user_email)
        VALUES (v_auth_user_id, v_auth_user_id, NULL)
        ON CONFLICT (auth_user_id) DO NOTHING
        RETURNING user_id INTO v_user_id;
        
        -- If ON CONFLICT happened, fetch the existing user_id
        IF v_user_id IS NULL THEN
          SELECT user_id INTO v_user_id
          FROM users
          WHERE auth_user_id = v_auth_user_id;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          -- If insert fails, try to get existing user one more time
          SELECT user_id INTO v_user_id
          FROM users
          WHERE auth_user_id = v_auth_user_id;
      END;
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

COMMENT ON FUNCTION get_or_create_user_from_auth IS 'Get or create user from Supabase auth context, fallback to default user. Optimized to prevent recursion.';
