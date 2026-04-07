-- ============================================================================
-- INSPECTION TASKS, REPORTS, FILES, HISTORY
-- ============================================================================

-- 1. inspection_tasks
CREATE TABLE IF NOT EXISTS inspection_tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT,
  building_number BIGINT NOT NULL,
  asset_ids JSONB DEFAULT '[]'::jsonb,
  assigned_to BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  taken_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  note TEXT,
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium'
);

CREATE INDEX IF NOT EXISTS idx_inspection_tasks_building ON inspection_tasks(building_number);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_assigned ON inspection_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_status ON inspection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_created_at ON inspection_tasks(created_at DESC);

ALTER TABLE inspection_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read inspection_tasks" ON inspection_tasks;
DROP POLICY IF EXISTS "Allow insert inspection_tasks" ON inspection_tasks;
DROP POLICY IF EXISTS "Allow update inspection_tasks" ON inspection_tasks;
DROP POLICY IF EXISTS "Allow delete inspection_tasks" ON inspection_tasks;

CREATE POLICY "Allow read inspection_tasks"   ON inspection_tasks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert inspection_tasks" ON inspection_tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update inspection_tasks" ON inspection_tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete inspection_tasks" ON inspection_tasks FOR DELETE TO anon, authenticated USING (true);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_inspection_tasks_updated_at ON inspection_tasks;
CREATE TRIGGER update_inspection_tasks_updated_at BEFORE UPDATE ON inspection_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. inspection_reports
CREATE TABLE IF NOT EXISTS inspection_reports (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  report_text TEXT,
  reported_at TIMESTAMPTZ DEFAULT now(),
  reported_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  UNIQUE(task_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_task ON inspection_reports(task_id);

ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read inspection_reports" ON inspection_reports;
DROP POLICY IF EXISTS "Allow insert inspection_reports" ON inspection_reports;
DROP POLICY IF EXISTS "Allow update inspection_reports" ON inspection_reports;
DROP POLICY IF EXISTS "Allow delete inspection_reports" ON inspection_reports;

CREATE POLICY "Allow read inspection_reports"   ON inspection_reports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert inspection_reports" ON inspection_reports FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update inspection_reports" ON inspection_reports FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete inspection_reports" ON inspection_reports FOR DELETE TO anon, authenticated USING (true);

-- 3. inspection_report_files
CREATE TABLE IF NOT EXISTS inspection_report_files (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  asset_ids JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inspection_report_files_report ON inspection_report_files(report_id);

ALTER TABLE inspection_report_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read inspection_report_files" ON inspection_report_files;
DROP POLICY IF EXISTS "Allow insert inspection_report_files" ON inspection_report_files;
DROP POLICY IF EXISTS "Allow update inspection_report_files" ON inspection_report_files;
DROP POLICY IF EXISTS "Allow delete inspection_report_files" ON inspection_report_files;

CREATE POLICY "Allow read inspection_report_files"   ON inspection_report_files FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert inspection_report_files" ON inspection_report_files FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update inspection_report_files" ON inspection_report_files FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete inspection_report_files" ON inspection_report_files FOR DELETE TO anon, authenticated USING (true);

-- 4. inspection_task_history
CREATE TABLE IF NOT EXISTS inspection_task_history (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  comment_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_inspection_task_history_task ON inspection_task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_inspection_task_history_created ON inspection_task_history(created_at DESC);

ALTER TABLE inspection_task_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read inspection_task_history" ON inspection_task_history;
DROP POLICY IF EXISTS "Allow insert inspection_task_history" ON inspection_task_history;

CREATE POLICY "Allow read inspection_task_history"   ON inspection_task_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow insert inspection_task_history" ON inspection_task_history FOR INSERT TO anon, authenticated WITH CHECK (true);
