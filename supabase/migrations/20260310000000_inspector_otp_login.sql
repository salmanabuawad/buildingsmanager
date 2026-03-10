-- Inspector OTP login: one-time codes sent by email when task is assigned.
-- Inspector can log in with OTP (no password) or with task link token.

-- Table: store OTP codes (one per task assignment email)
CREATE TABLE IF NOT EXISTS inspector_otp_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  task_id BIGINT REFERENCES inspection_tasks(id) ON DELETE SET NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspector_otp_codes_otp ON inspector_otp_codes(otp_code) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inspector_otp_codes_expires ON inspector_otp_codes(expires_at);

COMMENT ON TABLE inspector_otp_codes IS 'One-time OTP codes for inspector login; sent in task assignment email.';

-- Create OTP for inspector (called when sending task assignment email). Admin or system only.
-- Returns 6-digit OTP string for inclusion in email. Invalidates previous OTP for same user+task.
CREATE OR REPLACE FUNCTION inspector_create_otp(
  p_user_id BIGINT,
  p_task_id BIGINT DEFAULT NULL,
  p_caller_user_id BIGINT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp TEXT;
  v_caller_role TEXT;
  v_user_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'inspector_create_otp: user_id required';
  END IF;

  -- Optional: caller must be admin if provided
  IF p_caller_user_id IS NOT NULL THEN
    SELECT user_role INTO v_caller_role FROM users WHERE user_id = p_caller_user_id;
    IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
      RAISE EXCEPTION 'inspector_create_otp: only admin can create OTP';
    END IF;
  END IF;

  -- User must be inspector (or allow any role for flexibility)
  SELECT user_role INTO v_user_role FROM users WHERE user_id = p_user_id AND active = true;
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'inspector_create_otp: user not found or inactive';
  END IF;

  -- Invalidate previous OTP for this user (and task if specified)
  UPDATE inspector_otp_codes SET used_at = now()
  WHERE user_id = p_user_id AND (p_task_id IS NULL OR task_id = p_task_id) AND used_at IS NULL;

  -- Generate 6-digit numeric OTP
  v_otp := lpad(floor(random() * 1000000)::text, 6, '0');

  INSERT INTO inspector_otp_codes (user_id, task_id, otp_code, expires_at)
  VALUES (p_user_id, p_task_id, v_otp, now() + interval '30 minutes');

  RETURN v_otp;
END;
$$;

COMMENT ON FUNCTION inspector_create_otp IS 'Create OTP for inspector task email. Returns 6-digit code.';

-- Login by OTP (no password). Consumes the OTP (one-time use). Callable by anon.
CREATE OR REPLACE FUNCTION auth_login_by_otp(p_otp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id BIGINT;
  v_user_name TEXT;
  v_user_role TEXT;
  v_task_id BIGINT;
BEGIN
  IF p_otp IS NULL OR trim(p_otp) = '' OR length(trim(p_otp)) < 6 THEN
    RAISE EXCEPTION 'auth_login_by_otp: valid OTP required';
  END IF;

  UPDATE inspector_otp_codes
  SET used_at = now()
  WHERE otp_code = trim(p_otp)
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING user_id, task_id INTO v_user_id, v_task_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_login_by_otp: invalid or expired OTP';
  END IF;

  SELECT user_name, user_role INTO v_user_name, v_user_role
  FROM users WHERE user_id = v_user_id AND active = true;

  IF v_user_name IS NULL THEN
    RAISE EXCEPTION 'auth_login_by_otp: user not found or inactive';
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'user_name', v_user_name,
    'user_role', COALESCE(v_user_role, 'user'),
    'task_id', v_task_id
  );
END;
$$;

COMMENT ON FUNCTION auth_login_by_otp IS 'Login using OTP from email (one-time use).';
