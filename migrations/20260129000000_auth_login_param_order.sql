-- Fix auth_login param order for PostgREST schema cache: expect auth_login(p_password, p_user_name)
-- Redefine with params in alphabetical order so schema cache lookup succeeds.
-- Must DROP first because PostgreSQL does not allow changing param names with CREATE OR REPLACE.

DROP FUNCTION IF EXISTS auth_login(text, text);

CREATE OR REPLACE FUNCTION auth_login(p_password TEXT, p_user_name TEXT)
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

COMMENT ON FUNCTION auth_login(TEXT, TEXT) IS 'Users-table-only login. Params (p_password, p_user_name) for schema cache. Returns { user_id, user_name, user_role } or raises.';

-- Force PostgREST to reload schema cache so auth_login(p_password, p_user_name) is visible to the API
NOTIFY pgrst, 'reload schema';
