-- Add priority to inspection tasks: high, medium, low

ALTER TABLE inspection_tasks
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('high', 'medium', 'low'));

COMMENT ON COLUMN inspection_tasks.priority IS 'Task priority: high, medium, low';
