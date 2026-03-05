-- Inspection tasks: tables for admin-managed tasks and inspector reports (design: docs/INSPECTION_TASKS_DESIGN.md)
-- Buildings PK is building_number; users PK is user_id.

CREATE TABLE IF NOT EXISTS inspection_tasks (
  id bigserial PRIMARY KEY,
  title text,
  building_number bigint NOT NULL REFERENCES buildings(building_number) ON DELETE CASCADE,
  asset_ids bigint[] DEFAULT '{}',
  assigned_to bigint REFERENCES users(user_id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_inspector_handling', 'pending_manager_approval', 'transferred_to_automation')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES users(user_id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  taken_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by bigint REFERENCES users(user_id) ON DELETE SET NULL,
  note text
);

CREATE INDEX IF NOT EXISTS idx_inspection_tasks_assigned_to ON inspection_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_status ON inspection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_building_number ON inspection_tasks(building_number);
CREATE INDEX IF NOT EXISTS idx_inspection_tasks_created_at ON inspection_tasks(created_at);

COMMENT ON TABLE inspection_tasks IS 'Inspection tasks created by admin, assigned to inspectors';
COMMENT ON COLUMN inspection_tasks.asset_ids IS 'Specific asset IDs to inspect; empty = whole building';

CREATE TABLE IF NOT EXISTS inspection_reports (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  report_text text,
  reported_at timestamptz,
  reported_by bigint REFERENCES users(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_task_id ON inspection_reports(task_id);

CREATE TABLE IF NOT EXISTS inspection_report_files (
  id bigserial PRIMARY KEY,
  report_id bigint NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text,
  file_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by bigint REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inspection_report_files_report_id ON inspection_report_files(report_id);

COMMENT ON TABLE inspection_report_files IS 'Photos/files attached to inspection reports; storage path e.g. inspections/{report_id}/';
