"""
Delhivery B2C (Express) API helpers.

Flow per order: create_shipment() manifests it and returns the waybill (AWB /
tracking id); request_pickup() books one courier visit per warehouse per day
for all packages manifested for that date.

Configure via env (never commit the token):
    DELHIVERY_API_TOKEN   production or staging API token
    DELHIVERY_BASE_URL    https://track.delhivery.com (prod, default)
                          https://staging-express.delhivery.com (staging)
"""
import json
import logging
import os
from typing import Any, Dict, List

import httpx

logger = logging.getLogger(__name__)

API_TOKEN = os.getenv("DELHIVERY_API_TOKEN", "")
BASE_URL = os.getenv("DELHIVERY_BASE_URL", "https://track.delhivery.com").rstrip("/")
PICKUP_TIME = os.getenv("DELHIVERY_PICKUP_TIME", "11:00:00")
COURIER_NAME = "Delhivery"


def is_configured() -> bool:
    return bool(API_TOKEN)


def _headers(json_body: bool = False) -> Dict[str, str]:
    h = {"Authorization": f"Token {API_TOKEN}", "Accept": "application/json"}
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def _json(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        raise RuntimeError(f"Delhivery returned non-JSON ({resp.status_code}): {resp.text[:300]}")


def create_shipment(shipment: Dict[str, Any], pickup_location: str) -> str:
    """Manifest one shipment and return its waybill. Raises RuntimeError with Delhivery's reason on failure."""
    payload = {"shipments": [shipment], "pickup_location": {"name": pickup_location}}
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{BASE_URL}/api/cmu/create.json",
            data={"format": "json", "data": json.dumps(payload)},
            headers=_headers(),
        )
    data = _json(resp)
    packages = data.get("packages") or []
    pkg = packages[0] if packages else {}
    waybill = pkg.get("waybill") or ""
    if resp.status_code >= 400 or not waybill or str(pkg.get("status", "")).lower() == "fail":
        remarks = pkg.get("remarks") or data.get("rmk") or data
        raise RuntimeError(f"Shipment creation failed: {remarks}")
    return str(waybill)


def request_pickup(pickup_location: str, pickup_date: str, package_count: int) -> str:
    """
    Book a pickup (one per warehouse per date). Returns the pickup id.
    If a pickup already exists for that date, Delhivery collects every
    manifested package anyway, so that counts as success.
    """
    body = {
        "pickup_location": pickup_location,
        "pickup_date": pickup_date,          # YYYY-MM-DD
        "pickup_time": PICKUP_TIME,          # HH:MM:SS
        "expected_package_count": package_count,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(f"{BASE_URL}/fm/request/new/", json=body, headers=_headers(json_body=True))
    data = _json(resp)
    if isinstance(data, dict):
        if data.get("pickup_id"):
            return str(data["pickup_id"])
        if data.get("pr_exist"):
            existing = (data.get("data") or {}).get("pickup_id") if isinstance(data.get("data"), dict) else None
            return str(existing or "existing")
    raise RuntimeError(f"Pickup request failed ({resp.status_code}): {data}")


def track(waybills: List[str]) -> Dict[str, str]:
    """Return {waybill: status text} e.g. 'Manifested', 'In Transit', 'Delivered'."""
    out: Dict[str, str] = {}
    for i in range(0, len(waybills), 50):  # API accepts up to 50 per call
        chunk = waybills[i:i + 50]
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(
                f"{BASE_URL}/api/v1/packages/json/",
                params={"waybill": ",".join(chunk)},
                headers=_headers(),
            )
        data = _json(resp)
        for item in (data.get("ShipmentData") or []) if isinstance(data, dict) else []:
            shipment = item.get("Shipment") or {}
            awb = str(shipment.get("AWB") or "")
            status = (shipment.get("Status") or {}).get("Status") or ""
            if awb:
                out[awb] = status
    return out


def cancel_shipment(waybill: str) -> None:
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{BASE_URL}/api/p/edit",
            json={"waybill": waybill, "cancellation": "true"},
            headers=_headers(json_body=True),
        )
    data = _json(resp)
    if resp.status_code >= 400 or (isinstance(data, dict) and data.get("status") is False):
        raise RuntimeError(f"Cancel failed: {data}")


def label_url(waybill: str) -> str:
    """Shipping label (packing slip) PDF link for printing."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{BASE_URL}/api/p/packing_slip",
            params={"wbns": waybill, "pdf": "true"},
            headers=_headers(),
        )
    data = _json(resp)
    packages = (data.get("packages") or []) if isinstance(data, dict) else []
    link = packages[0].get("pdf_download_link") if packages else ""
    if not link:
        raise RuntimeError(f"Label not available: {data}")
    return link
