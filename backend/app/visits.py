"""Where a visit came from and what it was on, for Admin → Visitors.

Everything is worked out from what the browser already sends (its user-agent, the page it
came from, ?utm_source / click ids in the link) and stored as anonymous daily totals:
no IP addresses, no cookies, nothing that identifies a person.
"""
import re
from urllib.parse import urlparse

DEVICES = ("Mobile", "Tablet", "Computer")

_TABLET = re.compile(r"ipad|tablet|playbook|silk|kindle|sm-t\d|tab\b", re.I)
_MOBILE = re.compile(r"mobi|iphone|ipod|android|windows phone|opera mini", re.I)

# first match wins; checked against utm_source and the referring site's host
_SOURCES = [
    ("Instagram", re.compile(r"instagram|^ig$")),
    ("Facebook", re.compile(r"facebook|^fb$|fb\.com|fb\.me|messenger")),
    ("WhatsApp", re.compile(r"whatsapp|wa\.me")),
    ("Google", re.compile(r"google")),
    ("YouTube", re.compile(r"youtube|youtu\.be")),
    ("Other search", re.compile(r"bing\.|duckduckgo|yahoo\.|yandex|brave\.com")),
]
OWN_HOSTS = ("loopstitch.online", "localhost", "127.0.0.1")


def device(user_agent: str) -> str:
    ua = user_agent or ""
    if _TABLET.search(ua) or ("android" in ua.lower() and "mobi" not in ua.lower()):
        return "Tablet"
    return "Mobile" if _MOBILE.search(ua) else "Computer"


def _named(text: str) -> str:
    return next((name for name, pattern in _SOURCES if pattern.search(text)), "")


def source(user_agent: str = "", referrer: str = "", utm_source: str = "", click_id: str = "") -> str:
    """Instagram, Facebook, WhatsApp, Google, YouTube, Other search, Other website or Direct."""
    ua = user_agent or ""
    # links opened inside the Instagram / Facebook apps say so in the user-agent
    if "Instagram" in ua:
        return "Instagram"
    if re.search(r"FBAN|FBAV|FB_IAB", ua):
        return "Facebook"
    tagged = _named((utm_source or "").strip().lower())
    if tagged:
        return tagged
    try:
        host = (urlparse(referrer or "").hostname or "").lower()
    except ValueError:
        host = ""
    if host.endswith(OWN_HOSTS):
        host = ""
    if _named(host):
        return _named(host)
    if click_id == "fbclid":
        return "Facebook / Instagram ad"
    if click_id == "gclid":
        return "Google"
    if utm_source or host:
        return "Other website"
    return "Direct"
