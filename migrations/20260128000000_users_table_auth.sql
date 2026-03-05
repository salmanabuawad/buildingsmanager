-- Users-table-only authentication
-- Adds password_hash, auth_login RPC, users_set_password, users_create_internal.
-- Use auth_user_id = 'uid:' || user_id for users-table-only users (RPCs pass this as p_user_id).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash for users-table-only auth. NULL if using Supabase Auth.';

-- Set hashes for default users (admin123, user123)
UPDATE users
  SET password_hash = crypt('admin123', gen_salt('bf'))
  WHERE user_name = 'admin';

UPDATE users
  SET password_hash = crypt('user123', gen_salt('bf'))
  WHERE user_name = 'user';

-- Ensure default users have synthetic auth_user_id for RPC lookup
UPDATE users
  SET auth_user_id = 'uid:' || user_id
  WHERE auth_user_id IS NULL
    AND user_name IN ('admin', 'user');

-- auth_login: verify user_name + password, return user_id, user_name, user_role
CREATE OR REPLACE FUNCTION auth_login(p_user_name TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id BIGINT;
  v_user_name TEXT;
  v_user_role TEXT;
  v_hash TEXT;
BEGIN
  IF p_user_name IS NULL OR trim(p_user_name) = '' OR p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'auth_login: user_name and password (min 6 chars) required';
  END IF;

  SELECT user_id, user_name, user_role, password_hash
    INTO v_user_id, v_user_name, v_user_role, v_hash
  FROM users
  WHERE user_name = trim(p_user_name)
    AND active = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_login: invalid credentials';
  END IF;

  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'auth_login: user has no password set';
  END IF;

  IF v_hash <> crypt(p_password, v_hash) THEN
    RAISE EXCEPTION 'auth_login: invalid credentials';
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'user_name', v_user_name,
    'user_role', COALESCE(v_user_role, 'user')
  );
END;
$$;

COMMENT ON FUNCTION auth_login IS 'Users-table-only login. Returns { user_id, user_name, user_role } or raises.';

-- users_set_password: set password for a user (by user_id)
CREATE OR REPLACE FUNCTION users_set_password(p_user_id BIGINT, p_new_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL OR p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'users_set_password: user_id and new password (min 6 chars) required';
  END IF;

  UPDATE users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'users_set_password: user not found';
  END IF;
END;
$$;

COMMENT ON FUNCTION users_set_password IS 'Set password for a user (users-table-only).';

-- users_create_internal: insert user with password, set auth_user_id = 'uid:' || user_id
CREATE OR REPLACE FUNCTION users_create_internal(
  p_user_name TEXT,
  p_user_email TEXT,
  p_password TEXT,
  p_user_role TEXT DEFAULT 'user'
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
  IF p_user_role IS NULL OR p_user_role NOT IN ('admin', 'user') THEN
    p_user_role := 'user';
  END IF;

  INSERT INTO users (user_name, user_email, user_role, password_hash, active)
  VALUES (
    trim(p_user_name),
    NULLIF(trim(p_user_email), ''),
    p_user_role,
    crypt(p_password, gen_salt('bf')),
    true
  )
  RETURNING user_id INTO v_user_id;

  v_auth_id := 'uid:' || v_user_id;
  UPDATE users SET auth_user_id = v_auth_id WHERE user_id = v_user_id;

  RETURN jsonb_build_object('user_id', v_user_id, 'auth_user_id', v_auth_id);
END;
$$;

COMMENT ON FUNCTION users_create_internal IS 'Create user with password (users-table-only). Sets auth_user_id = uid:user_id.';

-- users_ensure_defaults: create admin/user if missing (for "Create default users" on login)
CREATE OR REPLACE FUNCTION users_ensure_defaults()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO users (user_name, user_email, user_role, password_hash, active)
  SELECT 'admin', 'admin@buildingsmanager.local', 'admin', crypt('admin123', gen_salt('bf')), true
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_name = 'admin')
  RETURNING user_id INTO v_id;
  IF v_id IS NOT NULL THEN
    UPDATE users SET auth_user_id = 'uid:' || v_id WHERE user_id = v_id;
  END IF;

  INSERT INTO users (user_name, user_email, user_role, password_hash, active)
  SELECT 'user', 'user@buildingsmanager.local', 'user', crypt('user123', gen_salt('bf')), true
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_name = 'user')
  RETURNING user_id INTO v_id;
  IF v_id IS NOT NULL THEN
    UPDATE users SET auth_user_id = 'uid:' || v_id WHERE user_id = v_id;
  END IF;

  UPDATE users SET auth_user_id = 'uid:' || user_id
  WHERE auth_user_id IS NULL AND user_name IN ('admin', 'user');

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION users_ensure_defaults IS 'Create admin/user with default passwords if missing (users-table-only).';
