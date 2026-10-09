"""
Razorpay Standard Checkout helpers — order creation and payment verification.

Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
"""
from __future__ import annotations

import hashlib
import hmac
import os
from typing import Optional

import razorpay
import razorpay.errors


_client: Optional[razorpay.Client] = None


def get_client() -> razorpay.Client:
    """Return a singleton Razorpay client initialised from env vars."""
    global _client
    if _client is None:
        key_id = os.getenv("RAZORPAY_KEY_ID", "")
        key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
        if not key_id or not key_secret:
            raise RuntimeError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set")
        _client = razorpay.Client(auth=(key_id, key_secret))
    return _client


def get_key_id() -> str:
    """Return the public Razorpay key ID (safe to send to frontend)."""
    return os.getenv("RAZORPAY_KEY_ID", "")


def create_order(
    amount_paise: int,
    currency: str = "INR",
    receipt: str = "",
    notes: Optional[dict] = None,
) -> dict:
    """
    Create a Razorpay order.

    Parameters
    ----------
    amount_paise : int
        Amount in paise (e.g. 19900 for ₹199.00). Must be >= 100.
    currency : str
        Three-letter ISO currency code. Default "INR".
    receipt : str
        Unique receipt id for your reference (e.g. order number).
    notes : dict, optional
        Arbitrary key-value notes attached to the order.

    Returns
    -------
    dict  with keys: id, amount, currency, receipt, status, ...

    Raises
    ------
    razorpay.errors.BadRequestError  on invalid params
    RuntimeError                     on config issues
    """
    if amount_paise < 100:
        raise ValueError("Amount must be at least 100 paise (₹1.00)")

    payload = {
        "amount": amount_paise,
        "currency": currency,
        "receipt": receipt,
    }
    if notes:
        payload["notes"] = notes

    client = get_client()
    return client.order.create(payload)


def verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """
    Verify that the payment signature is authentic.

    Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)

    Returns True if the signature matches, False otherwise.
    """
    key_secret = os.getenv("RAZORPAY_KEY_SECRET", "")
    if not key_secret:
        return False

    payload = f"{razorpay_order_id}|{razorpay_payment_id}"
    expected = hmac.new(
        key_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, razorpay_signature)


def order_payments(razorpay_order_id: str) -> list:
    """All payment attempts on a Razorpay order (each has id, status, amount)."""
    return get_client().order.payments(razorpay_order_id).get("items", [])


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Check X-Razorpay-Signature: HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)."""
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
