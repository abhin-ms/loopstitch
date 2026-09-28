"""
Delhivery B2C integration — automatic shipment + pickup for every paid order.

Flow (runs in the background right after Razorpay payment is verified):
  1. Create the shipment in Delhivery  -> AWB (waybill) saved on the order
  2. pickup_date = order date (IST) + DELHIVERY_PICKUP_AFTER_DAYS (default 3),
     skipping Sundays / listed holidays
  3. Make sure a pickup request exists for that date.
     Delhivery allows ONE open pickup per warehouse per day, so the first order
     for a date creates it and later orders for the same date simply ride on it.

If Delhivery refuses a pickup (e.g. date too far ahead, API down) the request is
kept as "failed" and retried automatically every few hours until the date passes.

Environment variables
---------------------
DELHIVERY_TOKEN              API token (Delhivery One -> Settings -> API Setup)   [required]
DELHIVERY_PICKUP_LOCATION    Warehouse name EXACTLY as registered in Delhivery   [required]
DELHIVERY_MODE               "staging" (default) or "live"
DELHIVERY_AUTO               "true" (default) = auto-ship on payment, "false" = manual only
DELHIVERY_PICKUP_AFTER_DAYS  default 3
DELHIVERY_PICKUP_TIME        default 14:00:00
DELHIVERY_SKIP_SUNDAY        default true
DELHIVERY_HOLIDAYS           comma separated YYYY-MM-DD dates with no pickup
DELHIVERY_SHIPPING_MODE      "Surface" (default) or "Express"
DELHIVERY_WEIGHT_PER_ITEM_G  packed weight per tee in grams, default 350
DELHIVERY_SELLER_NAME        default "Loopstitch"
DELHIVERY_HSN_CODE           default 6109 (knitted t-shirts)
"""
import os
import json
import logging
import datetime
from typing import Optional, Tuple
from urllib.parse import urlencode

import httpx
from sqlalchemy import update, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models
from .database import SessionLocal

logger = logging.getLogger(__name__)

IST_OFFSET = datetime.timedelta(hours=5, minutes=30)
TIMEOUT = httpx.Timeout(30.0, connect=10.0)


# ------------------------------------------------------------------ config
def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def token() -> str:
    return _env("DELHIVERY_TOKEN")


def pickup_location() -> str:
    return _env("DELHIVERY_PICKUP_LOCATION")


def mode() -> str:
    return "live" if _env("DELHIVERY_MODE", "staging").lower() in ("live", "production", "prod") else "staging"


def base_url() -> str:
    override = _env("DELHIVERY_BASE_URL")   # optional, e.g. for a local mock server
    if override:
        return override.rstrip("/")
    return "https://track.delhivery.com" if mode() == "live" else "https://staging-express.delhivery.com"


def is_configured() -> bool:
    return bool(token() and pickup_location())


def auto_enabled() -> bool:
    return is_configured() and _env("DELHIVERY_AUTO", "true").lower() == "true"


def _pickup_after_days() -> int:
    try:
        return max(0, int(_env("DELHIVERY_PICKUP_AFTER_DAYS", "3")))
    except ValueError:
        return 3


def _pickup_time() -> str:
    return _env("DELHIVERY_PICKUP_TIME", "14:00:00") or "14:00:00"


def _holidays() -> set:
    out = set()
    for part in _env("DELHIVERY_HOLIDAYS").split(","):
        part = part.strip()
        if part:
            try:
                out.add(datetime.date.fromisoformat(part))
            except ValueError:
                logger.warning("Ignoring bad DELHIVERY_HOLIDAYS date: %s", part)
    return out


def config_summary() -> dict:
    return {
        "configured": is_configured(),
        "auto": auto_enabled(),
        "mode": mode(),
        "pickup_location": pickup_location(),
        "pickup_after_days": _pickup_after_days(),
        "pickup_time": _pickup_time(),
        "skip_sunday": _env("DELHIVERY_SKIP_SUNDAY", "true").lower() == "true",
    }


def _headers(json_body: bool = True) -> dict:
    h = {"Authorization": f"Token {token()}", "Accept": "application/json"}
    h["Content-Type"] = "application/json" if json_body else "application/x-www-form-urlencoded"
    return h


# ------------------------------------------------------------------ helpers
def today_ist() -> datetime.date:
    return (datetime.datetime.utcnow() + IST_OFFSET).date()


