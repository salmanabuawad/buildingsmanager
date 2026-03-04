-- ============================================================================
-- Migration: Add dev user (dev/dev123) as admin
-- ============================================================================
-- Adds a development admin user with credentials dev/dev123
-- Note: Passwords must be at least 6 characters (auth requirement)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insert dev user (if not exists)
INSERT INTO users (auth_user_id, user_name, user_email, user_role, password_hash, active, created_at, updated_at)
SELECT 
  NULL,
  'dev',
  'dev@buildingsmanager.local',
  'admin',
  crypt('dev123', gen_salt('bf')),
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE user_name = 'dev'
);

-- Set auth_user_id for dev (uid:user_id pattern for users-table auth)
UPDATE users
  SET auth_user_id = 'uid:' || user_id
  WHERE user_name = 'dev' AND auth_user_id IS NULL;

-- Update users_ensure_defaults to also create dev if missing
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

  INSERT INTO users (user_name, user_email, user_role, password_hash, active)
  SELECT 'dev', 'dev@buildingsmanager.local', 'admin', crypt('dev123', gen_salt('bf')), true
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE user_name = 'dev')
  RETURNING user_id INTO v_id;
  IF v_id IS NOT NULL THEN
    UPDATE users SET auth_user_id = 'uid:' || v_id WHERE user_id = v_id;
  END IF;

  UPDATE users SET auth_user_id = 'uid:' || user_id
  WHERE auth_user_id IS NULL AND user_name IN ('admin', 'user', 'dev');

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION users_ensure_defaults IS 'Create admin, user, dev with default passwords if missing (users-table-only).';
