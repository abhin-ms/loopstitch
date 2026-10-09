"""
Order payment + stock lifecycle — one place for every status change that
touches money or stock, shared by the API (main.py) and the courier worker.

  * Stock is reserved when an order is created (main.create_order).
  * It is given back when the order is cancelled, or when an online / COD-advance
    order is never paid within ORDER_PAYMENT_TIMEOUT_MINUTES (expire_unpaid_orders).
  * An order only becomes "paid" through mark_paid(), which insists the Razorpay
    payment belongs to the Razorpay order we created for THIS order (with the
    amount the server calculated), and that a payment is never reused.
"""
import datetime
import logging
import os
from typing import List, Optional

from sqlalchemy.orm import Session

from . import models
from . import razorpay as razorpay_helper

logger = logging.getLogger(__name__)

PAYMENT_TIMEOUT_MINUTES = int(os.getenv("ORDER_PAYMENT_TIMEOUT_MINUTES", "30"))

CLOSED = (models.OrderStatus.cancelled, models.OrderStatus.failed)


class PaymentMismatch(Exception):
    """The payment does not belong to this order (or was already used elsewhere)."""


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def amount_due(order: models.Order) -> float:
    """What the shopper must pay online: the COD advance, or the full total."""
    if order.payment_method == "cod":
        return round(order.cod_advance_paid or 0.0, 2)
    return round(order.total or 0.0, 2)


def amount_due_paise(order: models.Order) -> int:
    return int(round(amount_due(order) * 100))


# ---------------------------------------------------------------- stock
def _size_row(db: Session, item: models.OrderItem) -> Optional[models.ProductSize]:
    q = db.query(models.ProductSize).filter(
        models.ProductSize.product_id == item.product_id,
        models.ProductSize.size == item.size,
    )
    if item.color_id is not None:
        q = q.filter(models.ProductSize.color_id == item.color_id)
    else:
        q = q.filter(models.ProductSize.color_id.is_(None))
    return q.with_for_update().first()


def _stock_items(order: models.Order) -> List[models.OrderItem]:
    # custom tees are printed to order: no stock to hold
    return [i for i in order.items if i.product_id is not None and not i.is_custom]


def release_stock(db: Session, order: models.Order) -> None:
    """Put the order's units back on the shelf and give back its coupon use."""
    for item in _stock_items(order):
        row = _size_row(db, item)
        if row is not None:  # size may have been deleted in admin since
            row.stock = (row.stock or 0) + item.quantity
    if order.coupon_id and (order.coupon_discount or 0) > 0:
        db.query(models.Coupon).filter(
            models.Coupon.id == order.coupon_id, models.Coupon.times_used > 0
        ).update({models.Coupon.times_used: models.Coupon.times_used - 1}, synchronize_session=False)


def reserve_stock(db: Session, order: models.Order) -> bool:
    """Take the order's units again (used when a closed order comes back). False if any size ran out."""
    rows = []
    for item in _stock_items(order):
        row = _size_row(db, item)
        if row is None or (row.stock or 0) < item.quantity:
            return False
        rows.append((row, item.quantity))
    for row, qty in rows:
        row.stock -= qty
    if order.coupon_id and (order.coupon_discount or 0) > 0:
        db.query(models.Coupon).filter(models.Coupon.id == order.coupon_id).update(
            {models.Coupon.times_used: models.Coupon.times_used + 1}, synchronize_session=False
        )
    return True


def close_order(db: Session, order: models.Order, status: models.OrderStatus) -> None:
    """Cancel / fail an order, returning its stock exactly once."""
    if order.status not in CLOSED:
        release_stock(db, order)
    order.status = status


def reopen_order(db: Session, order: models.Order, status: models.OrderStatus) -> bool:
    """Move a cancelled / failed order back to an active status. False if stock is gone."""
    if order.status in CLOSED and not reserve_stock(db, order):
        return False
    order.status = status
    return True


