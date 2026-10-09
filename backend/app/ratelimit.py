"""
Small in-process rate limiter for the few endpoints that can be abused
(OTP send/verify, admin login, public uploads).

Limits are counted per worker process, so with `uvicorn --workers 2` the real
ceiling is up to 2x the numbers below. That is fine as a brake on bots; the
hard money guard for WhatsApp OTPs is the database-backed hourly cap in main.py.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_lock = threading.Lock()
_hits: dict = defaultdict(deque)


def client_ip(request: Request) -> str:
    """Best guess at the shopper's IP behind Cloudflare -> aaPanel nginx -> container nginx."""
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def limit(request: Request, bucket: str, max_hits: int, window_seconds: int) -> None:
    """Raise 429 once this IP has hit `bucket` more than `max_hits` times in the window."""
    key = (bucket, client_ip(request))
    now = time.monotonic()
    with _lock:
        hits = _hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= max_hits:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again in a few minutes.")
        hits.append(now)
        # keep memory bounded: drop idle keys now and then
        if len(_hits) > 50_000:
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                _hits.pop(k, None)


def reset() -> None:
    """Clear all counters (used by tests)."""
    with _lock:
        _hits.clear()
