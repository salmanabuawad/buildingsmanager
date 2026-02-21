-- Export email queue for async sending (daemon worker consumes this).
-- Frontend enqueues after user gets ZIP; worker sends one Excel per row (no ZIP).

CREATE TABLE IF NOT EXISTS export_email_queue (
  id BIGSERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  to_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_he TEXT NOT NULL,
  attachment_base64 TEXT NOT NULL,
  attachment_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_export_email_queue_status ON export_email_queue(status);
CREATE INDEX IF NOT EXISTS idx_export_email_queue_created_at ON export_email_queue(created_at);

COMMENT ON TABLE export_email_queue IS 'תור שליחת מיילי ייצוא – נצרך על ידי worker ברקע';
