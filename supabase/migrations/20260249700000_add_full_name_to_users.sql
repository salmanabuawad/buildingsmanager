-- Add full_name column to users table (display name, e.g. "John Doe")

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name TEXT;

COMMENT ON COLUMN users.full_name IS 'Full display name of the user (e.g. "John Doe")';

-- Update users_create_internal to accept full_name
DROP FUNCTION IF EXISTS users_create_internal(TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION users_create_internal(
  p_user_name TEXT,
  p_user_email TEXT,
  p_password TEXT,
  p_user_role TEXT DEFAULT 'user',
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id BIGINT;
  v_auth_id TEXT;
BEGIN
  IF p_user_name IS NULL OR trim(p_user_name) = '' THEN
    RAISE EXCEPTION 'users_create_internal: user_name required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'users_create_internal: password min 6 chars required';
  END IF;
  IF p_user_role IS NULL OR p_user_role NOT IN ('admin', 'user', 'inspector') THEN
    p_user_role := 'user';
  END IF;

  INSERT INTO users (user_name, user_email, user_role, password_hash, active, full_name)
  VALUES (
    trim(p_user_name),
    NULLIF(trim(p_user_email), ''),
    p_user_role,
    crypt(p_password, gen_salt('bf')),
    true,
    NULLIF(trim(COALESCE(p_full_name, '')), '')
  )
  RETURNING user_id INTO v_user_id;

  v_auth_id := 'uid:' || v_user_id;
  UPDATE users SET auth_user_id = v_auth_id WHERE user_id = v_user_id;

  RETURN jsonb_build_object('user_id', v_user_id, 'auth_user_id', v_auth_id);
END;
$$;

COMMENT ON FUNCTION users_create_internal IS 'Create user with password. Supports full_name. Sets auth_user_id = uid:user_id.';
