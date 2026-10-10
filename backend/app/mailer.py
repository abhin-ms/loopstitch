"""
Outgoing email over SMTP (works with any mailbox provider: Zoho, Google Workspace,
Hostinger, Titan, ...). Configure via env — never commit the password:

    SMTP_HOST       e.g. smtp.zoho.in
    SMTP_PORT       465 (SSL) or 587 (STARTTLS)
    SMTP_USER       info@loopstitch.online
    SMTP_PASSWORD   mailbox / app password
    MAIL_FROM       "Loopstitch <info@loopstitch.online>"  (defaults to SMTP_USER)
"""
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Dict, Optional

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465") or 465)
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "") or formataddr(("Loopstitch", SMTP_USER))


def is_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def connect() -> smtplib.SMTP:
    """One authenticated connection — reuse it to send a batch."""
    if not is_configured():
        raise RuntimeError("Email is not configured — set SMTP_HOST, SMTP_USER and SMTP_PASSWORD")
    context = ssl.create_default_context()
    if SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=30)
    else:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
        server.starttls(context=context)
    server.login(SMTP_USER, SMTP_PASSWORD)
    return server


def build(to: str, subject: str, html: str, text: str, headers: Optional[Dict[str, str]] = None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = MAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg["Reply-To"] = SMTP_USER
    msg["Message-ID"] = make_msgid(domain=SMTP_USER.split("@")[-1] or None)
    for key, value in (headers or {}).items():
        msg[key] = value
    msg.set_content(text)  # plain-text part for clients that block HTML
    msg.add_alternative(html, subtype="html")
    return msg


def send(to: str, subject: str, html: str, text: str, headers: Optional[Dict[str, str]] = None,
         server: Optional[smtplib.SMTP] = None) -> None:
    msg = build(to, subject, html, text, headers)
    if server is not None:
        server.send_message(msg)
        return
    with connect() as own:
        own.send_message(msg)
