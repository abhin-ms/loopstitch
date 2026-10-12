"""
Responsive WebP copies of product photos.

The original upload (JPG / PNG) is kept as the image's main URL — Meta's catalogue and link
previews want that format. Next to it we store smaller WebP versions named
`<same name>_w640.webp` and `<same name>_w1280.webp`; the storefront offers them through
`srcset`, so phones download a fraction of the bytes.

Existing photos:   python -m app.imaging      (safe to re-run; skips images already done)
"""
import io
import logging
import os
from typing import Dict, Optional

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

WIDTHS = (640, 1280)
QUALITY = 80


def webp_variants(contents: bytes) -> Dict[int, bytes]:
    """{width: webp bytes}. Never upscales: a narrow original is just re-encoded at its own width."""
    with Image.open(io.BytesIO(contents)) as img:
        img = ImageOps.exif_transpose(img)  # phone photos: apply the rotation before stripping EXIF
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "transparency" in img.info else "RGB")
        out = {}
        for width in WIDTHS:
            copy = img.copy()
            if copy.width > width:
                copy = copy.resize((width, round(copy.height * width / copy.width)), Image.LANCZOS)
            buf = io.BytesIO()
            copy.save(buf, "WEBP", quality=QUALITY, method=5)
            out[width] = buf.getvalue()
        return out


def variant_name(original_name: str, width: int) -> str:
    return f"{os.path.splitext(original_name)[0]}_w{width}.webp"


def store_variants(contents: bytes, original_name: str, original_url: str, store) -> Optional[str]:
    """Create + store the WebP copies beside the original. Returns the URL base the storefront
    appends `_w640.webp` to, or None if anything went wrong (the image then simply has no srcset).
    `store(bytes, filename, content_type) -> url` is the same function that saved the original."""
    base = os.path.splitext(original_url)[0]
    try:
        for width, data in webp_variants(contents).items():
            url = store(data, variant_name(original_name, width), "image/webp")
            if url != f"{base}_w{width}.webp":  # e.g. cloud upload failed and it fell back to local disk
                return None
        return base
    except Exception:
        logger.exception("Could not create WebP copies of %s", original_name)
        return None


def backfill() -> None:
    """Create WebP copies for product images uploaded before this existed."""
    import httpx
    from . import models
    from .database import SessionLocal
    from .main import UPLOADS_ROOT, store_upload

    db = SessionLocal()
    done = failed = 0
    try:
        for image in db.query(models.ProductImage).filter(models.ProductImage.webp_base.is_(None)).all():
            try:
                if image.url.startswith("http"):
                    resp = httpx.get(image.url, timeout=30.0, follow_redirects=True)
                    resp.raise_for_status()
                    contents = resp.content
                else:
                    with open(os.path.join(os.path.dirname(UPLOADS_ROOT), image.url.lstrip("/")), "rb") as f:
                        contents = f.read()
                name = os.path.basename(image.url.split("?")[0])
                base = store_variants(contents, name, image.url, lambda data, fname, ctype: store_upload(data, fname, ctype, "products"))
                if not base:
                    raise RuntimeError("variants were not stored next to the original")
                image.webp_base = base
                db.commit()
                done += 1
                print(f"  + {name}")
            except Exception as exc:
                db.rollback()
                failed += 1
                print(f"  ! {image.url}: {exc}")
    finally:
        db.close()
    print(f"WebP copies created for {done} image(s), {failed} failed.")


if __name__ == "__main__":
    backfill()
