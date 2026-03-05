/*
  # Add priority to inspection_tasks (align with Supabase)

  Supabase has priority (high, medium, low). This migration adds it to local DB.
  Idempotent: only adds if column does not exist.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inspection_tasks' AND column_name = 'priority'
  ) THEN
    ALTER TABLE inspection_tasks ADD COLUMN priority text NOT NULL DEFAULT 'medium'
      CHECK (priority IN ('high', 'medium', 'low'));
    COMMENT ON COLUMN inspection_tasks.priority IS 'Task priority: high, medium, low';
  END IF;
END $$;
