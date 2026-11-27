"""Tenant emails, sent from Living High's own mailbox over SMTP.

Documenso is told not to email anyone (distributionMethod NONE). We send exactly two emails:
  1. signing request — contains the tenant's personal Documenso signing link
  2. completed copy  — the signed agreement attached as a PDF
Never log email bodies or addresses (Australian Privacy Act).
"""
import asyncio
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.config import settings
from app.services import settings_service

logger = logging.getLogger(__name__)


class EmailError(ValueError):
    """Email could not be sent. Message is safe to show staff (no password, no tenant data)."""


def is_configured() -> bool:
    return bool(settings.smtp_host and settings.email_from)


def ensure_configured() -> None:
    if not is_configured():
        raise EmailError(
            "Email is not set up yet. Add SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD and "
            "EMAIL_FROM to the .env file, then restart the backend."
        )


def _first_name(name: str) -> str:
    return (name or "").strip().split(" ")[0] or "there"


def _layout(heading: str, body_html: str) -> str:
    """Simple, email-client-safe HTML wrapper (inline styles, table layout)."""
    brand = html.escape(settings_service.sender_name())
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;font-size:18px;font-weight:bold;">{brand}</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.6;">
<h1 style="margin:0 0 16px;font-size:20px;">{html.escape(heading)}</h1>
{body_html}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
Sent by {brand}. If you have questions, just reply to this email.
</td></tr>
</table>
</td></tr></table>
</body></html>"""


def _paragraphs(text: str) -> str:
    """Staff-written message → safe HTML paragraphs."""
    parts = [p.strip() for p in text.split("\n\n") if p.strip()]
    return "".join(
        f'<p style="margin:0 0 14px;">{html.escape(p).replace(chr(10), "<br>")}</p>' for p in parts
    )


def _new_message(to_email: str, to_name: str, subject: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((settings_service.sender_name(), settings.email_from))
    msg["To"] = formataddr((to_name, to_email))
    msg["Subject"] = subject
    msg["Reply-To"] = settings_service.reply_to()
    msg["Message-ID"] = make_msgid(domain=settings.email_from.split("@")[-1])
    return msg


def _login(s: smtplib.SMTP) -> None:
    """Single AUTH PLAIN attempt. smtplib.login() falls back to other methods after a 535,
    and Gmail then drops the connection — hiding the real 'bad password' error."""
    if not settings.smtp_username:
        return
    s.ehlo_or_helo_if_needed()
    s.user, s.password = settings.smtp_username, settings.smtp_password
    code, resp = s.auth("PLAIN", s.auth_plain, initial_response_ok=True)
    if code not in (235, 503):
        raise smtplib.SMTPAuthenticationError(code, resp)


def _send_sync(msg: EmailMessage) -> None:
    context = ssl.create_default_context()
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=30) as s:
                _login(s)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as s:
                s.starttls(context=context)
                _login(s)
                s.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        logger.warning("SMTP login failed (code %s)", exc.smtp_code)
        raise EmailError("Email login failed. Check SMTP_USERNAME and SMTP_PASSWORD (use an app password).") from exc
    except smtplib.SMTPRecipientsRefused as exc:
        raise EmailError("The mail server refused the tenant's email address. Check it is correct.") from exc
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("SMTP send failed: %s", type(exc).__name__)
        raise EmailError(f"Could not send the email ({type(exc).__name__}). Please try again.") from exc


async def _send(msg: EmailMessage) -> None:
    await asyncio.to_thread(_send_sync, msg)


async def send_signing_request(
    *,
    to_email: str,
    to_name: str,
    signing_url: str,
    document_title: str,
    subject: str | None = None,
    message: str | None = None,
) -> None:
    ensure_configured()
    subject = subject or f"Please sign: {document_title}"
    intro = message or (
        f"Hi {_first_name(to_name)},\n\n"
        "Your Living High agreement is ready. Please review and sign it using the button below."
    )

    msg = _new_message(to_email, to_name, subject)
    msg.set_content(
        f"{intro}\n\nReview and sign here:\n{signing_url}\n\n"
        f"This link is personal to you. Please don't forward it.\n\n— {settings_service.sender_name()}"
    )
    button = (
        f'<p style="margin:24px 0;"><a href="{html.escape(signing_url, quote=True)}" '
        f'style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;'
        f'border-radius:6px;font-weight:bold;display:inline-block;">Review and sign</a></p>'
        f'<p style="margin:0;font-size:13px;color:#6b7280;">This link is personal to you. Please don\'t forward it.</p>'
    )
    msg.add_alternative(_layout("Your agreement is ready to sign", _paragraphs(intro) + button), subtype="html")
    await _send(msg)


async def send_completed_copy(
    *,
    to_email: str,
    to_name: str,
    document_title: str,
    signed_pdf: bytes,
    filename: str,
) -> None:
    ensure_configured()
    msg = _new_message(to_email, to_name, f"Signed copy: {document_title}")
    text = (
        f"Hi {_first_name(to_name)},\n\n"
        "Thanks for signing. Your signed Living High agreement is attached for your records, "
        f"including the signing certificate.\n\nPlease keep this copy somewhere safe."
    )
    msg.set_content(f"{text}\n\n— {settings_service.sender_name()}")
    msg.add_alternative(_layout("Your signed agreement", _paragraphs(text)), subtype="html")
    msg.add_attachment(signed_pdf, maintype="application", subtype="pdf", filename=filename)
    await _send(msg)


async def send_team_invite(*, to_email: str, inviter_name: str, role_label: str, link: str, days: int) -> None:
    """Invite a staff member to the Living High contracts workspace."""
    ensure_configured()
    msg = _new_message(to_email, "", f"{inviter_name} invited you to Living High Contracts")
    text = (
        f"Hi,\n\n{inviter_name} has invited you to join the Living High contracts workspace "
        f"as a {role_label}.\n\nAccept the invite to set your password. The link works for {days} days."
    )
    msg.set_content(f"{text}\n\nAccept the invite:\n{link}\n\n— {settings_service.sender_name()}")
    button = (
        f'<p style="margin:24px 0;"><a href="{html.escape(link, quote=True)}" '
        f'style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;'
        f'border-radius:6px;font-weight:bold;display:inline-block;">Accept invite</a></p>'
        f'<p style="margin:0;font-size:13px;color:#6b7280;">If you weren\'t expecting this, you can ignore this email.</p>'
    )
    msg.add_alternative(_layout("You're invited", _paragraphs(text) + button), subtype="html")
    await _send(msg)