# ---------------------------------------------------------------- payment
def mark_paid(db: Session, order: models.Order, rp_order_id: str, payment_id: str, signature: str = "") -> str:
    """Record a Razorpay payment for this order.

    Returns "paid" (newly confirmed), "already_paid" (repeat call) or
    "needs_refund" (money arrived for an order that can no longer be filled).
    Raises PaymentMismatch when the payment is not for this order.
    """
    if not order.razorpay_order_id or rp_order_id != order.razorpay_order_id:
        raise PaymentMismatch("This payment is not for this order")

    reused = db.query(models.Order.id).filter(
        models.Order.razorpay_payment_id == payment_id, models.Order.id != order.id
    ).first()
    if reused:
        raise PaymentMismatch("This payment was already used for another order")

    if order.razorpay_payment_id == payment_id and order.status not in CLOSED + (models.OrderStatus.pending,):
        return "already_paid"
    if order.status not in CLOSED + (models.OrderStatus.pending,):
        # paid/shipped/delivered with a different payment id: keep the first one
        logger.warning("Second payment %s for already-paid order %s — refund it", payment_id, order.order_number)
        return "needs_refund"

    order.razorpay_payment_id = payment_id
    order.razorpay_signature = signature or order.razorpay_signature

    if order.status == models.OrderStatus.cancelled:
        order.courier_error = "Payment received after the order was cancelled — refund it in Razorpay."
        logger.warning("Payment %s arrived for cancelled order %s", payment_id, order.order_number)
        return "needs_refund"
    if order.status == models.OrderStatus.failed and not reserve_stock(db, order):
        order.courier_error = "Paid after the payment window closed and the stock is gone — refund it in Razorpay."
        logger.warning("Late payment %s for expired order %s, stock gone", payment_id, order.order_number)
        return "needs_refund"

    from . import courier  # local import: courier imports this module
    order.status = models.OrderStatus.paid
    courier.schedule_pickup(db, order)
    return "paid"


def expire_unpaid_orders(db: Session, timeout_minutes: int = PAYMENT_TIMEOUT_MINUTES) -> int:
    """Fail orders still waiting for an online payment after the timeout and free their stock.

    Before failing one, ask Razorpay whether it was actually paid (shopper closed the
    tab before our /verify call, webhook not set up) and confirm it instead.
    """
    cutoff = _utcnow() - datetime.timedelta(minutes=timeout_minutes)
    stale = (
        db.query(models.Order)
        .filter(models.Order.status == models.OrderStatus.pending, models.Order.created_at < cutoff)
        .with_for_update(skip_locked=True)
        .all()
    )
    expired = 0
    for order in stale:
        if amount_due(order) <= 0:
            continue  # COD with no advance: nothing to pay online, admin handles it
        captured = _captured_payment(order)
        if captured == "unknown":
            continue  # Razorpay unreachable: try again next tick rather than fail a paid order
        if captured:
            try:
                if mark_paid(db, order, order.razorpay_order_id, captured, "reconciled") == "paid":
                    logger.info("Order %s was paid (found on Razorpay) — confirmed", order.order_number)
                continue
            except PaymentMismatch:
                logger.warning("Razorpay payment %s for %s already used elsewhere", captured, order.order_number)
        close_order(db, order, models.OrderStatus.failed)
        expired += 1
        logger.info("Order %s unpaid after %s min — stock released", order.order_number, timeout_minutes)
    db.commit()
    return expired


def _captured_payment(order: models.Order):
    """Payment id if Razorpay has a captured payment for this order, None if not, "unknown" on error."""
    if not order.razorpay_order_id:
        return None
    try:
        payments = razorpay_helper.order_payments(order.razorpay_order_id)
    except Exception as exc:
        logger.warning("Could not check Razorpay for %s: %s", order.order_number, exc)
        return "unknown"
    for p in payments:
        if p.get("status") == "captured" and int(p.get("amount", 0)) == amount_due_paise(order):
            return p.get("id")
        if p.get("status") == "authorized":
            return "unknown"  # money is on hold; wait for capture instead of failing the order
    return None
