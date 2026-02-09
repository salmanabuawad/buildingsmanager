"""
Email Router
Handles email sending functionality
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import base64
import io

router = APIRouter()


class EmailAttachment(BaseModel):
    filename: str
    content: str  # Base64 encoded
    contentType: str = "application/octet-stream"


class EmailConfig(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_encryption: str  # 'tls', 'ssl', 'none'
    smtp_username: str
    smtp_password: str
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


class SendEmailResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None


def send_email_with_smtp(
    config: EmailConfig,
    to: List[str],
    subject: str,
    body: str,
    attachments: Optional[List[EmailAttachment]] = None,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None
) -> bool:
    """
    Send email using SMTP
    
    Args:
        config: Email configuration
        to: List of recipient email addresses
        subject: Email subject
        body: Email body (plain text)
        attachments: Optional list of attachments
        cc: Optional list of CC recipients
        bcc: Optional list of BCC recipients
    
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = config.from_name if config.from_name else config.from_email
        msg['To'] = ', '.join(to)
        if cc:
            msg['Cc'] = ', '.join(cc)
        if config.reply_to_email:
            msg['Reply-To'] = config.reply_to_email
        msg['Subject'] = subject

        # Add body
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # Add attachments
        if attachments:
            for attachment in attachments:
                part = MIMEBase('application', 'octet-stream')
                # Decode base64 content
                attachment_data = base64.b64decode(attachment.content)
                part.set_payload(attachment_data)
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {attachment.filename}'
                )
                msg.attach(part)

        # Determine all recipients
        all_recipients = to.copy()
        if cc:
            all_recipients.extend(cc)
        if bcc:
            all_recipients.extend(bcc)

        # Connect to SMTP server
        if config.smtp_encryption == 'ssl':
            server = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port)
        else:
            server = smtplib.SMTP(config.smtp_host, config.smtp_port)
            if config.smtp_encryption == 'tls':
                server.starttls()

        # Login if credentials provided
        if config.smtp_username and config.smtp_password:
            server.login(config.smtp_username, config.smtp_password)

        # Send email
        text = msg.as_string()
        server.sendmail(config.from_email, all_recipients, text)
        server.quit()

        return True
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        raise


@router.post("/send", response_model=SendEmailResponse)
async def send_email(request: SendEmailRequest):
    """
    Send email with attachments
    
    Requires email configuration and recipient list.
    """
    try:
        # Validate email addresses
        if not request.to or len(request.to) == 0:
            raise HTTPException(status_code=400, detail="No recipients specified")

        # Send email
        success = send_email_with_smtp(
            config=request.email_config,
            to=request.to,
            subject=request.subject,
            body=request.body,
            attachments=request.attachments,
            cc=request.cc,
            bcc=request.bcc
        )

        if success:
            return SendEmailResponse(
                success=True,
                message=f"Email sent successfully to {len(request.to)} recipient(s)"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error sending email: {str(e)}"
        )
