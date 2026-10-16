"""
WhatsApp review requests.

1. A few days after an order is delivered (REVIEW_REQUEST_DELAY_DAYS, default 2) the courier
   worker sends the order_review template once. Its Flow button opens the review form:
   star rating and feedback text, then an optional upload screen with up to 3 photos from the
   camera / gallery (PhotoPicker) and a link to a files screen (DocumentPicker) – Meta allows
   only one picker per screen.
2. When the customer submits, Meta posts an nfm_reply message to /api/webhooks/whatsapp.
   handle_flow_reply() checks the signed flow_token, downloads the photos, re-encodes them as
   JPEG (which also strips EXIF / GPS data) and saves one Review per product in the order.
3. Right after the form is submitted we WhatsApp a text (the form reply opens the 24-hour
   window): with a photo, a unique single-use REVIEW_REWARD_PERCENT (default 20) % coupon
   that never expires; without a photo, just a thank-you.
4. Reviews stay hidden until an admin approves them, like website reviews.

The Flow's last screen completes with (media at the top level, as Meta requires):
    {"rating": ..., "feedback": ..., "photos": "${form.photos}"}       camera / gallery screen
    {"rating": ..., "feedback": ..., "documents": "${form.documents}"} files screen
See whatsapp_flows/order_review.json.
"""
import datetime
import hashlib
import secrets
import hmac
import io
import json
import logging
import os
import re
import uuid
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

from PIL import Image, ImageOps
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import models
from . import whatsapp as whatsapp_helper
from .auth import SECRET_KEY
from .database import SessionLocal

logger = logging.getLogger(__name__)

MESSAGE_TYPE = "order_review"
DELAY_DAYS = float(os.getenv("REVIEW_REQUEST_DELAY_DAYS", "2"))
# never ask about deliveries older than this (e.g. after the worker was down for a while)
MAX_AGE_DAYS = 30
BATCH_SIZE = 50
MAX_PHOTOS = 3
PHOTO_MAX_SIDE = 1600
FEEDBACK_MAX = 2000
REWARD_PERCENT = float(os.getenv("REVIEW_REWARD_PERCENT", "20"))
REWARD_MESSAGE_TYPE = "review_reward"
THANKS_MESSAGE_TYPE = "review_thanks"
# Flow uploads delivered as {cdn_url, encryption_metadata} must come from Meta's CDN
CDN_HOST_SUFFIXES = (".whatsapp.net", ".fbcdn.net", ".fbsbx.com")
_MEDIA_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

Store = Callable[[bytes, str, str, str], str]  # (bytes, filename, content_type, subdir) -> url


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------- flow token
def _sign(order_id: int) -> str:
    return hmac.new(SECRET_KEY.encode(), f"review:{order_id}".encode(), hashlib.sha256).hexdigest()[:20]


def flow_token(order_id: int) -> str:
    """Identifies the order in the form answers; signed so nobody can review someone else's order."""
    return f"rv.{order_id}.{_sign(order_id)}"


def order_id_from_token(token: str) -> Optional[int]:
    parts = (token or "").split(".")
    if len(parts) != 3 or parts[0] != "rv" or not parts[1].isdigit():
        return None
    order_id = int(parts[1])
    return order_id if hmac.compare_digest(parts[2], _sign(order_id)) else None


# ---------------------------------------------------------------- sending
def send_request(db: Session, order: models.Order) -> models.Notification:
    """Send the review template for one order and log it under Notifications."""
    phone = whatsapp_helper.to_e164(order.customer_phone)
    notification = models.Notification(
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer_name,
        customer_phone=phone,
        message_type=MESSAGE_TYPE,
        status="pending",
    )
    db.add(notification)
    db.flush()
    deliver(notification, order)
    db.commit()
    return notification


def deliver(notification: models.Notification, order: models.Order) -> None:
    """Send (or re-send) the template for an existing Notification row. Caller commits."""
    try:
        result = whatsapp_helper.send_review_message(
            notification.customer_phone, order.customer_name, order.order_number, flow_token(order.id)
        )
        notification.whatsapp_message_id = result.get("message_id", "")
        notification.status = "sent"
        notification.error_message = ""
        notification.sent_at = _utcnow()
        order.review_msg_sent = True
    except Exception as exc:
        notification.status = "failed"
        notification.error_message = str(exc)[:500]
        logger.warning("Review WhatsApp failed for %s: %s", order.order_number, exc)


