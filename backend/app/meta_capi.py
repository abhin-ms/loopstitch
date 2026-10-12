"""
Meta Conversions API: reports a confirmed order to Meta from the server, so the sale is
counted even when the shopper's browser blocks the Pixel (ad blockers, iOS privacy).

The browser Pixel sends the same Purchase with eventID = order number; Meta drops the
duplicate. Only hashed email / phone leave the server.

    META_PIXEL_ID          the Pixel (dataset) id — also given to the storefront
    META_CAPI_TOKEN        Events Manager → Settings → Conversions API → Generate access token
    META_TEST_EVENT_CODE   optional, shows the events under "Test events" while you check them
"""
import hashlib
import logging
import os
import threading
import time
from typing import Dict, Optional

import httpx

logger = logging.getLogger(__name__)

PIXEL_ID = os.getenv("META_PIXEL_ID", "1716589266071799")
CAPI_TOKEN = os.getenv("META_CAPI_TOKEN", "")
TEST_EVENT_CODE = os.getenv("META_TEST_EVENT_CODE", "")
GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v21.0")
SITE_URL = os.getenv("SITE_URL", "https://loopstitch.online").rstrip("/")


def is_configured() -> bool:
    return bool(PIXEL_ID and CAPI_TOKEN)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


def _phone(raw: str) -> str:
    digits = "".join(c for c in raw or "" if c.isdigit())
    return "91" + digits if len(digits) == 10 else digits  # Meta wants the country code, no "+"


def variant_id(product_id, color_id, size) -> str:
    """Same id as the catalogue feed and the browser Pixel (frontend/src/utils/pixel.js)."""
    return f"LS{product_id}-{color_id or 0}-{size}"


def purchase_event(order, client: Optional[Dict[str, str]] = None) -> dict:
    """Purchase payload for an order. `client` carries what the browser sent with /verify
    (ip, user agent, _fbp / _fbc cookies) when the confirmation came from the shopper."""
    client = client or {}
    user_data = {"country": [_sha256("in")]}
    if order.customer_email:
        user_data["em"] = [_sha256(order.customer_email)]
    if _phone(order.customer_phone):
        user_data["ph"] = [_sha256(_phone(order.customer_phone))]
    if order.pincode:
        user_data["zp"] = [_sha256(order.pincode)]
    for key, field in (("ip", "client_ip_address"), ("user_agent", "client_user_agent"), ("fbp", "fbp"), ("fbc", "fbc")):
        if client.get(key):
            user_data[field] = client[key]
    contents = [
        {"id": variant_id(i.product_id, i.color_id, i.size), "quantity": i.quantity, "item_price": i.unit_price}
        for i in order.items if i.product_id and not i.is_custom
    ]
    return {
        "event_name": "Purchase",
        "event_time": int(time.time()),
        "event_id": order.order_number,  # the browser Pixel uses the same id -> deduplicated
        "action_source": "website",
        "event_source_url": f"{SITE_URL}/order/confirm",
        "user_data": user_data,
        "custom_data": {
            "currency": "INR",
            "value": round(order.total or 0, 2),
            "content_type": "product",
            "content_ids": [c["id"] for c in contents],
            "contents": contents,
            "num_items": sum(i.quantity for i in order.items),
            "order_id": order.order_number,
        },
    }


def _post(event: dict) -> None:
    body = {"data": [event]}
    if TEST_EVENT_CODE:
        body["test_event_code"] = TEST_EVENT_CODE
    try:
        resp = httpx.post(f"https://graph.facebook.com/{GRAPH_VERSION}/{PIXEL_ID}/events",
                          params={"access_token": CAPI_TOKEN}, json=body, timeout=10.0)
        if resp.status_code >= 400:
            logger.warning("Meta CAPI rejected %s: %s", event.get("event_id"), resp.text[:300])
    except Exception as exc:
        logger.warning("Meta CAPI send failed for %s: %s", event.get("event_id"), exc)


def send_purchase(order, client: Optional[Dict[str, str]] = None) -> None:
    """Fire-and-forget: never slows down or breaks the payment confirmation."""
    if not is_configured():
        return
    try:
        event = purchase_event(order, client)  # built now, while the order is still loaded
    except Exception:
        logger.exception("Could not build Meta purchase event for %s", getattr(order, "order_number", "?"))
        return
    threading.Thread(target=_post, args=(event,), daemon=True).start()
