"""
WhatsApp alert to the store owners for every newly confirmed order.

An order counts as confirmed when its online payment (or COD advance) is received,
or when a cash-on-delivery order is placed with nothing to pay online. Unpaid or
abandoned checkouts never trigger an alert.

Each owner number gets at most one alert per order, and a failed alert never affects
checkout or payment: the outcome is logged as a Notification ("admin_new_order"),
visible and resendable in Admin -> Notifications.
"""
import datetime
import logging
from typing import List

from sqlalchemy.orm import Session

from . import models
from . import whatsapp as whatsapp_helper
from .database import SessionLocal

logger = logging.getLogger(__name__)

MESSAGE_TYPE = "admin_new_order"


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def build_params(db: Session, order: models.Order) -> List[str]:
    """The five template values for this order: name, item count, amount, payment, time."""
    quantities = db.query(models.OrderItem.quantity).filter(models.OrderItem.order_id == order.id).all()
    return whatsapp_helper.build_admin_order_params(
        customer_name=order.customer_name,
        item_count=sum(q for (q,) in quantities),
        total=order.total,
        payment=whatsapp_helper.payment_label(order),
        ordered_at=order.created_at,
    )


def deliver(notification: models.Notification, params: List[str]) -> None:
    """Send one alert and record the outcome on its Notification row. Never raises; does not commit."""
    try:
        result = whatsapp_helper.send_admin_order_alert(notification.customer_phone, params)
        notification.whatsapp_message_id = result.get("message_id", "")
        notification.status = "sent"
        notification.error_message = ""
        notification.sent_at = _utcnow()
    except Exception as exc:  # any API or network failure is recorded, never raised
        notification.status = "failed"
        notification.error_message = str(exc)[:500]
        logger.warning("Owner alert to %s for order %s failed: %s",
                       notification.customer_phone, notification.order_number, exc)


def notify_new_order(db: Session, order: models.Order) -> None:
    """Alert every owner number about a confirmed order, once per number. Never raises."""
    if not whatsapp_helper.is_configured():
        return
    try:
        params = build_params(db, order)
    except Exception:
        logger.exception("Could not build the owner alert for order %s", order.order_number)
        return

    for number in whatsapp_helper.ADMIN_ALERT_NUMBERS:
        phone = whatsapp_helper.to_e164(number)
        try:
            already_sent = db.query(models.Notification.id).filter(
                models.Notification.order_id == order.id,
                models.Notification.message_type == MESSAGE_TYPE,
                models.Notification.customer_phone == phone,
            ).first()
            if already_sent:
                continue
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
            deliver(notification, params)
            db.commit()  # per number, so one bad row can't undo another number's record
        except Exception:
            db.rollback()
            logger.exception("Could not record the owner alert to %s for order %s", phone, order.order_number)


def notify_new_order_by_id(order_id: int) -> None:
    """Background-task entry point (runs after the response is sent), with its own session."""
    db = SessionLocal()
    try:
        order = db.query(models.Order).filter(models.Order.id == order_id).first()
        if order:
            notify_new_order(db, order)
    finally:
        db.close()
