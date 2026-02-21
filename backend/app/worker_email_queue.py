"""
Daemon worker: consumes export_email_queue and sends emails in the background.
Run: python -m app.worker_email_queue
Uses DATABASE_URL and sends via SMTP (email_config from system_configuration).
"""

import json
import time
import base64
from datetime import datetime
from sqlalchemy import text
from app.database import SessionLocal
from app.models import ExportEmailQueue
from app.routers.email import (
    send_email_with_smtp,
    EmailConfig,
    EmailAttachment,
)


def get_email_config(session):
    """Load email_config from system_configuration (Supabase/public)."""
    row = session.execute(
        text("SELECT value FROM system_configuration WHERE name = 'email_config' LIMIT 1")
    ).fetchone()
    if not row or not row[0]:
        return None
    try:
        data = json.loads(row[0])
        return EmailConfig(
            smtp_host=data.get("smtp_host", ""),
            smtp_port=int(data.get("smtp_port", 587)),
            smtp_encryption=data.get("smtp_encryption", "tls"),
            smtp_username=data.get("smtp_username", ""),
            smtp_password=data.get("smtp_password", ""),
            from_email=data.get("from_email", ""),
            from_name=data.get("from_name"),
            reply_to_email=data.get("reply_to_email"),
        )
    except Exception:
        return None


def process_queue():
    db = SessionLocal()
    try:
        config = get_email_config(db)
        if not config or not config.smtp_host or not config.from_email:
            return 0
        rows = (
            db.query(ExportEmailQueue)
            .filter(ExportEmailQueue.status == "pending")
            .order_by(ExportEmailQueue.created_at)
            .limit(10)
            .all()
        )
        sent = 0
        for row in rows:
            try:
                attachment = EmailAttachment(
                    filename=row.attachment_filename,
                    content=row.attachment_base64,
                    contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                ok = send_email_with_smtp(
                    config=config,
                    to=[row.to_email],
                    subject=row.subject,
                    body=row.body_he,
                    attachments=[attachment],
                )
                if ok:
                    row.status = "sent"
                    row.sent_at = datetime.utcnow()
                    row.error_message = None
                    sent += 1
                else:
                    row.status = "failed"
                    row.error_message = "Send returned False"
            except Exception as e:
                row.status = "failed"
                row.error_message = str(e)[:500]
            db.commit()
        return sent
    finally:
        db.close()


def main():
    print("Export email queue worker started. Ctrl+C to stop.")
    while True:
        try:
            n = process_queue()
            if n:
                print(f"{datetime.utcnow().isoformat()} Sent {n} email(s).")
        except Exception as e:
            print(f"Worker error: {e}")
        time.sleep(5)


if __name__ == "__main__":
    main()
