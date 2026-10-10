"""
Subscriber messages for everyone who taps Notify me — email or WhatsApp,
whichever they signed up with:

1. welcome   — right after they subscribe: "You're on the list".
2. reminder  — 1 minute before the launch countdown ends: "We go live in 1 minute".
               The courier worker wakes up for it and calls maybe_send_launch_alerts().

Both are switched on by the launch_alerts_enabled setting. Each subscriber is stamped
(welcomed_at / notified_at) so nobody gets the same message twice; failures keep their
error and can be retried from Admin → Subscribers.
"""
import datetime
import hashlib
import hmac
import logging
import os
from typing import Dict, Optional

from sqlalchemy.orm import Session

from . import mailer, models
from . import whatsapp as whatsapp_helper
from .database import SessionLocal
from .offers import set_setting

logger = logging.getLogger(__name__)

SITE_URL = os.getenv("SITE_URL", "https://loopstitch.online").rstrip("/")
SECRET = os.getenv("SECRET_KEY", "")
CONTACT_EMAIL = os.getenv("SMTP_USER", "") or "info@loopstitch.online"
INSTAGRAM_URL = "https://www.instagram.com/loopstitch_co"
REMINDER_LEAD = datetime.timedelta(minutes=1)  # reminder goes out this long before launch
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
UTM = "utm_source={campaign}&utm_medium=email&utm_campaign=drop001"


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------- unsubscribe
def unsubscribe_token(sub_id: int, contact: str) -> str:
    return hmac.new(SECRET.encode(), f"unsub:{sub_id}:{contact}".encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_url(sub: models.Subscriber) -> str:
    return f"{SITE_URL}/api/unsubscribe?s={sub.id}&t={unsubscribe_token(sub.id, sub.contact)}"


def _unsub_headers(url: str) -> Dict[str, str]:
    # one-click unsubscribe (Gmail / Yahoo bulk-sender rules)
    return {"List-Unsubscribe": f"<{url}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}


# ---------------------------------------------------------------- settings / timing
def _settings(db: Session) -> Dict[str, str]:
    return {r.key: r.value for r in db.query(models.Setting).all()}


def _enabled(raw: Dict[str, str]) -> bool:
    return raw.get("launch_alerts_enabled") == "true"


def _launch_time(raw: Dict[str, str]) -> Optional[datetime.datetime]:
    try:
        when = datetime.datetime.fromisoformat(raw.get("launch_date", "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=datetime.timezone.utc)


def launch_label(raw: Dict[str, str]) -> str:
    """'Saturday, 11 October at 7:00 PM IST' — or '' when no launch time is set."""
    when = _launch_time(raw)
    if not when:
        return ""
    local = when.astimezone(IST)
    return f"{local:%A}, {local.day} {local:%B} at {local:%I:%M %p}".replace(" 0", " ") + " IST"


def seconds_until_due(db: Session) -> Optional[float]:
    """Seconds until the 1-minute reminder should go out (None if nothing is scheduled)."""
    raw = _settings(db)
    when = _launch_time(raw)
    if not _enabled(raw) or not when or raw.get("launch_alerts_sent_at"):
        return None
    return (when - REMINDER_LEAD - datetime.datetime.now(datetime.timezone.utc)).total_seconds()


# ---------------------------------------------------------------- email content
def _email_shell(title: str, preheader: str, label: str, headline: str, intro: str,
                 cta_text: str, cta_url: str, points, extra: str, unsub_url: str) -> str:
    logo = f"{SITE_URL}/icon-192.png?v=2"
    rows = "".join(
        f'''<tr><td style="padding:0 0 14px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="top" style="width:18px;padding-top:2px;color:#FF3B5C;font-size:14px;">&#10022;</td>
            <td style="font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:15px;font-weight:bold;color:#F3F1EA;">{t}</div>
              <div style="font-size:13px;color:#A6A6AE;padding-top:2px;">{d}</div>
            </td></tr></table></td></tr>'''
        for t, d in points
    )
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#0B0B0D;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0B0B0D;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0B0B0D;">
<tr><td align="center" style="padding:28px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
    <tr><td align="center" style="padding:0 0 22px 0;">
      <img src="{logo}" width="72" height="72" alt="Loopstitch" style="display:block;border:0;border-radius:36px;">
      <div style="font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:22px;letter-spacing:1px;color:#F3F1EA;padding-top:10px;">LOOPSTITCH<span style="color:#FF3B5C;">.</span></div>
    </td></tr>
    <tr><td style="background:#16151A;border:1px solid #2A2930;border-top:4px solid #FF3B5C;padding:36px 32px;">
      <div style="font-family:'Courier New',monospace;font-size:12px;letter-spacing:3px;color:#E8FF52;text-transform:uppercase;">{label}</div>
      <h1 style="margin:12px 0 0 0;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-weight:normal;font-size:48px;line-height:1.05;letter-spacing:1px;color:#F3F1EA;text-transform:uppercase;">{headline}<span style="color:#FF3B5C;">.</span></h1>
      <p style="margin:18px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#D9D7D0;">{intro}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 30px 0;"><tr>
        <td style="background:#FF3B5C;">
          <a href="{cta_url}" style="display:inline-block;padding:16px 30px;font-family:'Courier New',monospace;font-size:14px;font-weight:bold;letter-spacing:3px;color:#0B0B0D;text-decoration:none;text-transform:uppercase;">{cta_text} &rarr;</a>
        </td></tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{rows}</table>
      <div style="border-top:1px dashed #3A3940;margin:12px 0 22px 0;"></div>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#A6A6AE;">{extra}</p>
    </td></tr>
    <tr><td align="center" style="padding:24px 10px 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#7C7C85;">
      Questions? Just reply to this email or write to <a href="mailto:{CONTACT_EMAIL}" style="color:#A6A6AE;">{CONTACT_EMAIL}</a><br>
      <a href="{INSTAGRAM_URL}" style="color:#A6A6AE;">Instagram @loopstitch_co</a> &middot; <a href="{SITE_URL}" style="color:#A6A6AE;">loopstitch.online</a><br><br>
      You're receiving this because you asked to be notified at loopstitch.online.<br>
      <a href="{unsub_url}" style="color:#7C7C85;">Unsubscribe</a> &middot; &copy; Loopstitch
    </td></tr>
  </table>
</td></tr></table>
</body></html>'''


POINTS = [
    ("Unisex oversized fit", "Relaxed, dropped-shoulder cut · S, M, L, XL"),
    ("Premium 250 GSM cotton", "Heavyweight fabric with a print built to last"),
    ("Limited pieces", "Printed in small batches — never restocked"),
]


def welcome_email(unsub_url: str, when: str) -> Dict[str, str]:
    site = f"{SITE_URL}/?{UTM.format(campaign='welcome')}"
    insta = INSTAGRAM_URL
    timing = f"We open on <b style=\"color:#F3F1EA;\">{when}</b>." if when else "We're putting the final stitches in."
    timing_text = f"We open on {when}." if when else "We're putting the final stitches in."
    subject = "You're on the list — Loopstitch Drop 001"
    html = _email_shell(
        subject, "Thanks for signing up — we'll message you a minute before we go live.",
        "Drop 001 &middot; Early access", "You're on the list",
        f"Thanks for signing up for Loopstitch. {timing} We'll email you <b style=\"color:#F3F1EA;\">one minute before we go live</b>, so you can grab your size before anyone else.",
        "Follow the countdown", site, POINTS,
        f'Want a sneak peek? <a href="{insta}" style="color:#E8FF52;">Follow @loopstitch_co on Instagram</a> for first looks at the drop.',
        unsub_url,
    )
    text = (
        "YOU'RE ON THE LIST.\n\n"
        f"Thanks for signing up for Loopstitch. {timing_text} "
        "We'll email you one minute before we go live, so you can grab your size before anyone else.\n\n"
        f"Follow the countdown: {site}\n\n"
        "- Unisex oversized fit · S, M, L, XL\n- Premium 250 GSM cotton\n- Limited pieces — never restocked\n\n"
        f"Sneak peeks on Instagram: {insta}\n\n"
        f"Questions? Reply to this email or write to {CONTACT_EMAIL}\n\n"
        "You're receiving this because you asked to be notified at loopstitch.online.\n"
        f"Unsubscribe: {unsub_url}\n"
    )
    return {"subject": subject, "html": html, "text": text}


def reminder_email(unsub_url: str, when: str) -> Dict[str, str]:
    shop = f"{SITE_URL}/shop?{UTM.format(campaign='launch_reminder')}"
    custom = f"{SITE_URL}/customize?{UTM.format(campaign='launch_reminder')}"
    at = when.split(" at ")[-1] if when else ""
    subject = f"1 minute to go — Loopstitch opens at {at}" if at else "1 minute to go — Loopstitch Drop 001"
    html = _email_shell(
        subject, "Drop 001 opens in one minute. Limited pieces — get your size first.",
        "Drop 001 &middot; Opening now", "1 minute to go",
        f"You asked us to tell you the moment Loopstitch opens — this is it. Drop 001 goes live{' at <b style=\"color:#F3F1EA;\">' + at + '</b>' if at else ''}, "
        "in just one minute. Pieces are limited and never restocked, so be ready to grab your size.",
        "Open the store", shop, POINTS,
        f'Have your own artwork? We print custom tees too &mdash; <a href="{custom}" style="color:#E8FF52;">design yours here</a>.',
        unsub_url,
    )
    text = (
        "1 MINUTE TO GO.\n\n"
        f"You asked us to tell you the moment Loopstitch opens — this is it. Drop 001 goes live{' at ' + at if at else ''}, in just one minute.\n"
        "Pieces are limited and never restocked, so be ready to grab your size.\n\n"
        f"Open the store: {shop}\n\n"
        "- Unisex oversized fit · S, M, L, XL\n- Premium 250 GSM cotton\n- Limited pieces — never restocked\n\n"
        f"Design your own custom tee: {custom}\n\n"
        f"Questions? Reply to this email or write to {CONTACT_EMAIL}\n\n"
        "You're receiving this because you asked to be notified at loopstitch.online.\n"
        f"Unsubscribe: {unsub_url}\n"
    )
    return {"subject": subject, "html": html, "text": text}


# ---------------------------------------------------------------- sending
def _send_one(sub: models.Subscriber, kind: str, when: str, smtp=None) -> None:
    if sub.kind == "email":
        url = unsubscribe_url(sub)
        mail = welcome_email(url, when) if kind == "welcome" else reminder_email(url, when)
        mailer.send(sub.contact, mail["subject"], mail["html"], mail["text"], _unsub_headers(url), server=smtp)
    else:
        template = whatsapp_helper.WELCOME_TEMPLATE if kind == "welcome" else whatsapp_helper.LAUNCH_TEMPLATE
        whatsapp_helper.send_launch_message(whatsapp_helper.to_e164(sub.contact), template)


def send_welcome(subscriber_id: int) -> None:
    """Background task after /api/subscribe: 'You're on the list' (own DB session)."""
    db = SessionLocal()
    try:
        raw = _settings(db)
        sub = db.query(models.Subscriber).filter(models.Subscriber.id == subscriber_id).first()
        if not _enabled(raw) or not sub or sub.welcomed_at or sub.unsubscribed:
            return
        try:
            _send_one(sub, "welcome", launch_label(raw))
            sub.welcomed_at = _utcnow()
        except Exception as exc:
            sub.notify_error = f"Welcome: {exc}"[:500]
            logger.warning("Welcome message to subscriber %s failed: %s", sub.id, exc)
        db.commit()
    finally:
        db.close()


def send_pending(db: Session, ids: Optional[list] = None) -> Dict[str, int]:
    """1-minute reminder to every subscriber not yet notified (or just `ids`). Returns counts."""
    q = db.query(models.Subscriber).filter(
        models.Subscriber.notified_at.is_(None),
        models.Subscriber.unsubscribed.isnot(True),
    )
    if ids:
        q = q.filter(models.Subscriber.id.in_(ids))
    subs = q.order_by(models.Subscriber.id).all()
    when = launch_label(_settings(db))
    counts = {"sent": 0, "failed": 0}
    smtp = None
    try:
        for sub in subs:
            try:
                if sub.kind == "email" and smtp is None:
                    smtp = mailer.connect()  # one connection for the whole batch
                _send_one(sub, "reminder", when, smtp)
                sub.notified_at = _utcnow()
                sub.notify_error = None
                counts["sent"] += 1
            except Exception as exc:
                sub.notify_error = str(exc)[:500]
                counts["failed"] += 1
                logger.warning("Launch reminder to subscriber %s failed: %s", sub.id, exc)
                if sub.kind == "email" and smtp is not None:
                    try:  # the connection may be dead; reconnect for the next one
                        smtp.quit()
                    except Exception:
                        pass
                    smtp = None
            db.commit()
    finally:
        if smtp is not None:
            try:
                smtp.quit()
            except Exception:
                pass
    return counts


def maybe_send_launch_alerts(db: Session) -> Optional[Dict[str, int]]:
    """Fire once, automatically, 1 minute before the launch time."""
    raw = _settings(db)
    when = _launch_time(raw)
    if not _enabled(raw) or raw.get("launch_alerts_sent_at") or not when:
        return None
    now = datetime.datetime.now(datetime.timezone.utc)
    if now < when - REMINDER_LEAD:
        return None
    if now > when + datetime.timedelta(hours=6):
        return None  # launch was long ago (date changed / worker was down): don't send a stale "1 minute to go"
    set_setting(db, "launch_alerts_sent_at", _utcnow().isoformat(timespec="seconds"))  # mark first: never double-send
    db.commit()
    counts = send_pending(db)
    logger.info("Launch reminders sent: %s", counts)
    return counts


def send_test(contact: str, kind: str, db: Session) -> str:
    """Send the real welcome / reminder to one address or number without touching subscribers."""
    contact = contact.strip()
    when = launch_label(_settings(db))
    if "@" in contact:
        url = f"{SITE_URL}/api/unsubscribe?s=0&t=test"
        mail = welcome_email(url, when) if kind == "welcome" else reminder_email(url, when)
        mailer.send(contact, "[TEST] " + mail["subject"], mail["html"], mail["text"])
        return "email"
    template = whatsapp_helper.WELCOME_TEMPLATE if kind == "welcome" else whatsapp_helper.LAUNCH_TEMPLATE
    whatsapp_helper.send_launch_message(whatsapp_helper.to_e164(contact), template)
    return "WhatsApp"
