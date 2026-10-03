"""
Automatic Delhivery pickups.

1. When an order's payment is confirmed, schedule_pickup() sets its pickup
   date: +3 days (standard) / +5 days (custom), never on a Sunday.
2. Once a day (default 18:00 IST) run_pickup_batch() takes every paid order
   due by the next pickup day, creates its Delhivery shipment (tracking id),
   books ONE pickup for the warehouse for that day, then WhatsApps each
   customer their tracking id.
3. Every few hours sync_tracking() moves orders to shipped / delivered.

Runs as its own process (see supervisord.conf) so the 2 web workers can't
book the same pickup twice:

    python -m app.courier
"""
import datetime
import logging
import time
from typing import Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from . import delhivery, models
from . import whatsapp as whatsapp_helper
from .database import SessionLocal
from .offers import set_setting

logger = logging.getLogger(__name__)

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
SYNC_EVERY = datetime.timedelta(hours=3)
TICK_SECONDS = 300
# Delhivery statuses that mean the parcel hasn't left the warehouse yet
PRE_PICKUP = {"", "manifested", "not picked", "open", "scheduled", "pickup scheduled"}


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def today_ist() -> datetime.date:
    return datetime.datetime.now(IST).date()


def skip_sunday(day: datetime.date) -> datetime.date:
    # Delhivery doesn't do pickups on Sundays
    return day + datetime.timedelta(days=1) if day.weekday() == 6 else day


def next_pickup_day(today: Optional[datetime.date] = None) -> datetime.date:
    return skip_sunday((today or today_ist()) + datetime.timedelta(days=1))


def _int(raw: Dict[str, str], key: str, default: int) -> int:
    try:
        return int(float(raw.get(key, default)))
    except (TypeError, ValueError):
        return default


def load_config(db: Session) -> Dict:
    raw = {r.key: r.value for r in db.query(models.Setting).all()}
    try:
        length, width, height = (int(float(x)) for x in raw.get("ship_box_cm", "30x25x5").lower().split("x"))
    except ValueError:
        length, width, height = 30, 25, 5
    return {
        "auto": raw.get("ship_auto_pickup", "true") == "true",
        "location": raw.get("ship_pickup_location", "").strip(),
        "days_standard": _int(raw, "ship_days_standard", 3),
        "days_custom": _int(raw, "ship_days_custom", 5),
        "weight_grams": _int(raw, "ship_weight_grams", 250),
        "box": (length, width, height),
        "run_hour": _int(raw, "ship_run_hour", 18),
        "last_batch": raw.get("ship_last_batch", ""),
        "last_sync": raw.get("ship_last_sync", ""),
    }


def schedule_pickup(db: Session, order: models.Order) -> None:
    """Set the pickup date once, when the order is confirmed. Never same-day."""
    if order.pickup_date:
        return
    cfg = load_config(db)
    days = cfg["days_custom"] if order.order_type == models.OrderType.custom else cfg["days_standard"]
    order.pickup_date = skip_sunday(today_ist() + datetime.timedelta(days=max(days, 1)))


def _shipment_payload(order: models.Order, cfg: Dict) -> Dict:
    pieces = sum(i.quantity for i in order.items) or 1
    length, width, height = cfg["box"]
    is_cod = order.payment_method == "cod"
    cod_due = round((order.total or 0) - (order.cod_advance_paid or 0), 2) if is_cod else 0
    desc = ", ".join(f"{i.product_name} ({i.size}) x{i.quantity}" for i in order.items)[:200] or "Apparel"
    phone = "".join(c for c in order.customer_phone if c.isdigit())[-10:]
    return {
        "name": order.customer_name,
        "add": order.shipping_address,
        "pin": order.pincode,
        "city": order.city,
        "state": order.state,
        "country": "India",
        "phone": phone,
        "order": order.order_number,
        "payment_mode": "COD" if is_cod else "Prepaid",
        "cod_amount": str(cod_due),
        "total_amount": str(round(order.total or 0, 2)),
        "products_desc": desc,
        "quantity": str(pieces),
        "weight": str(pieces * cfg["weight_grams"]),
        "shipment_length": str(length),
        "shipment_width": str(width),
        "shipment_height": str(height),
        "shipping_mode": "Surface",
        "seller_name": "Loopstitch Co.",
        "waybill": "",
    }


def send_shipped_notification(db: Session, order: models.Order) -> None:
    """WhatsApp the customer their courier + tracking id (once per order)."""
    if order.shipped_msg_sent or not order.awb or not whatsapp_helper.is_configured():
        return
    phone = whatsapp_helper.to_e164(order.customer_phone)
    notification = models.Notification(
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer_name,
        customer_phone=phone,
        message_type="order_shipped",
        status="pending",
    )
    db.add(notification)
    db.flush()
    try:
        result = whatsapp_helper.send_shipped_message(
            phone, order.customer_name, order.order_number, order.courier_name or delhivery.COURIER_NAME, order.awb
        )
        notification.whatsapp_message_id = result.get("message_id", "")
        notification.status = "sent"
        notification.sent_at = _utcnow()
        order.shipped_msg_sent = True
    except Exception as exc:
        notification.status = "failed"
        notification.error_message = str(exc)[:500]
        logger.warning("Shipped WhatsApp failed for %s: %s", order.order_number, exc)
    db.commit()


