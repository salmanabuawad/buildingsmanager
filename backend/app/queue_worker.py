"""
Background worker that consumes from the lite queue. Start on app startup.
- Topic "export_automation": 3 job types — create_download_zip, send_mail_operators, send_mail_managers.
  Email sends are done directly in this worker (no separate email queue).
"""
import logging
import threading
from typing import Any, Dict, List, Optional

from app.queue_lite import get_queue

logger = logging.getLogger(__name__)

EXPORT_AUTOMATION_CONSUMER_ID = "export_automation_worker"
POLL_INTERVAL_SEC = 1.0
BATCH_SIZE = 10

_stop = threading.Event()
_thread: Optional[threading.Thread] = None


def _handle_export_zip(payload: Dict[str, Any]) -> None:
    """Create and prepare ZIP for client download. Asset IDs are in payload; actual ZIP build can be extended later.
    After successful handling, mark those assets as exported so the UI count updates."""
    export_job_id = payload.get("export_job_id") or ""
    asset_ids = payload.get("asset_ids") or []
    logger.info("Export automation: create_download_zip job %s for %d asset(s)", export_job_id, len(asset_ids))
    # Placeholder: ZIP is currently built and downloaded by the client. To serve ZIP from backend,
    # implement build + store and expose GET /api/export-to-automation/download/{export_job_id}.
    if asset_ids:
        try:
            from app.transactions import asset_queries
            result = asset_queries.mark_assets_as_exported_to_automation_by_ids(asset_ids)
            logger.info("Export automation: marked %d asset(s) as exported after zip job", result.get("updated_count", 0))
        except Exception as e:
            logger.exception("Export automation: failed to mark assets as exported: %s", e)


def _handle_export_email_items(
    payload: Dict[str, Any],
    job_type: str,
) -> None:
    """Send each email item directly via SMTP (no queue)."""
    from app.routers.email import (
        EmailAttachment,
        EmailConfig,
        send_email_with_smtp,
    )
    email_config = payload.get("email_config")
    items: List[Dict[str, Any]] = payload.get("items") or []
    if not email_config:
        logger.warning("Export automation %s: missing email_config, skipping %d items", job_type, len(items))
        return
    config = EmailConfig(**email_config)
    sent = 0
    for item in items:
        to_addr = item.get("to") or ""
        if not to_addr or "@" not in to_addr:
            continue
        attachments = None
        if item.get("attachment_base64") and item.get("attachment_filename"):
            attachments = [
                EmailAttachment(
                    filename=item["attachment_filename"],
                    content=item["attachment_base64"],
                    contentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            ]
        try:
            send_email_with_smtp(
                config=config,
                to=[to_addr],
                subject=item.get("subject") or "",
                body=item.get("body") or "",
                attachments=attachments,
            )
            sent += 1
        except Exception as e:
            logger.exception("Export automation %s: failed to send email to %s: %s", job_type, to_addr, e)
    logger.info("Export automation %s: sent %d email(s)", job_type, sent)


def _process_export_automation_message(m: Dict[str, Any]) -> None:
    """Dispatch export_automation message by job_type."""
    payload = m.get("payload") or {}
    job_type = payload.get("job_type") or ""
    if job_type == "create_download_zip":
        _handle_export_zip(payload)
    elif job_type == "send_mail_operators":
        _handle_export_email_items(payload, "send_mail_operators")
    elif job_type == "send_mail_managers":
        _handle_export_email_items(payload, "send_mail_managers")
    else:
        logger.warning("Export automation: unknown job_type %s", job_type)


def _run_worker() -> None:
    q = get_queue()
    while not _stop.is_set():
        try:
            export_msgs = q.consume("export_automation", consumer_id=EXPORT_AUTOMATION_CONSUMER_ID, limit=BATCH_SIZE)
            for m in export_msgs:
                try:
                    _process_export_automation_message(m)
                except Exception as e:
                    logger.exception("Error processing export_automation message %s: %s", m.get("id"), e)
        except Exception as e:
            logger.exception("Queue worker error (export_automation): %s", e)

        _stop.wait(POLL_INTERVAL_SEC)


def start_queue_worker() -> None:
    """Start the background thread that consumes the export_automation topic."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_run_worker, daemon=True, name="queue_worker")
    _thread.start()
    logger.info("Queue worker started (topic: export_automation)")


def stop_queue_worker() -> None:
    """Signal the worker to stop (e.g. on shutdown)."""
    _stop.set()
