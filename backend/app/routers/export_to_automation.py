"""
Export to automation: enqueue 3 queue requests.
1. Create and download ZIP to client
2. Send mail to relevant operators
3. Send mail to relevant managers
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.queue_lite import get_queue

router = APIRouter()

TOPIC_EXPORT_AUTOMATION = "export_automation"
JOB_TYPE_ZIP = "create_download_zip"
JOB_TYPE_EMAIL_OPERATORS = "send_mail_operators"
JOB_TYPE_EMAIL_MANAGERS = "send_mail_managers"


class EmailItem(BaseModel):
    to: str
    subject: str
    body: str
    attachment_filename: Optional[str] = None
    attachment_base64: Optional[str] = None


class EmailConfigPayload(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_encryption: str
    smtp_username: str
    smtp_password: str
    from_email: str
    from_name: Optional[str] = None
    reply_to_email: Optional[str] = None


class EnqueueExportRequest(BaseModel):
    """After assets are marked as exported, enqueue the 3 follow-up requests."""
    asset_ids: List[int]
    operator_email_items: Optional[List[EmailItem]] = None
    manager_email_items: Optional[List[EmailItem]] = None
    email_config: Optional[EmailConfigPayload] = None


class EnqueueExportResponse(BaseModel):
    export_job_id: str
    enqueued: List[str]
    message: str


@router.post("/enqueue", response_model=EnqueueExportResponse)
async def enqueue_export_to_automation(request: EnqueueExportRequest):
    """
    Enqueue 3 requests for export-to-automation follow-up:
    1. Create and download ZIP to client
    2. Send mail to relevant operators
    3. Send mail to relevant managers
    """
    if not request.asset_ids:
        raise HTTPException(status_code=400, detail="asset_ids required and must be non-empty")
    export_job_id = str(uuid.uuid4())
    date_str = datetime.utcnow().strftime("%Y%m%d")
    q = get_queue()
    enqueued: List[str] = []

    # 1. Create and download ZIP to client
    q.produce(TOPIC_EXPORT_AUTOMATION, {
        "job_type": JOB_TYPE_ZIP,
        "export_job_id": export_job_id,
        "asset_ids": request.asset_ids,
        "date_str": date_str,
    })
    enqueued.append(JOB_TYPE_ZIP)

    # 2. Send mail to relevant operators
    q.produce(TOPIC_EXPORT_AUTOMATION, {
        "job_type": JOB_TYPE_EMAIL_OPERATORS,
        "export_job_id": export_job_id,
        "email_config": request.email_config.model_dump() if request.email_config else None,
        "items": [i.model_dump() for i in (request.operator_email_items or [])],
    })
    enqueued.append(JOB_TYPE_EMAIL_OPERATORS)

    # 3. Send mail to relevant managers
    q.produce(TOPIC_EXPORT_AUTOMATION, {
        "job_type": JOB_TYPE_EMAIL_MANAGERS,
        "export_job_id": export_job_id,
        "email_config": request.email_config.model_dump() if request.email_config else None,
        "items": [i.model_dump() for i in (request.manager_email_items or [])],
    })
    enqueued.append(JOB_TYPE_EMAIL_MANAGERS)

    return EnqueueExportResponse(
        export_job_id=export_job_id,
        enqueued=enqueued,
        message="3 requests enqueued: create and download zip, send mail to operators, send mail to managers",
    )