def send_due(db: Session, now: Optional[datetime.datetime] = None) -> int:
    """Send the review request for orders delivered DELAY_DAYS ago. Returns how many were tried."""
    if not whatsapp_helper.is_configured():
        return 0
    now = now or _utcnow()
    due = (
        db.query(models.Order)
        .filter(
            models.Order.status == models.OrderStatus.delivered,
            models.Order.delivered_at.isnot(None),
            models.Order.delivered_at <= now - datetime.timedelta(days=DELAY_DAYS),
            models.Order.delivered_at >= now - datetime.timedelta(days=MAX_AGE_DAYS),
            or_(models.Order.review_msg_sent == False, models.Order.review_msg_sent.is_(None)),  # noqa: E712
        )
        .order_by(models.Order.delivered_at)
        .limit(BATCH_SIZE)
        .all()
    )
    for order in due:
        # mark first: a failed send is retried by hand from Notifications, not every 5 minutes
        order.review_msg_sent = True
        send_request(db, order)
    return len(due)


# ---------------------------------------------------------------- receiving
def _display_name(full_name: str) -> str:
    """'Arjun Kumar' -> 'Arjun K.' (shown publicly on the storefront)."""
    parts = (full_name or "").split()
    if not parts:
        return "Customer"
    name = parts[0][:60]
    if len(parts) > 1:
        name += f" {parts[-1][0].upper()}."
    return name


def _last10(phone: str) -> str:
    return "".join(c for c in (phone or "") if c.isdigit())[-10:]


