"""
WhatsApp Business Cloud API helpers (Meta Cloud API v23.0).

Sends pre-approved template messages for order confirmations.
"""
import os
import logging
from typing import Dict, Any, List, Optional

import httpx

logger = logging.getLogger(__name__)

PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v23.0")

# Template names/language exactly as approved in WhatsApp Manager (change in the server env, no code change needed)
OTP_TEMPLATE = os.getenv("WHATSAPP_OTP_TEMPLATE", "otp_verification")
ORDER_TEMPLATE = os.getenv("WHATSAPP_ORDER_TEMPLATE", "order_confirm")
LAUNCH_TEMPLATE = os.getenv("WHATSAPP_LAUNCH_TEMPLATE", "store_launch")
WELCOME_TEMPLATE = os.getenv("WHATSAPP_WELCOME_TEMPLATE", "subscribe_confirm")
# order_shipped has a static "Track order" link button, so only body variables are sent
SHIPPED_TEMPLATE = os.getenv("WHATSAPP_SHIPPED_TEMPLATE", "order_shipped")
TEMPLATE_LANG = os.getenv("WHATSAPP_TEMPLATE_LANG", "en")

BASE_URL = f"https://graph.facebook.com/{API_VERSION}"


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }


def is_configured() -> bool:
    return bool(PHONE_NUMBER_ID and ACCESS_TOKEN)


def send_template_message(
    phone: str,
    template_name: str,
    language_code: str,
    body_params: List[str],
    is_authentication: bool = False,
) -> Dict[str, Any]:
    """
    Send a pre-approved WhatsApp template message.

    Args:
        phone: Recipient phone in E.164 format (e.g. "+916238860673")
        template_name: Name of the approved Meta template (e.g. "order_confirm")
        language_code: BCP-47 language code (e.g. "en", "en_US")
        body_params: Ordered list of template body variables
        is_authentication: If True, sends as Authentication template (for OTP)

    Returns:
        Dict with "message_id" (wamid.xxx) on success.

    Raises:
        Exception on API failure.
    """
    if not is_configured():
        raise RuntimeError("WhatsApp is not configured — missing PHONE_NUMBER_ID or ACCESS_TOKEN")

    url = f"{BASE_URL}/{PHONE_NUMBER_ID}/messages"

    if is_authentication:
        components: List[Dict[str, Any]] = [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": body_params[0] if body_params else ""}
                ],
            },
            {
                "type": "button",
                "sub_type": "url",
                "index": 0,
                "parameters": [
                    {"type": "text", "text": body_params[0] if body_params else ""}
                ],
            },
        ]
    else:
        parameters: List[Dict[str, str]] = [
            {"type": "text", "text": param} for param in body_params
        ]
        components = [
            {
                "type": "body",
                "parameters": parameters,
            }
        ]

    to_digits = "".join(c for c in phone if c.isdigit())

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_digits,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "policy": "deterministic",
                "code": language_code,
            },
            "components": components,
        },
    }

    with httpx.Client(timeout=15.0) as client:
        resp = client.post(url, json=payload, headers=_headers())
        data = resp.json()

    if resp.status_code not in (200, 201):
        error_msg = data.get("error", {}).get("message", resp.text)
        raise RuntimeError(f"WhatsApp API error ({resp.status_code}): {error_msg}")

    messages = data.get("messages", [])
    if not messages:
        raise RuntimeError("WhatsApp API returned no messages in response")

    return {"message_id": messages[0].get("id", "")}


def build_order_confirm_params(
    customer_name: str,
    order_number: str,
    items_summary: str,
    total: str,
    payment_method: str,
) -> List[str]:
    """
    Build the ordered body parameter list for the order_confirm template.

    Template variables:
      {{1}} = customer first name
      {{2}} = order number
      {{3}} = items summary (e.g. "2 items — Ronin Wave Tee × 1, Elite Soldier Tee × 1")
      {{4}} = total amount (e.g. "₹999")
      {{5}} = payment method (e.g. "Online (Razorpay)" or "COD — 10% paid")
    """
    first_name = customer_name.strip().split()[0] if customer_name.strip() else "there"
    return [
        first_name,
        order_number,
        items_summary,
        total,
        payment_method,
    ]


def send_otp_message(phone: str, otp_code: str) -> Dict[str, Any]:
    """
    Send an OTP verification code via WhatsApp template.

    Template: WHATSAPP_OTP_TEMPLATE (Authentication category)
    Variables: code = 6-digit OTP code
    """
    return send_template_message(
        phone=phone,
        template_name=OTP_TEMPLATE,
        language_code=TEMPLATE_LANG,
        body_params=[otp_code],
        is_authentication=True,
    )


def to_e164(phone: str) -> str:
    """'9876543210' / '91 98765 43210' -> '+919876543210' (Indian numbers by default)."""
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10:
        return "+91" + digits
    return "+" + digits


def build_shipped_params(customer_name: str, order_number: str, courier: str, awb: str) -> List[str]:
    """
    order_shipped template variables:
      {{1}} = customer first name   {{2}} = order number
      {{3}} = delivery partner      {{4}} = tracking id (AWB)
    """
    first_name = customer_name.strip().split()[0] if customer_name.strip() else "there"
    return [first_name, order_number, courier, awb]


def send_shipped_message(phone: str, customer_name: str, order_number: str, courier: str, awb: str) -> Dict[str, Any]:
    """Tell the customer their parcel is booked with the courier and give them the tracking id."""
    return send_template_message(
        phone=phone,
        template_name=SHIPPED_TEMPLATE,
        language_code=TEMPLATE_LANG,
        body_params=build_shipped_params(customer_name, order_number, courier, awb),
    )


def send_launch_message(phone: str, template: str = "") -> Dict[str, Any]:
    """Subscriber message (sign-up confirmation or 1-minute launch reminder). The templates
    have no variables — subscribers leave only a number — and static link buttons."""
    if not is_configured():
        raise RuntimeError("WhatsApp is not configured — missing PHONE_NUMBER_ID or ACCESS_TOKEN")
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": "".join(c for c in phone if c.isdigit()),
        "type": "template",
        "template": {"name": template or LAUNCH_TEMPLATE, "language": {"policy": "deterministic", "code": TEMPLATE_LANG}},
    }
    with httpx.Client(timeout=15.0) as client:
        resp = client.post(f"{BASE_URL}/{PHONE_NUMBER_ID}/messages", json=payload, headers=_headers())
        data = resp.json()
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"WhatsApp API error ({resp.status_code}): {data.get('error', {}).get('message', resp.text)}")
    messages = data.get("messages", [])
    return {"message_id": messages[0].get("id", "") if messages else ""}
