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
BRAND = "Loopstitch"


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


def load_pages() -> dict:
    """Titles / copy for the static + landing pages. One JSON file shared with the React app
    (frontend/src/content/pages.json, copied next to this module in the Docker image)."""
    here = os.path.dirname(__file__)
    for path in (os.getenv("SEO_PAGES_PATH", ""), os.path.join(here, "seo_pages.json"),
                 os.path.join(here, "..", "..", "frontend", "src", "content", "pages.json")):
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    return {}


PAGES = load_pages()
ORG_ID = f"{SITE_URL}/#organization"
FALLBACK_STYLE = "max-width:760px;margin:0 auto;padding:96px 20px;font-family:system-ui,sans-serif;line-height:1.6"


def e(text) -> str:
    return html.escape(str(text or ""), quote=True)


def inr(amount: float) -> str:
    return f"₹{amount:,.0f}"


def breadcrumbs(*crumbs) -> dict:
    """crumbs: (name, path) pairs after Home."""
    items = [("Home", "/")] + list(crumbs)
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": f"{SITE_URL}{path}"}
            for i, (name, path) in enumerate(items)
        ],
    }


def inject(page: str, *, title: str, description: str, url: str, image: str, og_type: str,
           json_ld=None, body: str = "") -> str:
    """Fill in the route's <head> and (optionally) put real, crawlable content inside #root.
    React replaces that content with the same page as soon as it starts."""
    page = re.sub(r"<title>.*?</title>", lambda _: f"<title>{html.escape(title)}</title>", page, count=1, flags=re.S)
    page = _set_meta(page, "name", "description", description)
    page = _set_meta(page, "property", "og:title", title)
    page = _set_meta(page, "property", "og:description", description)
    page = _set_meta(page, "property", "og:image", image)
    page = _set_meta(page, "property", "og:type", og_type)
    page = _set_meta(page, "property", "og:url", url)
    page = _set_meta(page, "name", "twitter:title", title)
    page = _set_meta(page, "name", "twitter:description", description)
    page = _set_meta(page, "name", "twitter:image", image)
    extra = f'    <link rel="canonical" href="{html.escape(url, quote=True)}" />\n'
    for block in (json_ld if isinstance(json_ld, list) else [json_ld] if json_ld else []):
        # "</" is escaped so text in the data can never close the script tag
        data = json.dumps(block, ensure_ascii=False).replace("</", "<\\/")
        extra += f'    <script type="application/ld+json">{data}</script>\n'
    page = page.replace("</head>", extra + "  </head>", 1)
    if body:
        page = page.replace('<div id="root"></div>', f'<div id="root"><div id="seo-content" style="{FALLBACK_STYLE}">{body}</div></div>', 1)
    return page


def _paragraphs(text: str) -> str:
    return "".join(f"<p>{e(block.strip())}</p>" for block in re.split(r"\n\s*\n", text or "") if block.strip())


def _product_links(products) -> str:
    if not products:
        return ""
    rows = "".join(
        f'<li><a href="/product/{e(p.slug)}">{e(p.name)}</a> – {inr(p.price)}'
        f'{"" if (p.total_stock or 0) > 0 else " (sold out)"}</li>'
        for p in products
    )
    return f"<ul>{rows}</ul>"


def _page_links(keys) -> str:
    links = "".join(
        f'<li><a href="{e(PAGES[k]["path"])}">{e(PAGES[k].get("breadcrumb") or PAGES[k]["h1"])}</a></li>'
        for k in keys if k in PAGES
    )
    return f"<nav><ul>{links}</ul></nav>" if links else ""


def matching_products(page: dict, products) -> list:
    """Products a landing page shows: names containing one of its keywords, else the whole range.
    (Names only: every description says "machine wash cold", which would match "wash".)"""
    words = [w.lower() for w in page.get("match") or []]
    hits = [p for p in products if any(w in p.name.lower() for w in words)]
    return hits or list(products)