def _photo_bytes(item: Any) -> bytes:
    """One PhotoPicker entry -> raw image bytes (media id via the Media API, or encrypted CDN file)."""
    if not isinstance(item, dict):
        raise ValueError("unexpected photo entry")
    media_id = str(item.get("media_id") or item.get("id") or "")
    if media_id and _MEDIA_ID.match(media_id):
        return whatsapp_helper.download_media(media_id)
    cdn_url = item.get("cdn_url") or ""
    meta = item.get("encryption_metadata")
    if cdn_url and isinstance(meta, dict):
        parsed = urlparse(cdn_url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not host.endswith(CDN_HOST_SUFFIXES):
            raise ValueError(f"photo from unexpected host {host!r}")
        return whatsapp_helper.decrypt_flow_media(cdn_url, meta)
    raise ValueError("photo entry has no media id or cdn_url")


def clean_photo(raw: bytes) -> bytes:
    """Re-encode as a JPEG no larger than PHOTO_MAX_SIDE; rotation applied, EXIF/GPS dropped."""
    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail((PHOTO_MAX_SIDE, PHOTO_MAX_SIDE), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, "JPEG", quality=85, optimize=True)
        return out.getvalue()


def _media_items(answers: Dict[str, Any]) -> List[Any]:
    """Photos from the camera / gallery screen and files from the documents screen, in one list."""
    items: List[Any] = []
    for key in ("photos", "documents"):
        value = answers.get(key)
        if isinstance(value, dict):
            value = [value]
        if isinstance(value, list):
            items.extend(value)
    return items


def _save_photos(items: List[Any], order_number: str, store: Store) -> List[str]:
    urls = []
    for item in items[:MAX_PHOTOS]:
        try:
            jpeg = clean_photo(_photo_bytes(item))
            name = f"review_{re.sub(r'[^A-Za-z0-9_-]', '', order_number)}_{uuid.uuid4().hex[:10]}.jpg"
            urls.append(store(jpeg, name, "image/jpeg", "reviews"))
        except Exception as exc:
            logger.warning("Could not save a review photo for %s: %s", order_number, exc)
    return urls


def save_flow_reply(db: Session, message: Dict[str, Any], store: Store) -> List[models.Review]:
    """Turn one nfm_reply webhook message into Review rows. Returns the rows created (may be empty)."""
    reply = (message.get("interactive") or {}).get("nfm_reply") or {}
    try:
        answers = json.loads(reply.get("response_json") or "{}")
    except ValueError:
        return []
    if not isinstance(answers, dict):
        return []
    order_id = order_id_from_token(str(answers.get("flow_token", "")))
    if order_id is None:
        return []  # some other Flow, or a forged token
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        return []
    if _last10(message.get("from", "")) != _last10(order.customer_phone):
        logger.warning("Review form for %s came from a different number; ignored", order.order_number)
        return []
    if db.query(models.Review).filter(models.Review.order_id == order.id, models.Review.source == "whatsapp").first():
        return []  # Meta re-delivered the webhook, or the customer submitted twice

    try:
        rating = int(str(answers.get("rating", "")).strip())
    except ValueError:
        return []
    if not 1 <= rating <= 5:
        return []
    feedback = str(answers.get("feedback") or "").strip()[:FEEDBACK_MAX]

    product_ids = []
    for item in order.items:
        if item.product_id and item.product_id not in product_ids:
            product_ids.append(item.product_id)
    if not product_ids:
        logger.info("Review form for %s has no catalogue products to attach to", order.order_number)
        return []

    uploads = _media_items(answers)
    photos = _save_photos(uploads, order.order_number, store)
    rows = []
    for product_id in product_ids:
        row = models.Review(
            product_id=product_id,
            name=_display_name(order.customer_name),
            rating=rating,
            title="",
            body=feedback,
            is_approved=False,
            source="whatsapp",
            order_id=order.id,
            photos_json=json.dumps(photos) if photos else None,
        )
        db.add(row)
        rows.append(row)
    db.commit()
    logger.info("Saved WhatsApp review for %s (%s stars, %s photos)", order.order_number, rating, len(photos))
    # the form promises the discount for adding a photo, whatever the rating; reward the upload
    # even if one of our downloads failed, since the customer did their part
    if uploads and REWARD_PERCENT > 0:
        send_reward(db, order)
    else:
        send_thanks(db, order)
    return rows


# ---------------------------------------------------------------- photo reward
def create_reward_coupon(db: Session) -> models.Coupon:
    """A fresh single-use % coupon with no expiry date."""
    while True:
        code = "THANKS" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
        if not db.query(models.Coupon).filter(models.Coupon.code == code).first():
            break
    coupon = models.Coupon(
        code=code, discount_type="percent", discount_percent=REWARD_PERCENT, max_uses=1,
        is_active=True, ends_at=None,
    )
    db.add(coupon)
    db.flush()
    return coupon


def _first_name(customer_name: str) -> str:
    parts = (customer_name or "").split()
    return parts[0] if parts else "there"


def reward_text(customer_name: str, code: str) -> str:
    return (
        f"Thanks for your review and photos, {_first_name(customer_name)}! 🙌\n\n"
        f"Here's {REWARD_PERCENT:g}% off your next Loopstitch order: *{code}*\n"
        "Use it at checkout on loopstitch.online. It can be used once."
    )


def thanks_text(customer_name: str) -> str:
    return (
        f"Thanks for your review, {_first_name(customer_name)}! 🙌\n"
        "Your feedback helps us make better tees. See you at the next drop – loopstitch.online"
    )


def send_thanks(db: Session, order: models.Order) -> models.Notification:
    """Thank-you text for a review without photos; logged under Notifications."""
    notification = models.Notification(
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer_name,
        customer_phone=whatsapp_helper.to_e164(order.customer_phone),
        message_type=THANKS_MESSAGE_TYPE,
        status="pending",
    )
    db.add(notification)
    db.flush()
    try:
        result = whatsapp_helper.send_text_message(notification.customer_phone, thanks_text(order.customer_name))
        notification.whatsapp_message_id = result.get("message_id", "")
        notification.status = "sent"
        notification.sent_at = _utcnow()
    except Exception as exc:
        notification.status = "failed"
        notification.error_message = str(exc)[:500]
        logger.warning("Review thank-you WhatsApp failed for %s: %s", order.order_number, exc)
    db.commit()
    return notification


def send_reward(db: Session, order: models.Order) -> models.Notification:
    """Create the coupon and WhatsApp it; logged under Notifications so a failed send shows up."""
    coupon = create_reward_coupon(db)
    notification = models.Notification(
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer_name,
        customer_phone=whatsapp_helper.to_e164(order.customer_phone),
        message_type=REWARD_MESSAGE_TYPE,
        status="pending",
        error_message=f"Coupon {coupon.code}",
    )
    db.add(notification)
    db.commit()  # keep the coupon even if the message fails; the admin can see the code
    deliver_reward(notification, order, coupon.code)
    db.commit()
    return notification


def reward_code(notification: models.Notification) -> str:
    """The coupon code recorded on a reward notification ("Coupon THANKS…")."""
    match = re.search(r"Coupon (THANKS[A-Z0-9]+)", notification.error_message or "")
    return match.group(1) if match else ""


def deliver_reward(notification: models.Notification, order: models.Order, code: str) -> None:
    try:
        result = whatsapp_helper.send_text_message(notification.customer_phone, reward_text(order.customer_name, code))
        notification.whatsapp_message_id = result.get("message_id", "")
        notification.status = "sent"
        notification.sent_at = _utcnow()
    except Exception as exc:
        notification.status = "failed"
        notification.error_message = f"Coupon {code}: {exc}"[:500]
        logger.warning("Review reward WhatsApp failed for %s: %s", order.order_number, exc)


def handle_flow_reply(message: Dict[str, Any], store: Store) -> None:
    """Background task for the webhook: own DB session, never raises."""
    db = SessionLocal()
    try:
        save_flow_reply(db, message, store)
    except Exception:
        db.rollback()
        logger.exception("Saving WhatsApp review failed")
    finally:
        db.close()
