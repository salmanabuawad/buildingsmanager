"""
Email router: /api/email/send and /api/email/test
Async SMTP via aiosmtplib.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.services.email_service import send_email

router = APIRouter()


class EmailAttachment(BaseModel):
    filename: str
    content: str  # base64-encoded
    contentType: str = "application/octet-stream"


class EmailConfig(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_encryption: str
    smtp_username: str = ""
    smtp_password: str = ""
    from_email: str
    from_name: Optional[str] = None
    reply_to_email: Optional[str] = None


class SendEmailRequest(BaseModel):
    email_config: EmailConfig
    to: List[str]
    subject: str
    body: str
    attachments: Optional[List[EmailAttachment]] = None
    cc: Optional[List[str]] = None
    bcc: Optional[List[str]] = None


class TestEmailRequest(BaseModel):
    email_config: EmailConfig
    test_to: str


@router.post("/send")
async def send(req: SendEmailRequest):
    if not req.to:
        raise HTTPException(status_code=400, detail="No recipients specified")
    try:
        await send_email(
            smtp_host=req.email_config.smtp_host,
            smtp_port=req.email_config.smtp_port,
            smtp_encryption=req.email_config.smtp_encryption,
            smtp_username=req.email_config.smtp_username,
            smtp_password=req.email_config.smtp_password,
            from_email=req.email_config.from_email,
            from_name=req.email_config.from_name,
            reply_to_email=req.email_config.reply_to_email,
            to=req.to,
            subject=req.subject,
            body=req.body,
            attachments=[a.model_dump() for a in req.attachments] if req.attachments else None,
            cc=req.cc,
            bcc=req.bcc,
        )
        return {"success": True, "message": f"Email sent to {len(req.to)} recipient(s)"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email send failed: {e}")


@router.post("/test")
async def test_email(req: TestEmailRequest):
    if not req.test_to or "@" not in req.test_to:
        raise HTTPException(status_code=400, detail="Valid recipient email required")
    try:
        await send_email(
            smtp_host=req.email_config.smtp_host,
            smtp_port=req.email_config.smtp_port,
            smtp_encryption=req.email_config.smtp_encryption,
            smtp_username=req.email_config.smtp_username,
            smtp_password=req.email_config.smtp_password,
            from_email=req.email_config.from_email,
            from_name=req.email_config.from_name,
            reply_to_email=req.email_config.reply_to_email,
            to=[req.test_to],
            subject="BuildingsManager - Test Email",
            body="This is a test email from BuildingsManager. SMTP is working.",
        )
        return {"success": True, "message": "Test email sent"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test email failed: {e}")