def pickup_date_for(order_created_utc: Optional[datetime.datetime]) -> datetime.date:
    """Order date in IST + N days, pushed past Sundays/holidays. Never earlier than today."""
    base = (order_created_utc + IST_OFFSET).date() if order_created_utc else today_ist()
    d = max(base + datetime.timedelta(days=_pickup_after_days()), today_ist())
    skip_sunday = _env("DELHIVERY_SKIP_SUNDAY", "true").lower() == "true"
    holidays = _holidays()
    for _ in range(14):
        if (skip_sunday and d.weekday() == 6) or d in holidays:
            d += datetime.timedelta(days=1)
        else:
            break
    return d


def _clean(text: str, limit: int = 250) -> str:
    """Delhivery chokes on some special characters in address/name fields."""
    text = (text or "").replace("\n", " ").replace("\r", " ")
    for ch in "&#%;\\\"'":
        text = text.replace(ch, " ")
    return " ".join(text.split())[:limit]


def _phone10(phone: str) -> str:
    digits = "".join(c for c in (phone or "") if c.isdigit())
    return digits[-10:]


def _error_text(resp: httpx.Response) -> str:
    try:
        data = resp.json()
    except ValueError:
        return f"HTTP {resp.status_code}: {resp.text[:400]}"
    return f"HTTP {resp.status_code}: {json.dumps(data)[:600]}"


