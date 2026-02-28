-- One-time access tokens for inspection task deep links (no login required)
-- Token allows direct access to a specific task for the assigned inspector

CREATE TABLE IF NOT EXISTS inspection_task_access_tokens (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_token ON inspection_task_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_expires ON inspection_task_access_tokens(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_task_user ON inspection_task_access_tokens(task_id, user_id)
  WHERE used_at IS NULL;

COMMENT ON TABLE inspection_task_access_tokens IS 'One-time tokens for inspector task deep links; enables access without username/password';

-- Create token (called by admin when assigning/returning). Caller must be admin.
-- Returns token string for inclusion in email link. Reuses existing valid token if one exists.
CREATE OR REPLACE FUNCTION inspection_task_create_access_token(
  p_task_id BIGINT,
  p_user_id BIGINT,
  p_caller_user_id BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_caller_role TEXT;
  v_task_created_by BIGINT;
BEGIN
  IF p_task_id IS NULL OR p_user_id IS NULL OR p_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'inspection_task_create_access_token: task_id, user_id, caller_user_id required';
  END IF;

  SELECT user_role INTO v_caller_role FROM users WHERE user_id = p_caller_user_id;
  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'inspection_task_create_access_token: only admin can create tokens';
  END IF;

  SELECT created_by INTO v_task_created_by FROM inspection_tasks WHERE id = p_task_id;
  IF v_task_created_by IS NULL THEN
    RAISE EXCEPTION 'inspection_task_create_access_token: task not found';
  END IF;

  -- Reuse valid unused token if exists
  SELECT token INTO v_token
  FROM inspection_task_access_tokens
  WHERE task_id = p_task_id AND user_id = p_user_id
    AND used_at IS NULL AND expires_at > now()
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  -- Invalidate any previous tokens for this task+user
  UPDATE inspection_task_access_tokens SET used_at = now() WHERE task_id = p_task_id AND user_id = p_user_id;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO inspection_task_access_tokens (task_id, user_id, token, expires_at)
  VALUES (p_task_id, p_user_id, v_token, now() + interval '7 days');

  RETURN v_token;
END;
$$;

-- Login by token (no password). Consumes the token (one-time use). Callable by anon.
CREATE OR REPLACE FUNCTION auth_login_by_task_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task_id BIGINT;
  v_user_id BIGINT;
  v_user_name TEXT;
  v_user_role TEXT;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'auth_login_by_task_token: token required';
  END IF;

  UPDATE inspection_task_access_tokens
  SET used_at = now()
  WHERE token = trim(p_token)
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING task_id, user_id INTO v_task_id, v_user_id;

  IF v_task_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_login_by_task_token: invalid or expired token';
  END IF;

  SELECT user_name, user_role INTO v_user_name, v_user_role
  FROM users WHERE user_id = v_user_id AND active = true;

  IF v_user_name IS NULL THEN
    RAISE EXCEPTION 'auth_login_by_task_token: user not found or inactive';
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'user_name', v_user_name,
    'user_role', COALESCE(v_user_role, 'user'),
    'task_id', v_task_id
  );
END;
$$;

COMMENT ON FUNCTION inspection_task_create_access_token IS 'Create one-time token for task deep link. Admin only.';
COMMENT ON FUNCTION auth_login_by_task_token IS 'Login using task access token (no password). One-time use.';
