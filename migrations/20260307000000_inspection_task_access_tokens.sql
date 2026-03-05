-- One-time tokens for inspector task deep links; enables access without username/password.
-- Design: docs/INSPECTION_TASKS_DESIGN.md

CREATE TABLE IF NOT EXISTS inspection_task_access_tokens (
  id bigserial PRIMARY KEY,
  task_id bigint NOT NULL REFERENCES inspection_tasks(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_token ON inspection_task_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_task_id ON inspection_task_access_tokens(task_id);
CREATE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_user_id ON inspection_task_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_inspection_task_access_tokens_expires_at ON inspection_task_access_tokens(expires_at);

COMMENT ON TABLE inspection_task_access_tokens IS 'One-time tokens for inspector task deep links; enables access without username/password';
