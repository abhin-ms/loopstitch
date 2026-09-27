"""
Buy X Get Y discount engine.

All pricing decisions happen here so both the quote endpoint and order
creation apply identical logic. Server-side only — the client can display
results but never dictates prices.
"""
import datetime
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from . import models


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------- settings
def get_setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(models.Setting).filter(models.Setting.key == key).first()
    return row.value if row else default


def get_setting_float(db: Session, key: str, default: float) -> float:
    raw = get_setting(db, key)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return float(default)


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.query(models.Setting).filter(models.Setting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(models.Setting(key=key, value=value))


def get_shipping_config(db: Session) -> Dict[str, float]:
    """Delivery fee + free-shipping threshold from editable admin settings."""
    return {
        "delivery_fee": get_setting_float(db, "delivery_fee", 45.0),
        "free_shipping_threshold": get_setting_float(db, "free_shipping_threshold", 1000.0),
    }


def shipping_fee_for(subtotal: float, config: Dict[str, float]) -> float:
    """Free shipping is judged on the PRE-discount merchandise value."""
    return 0.0 if subtotal >= config["free_shipping_threshold"] else config["delivery_fee"]


# ---------------------------------------------------------------- offers
def active_offers(db: Session) -> List[models.Offer]:
    now = _utcnow()
    rows = db.query(models.Offer).filter(models.Offer.is_active == True).all()  # noqa: E712
    result = []
    for offer in rows:
        if offer.starts_at is not None and offer.starts_at > now:
            continue
        if offer.ends_at is not None and offer.ends_at < now:
            continue
        result.append(offer)
    return result


def parse_product_ids(raw: str) -> List[int]:
    ids = []
    for part in (raw or "").split(","):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    return ids


def offer_label(offer: models.Offer) -> str:
    base = f"Buy {offer.buy_quantity} Get {offer.get_quantity}"
    if offer.scope == models.OfferScope.category and offer.category:
        base += f" · {offer.category}"
    elif offer.scope == models.OfferScope.products:
        base += " · selected items"
    return base


def _eligible_lines(lines: List[dict], offer: models.Offer) -> List[dict]:
    scope = offer.scope
    if scope == models.OfferScope.all:
        return list(lines)
    if scope == models.OfferScope.category:
        return [l for l in lines if l["product"].category == offer.category]
    if scope == models.OfferScope.products:
        allowed = set(parse_product_ids(offer.product_ids))
        return [l for l in lines if l["product_id"] in allowed]
    return []


def compute_best_offer(
    db: Session,
    lines: List[dict],
) -> Optional[Dict]:
    """
    lines: [{"product_id", "size", "quantity", "unit_price", "product"}]
           product must be the models.Product instance.

    Returns the best single offer application:
               {offer_id, label, discount, line_discounts: {line_key: amount}}
    or None when nothing applies.
    """
    best: Optional[Dict] = None

    try:
        offers = active_offers(db)
    except Exception:
        return None

    for offer in offers:
        try:
            eligible = _eligible_lines(lines, offer)
            free = free_units_discount(eligible, offer.buy_quantity, offer.get_quantity)
            if not free:
                continue
            discount, line_discounts = free["discount"], free["line_discounts"]

            candidate = {
                "offer_id": offer.id,
                "label": offer.name or offer_label(offer),
                "discount": round(discount, 2),
                "line_discounts": line_discounts,
            }
            if best is None or candidate["discount"] > best["discount"]:
                best = candidate
        except Exception:
            continue

    return best


# ---------------------------------------------------------------- shared buy-X-get-Y maths
def free_units_discount(lines: List[dict], buy: int, get: int) -> Optional[Dict]:
    """Every complete set of (buy + get) units makes `get` units free; the CHEAPEST units are the free ones.

    e.g. Buy 2 Get 1 with 5 units -> 1 complete set of 3 -> the single cheapest unit is free.
    Returns {"discount", "line_discounts", "free_units"} or None when nothing is free.
    """
    if buy < 1 or get < 1:
        return None
    total_units = sum(l["quantity"] for l in lines)
    free_units = (total_units // (buy + get)) * get
    if free_units <= 0:
        return None
    units = sorted(
        ((l["unit_price"], l.get("line_key", (l["product_id"], l["size"]))) for l in lines for _ in range(l["quantity"])),
        key=lambda u: u[0],
    )
    discount = 0.0
    line_discounts: Dict[tuple, float] = {}
    for price, key in units[:free_units]:
        discount += price
        line_discounts[key] = line_discounts.get(key, 0.0) + price
    return {"discount": round(discount, 2), "line_discounts": line_discounts, "free_units": free_units}


# ---------------------------------------------------------------- coupons
def coupon_type(coupon) -> str:
    return (getattr(coupon, "discount_type", None) or "percent").lower()


def coupon_label(coupon) -> str:
    """Human description, e.g. "10% off", "₹100 off", "Buy 2 Get 1 Free"."""
    kind = coupon_type(coupon)
    if kind == "flat":
        return f"₹{(coupon.flat_amount or 0):g} off"
    if kind == "bxgy":
        return f"Buy {coupon.buy_quantity} Get {coupon.get_quantity} Free"
    return f"{(coupon.discount_percent or 0):g}% off"


def check_coupon(db: Session, code: str, subtotal: float = 0.0):
    """Look up a code and check dates, usage and minimum order.

    Returns (coupon, None) when usable, or (None, reason) with a message shoppers can act on.
    """
    code = (code or "").strip().upper()
    if not code:
        return None, None
    coupon = db.query(models.Coupon).filter(models.Coupon.code == code).first()
    if not coupon or not coupon.is_active:
        return None, f"The code {code} isn't valid."
    now = _utcnow()
    if coupon.starts_at and coupon.starts_at > now:
        return None, f"The code {code} isn't active yet."
    if coupon.ends_at and coupon.ends_at < now:
        return None, f"The code {code} has expired."
    if (coupon.max_uses or 0) > 0 and (coupon.times_used or 0) >= coupon.max_uses:
        return None, f"The code {code} has reached its usage limit."
    if subtotal < (coupon.min_order or 0):
        return None, f"Add ₹{(coupon.min_order - subtotal):,.0f} more to use {code} (minimum order ₹{coupon.min_order:,.0f})."
    return coupon, None


def validate_coupon(db: Session, code: str, subtotal: float = 0.0) -> Optional[Dict]:
    """Backwards-compatible wrapper: coupon info dict, or None if it can't be used."""
    coupon, _reason = check_coupon(db, code, subtotal)
    if not coupon:
        return None
    return {"coupon_id": coupon.id, "code": coupon.code, "discount_percent": coupon.discount_percent or 0,
            "discount_type": coupon_type(coupon), "label": coupon_label(coupon)}


def apply_coupon_discount(subtotal_after_bogo: float, coupon_info: Optional[Dict]) -> float:
    """Percentage coupon on the offer-discounted subtotal (kept for older callers)."""
    if not coupon_info:
        return 0.0
    return round(subtotal_after_bogo * (coupon_info.get("discount_percent") or 0) / 100.0, 2)


# ---------------------------------------------------------------- full cart pricing
def price_cart(db: Session, lines: List[dict], subtotal: float, coupon_code: Optional[str]) -> Dict:
    """Single source of truth for discounts, used by the live quote AND order creation.

    Rules:
      * The best automatic offer (Buy X Get Y) applies on its own.
      * A % or ₹ coupon stacks on top of it, on the already-discounted amount.
      * A Buy X Get Y coupon does NOT stack with an automatic Buy X Get Y offer (that would make
        the same tees free twice); whichever saves the shopper more is used.
      * Free items are always the cheapest units in the cart.
    """
    best = compute_best_offer(db, lines)
    result = {
        "offer": best, "offer_discount": best["discount"] if best else 0.0, "offer_label": best["label"] if best else "",
        "coupon": None, "coupon_discount": 0.0, "coupon_label": "", "coupon_message": "", "coupon_line_discounts": {},
    }
    coupon, reason = check_coupon(db, coupon_code, subtotal)
    if not coupon:
        result["coupon_message"] = reason or ""
        return result

    kind = coupon_type(coupon)
    label = coupon_label(coupon)
    after_offer = round(subtotal - result["offer_discount"], 2)
    if kind == "bxgy":
        free = free_units_discount(lines, coupon.buy_quantity or 0, coupon.get_quantity or 0)
        if not free:
            need = (coupon.buy_quantity or 0) + (coupon.get_quantity or 0)
            have = sum(l["quantity"] for l in lines)
            more = max(need - have, 1)
            result["coupon_message"] = f"Add {more} more tee{'s' if more > 1 else ''} to use {coupon.code} ({label})."
            return result
        if free["discount"] <= result["offer_discount"]:
            result["coupon_message"] = f"The current offer already saves you at least as much as {coupon.code}, so we kept that."
            return result
        # coupon wins: it replaces the automatic offer
        result.update(offer=None, offer_discount=0.0, offer_label="",
                      coupon=coupon, coupon_discount=free["discount"], coupon_line_discounts=free["line_discounts"])
    elif kind == "flat":
        amount = round(min(coupon.flat_amount or 0, after_offer), 2)
        result.update(coupon=coupon, coupon_discount=amount)
    else:
        result.update(coupon=coupon, coupon_discount=round(after_offer * (coupon.discount_percent or 0) / 100.0, 2))
    result["coupon_label"] = label
    return result