def run_pickup_batch(db: Session, pickup_day: Optional[datetime.date] = None) -> Dict:
    """Create shipments + book one pickup for every paid order due by pickup_day."""
    pickup_day = pickup_day or next_pickup_day()
    if not delhivery.is_configured():
        raise RuntimeError("Delhivery is not configured (DELHIVERY_API_TOKEN missing)")
    cfg = load_config(db)
    if not cfg["location"]:
        raise RuntimeError("Set the Delhivery pickup location name in Admin → Settings first")

    orders: List[models.Order] = (
        db.query(models.Order)
        .options(joinedload(models.Order.items))
        .filter(
            models.Order.status == models.OrderStatus.paid,
            models.Order.pickup_date.isnot(None),
            models.Order.pickup_date <= pickup_day,
        )
        .all()
    )
    orders = [o for o in orders if not o.pickup_request_id]

    failed = 0
    for order in orders:
        if order.awb:
            continue
        try:
            order.awb = delhivery.create_shipment(_shipment_payload(order, cfg), cfg["location"])
            order.courier_name = delhivery.COURIER_NAME
            order.courier_status = "Manifested"
            order.courier_error = None
        except Exception as exc:
            failed += 1
            order.courier_error = str(exc)[:500]
            logger.warning("Delhivery shipment failed for %s: %s", order.order_number, exc)
        db.commit()

    ready = [o for o in orders if o.awb]
    if ready:
        try:
            pickup_id = delhivery.request_pickup(cfg["location"], pickup_day.isoformat(), len(ready))
        except Exception as exc:
            for order in ready:
                order.courier_error = f"Pickup request failed: {exc}"[:500]
            db.commit()
            raise
        for order in ready:
            order.pickup_request_id = pickup_id
            order.pickup_date = pickup_day
            order.courier_error = None
        db.commit()
        for order in ready:
            send_shipped_notification(db, order)

    return {"pickup_date": pickup_day.isoformat(), "booked": len(ready), "failed": failed}


def sync_tracking(db: Session) -> int:
    """Pull courier status for open shipments; advance order status. Returns orders updated."""
    orders = (
        db.query(models.Order)
        .filter(
            models.Order.awb.isnot(None),
            models.Order.awb != "",
            models.Order.status.in_([models.OrderStatus.paid, models.OrderStatus.shipped]),
        )
        .all()
    )
    if not orders:
        return 0
    statuses = delhivery.track([o.awb for o in orders])
    changed = 0
    for order in orders:
        status = statuses.get(order.awb)
        if status is None:
            continue
        if status != order.courier_status:
            order.courier_status = status
            changed += 1
        lowered = status.strip().lower()
        if lowered == "delivered":
            order.status = models.OrderStatus.delivered
        elif lowered not in PRE_PICKUP and order.status == models.OrderStatus.paid:
            order.status = models.OrderStatus.shipped
    db.commit()
    return changed


def cancel_for_order(order: models.Order) -> None:
    """Called when admin cancels an order that already has a tracking id."""
    if not order.awb or not delhivery.is_configured() or order.status == models.OrderStatus.delivered:
        return
    try:
        delhivery.cancel_shipment(order.awb)
        order.courier_status = "Cancelled"
        order.courier_error = None
    except Exception as exc:
        order.courier_error = f"Courier cancel failed: {exc}"[:500]


def tick() -> None:
    db = SessionLocal()
    try:
        if not delhivery.is_configured():
            return
        cfg = load_config(db)
        now = datetime.datetime.now(IST)
        today = now.date().isoformat()

        if cfg["auto"] and now.hour >= cfg["run_hour"] and cfg["last_batch"] != today:
            set_setting(db, "ship_last_batch", today)  # mark first: a failing batch retries tomorrow, not every 5 min
            db.commit()
            try:
                logger.info("Delhivery pickup batch: %s", run_pickup_batch(db))
            except Exception as exc:
                logger.warning("Delhivery pickup batch failed: %s", exc)

        last_sync = None
        if cfg["last_sync"]:
            try:
                last_sync = datetime.datetime.fromisoformat(cfg["last_sync"])
            except ValueError:
                pass
        if last_sync is None or _utcnow() - last_sync >= SYNC_EVERY:
            set_setting(db, "ship_last_sync", _utcnow().isoformat(timespec="seconds"))
            db.commit()
            try:
                logger.info("Delhivery tracking sync: %s orders updated", sync_tracking(db))
            except Exception as exc:
                logger.warning("Delhivery tracking sync failed: %s", exc)
    finally:
        db.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s courier %(levelname)s %(message)s")
    logger.info("Courier worker started (Delhivery configured: %s)", delhivery.is_configured())
    while True:
        try:
            tick()
        except Exception:
            logger.exception("Courier worker tick crashed")
        time.sleep(TICK_SECONDS)


if __name__ == "__main__":
    main()
