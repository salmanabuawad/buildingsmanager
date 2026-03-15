"""
Email service: async SMTP via aiosmtplib.
Replaces Netlify email functions.
"""
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formataddr
import aiosmtplib


async def send_email(
    smtp_host: str,
    smtp_port: int,
    smtp_encryption: str,
    smtp_username: str,
    smtp_password: str,
    from_email: str,
    from_name: str | None,
    reply_to_email: str | None,
    to: list[str],
    subject: str,
    body: str,
    attachments: list[dict] | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
) -> None:
    """Send an email. Raises on failure."""
    msg = MIMEMultipart()
    msg["From"] = formataddr((from_name or from_email, from_email))
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    if reply_to_email:
        msg["Reply-To"] = reply_to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if attachments:
        for att in attachments:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(base64.b64decode(att["content"]))
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f'attachment; filename="{att["filename"]}"',
            )
            msg.attach(part)

    all_recipients = list(to)
    if cc:
        all_recipients.extend(cc)
    if bcc:
        all_recipients.extend(bcc)

    use_tls = smtp_encryption.lower() == "ssl"
    use_starttls = smtp_encryption.lower() == "tls"

    await aiosmtplib.send(
        msg,
        hostname=smtp_host,
        port=smtp_port,
        use_tls=use_tls,
        start_tls=use_starttls,
        username=smtp_username if smtp_username else None,
        password=smtp_password if smtp_password else None,
    )