def product_page(page: str, product, with_body: bool = True) -> str:
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
        "sku": f"LS{product.id}",
        "brand": {"@type": "Brand", "name": BRAND},
        "audience": {"@type": "PeopleAudience", "suggestedGender": "unisex"},
        "offers": {
            "@type": "Offer",
            "url": url,
            "priceCurrency": "INR",
            "price": f"{product.price:.2f}",
            "availability": "https://schema.org/InStock" if in_stock else "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
            "seller": {"@id": ORG_ID},
        },
    }
    if colors:
        json_ld["color"] = ", ".join(c.name for c in colors)
    body = ""
    if with_body:
        sizes = sorted({s.size for c in colors for s in (c.sizes or [])} or {s.size for s in (product.sizes or [])})
        was = f" <s>{inr(product.compare_at_price)}</s>" if product.compare_at_price and product.compare_at_price > product.price else ""
        body = (
            f'<nav><a href="/">Home</a> › <a href="/shop">Shop</a></nav>'
            f"<h1>{e(product.name)}</h1>"
            f"<p><strong>{inr(product.price)}</strong>{was} – {'In stock' if in_stock else 'Sold out'}</p>"
            + (f'<img src="{e(absolute(images[0]))}" alt="{e(product.name)} – unisex oversized t-shirt" width="600" height="750" />' if images else "")
            + _paragraphs(product.description)
            + (f"<p>Colours: {e(', '.join(c.name for c in colors))}</p>" if colors else "")
            + (f"<p>Sizes: {e(', '.join(sizes))} · Unisex oversized fit</p>" if sizes else "")
        )
    return inject(page, title=title, description=description, url=url, image=absolute(images[0] if images else ""),
                  og_type="product", json_ld=[json_ld, breadcrumbs(("Shop", "/shop"), (product.name, f"/product/{product.slug}"))], body=body)


def blog_page(page: str, post, with_body: bool = True) -> str:
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
        "publisher": {"@type": "Organization", "name": BRAND, "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/icon-512.png"}},
    }
    body = ""
    if with_body:
        text = re.sub(r"^#{2,3} ", "", post.body or "", flags=re.M)  # headings/bullets as plain lines in the fallback
        body = f'<nav><a href="/">Home</a> › <a href="/blog">Journal</a></nav><h1>{e(post.title)}</h1>' + _paragraphs(text)
    return inject(page, title=f"{post.title} | {BRAND}", description=description, url=url, image=absolute(post.cover_url),
                  og_type="article", json_ld=[json_ld, breadcrumbs(("Journal", "/blog"), (post.title, f"/blog/{post.slug}"))], body=body)


def static_page(page: str, key: str, products=(), posts=(), with_body: bool = True) -> str:
    """Home, shop, customize, faq, about, blog and the keyword landing pages."""
    info = PAGES[key]
    url = f"{SITE_URL}{info['path']}" if info["path"] != "/" else f"{SITE_URL}/"
    # product lists belong on home, shop and the collection pages (not FAQ / about / the custom tool)
    if key in ("home", "shop"):
        shown = list(products)
    elif info.get("landing") and info.get("match"):
        shown = matching_products(info, products)
    else:
        shown = []
    json_ld = []
    if key == "home":
        json_ld.append({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": BRAND,
            "url": f"{SITE_URL}/",
            "publisher": {"@id": ORG_ID},
            "potentialAction": {
                "@type": "SearchAction",
                "target": {"@type": "EntryPoint", "urlTemplate": f"{SITE_URL}/shop?q={{search_term_string}}"},
                "query-input": "required name=search_term_string",
            },
        })
    else:
        json_ld.append(breadcrumbs((info.get("breadcrumb") or info["h1"], info["path"])))
    if shown:
        json_ld.append({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": f"{SITE_URL}/product/{p.slug}", "name": p.name}
                for i, p in enumerate(shown)
            ],
        })
    body = ""
    if with_body:
        body = (
            (f"<p>{e(info['eyebrow'])}</p>" if info.get("eyebrow") else "")
            + f"<h1>{e(info['h1'])}</h1>"
            + "".join(f"<p>{e(t)}</p>" for t in info.get("intro", []))
            + _product_links(shown)
            + "".join(f"<h2>{e(sec['heading'])}</h2>" + "".join(f"<p>{e(t)}</p>" for t in sec["body"]) for sec in info.get("sections", []))
            + ("<ul>" + "".join(f'<li><a href="/blog/{e(post.slug)}">{e(post.title)}</a></li>' for post in posts) + "</ul>" if key == "blog" and posts else "")
            + (f'<p><a href="{e(info["cta"]["to"])}">{e(info["cta"]["label"])}</a></p>' if info.get("cta") else "")
            + _page_links(info.get("links", []))
        )
    return inject(page, title=info["title"], description=info["description"], url=url,
                  image=f"{SITE_URL}/preview.webp", og_type="website", json_ld=json_ld, body=body)
