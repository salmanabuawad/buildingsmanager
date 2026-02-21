-- Email queue for background sending (daemon processes rows).
-- Frontend enqueues items; worker sends one Excel per row and updates status.

CREATE TABLE IF NOT EXISTS email_queue (
  id BIGSERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  attachment_filename TEXT,
  attachment_content_base64 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status_created ON email_queue (status, created_at)
  WHERE status = 'pending';

COMMENT ON TABLE email_queue IS 'תור שליחת מיילים – נבדק על ידי daemon. נספח: קובץ אקסל אחד לכל שורה.';

-- RLS: allow authenticated users to insert (enqueue); worker uses service_role to select/update
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Authenticated users (frontend with JWT) can only insert (enqueue)
CREATE POLICY email_queue_insert_authenticated ON email_queue
  FOR INSERT TO authenticated WITH CHECK (true);

-- SELECT/UPDATE: no policy for anon/authenticated so only service_role (daemon) can poll and update