# ------------------------------------------------------------------ raw API calls
def api_create_shipment(order: models.Order, items: list) -> Tuple[Optional[str], str]:
    """Create one shipment. Returns (awb, "") on success or (None, error)."""
    qty = sum(i.quantity for i in items) or 1
    try:
        per_item = int(_env("DELHIVERY_WEIGHT_PER_ITEM_G", "350"))
    except ValueError:
        per_item = 350
    names = ", ".join(f"{i.product_name} {i.size} x{i.quantity}" for i in items)

    is_cod = order.payment_method == "cod"
    cod_amount = round(max((order.total or 0) - (order.cod_advance_paid or 0), 0), 2) if is_cod else 0

    shipment = {
        "name": _clean(order.customer_name, 100),
        "add": _clean(order.shipping_address),
        "pin": "".join(c for c in (order.pincode or "") if c.isdigit()),
        "city": _clean(order.city, 60),
        "state": _clean(order.state, 60),
        "country": "India",
        "phone": _phone10(order.customer_phone),
        "order": order.order_number,
        "payment_mode": "COD" if is_cod and cod_amount > 0 else "Prepaid",
        "cod_amount": cod_amount,
        "total_amount": round(order.total or 0, 2),
        "products_desc": _clean(names, 200),
        "hsn_code": _env("DELHIVERY_HSN_CODE", "6109"),
        "quantity": str(qty),
        "weight": str(per_item * qty),                 # grams
        "shipment_length": "30",                       # cm
        "shipment_width": "25",
        "shipment_height": str(min(3 + 2 * (qty - 1), 30)),
        "seller_name": _clean(_env("DELHIVERY_SELLER_NAME", "Loopstitch"), 60),
        "shipping_mode": _env("DELHIVERY_SHIPPING_MODE", "Surface") or "Surface",
        "address_type": "home",
        "waybill": "",
        "order_date": (order.created_at or datetime.datetime.utcnow()).strftime("%Y-%m-%d %H:%M:%S"),
    }
    payload = {"shipments": [shipment], "pickup_location": {"name": pickup_location()}}
    body = urlencode({"format": "json", "data": json.dumps(payload)})

    try:
        resp = httpx.post(f"{base_url()}/api/cmu/create.json", headers=_headers(json_body=False),
                          content=body, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        return None, f"Network error: {exc}"

    try:
        data = resp.json()
    except ValueError:
        return None, _error_text(resp)

    packages = data.get("packages") or []
    pkg = packages[0] if packages else {}
    awb = str(pkg.get("waybill") or "").strip()
    if resp.status_code < 300 and awb and str(pkg.get("status", "")).lower() == "success":
        return awb, ""

    remarks = pkg.get("remarks") or data.get("rmk") or data.get("error") or data
    if isinstance(remarks, list):
        remarks = "; ".join(str(r) for r in remarks if r)
    return None, str(remarks)[:600] or _error_text(resp)


def api_request_pickup(pickup_date: datetime.date, count: int) -> Tuple[str, str, str]:
    """Returns (result, pickup_id, message) where result is 'scheduled', 'exists' or 'failed'."""
    payload = {
        "pickup_location": pickup_location(),
        "pickup_date": pickup_date.isoformat(),
        "pickup_time": _pickup_time(),
        "expected_package_count": max(int(count or 1), 1),
    }
    try:
        resp = httpx.post(f"{base_url()}/fm/request/new/", headers=_headers(), json=payload, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        return "failed", "", f"Network error: {exc}"

    try:
        data = resp.json()
    except ValueError:
        data = {}
    text = json.dumps(data).lower() if data else resp.text.lower()

    pickup_id = str(data.get("pickup_id") or data.get("id") or "") if isinstance(data, dict) else ""
    if resp.status_code < 300 and pickup_id:
        return "scheduled", pickup_id, ""
    # Delhivery answers with pr_exist / "already exists" when this date is already booked
    if (isinstance(data, dict) and data.get("pr_exist")) or "already" in text or "pr_exist" in text:
        return "exists", pickup_id, "Pickup already booked for this date"
    if resp.status_code < 300 and isinstance(data, dict) and not data.get("error"):
        return "scheduled", pickup_id, ""
    return "failed", "", _error_text(resp)


def api_cancel_shipment(awb: str) -> Tuple[bool, str]:
    try:
        resp = httpx.post(f"{base_url()}/api/p/edit", headers=_headers(),
                          json={"waybill": awb, "cancellation": "true"}, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        return False, f"Network error: {exc}"
    try:
        data = resp.json()
    except ValueError:
        return False, _error_text(resp)
    status_ok = data.get("status") is True or str(data.get("status")).lower() == "true"
    mentions_cancel = "cancel" in json.dumps(data).lower() and not data.get("error")
    ok = resp.status_code < 300 and (status_ok or mentions_cancel)
    return ok, "" if ok else _error_text(resp)


def api_label_link(awb: str) -> Tuple[Optional[str], str]:
    """Packing slip (shipping label) PDF link for an AWB."""
    try:
        resp = httpx.get(f"{base_url()}/api/p/packing_slip", headers=_headers(),
                         params={"wbns": awb, "pdf": "true"}, timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        return None, f"Network error: {exc}"
    try:
        data = resp.json()
    except ValueError:
        return None, _error_text(resp)
    for pkg in data.get("packages") or []:
        link = pkg.get("pdf_download_link") or pkg.get("pdf_link")
        if link:
            return link, ""
    return None, _error_text(resp)


# ------------------------------------------------------------------ pickup bookkeeping
def _count_for_date(db: Session, d: datetime.date) -> int:
    return db.query(models.Order).filter(
        models.Order.pickup_date == d, models.Order.shipment_status == "created"
    ).count()


def _submit_pickup(db: Session, row: models.PickupRequest) -> models.PickupRequest:
    row.expected_count = max(_count_for_date(db, row.pickup_date), 1)
    row.pickup_time = _pickup_time()
    row.pickup_location = pickup_location()
    row.attempts = (row.attempts or 0) + 1
    result, pickup_id, message = api_request_pickup(row.pickup_date, row.expected_count)
    if result in ("scheduled", "exists"):
        row.status = "scheduled"
        row.delhivery_pickup_id = pickup_id or row.delhivery_pickup_id or ""
        row.error = message if result == "exists" else ""
        logger.info("Delhivery pickup %s for %s (count=%s) %s",
                    result, row.pickup_date, row.expected_count, pickup_id)
    else:
        row.status = "failed"
        row.error = message[:1000]
        logger.warning("Delhivery pickup failed for %s: %s", row.pickup_date, message)
    db.commit()
    return row


def ensure_pickup(db: Session, d: datetime.date) -> models.PickupRequest:
    """Make sure a pickup request exists for date d (one per day)."""
    row = db.query(models.PickupRequest).filter(models.PickupRequest.pickup_date == d).first()
    if row and row.status == "scheduled":
        row.expected_count = _count_for_date(db, d)   # local count only; agent collects all manifested parcels
        db.commit()
        return row
    if not row:
        row = models.PickupRequest(pickup_date=d, status="queued", expected_count=0)
        db.add(row)
        try:
            db.commit()
        except IntegrityError:          # another worker created it at the same moment
            db.rollback()
            row = db.query(models.PickupRequest).filter(models.PickupRequest.pickup_date == d).first()
            if row.status == "scheduled":
                return row
    return _submit_pickup(db, row)


def retry_due_pickups() -> int:
    """Re-submit failed/queued pickups whose date hasn't passed. Safe to run from several workers."""
    if not is_configured():
        return 0
    db = SessionLocal()
    try:
        rows = db.query(models.PickupRequest).filter(
            models.PickupRequest.status.in_(["failed", "queued"]),
            models.PickupRequest.pickup_date >= today_ist(),
        ).all()
        for row in rows:
            if _count_for_date(db, row.pickup_date) == 0:
                continue   # every order for that day was cancelled
            _submit_pickup(db, row)
        return len(rows)
    except Exception:
        logger.exception("Delhivery pickup retry failed")
        return 0
    finally:
        db.close()


# ------------------------------------------------------------------ main entry points
def ship_order(db: Session, order_id: int, force: bool = False) -> models.Order:
    """Create the shipment (if not already) and make sure the pickup is booked. Idempotent.
    force=True (admin retry) also re-tries an order stuck in "creating" after a server restart."""
    retryable = [None, "failed"] if not force else [None, "failed", "cancelled", "creating"]
    status_filter = or_(models.Order.shipment_status.is_(None),
                        models.Order.shipment_status.in_([s for s in retryable if s]))
    # Atomically claim the order so a double payment-verify can't create two shipments
    claimed = db.execute(
        update(models.Order)
        .where(models.Order.id == order_id)
        .where(status_filter)
        .where(models.Order.status.in_([models.OrderStatus.paid, models.OrderStatus.shipped]))
        .values(shipment_status="creating", shipment_error="")
    ).rowcount
    db.commit()

    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise ValueError("Order not found")
    if not claimed:
        # already created / in progress / order not paid — just make sure the pickup is there
        if order.shipment_status == "created" and order.pickup_date:
            ensure_pickup(db, order.pickup_date)
        return order

    items = db.query(models.OrderItem).filter(models.OrderItem.order_id == order.id).all()
    try:
        awb, error = api_create_shipment(order, items)
    except Exception as exc:          # never leave the order stuck in "creating"
        awb, error = None, f"Unexpected error: {exc}"

    if not awb:
        order.shipment_status = "failed"
        order.shipment_error = error
        db.commit()
        logger.warning("Delhivery shipment failed for %s: %s", order.order_number, error)
        return order

    order.delhivery_awb = awb
    order.shipment_status = "created"
    order.shipment_error = ""
    order.pickup_date = pickup_date_for(order.created_at)
    db.commit()
    logger.info("Delhivery shipment created for %s: AWB %s, pickup %s", order.order_number, awb, order.pickup_date)

    ensure_pickup(db, order.pickup_date)
    db.refresh(order)
    return order


def cancel_order_shipment(db: Session, order_id: int) -> Tuple[bool, str]:
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order or not order.delhivery_awb or order.shipment_status != "created":
        return False, "No active Delhivery shipment on this order"
    ok, error = api_cancel_shipment(order.delhivery_awb)
    if ok:
        order.shipment_status = "cancelled"
        order.shipment_error = ""
    else:
        order.shipment_error = f"Cancel failed: {error}"[:1000]
    db.commit()
    if ok and order.pickup_date:
        row = db.query(models.PickupRequest).filter(models.PickupRequest.pickup_date == order.pickup_date).first()
        if row:
            row.expected_count = _count_for_date(db, order.pickup_date)
            db.commit()
    return ok, error


def ship_order_in_background(order_id: int) -> None:
    """BackgroundTasks entry point — opens its own DB session."""
    if not auto_enabled():
        return
    db = SessionLocal()
    try:
        ship_order(db, order_id)
    except Exception:
        logger.exception("Delhivery auto-ship crashed for order id %s", order_id)
    finally:
        db.close()


def cancel_in_background(order_id: int) -> None:
    if not is_configured():
        return
    db = SessionLocal()
    try:
        ok, error = cancel_order_shipment(db, order_id)
        if not ok:
            logger.warning("Delhivery cancel for order id %s: %s", order_id, error)
    except Exception:
        logger.exception("Delhivery cancel crashed for order id %s", order_id)
    finally:
        db.close()
