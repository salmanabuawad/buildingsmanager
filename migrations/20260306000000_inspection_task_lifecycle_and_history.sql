-- Task lifecycle: new -> in_progress -> pending_approval -> approved | cancelled
-- History table for back-and-forth with comment and timestamp.

-- 1) History table (comment with current date/time per handoff)
CREATE TABLE IF NOT EXISTS inspection_task_history (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint REFERENCES users(user_id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'taken', 'submitted', 'returned', 'approved', 'cancelled')),
  comment_text text
);

CREATE INDEX IF NOT EXISTS idx_inspection_task_history_task_id ON inspection_task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_inspection_task_history_created_at ON inspection_task_history(created_at);

COMMENT ON TABLE inspection_task_history IS 'Audit trail for task handoffs; each row has action + optional comment with timestamp';

-- 2) Relax constraint first, then map old statuses to new, then enforce new constraint
ALTER TABLE inspection_tasks DROP CONSTRAINT IF EXISTS inspection_tasks_status_check;
UPDATE inspection_tasks SET status = 'new'           WHERE status IS NULL;
UPDATE inspection_tasks SET status = 'new'           WHERE status = 'open';
UPDATE inspection_tasks SET status = 'in_progress'  WHERE status = 'in_inspector_handling';
UPDATE inspection_tasks SET status = 'pending_approval' WHERE status = 'pending_manager_approval';
UPDATE inspection_tasks SET status = 'approved'     WHERE status = 'closed';
UPDATE inspection_tasks SET status = 'approved'     WHERE status = 'transferred_to_automation';
UPDATE inspection_tasks SET status = 'approved'     WHERE status NOT IN ('new', 'in_progress', 'pending_approval', 'approved', 'cancelled');

ALTER TABLE inspection_tasks DROP CONSTRAINT IF EXISTS inspection_tasks_status_check;
ALTER TABLE inspection_tasks ADD CONSTRAINT inspection_tasks_status_check
  CHECK (status IN ('new', 'in_progress', 'pending_approval', 'approved', 'cancelled'));

ALTER TABLE inspection_tasks ALTER COLUMN status SET DEFAULT 'new';

COMMENT ON COLUMN inspection_tasks.status IS 'new (assigned) | in_progress | pending_approval | approved | cancelled';
