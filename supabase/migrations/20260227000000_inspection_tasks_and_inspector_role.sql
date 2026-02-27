-- ============================================================================
-- Inspection tasks feature: tables + inspector role
-- ============================================================================
-- Tables: inspection_tasks, inspection_task_history, inspection_reports, inspection_report_files
-- Role: add 'inspector' to user_role (admin, user, inspector)
-- ============================================================================

-- 1) Allow 'inspector' in users.user_role
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_role_check;
ALTER TABLE users ADD CONSTRAINT users_user_role_check
  CHECK (user_role IN ('admin', 'user', 'inspector'));

COMMENT ON COLUMN users.user_role IS 'User role: admin (full), user (editor), inspector (assigned tasks only)';

-- 2) inspection_tasks
CREATE TABLE IF NOT EXISTS inspection_tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  building_number BIGINT NOT NULL REFERENCES buildings(building_number) ON DELETE CASCADE,
  asset_ids BIGINT[],
  assigned_to BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'pending_approval', 'approved', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  taken_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_inspection_tasks_assigned_to ON inspection_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_status ON inspection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_building_number ON inspection_tasks(building_number);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_created_at ON inspection_tasks(created_at);

COMMENT ON TABLE inspection_tasks IS 'Admin-created inspection tasks assigned to inspectors; lifecycle: new -> in_progress -> pending_approval -> approved | returned | cancelled';

-- 3) inspection_task_history
CREATE TABLE IF NOT EXISTS inspection_task_history (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  action TEXT NOT NULL
    CHECK (action IN ('created', 'taken', 'submitted', 'returned', 'approved', 'cancelled')),
  comment_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_inspection_task_history_task_id ON inspection_task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_inspection_task_history_created_at ON inspection_task_history(created_at);

COMMENT ON TABLE inspection_task_history IS 'One row per handoff; comment_text holds inspector or admin comment when provided';

-- 4) inspection_reports (1:1 with task)
CREATE TABLE IF NOT EXISTS inspection_reports (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL UNIQUE REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  report_text TEXT,
  reported_at TIMESTAMPTZ,
  reported_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_reports_task_id ON inspection_reports(task_id);

COMMENT ON TABLE inspection_reports IS 'One report per inspection task';

-- 5) inspection_report_files
CREATE TABLE IF NOT EXISTS inspection_report_files (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inspection_report_files_report_id ON inspection_report_files(report_id);

COMMENT ON TABLE inspection_report_files IS 'Files (images/video) attached to inspection reports; file_path is storage path';

-- RLS (permissive for app auth; app enforces role in api layer)
ALTER TABLE inspection_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_report_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read inspection_tasks" ON inspection_tasks;
CREATE POLICY "Allow read inspection_tasks" ON inspection_tasks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert inspection_tasks" ON inspection_tasks;
CREATE POLICY "Allow insert inspection_tasks" ON inspection_tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update inspection_tasks" ON inspection_tasks;
CREATE POLICY "Allow update inspection_tasks" ON inspection_tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read inspection_task_history" ON inspection_task_history;
CREATE POLICY "Allow read inspection_task_history" ON inspection_task_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert inspection_task_history" ON inspection_task_history;
CREATE POLICY "Allow insert inspection_task_history" ON inspection_task_history FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read inspection_reports" ON inspection_reports;
CREATE POLICY "Allow read inspection_reports" ON inspection_reports FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert inspection_reports" ON inspection_reports;
CREATE POLICY "Allow insert inspection_reports" ON inspection_reports FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update inspection_reports" ON inspection_reports;
CREATE POLICY "Allow update inspection_reports" ON inspection_reports FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read inspection_report_files" ON inspection_report_files;
CREATE POLICY "Allow read inspection_report_files" ON inspection_report_files FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow insert inspection_report_files" ON inspection_report_files;
CREATE POLICY "Allow insert inspection_report_files" ON inspection_report_files FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow delete inspection_report_files" ON inspection_report_files;
CREATE POLICY "Allow delete inspection_report_files" ON inspection_report_files FOR DELETE TO anon, authenticated USING (true);

-- auth_login: return inspector role (drop first to avoid parameter name/order change error)
DROP FUNCTION IF EXISTS auth_login(TEXT, TEXT);
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
    'user_role', COALESCE(NULLIF(v_user_role, ''), 'user')
  );
END;
$$;

-- users_create_internal: allow inspector role (drop first for consistency)
DROP FUNCTION IF EXISTS users_create_internal(TEXT, TEXT, TEXT, TEXT);
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
  IF p_user_role IS NULL OR p_user_role NOT IN ('admin', 'user', 'inspector') THEN
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

-- 6) Storage bucket for inspection report files (images/video)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inspection-reports',
  'inspection-reports',
  false,
  104857600,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow read inspection-reports bucket" ON storage.objects;
CREATE POLICY "Allow read inspection-reports bucket" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'inspection-reports');
DROP POLICY IF EXISTS "Allow upload inspection-reports bucket" ON storage.objects;
CREATE POLICY "Allow upload inspection-reports bucket" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'inspection-reports');
DROP POLICY IF EXISTS "Allow update inspection-reports bucket" ON storage.objects;
CREATE POLICY "Allow update inspection-reports bucket" ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'inspection-reports') WITH CHECK (bucket_id = 'inspection-reports');
DROP POLICY IF EXISTS "Allow delete inspection-reports bucket" ON storage.objects;
CREATE POLICY "Allow delete inspection-reports bucket" ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'inspection-reports');
