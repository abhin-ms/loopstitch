"""Server-side SEO helpers.

The storefront is a single-page app: every URL gets the same index.html, and titles/images
are only set once JavaScript runs. Link previews (WhatsApp, Instagram, Facebook) never run
JavaScript, so product and journal pages are sent with their real title, description, image
and structured data already in the HTML. Shoppers get the same app either way.
"""
import html
import json
import os
import re
from typing import Optional

SITE_URL = os.getenv("SITE_URL", "https://loopstitch.online").rstrip("/")
INDEX_HTML = os.getenv("INDEX_HTML_PATH", "/usr/share/nginx/html/index.html")
BRAND = "Loopstitch Co."


def load_index() -> Optional[str]:
    try:
        with open(INDEX_HTML, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def absolute(url: str) -> str:
    if not url:
        return f"{SITE_URL}/preview.webp"
    return url if url.startswith("http") else f"{SITE_URL}{url}"


def plain(text: str, limit: int = 160) -> str:
    text = re.sub(r"\s+", " ", (text or "")).strip()
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def _set_meta(page: str, attr: str, key: str, value: str) -> str:
    tag = f'<meta {attr}="{key}" content="{html.escape(value, quote=True)}" />'
    pattern = re.compile(rf'<meta\s+{attr}="{re.escape(key)}"\s+content="[^"]*"\s*/?>', re.IGNORECASE)
    if pattern.search(page):
        return pattern.sub(lambda _: tag, page, count=1)
    return page.replace("</head>", f"    {tag}\n  </head>", 1)


def inject(page: str, *, title: str, description: str, url: str, image: str, og_type: str, json_ld: Optional[dict] = None) -> str:
    page = re.sub(r"<title>.*?</title>", lambda _: f"<title>{html.escape(title)}</title>", page, count=1, flags=re.S)
    page = _set_meta(page, "name", "description", description)
    page = _set_meta(page, "property", "og:title", title)
    page = _set_meta(page, "property", "og:description", description)
    page = _set_meta(page, "property", "og:image", image)
    page = _set_meta(page, "property", "og:type", og_type)
    page = _set_meta(page, "property", "og:url", url)
    extra = f'    <link rel="canonical" href="{html.escape(url, quote=True)}" />\n'
    if json_ld:
        # "</" is escaped so text in the data can never close the script tag
        data = json.dumps(json_ld, ensure_ascii=False).replace("</", "<\\/")
        extra += f'    <script type="application/ld+json">{data}</script>\n'
    return page.replace("</head>", extra + "  </head>", 1)


def product_page(page: str, product) -> str:
    colors = list(product.colors or [])
    images = [img.url for c in colors for img in (c.images or [])] or [img.url for img in (product.images or [])]
    in_stock = (product.total_stock or 0) > 0
    title = product.meta_title or f"{product.name} | Unisex Oversized T-Shirt | {BRAND}"
    description = plain(product.meta_description or product.description or f"{product.name}, a unisex oversized tee from {BRAND}.")
    url = f"{SITE_URL}/product/{product.slug}"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "description": description,
        "image": [absolute(u) for u in images[:6]],
        "sku": product.slug,
        "brand": {"@type": "Brand", "name": BRAND},
        "audience": {"@type": "PeopleAudience", "suggestedGender": "unisex"},
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "INR",
            "price": f"{product.price:.2f}",
            "availability": "https://schema.org/InStock" if in_stock else "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
        },
    }
    if colors:
        json_ld["color"] = ", ".join(c.name for c in colors)
    return inject(page, title=title, description=description, url=url, image=absolute(images[0] if images else ""), og_type="product", json_ld=json_ld)


def blog_page(page: str, post) -> str:
    url = f"{SITE_URL}/blog/{post.slug}"
    description = plain(post.excerpt or post.body)
    json_ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": description,
        "image": absolute(post.cover_url),
        "url": url,
        "datePublished": (post.published_at or post.created_at).isoformat(),
        "dateModified": (post.updated_at or post.published_at or post.created_at).isoformat(),
        "author": {"@type": "Organization", "name": BRAND},
        "publisher": {"@type": "Organization", "name": BRAND, "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/preview.webp"}},
    }
    return inject(page, title=f"{post.title} | {BRAND}", description=description, url=url, image=absolute(post.cover_url), og_type="article", json_ld=json_ld)
