import csv
import hmac
import io
import json
import os
import re
import secrets
import uuid
import logging
import datetime
from typing import List, Optional

from app import gcs

logger = logging.getLogger(__name__)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

from fastapi import BackgroundTasks, FastAPI, Depends, HTTPException, UploadFile, File, Form, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, HTMLResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, case, func, or_
from sqlalchemy.exc import IntegrityError

from . import models, schemas, auth
from .database import engine, get_db, SessionLocal
from .offers import compute_best_offer, get_shipping_config, set_setting, shipping_fee_for, validate_coupon, apply_coupon_discount, check_coupon, coupon_label, price_cart
from . import razorpay as razorpay_helper
from . import whatsapp as whatsapp_helper
from . import delhivery as delhivery_helper
from . import courier
from . import launch_alerts
from . import mailer
from . import meta_capi
from . import review_requests
from . import imaging
from . import visits as visits_helper
from . import customer_auth
from . import seo
from . import ratelimit
from . import order_lifecycle
from . import owner_alerts

models.Base.metadata.create_all(bind=engine)


def _ensure_coupon_columns() -> None:
    """Existing databases: add the Buy-X-Get-Y / flat-amount coupon columns if missing (safe to repeat)."""
    import sqlalchemy as sa
    wanted = {"discount_type": "VARCHAR(20) DEFAULT 'percent'", "flat_amount": "FLOAT DEFAULT 0",
              "buy_quantity": "INTEGER DEFAULT 0", "get_quantity": "INTEGER DEFAULT 0"}
    tables = {"coupons": wanted, "otps": {"attempts": "INTEGER DEFAULT 0"}}
    try:
        with engine.begin() as conn:
            for table, columns in tables.items():
                existing = {c["name"] for c in sa.inspect(conn).get_columns(table)}
                for name, ddl in columns.items():
                    if name not in existing:
                        conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                        logging.getLogger(__name__).info("added %s.%s", table, name)
    except Exception:
        logging.getLogger(__name__).exception("Could not add missing columns; run migrate.py")


_ensure_coupon_columns()

app = FastAPI(title="Loopstitch API", version="1.0.0")

# CORS - allow the storefront + local dev to call the API
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,https://loopstitch.online,https://www.loopstitch.online").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "products")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")), name="uploads")

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


UPLOADS_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


def store_upload(contents: bytes, fname: str, content_type: str, subdir: str) -> str:
    """Save an uploaded file and return its public URL.

    Uses Google Cloud Storage when it is configured. If that fails (wrong bucket, permissions,
    network), the file is kept on this server instead and the error is logged, so a shopper's
    upload is never lost because of a storage problem.
    """
    if os.getenv("GCS_BUCKET_NAME") and os.getenv("GCS_SERVICE_ACCOUNT_B64"):
        try:
            return gcs.upload_to_gcs(contents, fname, content_type=content_type)
        except Exception:
            logger.exception("Cloud storage upload failed for %s; saving on local disk instead", fname)
    folder = os.path.join(UPLOADS_ROOT, subdir)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, fname), "wb") as f:
        f.write(contents)
    return f"/uploads/{subdir}/{fname}"


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def unique_slug(db: Session, base: str, exclude_id: Optional[int] = None) -> str:
    slug = base or "product"
    counter = 1
    while True:
        q = db.query(models.Product).filter(models.Product.slug == slug)
        if exclude_id is not None:
            q = q.filter(models.Product.id != exclude_id)
        if not q.first():
            return slug
        counter += 1
        slug = f"{base}-{counter}"


def product_load_options():
    return (
        joinedload(models.Product.images),
        joinedload(models.Product.sizes),
        joinedload(models.Product.colors).joinedload(models.ProductColor.images),
        joinedload(models.Product.colors).joinedload(models.ProductColor.sizes),
    )


# ============================================================
# HEALTH
# ============================================================
@app.get("/api/health")
def health():
    return {"status": "ok", "brand": "Loopstitch"}


# ============================================================
# ADMIN AUTH  (hidden route — no signup endpoint exists at all)
# ============================================================
REPORT_KEEP_DAYS = 90  # cart and login logs older than this are deleted


def _log_login(db: Session, request: Request, kind: str, who: str, ok: bool, detail: str) -> None:
    """Admin → Accounts login log. Never lets a logging problem break the login itself."""
    try:
        db.add(models.LoginEvent(
            kind=kind, who=(who or "")[:150], ok=ok, detail=detail, ip=ratelimit.client_ip(request)[:64],
            device=visits_helper.device(request.headers.get("user-agent", "")),
        ))
        db.query(models.LoginEvent).filter(
            models.LoginEvent.created_at < _utcnow() - datetime.timedelta(days=REPORT_KEEP_DAYS)
        ).delete(synchronize_session=False)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("login log failed: %s", exc)


@app.post("/api/admin/login", response_model=schemas.TokenResponse)
def admin_login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    ratelimit.limit(request, "admin_login", max_hits=10, window_seconds=15 * 60)
    admin = db.query(models.Admin).filter(models.Admin.username == payload.username).first()
    if not admin or not auth.verify_password(payload.password, admin.hashed_password):
        _log_login(db, request, "admin", payload.username, False, "Wrong username or password")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    _log_login(db, request, "admin", admin.username, True, "Logged in")
    token = auth.create_access_token({"sub": admin.username, "role": "admin"})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/api/admin/me")
def admin_me(current: models.Admin = Depends(auth.get_current_admin)):
    return {"username": current.username}


# ============================================================
# CUSTOMER AUTH  (OTP login via WhatsApp)
# ============================================================
OTP_HOURLY_CAP = int(os.getenv("OTP_HOURLY_CAP", "200"))  # store-wide ceiling on WhatsApp OTP sends


def _normalize_phone(raw: str) -> str:
    """Keep digits only and use the last 10 (Indian mobile)."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    return digits[-10:] if len(digits) > 10 else digits


@app.post("/api/auth/send-otp", response_model=schemas.SendOTPResponse)
def send_otp(payload: schemas.SendOTPRequest, request: Request, db: Session = Depends(get_db)):
    """Generate a 6-digit OTP and send it via WhatsApp."""
    phone = _normalize_phone(payload.phone)
    if len(phone) != 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    ratelimit.limit(request, "send_otp", max_hits=5, window_seconds=10 * 60)
    hour_ago = _utcnow() - datetime.timedelta(hours=1)
    if db.query(models.OTP).filter(models.OTP.created_at >= hour_ago).count() >= OTP_HOURLY_CAP:
        logger.warning("OTP hourly cap (%s) reached; refusing new OTPs", OTP_HOURLY_CAP)
        raise HTTPException(status_code=429, detail="Login is busy right now. Please try again shortly.")

    # Per phone: one code every 45 s and at most 5 an hour (used or not), so
    # burning a code with wrong guesses can't be used to get fresh ones faster.
    phone_codes = db.query(models.OTP).filter(models.OTP.phone == phone, models.OTP.created_at >= hour_ago)
    if phone_codes.filter(models.OTP.created_at >= _utcnow() - datetime.timedelta(seconds=45)).count():
        raise HTTPException(status_code=429, detail="Please wait before requesting another OTP")
    if phone_codes.count() >= 5:
        raise HTTPException(status_code=429, detail="Too many OTP requests for this number. Try again in an hour.")

    # only the newest code is ever valid
    db.query(models.OTP).filter(models.OTP.phone == phone, models.OTP.used == False).update(  # noqa: E712
        {models.OTP.used: True}, synchronize_session=False
    )
    otp_code = customer_auth.generate_otp()
    expires_at = _utcnow() + datetime.timedelta(minutes=customer_auth.OTP_EXPIRE_MINUTES)

    otp_record = models.OTP(phone=phone, otp_code=otp_code, expires_at=expires_at)
    db.add(otp_record)
    db.commit()

    # Send OTP via WhatsApp (best-effort)
    e164_phone = "+91" + phone if not phone.startswith("+") else phone
    try:
        whatsapp_helper.send_otp_message(e164_phone, otp_code)
    except Exception as exc:
        logger.warning("WhatsApp OTP send failed for %s: %s", phone, exc)

    return schemas.SendOTPResponse()


@app.post("/api/auth/verify-otp", response_model=schemas.CustomerTokenResponse)
def verify_otp(payload: schemas.VerifyOTPRequest, request: Request, db: Session = Depends(get_db)):
    """Verify OTP and return a customer JWT."""
    ratelimit.limit(request, "verify_otp", max_hits=20, window_seconds=10 * 60)
    phone = _normalize_phone(payload.phone)
    otp_code = payload.otp.strip()

    # The newest unused code for this phone is the only one that counts; wrong guesses burn it.
    otp_record = db.query(models.OTP).filter(
        models.OTP.phone == phone,
        models.OTP.used == False,  # noqa: E712
    ).order_by(models.OTP.created_at.desc()).with_for_update().first()

    if not otp_record:
        _log_login(db, request, "customer", phone, False, "No code requested")
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    if otp_record.expires_at < _utcnow():
        otp_record.used = True
        db.commit()
        _log_login(db, request, "customer", phone, False, "Code expired")
        raise HTTPException(status_code=400, detail="OTP has expired")

    if not secrets.compare_digest(otp_record.otp_code, otp_code):
        otp_record.attempts = (otp_record.attempts or 0) + 1
        if otp_record.attempts >= customer_auth.OTP_MAX_ATTEMPTS:
            otp_record.used = True
            db.commit()
            _log_login(db, request, "customer", phone, False, "Too many wrong codes")
            raise HTTPException(status_code=400, detail="Too many wrong attempts. Please request a new OTP.")
        db.commit()
        _log_login(db, request, "customer", phone, False, "Wrong code")
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    otp_record.used = True
    db.commit()

    # Create or find customer
    customer = customer_auth.create_or_get_customer(db, phone)
    _log_login(db, request, "customer", phone, True, "Logged in")

    token = customer_auth.create_customer_token(phone)
    return schemas.CustomerTokenResponse(
        access_token=token,
        customer=schemas.CustomerOut.model_validate(customer),
    )


@app.get("/api/auth/me", response_model=schemas.CustomerOut)
def customer_me(current: models.Customer = Depends(customer_auth.require_customer)):
    return current


@app.patch("/api/auth/me", response_model=schemas.CustomerOut)
def update_customer_me(
    payload: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    current: models.Customer = Depends(customer_auth.require_customer),
):
    if payload.name is not None:
        current.name = payload.name
    if payload.email is not None:
        current.email = payload.email
    db.commit()
    db.refresh(current)
    return current


# ============================================================
# ADDRESSES  (customer saved addresses)
# ============================================================
@app.get("/api/addresses", response_model=List[schemas.AddressOut])
def list_addresses(
    db: Session = Depends(get_db),
    current: models.Customer = Depends(customer_auth.require_customer),
):
    return db.query(models.Address).filter(
        models.Address.customer_id == current.id
    ).order_by(models.Address.is_default.desc(), models.Address.created_at.desc()).all()


@app.post("/api/addresses", response_model=schemas.AddressOut)
def create_address(
    payload: schemas.AddressCreate,
    db: Session = Depends(get_db),
    current: models.Customer = Depends(customer_auth.require_customer),
):
    # If setting as default, unset other defaults
    if payload.is_default:
        db.query(models.Address).filter(
            models.Address.customer_id == current.id,
            models.Address.is_default == True,  # noqa: E712
        ).update({models.Address.is_default: False})

    address = models.Address(
        customer_id=current.id,
        full_address=payload.full_address,
        city=payload.city,
        state=payload.state,
        pincode=payload.pincode,
        is_default=payload.is_default,
    )
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


@app.delete("/api/addresses/{address_id}")
def delete_address(
    address_id: int,
    db: Session = Depends(get_db),
    current: models.Customer = Depends(customer_auth.require_customer),
):
    address = db.query(models.Address).filter(
        models.Address.id == address_id,
        models.Address.customer_id == current.id,
    ).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")
    db.delete(address)
    db.commit()
    return {"detail": "Address deleted"}


# ============================================================
# PUBLIC PRODUCT ROUTES
# ============================================================
@app.get("/api/products", response_model=List[schemas.ProductOut])
def list_products(
    category: Optional[str] = None,
    featured: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Product).options(*product_load_options()).filter(models.Product.is_active == True)  # noqa: E712
    if category:
        q = q.filter(models.Product.category == category)
    if featured is not None:
        q = q.filter(models.Product.is_featured == featured)
    products = q.order_by(models.Product.created_at.desc()).all()
    return products


@app.get("/api/products/{slug}", response_model=schemas.ProductOut)
def get_product(slug: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).options(*product_load_options()).filter(models.Product.slug == slug, models.Product.is_active == True).first()  # noqa: E712
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# ============================================================
# ADMIN PRODUCT ROUTES (protected)
# ============================================================
@app.get("/api/admin/products", response_model=List[schemas.ProductOut])
def admin_list_products(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    products = db.query(models.Product).options(*product_load_options()).order_by(models.Product.created_at.desc()).all()
    return products


@app.get("/api/admin/products/{product_id}", response_model=schemas.ProductOut)
def admin_get_product(product_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    product = db.query(models.Product).options(*product_load_options()).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@app.post("/api/admin/products", response_model=schemas.ProductOut)
def create_product(payload: schemas.ProductCreate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    slug = unique_slug(db, slugify(payload.name))
    product = models.Product(
        name=payload.name, slug=slug, description=payload.description, price=payload.price,
        compare_at_price=payload.compare_at_price, category=payload.category, colorway=payload.colorway,
        is_active=payload.is_active, is_featured=payload.is_featured,
        meta_title=payload.meta_title, meta_description=payload.meta_description,
    )
    db.add(product)
    db.flush()
    if payload.colors:
        for position, color_data in enumerate(payload.colors):
            color = models.ProductColor(
                product_id=product.id, name=color_data.name.strip(),
                hex_code=color_data.hex_code, position=color_data.position or position,
            )
            db.add(color)
            db.flush()
            for s in color_data.sizes:
                db.add(models.ProductSize(product_id=product.id, color_id=color.id, size=s.size, stock=s.stock))
    else:
        for s in payload.sizes:
            db.add(models.ProductSize(product_id=product.id, size=s.size, stock=s.stock))
    db.commit()
    db.refresh(product)
    return product


@app.put("/api/admin/products/{product_id}", response_model=schemas.ProductOut)
def update_product(product_id: int, payload: schemas.ProductUpdate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    data = payload.model_dump(exclude_unset=True)
    sizes = data.pop("sizes", None)
    colors = data.pop("colors", None)

    if "name" in data and data["name"] != product.name:
        product.slug = unique_slug(db, slugify(data["name"]), exclude_id=product.id)

    for key, value in data.items():
        setattr(product, key, value)

    if sizes is not None:
        existing_sizes = {s.size: s for s in product.sizes}
        incoming_sizes = {s["size"] for s in sizes}
        for size, row in existing_sizes.items():
            if size not in incoming_sizes:
                db.delete(row)
        for s in sizes:
            if s["size"] in existing_sizes:
                existing_sizes[s["size"]].stock = s["stock"]
            else:
                db.add(models.ProductSize(product_id=product.id, size=s["size"], stock=s["stock"]))

    if colors is not None:
        incoming_ids = {c.get("id") for c in colors if c.get("id")}
        for color in list(product.colors):
            if color.id not in incoming_ids:
                db.delete(color)
        for position, color_data in enumerate(colors):
            color = next((c for c in product.colors if c.id == color_data.get("id")), None)
            if color is None:
                color = models.ProductColor(
                    product_id=product.id,
                    name=color_data["name"].strip(),
                    hex_code=color_data.get("hex_code") or "#000000",
                    position=color_data.get("position", position),
                )
                db.add(color)
                db.flush()
            else:
                color.name = color_data["name"].strip()
                color.hex_code = color_data.get("hex_code") or "#000000"
                color.position = color_data.get("position", position)
            existing = {s.size: s for s in color.sizes}
            incoming_sizes = {s["size"] for s in color_data.get("sizes", [])}
            for size, row in existing.items():
                if size not in incoming_sizes:
                    db.delete(row)
            for size_data in color_data.get("sizes", []):
                if size_data["size"] in existing:
                    existing[size_data["size"]].stock = size_data["stock"]
                else:
                    db.add(models.ProductSize(product_id=product.id, color_id=color.id, size=size_data["size"], stock=size_data["stock"]))

    product.updated_at = _utcnow()
    db.commit()
    db.refresh(product)
    return product


@app.delete("/api/admin/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for img in product.images:
        if img.url.startswith("http"):
            gcs.delete_from_gcs(gcs.get_filename_from_url(img.url))
        else:
            try:
                fpath = os.path.join(os.path.dirname(os.path.dirname(__file__)), img.url.lstrip("/"))
                if os.path.exists(fpath):
                    os.remove(fpath)
            except OSError:
                pass
    db.delete(product)
    db.commit()
    return {"detail": "Product deleted"}


# content type -> file extension we save with. The extension is never taken from the
# uploaded filename: an "image" named x.html would otherwise be served as a web page
# on loopstitch.online and could read the admin token from localStorage.
ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}

_MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "application/pdf": (b"%PDF-",),
}


def _check_file_matches_type(contents: bytes, content_type: str) -> None:
    """Reject files whose bytes don't match the type the browser claimed."""
    if content_type == "image/webp":
        ok = contents[:4] == b"RIFF" and contents[8:12] == b"WEBP"
    else:
        ok = any(contents.startswith(sig) for sig in _MAGIC.get(content_type, (b"",)))
    if not ok:
        raise HTTPException(status_code=400, detail="The file doesn't match its type. Please upload a real image or PDF.")


@app.post("/api/admin/products/{product_id}/images", response_model=schemas.ProductOut)
async def upload_product_images(
    product_id: int,
    color_id: Optional[int] = None,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if color_id is not None and not db.query(models.ProductColor).filter(
        models.ProductColor.id == color_id, models.ProductColor.product_id == product_id
    ).first():
        raise HTTPException(status_code=404, detail="Color variant not found")

    for file in files:
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
        contents = b""
        while chunk := await file.read(8192):
            contents += chunk
            if len(contents) > MAX_UPLOAD_SIZE:
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 10 MB.")

        _check_file_matches_type(contents, file.content_type)
        fname = f"{uuid.uuid4().hex}{ALLOWED_IMAGE_TYPES[file.content_type]}"

        url = store_upload(contents, fname, file.content_type, "products")

        # after the current last image (count() would collide once an image has been deleted)
        last = db.query(func.max(models.ProductImage.position)).filter(
            models.ProductImage.product_id == product_id,
            models.ProductImage.color_id == color_id,
        ).scalar()
        position = 0 if last is None else last + 1
        webp_base = imaging.store_variants(
            contents, fname, url, lambda data, name, ctype: store_upload(data, name, ctype, "products"))
        db.add(models.ProductImage(
            product_id=product_id, color_id=color_id,
            url=url, webp_base=webp_base, position=position
        ))
        db.flush()  # so the next file in this request sees this one and gets the following position

    db.commit()
    db.refresh(product)
    return product


@app.put("/api/admin/products/{product_id}/images/order", response_model=schemas.ProductOut)
def reorder_product_images(product_id: int, payload: schemas.IdList, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    """Gallery order chosen in admin: ids[0] becomes the main (first) image."""
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    images = {
        img.id: img
        for img in db.query(models.ProductImage).filter(
            models.ProductImage.product_id == product_id, models.ProductImage.id.in_(payload.ids)
        )
    }
    if len(images) != len(set(payload.ids)):
        raise HTTPException(status_code=400, detail="Some images don't belong to this product")
    for position, image_id in enumerate(payload.ids):
        images[image_id].position = position
    db.commit()
    db.refresh(product)
    return product


@app.delete("/api/admin/products/{product_id}/images/{image_id}", response_model=schemas.ProductOut)
def delete_product_image(product_id: int, image_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    image = db.query(models.ProductImage).filter(
        models.ProductImage.id == image_id, models.ProductImage.product_id == product_id
    ).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    # the original plus its WebP copies
    urls = [image.url] + ([f"{image.webp_base}_w{w}.webp" for w in imaging.WIDTHS] if image.webp_base else [])
    for url in urls:
        if url.startswith("http"):
            gcs.delete_from_gcs(gcs.get_filename_from_url(url))
        else:
            try:
                fpath = os.path.join(os.path.dirname(os.path.dirname(__file__)), url.lstrip("/"))
                if os.path.exists(fpath):
                    os.remove(fpath)
            except OSError:
                pass
    db.delete(image)
    db.commit()
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    return product


# ============================================================
# ORDERS (checkout is public; management is admin-only)
# ============================================================
def generate_order_number() -> str:
    return "LSC" + _utcnow().strftime("%y%m%d") + uuid.uuid4().hex[:5].upper()


@app.post("/api/orders")
def create_order(
    payload: schemas.OrderCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current: models.Customer = Depends(customer_auth.get_current_customer),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Validate payment method
    payment_method = payload.payment_method if payload.payment_method in ("cod", "online") else "cod"
    raw_settings = {r.key: r.value for r in db.query(models.Setting).all()}

    if payment_method == "cod" and raw_settings.get("cod_enabled", "false") != "true":
        raise HTTPException(status_code=400, detail="Cash on delivery is not available. Please choose online payment.")

    # Link to customer if authenticated, or auto-create/find by phone
    customer_id = None
    if current:
        customer_id = current.id
    else:
        phone_digits = "".join(c for c in payload.customer_phone if c.isdigit())
        if len(phone_digits) > 10:
            phone_digits = phone_digits[-10:]
        existing = db.query(models.Customer).filter(models.Customer.phone == phone_digits).first()
        if existing:
            customer_id = existing.id
        else:
            new_cust = models.Customer(
                phone=phone_digits,
                name=payload.customer_name,
                email=payload.customer_email,
            )
            db.add(new_cust)
            db.flush()
            customer_id = new_cust.id

    order = models.Order(
        order_number=generate_order_number(),
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        shipping_address=payload.shipping_address,
        city=payload.city, state=payload.state, pincode=payload.pincode,
        status=models.OrderStatus.pending,
        payment_method=payment_method,
        customer_id=customer_id,
    )
    db.add(order)
    db.flush()

    subtotal = 0.0
    cart_ctx = []  # discount-engine context: product + line info
    item_rows = []
    for line in payload.items:
        product = db.query(models.Product).filter(models.Product.id == line.product_id, models.Product.is_active == True).first()  # noqa: E712
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {line.product_id} not found")

        color = None
        if line.color_id is not None:
            color = db.query(models.ProductColor).filter(
                models.ProductColor.id == line.color_id, models.ProductColor.product_id == product.id
            ).first()
            if not color:
                raise HTTPException(status_code=400, detail=f"Color variant not available for {product.name}")
        elif product.colors:
            # Existing carts created before color variants use the first/default color.
            color = sorted(product.colors, key=lambda item: item.position)[0]
        size_query = db.query(models.ProductSize).filter(
            models.ProductSize.product_id == product.id,
            models.ProductSize.size == line.size,
        )
        if color:
            size_query = size_query.filter(models.ProductSize.color_id == color.id)
        else:
            size_query = size_query.filter(models.ProductSize.color_id.is_(None))
        size_row = size_query.with_for_update().first()
        if not size_row:
            raise HTTPException(status_code=400, detail=f"Size {line.size} not available for {product.name}")
        if size_row.stock < line.quantity:
            raise HTTPException(
                status_code=409,
                detail=f"Only {size_row.stock} left for {product.name} ({color.name + ' / ' if color else ''}size {line.size}). Please lower the quantity."
            )

        size_row.stock -= line.quantity

        unit_price = product.price
        subtotal += unit_price * line.quantity

        item_rows.append(models.OrderItem(
            order_id=order.id, product_id=product.id, product_name=product.name,
            color_id=color.id if color else None,
            color_name=color.name if color else product.colorway or "",
            size=line.size, quantity=line.quantity, unit_price=unit_price,
        ))
        cart_ctx.append({
            "product_id": product.id, "size": line.size, "quantity": line.quantity,
            "line_key": (product.id, line.color_id, line.size),
            "unit_price": unit_price, "product": product,
        })

    # ---- Offers + coupon: same engine as the live quote, so the total always matches ----
    priced = price_cart(db, cart_ctx, subtotal, payload.coupon_code)
    line_discounts = {}
    if priced["offer"]:
        order.discount_amount = priced["offer_discount"]
        order.offer_id = priced["offer"]["offer_id"]
        order.offer_label = priced["offer_label"]
        line_discounts = priced["offer"]["line_discounts"]
    if priced["coupon"] and priced["coupon_discount"] > 0:
        order.coupon_id = priced["coupon"].id
        order.coupon_code = priced["coupon"].code
        order.coupon_discount = priced["coupon_discount"]
        line_discounts = priced["coupon_line_discounts"] or line_discounts
        # record the use (atomic increment)
        db.query(models.Coupon).filter(models.Coupon.id == priced["coupon"].id).update(
            {models.Coupon.times_used: models.Coupon.times_used + 1}
        )
    for row in item_rows:
        row.line_discount = round(line_discounts.get((row.product_id, row.color_id, row.size), line_discounts.get((row.product_id, row.size), 0.0)), 2)
    subtotal_after_bogo = round(subtotal - (order.discount_amount or 0.0), 2)

    # free-shipping judged on pre-discount subtotal (editable in admin settings)
    config = get_shipping_config(db)
    shipping_fee = shipping_fee_for(subtotal, config)

    order.subtotal = subtotal
    order.shipping_fee = shipping_fee
    order.total = round(subtotal_after_bogo - (order.coupon_discount or 0.0) + shipping_fee, 2)

    # For COD orders, calculate the advance amount to be paid online
    if payment_method == "cod":
        advance_pct = float(raw_settings.get("cod_advance_percent", "10"))
        order.cod_advance_percent = advance_pct
        order.cod_advance_paid = round(order.total * advance_pct / 100.0, 2)

    for row in item_rows:
        db.add(row)

    db.commit()
    db.refresh(order)
    _alert_owner_if_cod_confirmed(background, order)

    return {"order": schemas.OrderOut.model_validate(order).model_dump()}


@app.post("/api/cart/quote", response_model=schemas.QuoteOut)
def cart_quote(payload: schemas.QuoteRequest, db: Session = Depends(get_db)):
    """Live totals preview (subtotal / discount / shipping) — no stock changes, no order."""
    from .offers import active_offers as _  # noqa: F401  (engine imported at module load)

    if not payload.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    subtotal = 0.0
    cart_ctx = []
    for line in payload.items:
        product = db.query(models.Product).filter(
            models.Product.id == line.product_id, models.Product.is_active == True  # noqa: E712
        ).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {line.product_id} not found")
        subtotal += product.price * line.quantity
        cart_ctx.append({
            "product_id": product.id, "size": line.size, "quantity": line.quantity,
            "line_key": (product.id, line.color_id, line.size),
            "unit_price": product.price, "product": product,
        })

    priced = price_cart(db, cart_ctx, subtotal, payload.coupon_code)
    discount = priced["offer_discount"]
    coupon_discount = priced["coupon_discount"]
    subtotal_after_bogo = round(subtotal - discount, 2)

    config = get_shipping_config(db)
    fee = shipping_fee_for(subtotal, config)

    return {
        "subtotal": round(subtotal, 2),
        "discount": round(discount, 2),
        "offer_label": priced["offer_label"],
        "coupon_code": priced["coupon"].code if priced["coupon"] else "",
        "coupon_discount": round(coupon_discount, 2),
        "coupon_label": priced["coupon_label"],
        "coupon_message": priced["coupon_message"],
        "shipping_fee": round(fee, 2),
        "total": round(subtotal_after_bogo - coupon_discount + fee, 2),
    }


# ============================================================
# CUSTOMER ORDER HISTORY  (requires customer JWT)
# ============================================================
@app.get("/api/orders/history", response_model=List[schemas.OrderHistoryOut])
def customer_order_history(
    db: Session = Depends(get_db),
    current: models.Customer = Depends(customer_auth.require_customer),
):
    """Return all orders linked to the authenticated customer."""
    orders = db.query(models.Order).options(
        joinedload(models.Order.items)
    ).filter(
        models.Order.customer_id == current.id
    ).order_by(models.Order.created_at.desc()).all()
    return orders


def _order_for_viewer(order_number: str, token: Optional[str], db: Session) -> models.Order:
    """Return the order only to its own customer, or to an admin. 404 for everyone else,
    so order numbers can't be probed."""
    if token is None:
        raise HTTPException(status_code=401, detail="Authentication required to view orders")
    try:
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    except auth.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    order = db.query(models.Order).options(joinedload(models.Order.items)).filter(
        models.Order.order_number == order_number
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    role, sub = payload.get("role"), payload.get("sub")
    if role == "admin" and db.query(models.Admin).filter(models.Admin.username == sub).first():
        return order
    if role == "customer":
        customer = db.query(models.Customer).filter(models.Customer.phone == sub).first()
        if customer is not None and order.customer_id == customer.id:
            return order
    raise HTTPException(status_code=404, detail="Order not found")


@app.get("/api/orders/{order_number}", response_model=schemas.OrderOut)
def get_order_by_number(order_number: str, token: Optional[str] = Depends(auth.oauth2_scheme), db: Session = Depends(get_db)):
    return _order_for_viewer(order_number, token, db)


@app.get("/api/orders/{order_number}/invoice")
def download_order_invoice(order_number: str, token: Optional[str] = Depends(auth.oauth2_scheme), db: Session = Depends(get_db)):
    from .invoice import generate_invoice_pdf
    order = _order_for_viewer(order_number, token, db)
    pdf_bytes = generate_invoice_pdf(order)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{order.order_number}.pdf"'},
    )


# ============================================================
# ADMIN ORDER ROUTES
@app.get("/api/admin/orders", response_model=list[schemas.OrderOut])
def admin_list_orders(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    orders = db.query(models.Order).options(joinedload(models.Order.items)).order_by(models.Order.created_at.desc()).all()
    return orders


def _delete_order(db: Session, order: models.Order) -> None:
    """Remove an order for good: its items, WhatsApp notifications and design links go with it.
    Stock + coupon use come back only if the parcel never left (pending / paid);
    a booked-but-undelivered Delhivery shipment is cancelled too."""
    if order.status in (models.OrderStatus.pending, models.OrderStatus.paid):
        order_lifecycle.release_stock(db, order)
    if order.awb and order.status != models.OrderStatus.delivered:
        courier.cancel_for_order(order)  # best effort; never blocks the delete
    db.query(models.Notification).filter(models.Notification.order_id == order.id).delete(synchronize_session=False)
    db.query(models.CustomTshirtDesign).filter(models.CustomTshirtDesign.order_id == order.id).delete(synchronize_session=False)
    db.delete(order)  # order items cascade


@app.delete("/api/admin/orders/{order_id}")
def admin_delete_order(order_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    order = db.query(models.Order).options(joinedload(models.Order.items)).filter(models.Order.id == order_id).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _delete_order(db, order)
    db.commit()
    logger.info("Admin %s deleted order %s", current.username, order.order_number)
    return {"deleted": 1}


@app.post("/api/admin/orders/bulk-delete")
def admin_bulk_delete_orders(payload: schemas.IdList, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    orders = db.query(models.Order).options(joinedload(models.Order.items)).filter(models.Order.id.in_(payload.ids)).with_for_update().all()
    for order in orders:
        _delete_order(db, order)
    db.commit()
    logger.info("Admin %s deleted %s orders", current.username, len(orders))
    return {"deleted": len(orders)}


@app.patch("/api/admin/orders/{order_id}/status", response_model=schemas.OrderOut)
def update_order_status(order_id: int, payload: schemas.OrderStatusUpdate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    order = db.query(models.Order).options(joinedload(models.Order.items)).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if payload.status in order_lifecycle.CLOSED:
        if payload.status == models.OrderStatus.cancelled and order.status != models.OrderStatus.cancelled:
            courier.cancel_for_order(order)
        order_lifecycle.close_order(db, order, payload.status)  # gives the stock back once
    else:
        if not order_lifecycle.reopen_order(db, order, payload.status):  # takes the stock again if it was closed
            raise HTTPException(status_code=409, detail="Not enough stock left to reopen this order")
        if payload.status == models.OrderStatus.paid:
            courier.schedule_pickup(db, order)
        if payload.status == models.OrderStatus.delivered and order.delivered_at is None:
            order.delivered_at = _utcnow()  # starts the WhatsApp review request countdown
    db.commit()
    db.refresh(order)
    return order


@app.post("/api/admin/shipping/book-now")
def admin_book_pickups_now(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    """Run the daily Delhivery batch immediately (orders due by the next pickup day)."""
    try:
        return courier.run_pickup_batch(db)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/admin/shipping/sync")
def admin_sync_tracking(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    if not delhivery_helper.is_configured():
        raise HTTPException(status_code=400, detail="Delhivery is not configured")
    try:
        return {"updated": courier.sync_tracking(db)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Delhivery tracking failed: {exc}")


@app.get("/api/admin/orders/{order_id}/label")
def admin_shipping_label(order_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order or not order.awb:
        raise HTTPException(status_code=404, detail="No shipment for this order yet")
    try:
        return {"url": delhivery_helper.label_url(order.awb)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/admin/orders/{order_id}/invoice")
def admin_download_invoice(order_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    from .invoice import generate_invoice_pdf
    order = db.query(models.Order).options(joinedload(models.Order.items)).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pdf_bytes = generate_invoice_pdf(order)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{order.order_number}.pdf"'},
    )


# ============================================================
# STORE SETTINGS  (delivery fee etc. — editable from admin)
# ============================================================
# SETTINGS (delivery + Razorpay + COD — admin managed)
# ============================================================
def _get_all_settings(db: Session) -> dict:
    """Read all settings from the DB into a flat dict."""
    rows = db.query(models.Setting).all()
    return {r.key: r.value for r in rows}


def _build_settings_out(db: Session) -> schemas.SettingsOut:
    raw = _get_all_settings(db)
    return schemas.SettingsOut(
        delivery_fee=float(raw.get("delivery_fee", 45)),
        free_shipping_threshold=float(raw.get("free_shipping_threshold", 1000)),
        cod_advance_percent=float(raw.get("cod_advance_percent", "10")),
        cod_enabled=raw.get("cod_enabled", "false") == "true",
        launch_mode=raw.get("launch_mode", "false") == "true",
        launch_date=raw.get("launch_date", ""),
        launch_message=raw.get("launch_message", ""),
        launch_auto_open=raw.get("launch_auto_open", "false") == "true",
        launch_alerts_enabled=raw.get("launch_alerts_enabled", "false") == "true",
        ship_configured=delhivery_helper.is_configured(),
        ship_auto_pickup=raw.get("ship_auto_pickup", "true") == "true",
        ship_pickup_location=raw.get("ship_pickup_location", ""),
        ship_days_standard=int(float(raw.get("ship_days_standard", "3"))),
        ship_days_custom=int(float(raw.get("ship_days_custom", "5"))),
        ship_weight_grams=int(float(raw.get("ship_weight_grams", "250"))),
        ship_box_cm=raw.get("ship_box_cm", "30x25x5"),
        ship_run_hour=int(float(raw.get("ship_run_hour", "18"))),
    )


def _launch_countdown_over(raw: dict) -> bool:
    """True once the admin-set launch time has passed (launch_date is stored as UTC ISO)."""
    try:
        when = datetime.datetime.fromisoformat(raw.get("launch_date", "").replace("Z", "+00:00"))
    except ValueError:
        return False
    if when.tzinfo is None:
        when = when.replace(tzinfo=datetime.timezone.utc)
    return datetime.datetime.now(datetime.timezone.utc) >= when


def _launch_is_on(raw: dict) -> bool:
    """Launching-soon page showing to visitors? (auto-open ends it when the countdown runs out)"""
    launch_on = raw.get("launch_mode", "false") == "true"
    if launch_on and raw.get("launch_auto_open", "false") == "true" and _launch_countdown_over(raw):
        launch_on = False
    return launch_on


@app.get("/api/settings/launch", response_model=schemas.PublicLaunchSettings)
def public_launch_settings(db: Session = Depends(get_db)):
    # When launch_mode is on the storefront shows only the "launching soon" page —
    # unless auto-open is ticked and the countdown has run out, then the store opens by itself
    raw = _get_all_settings(db)
    launch_on = _launch_is_on(raw)
    return schemas.PublicLaunchSettings(
        launch_mode=launch_on,
        launch_date=raw.get("launch_date", ""),
        launch_message=raw.get("launch_message", ""),
        # analytics ids for the storefront (public by nature: they are in every page's requests)
        meta_pixel_id=meta_capi.PIXEL_ID,
        ga4_id=os.getenv("GA4_ID", ""),
    )


@app.get("/api/settings/shipping", response_model=schemas.PublicShippingSettings)
def public_shipping_settings(db: Session = Depends(get_db)):
    return get_shipping_config(db)


@app.get("/api/settings/checkout", response_model=schemas.PublicCheckoutSettings)
def public_checkout_settings(db: Session = Depends(get_db)):
    raw = _get_all_settings(db)
    return schemas.PublicCheckoutSettings(
        cod_enabled=raw.get("cod_enabled", "false") == "true",
        cod_advance_percent=float(raw.get("cod_advance_percent", "10")),
        razorpay_key_id=razorpay_helper.get_key_id(),
    )


@app.get("/api/admin/settings", response_model=schemas.SettingsOut)
def admin_get_settings(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return _build_settings_out(db)


@app.patch("/api/admin/settings", response_model=schemas.SettingsOut)
def admin_update_settings(payload: schemas.SettingsUpdate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    if payload.delivery_fee is not None:
        set_setting(db, "delivery_fee", str(round(float(payload.delivery_fee), 2)))
    if payload.free_shipping_threshold is not None:
        set_setting(db, "free_shipping_threshold", str(round(float(payload.free_shipping_threshold), 2)))
    if payload.cod_advance_percent is not None:
        set_setting(db, "cod_advance_percent", str(round(float(payload.cod_advance_percent), 1)))
    if payload.cod_enabled is not None:
        set_setting(db, "cod_enabled", "true" if payload.cod_enabled else "false")
    if payload.launch_mode is not None:
        set_setting(db, "launch_mode", "true" if payload.launch_mode else "false")
    before = _get_all_settings(db)
    rearm_reminder = False  # set launch_alerts_sent_at once at the end (no autoflush between set_setting calls)
    if payload.launch_date is not None:
        if payload.launch_date.strip() != before.get("launch_date", ""):
            rearm_reminder = True  # new launch time: the reminder fires again
        set_setting(db, "launch_date", payload.launch_date.strip())
    if payload.launch_message is not None:
        set_setting(db, "launch_message", payload.launch_message.strip())
    if payload.launch_auto_open is not None:
        set_setting(db, "launch_auto_open", "true" if payload.launch_auto_open else "false")
    if payload.launch_alerts_enabled is not None:
        was_on = before.get("launch_alerts_enabled") == "true"
        set_setting(db, "launch_alerts_enabled", "true" if payload.launch_alerts_enabled else "false")
        if payload.launch_alerts_enabled and not was_on:
            rearm_reminder = True  # re-arm the automatic reminder
    if rearm_reminder:
        set_setting(db, "launch_alerts_sent_at", "")
    if payload.ship_auto_pickup is not None:
        set_setting(db, "ship_auto_pickup", "true" if payload.ship_auto_pickup else "false")
    if payload.ship_pickup_location is not None:
        set_setting(db, "ship_pickup_location", payload.ship_pickup_location.strip())
    for key in ("ship_days_standard", "ship_days_custom", "ship_weight_grams", "ship_run_hour"):
        value = getattr(payload, key)
        if value is not None:
            set_setting(db, key, str(value))
    if payload.ship_box_cm is not None:
        set_setting(db, "ship_box_cm", payload.ship_box_cm.replace(" ", "").lower())
    db.commit()
    return _build_settings_out(db)


# ============================================================
# RAZORPAY  (create order + verify payment)
# ============================================================
@app.post("/api/razorpay/create-order", response_model=schemas.RazorpayOrderResponse)
def razorpay_create_order(payload: schemas.RazorpayOrderRequest, db: Session = Depends(get_db)):
    """Create (or reuse) the Razorpay order for one of our orders.

    The amount always comes from the order in the database (full total, or the COD
    advance) — never from the browser — and the Razorpay order id is stored on the
    order so /verify can check the payment belongs to it.
    """
    order = db.query(models.Order).filter(
        models.Order.order_number == payload.order_number
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != models.OrderStatus.pending:
        raise HTTPException(status_code=409, detail="This order is not waiting for payment")

    amount_paise = order_lifecycle.amount_due_paise(order)
    if amount_paise < 100:
        raise HTTPException(status_code=400, detail="Nothing to pay online for this order")

    if not order.razorpay_order_id:
        try:
            result = razorpay_helper.create_order(
                amount_paise=amount_paise,
                currency="INR",
                receipt=order.order_number,
                notes={"order_number": order.order_number},
            )
        except Exception as exc:
            logger.error("Razorpay create-order failed for %s: %s", order.order_number, exc, exc_info=True)
            raise HTTPException(status_code=502, detail="Could not start the payment. Please try again.")
        order.razorpay_order_id = result["id"]
        db.commit()
        logger.info("Razorpay order %s created for %s (%s paise)", order.razorpay_order_id, order.order_number, amount_paise)

    return schemas.RazorpayOrderResponse(
        order_id=order.razorpay_order_id,
        amount=amount_paise,
        currency="INR",
        key_id=razorpay_helper.get_key_id(),
    )


def _queue_owner_alert(background: Optional[BackgroundTasks], order_id: int) -> None:
    """Owner WhatsApp alert for a newly confirmed order, sent after the response when possible."""
    if background is not None:
        background.add_task(owner_alerts.notify_new_order_by_id, order_id)
    else:
        owner_alerts.notify_new_order_by_id(order_id)


def _alert_owner_if_cod_confirmed(background: Optional[BackgroundTasks], order: models.Order) -> None:
    """A COD order with nothing to pay online is confirmed the moment it's placed."""
    if order.payment_method == "cod" and order_lifecycle.amount_due(order) <= 0:
        _queue_owner_alert(background, order.id)


def _apply_payment(
    db: Session, order: models.Order, rp_order_id: str, payment_id: str, signature: str,
    background: Optional[BackgroundTasks] = None, client: Optional[dict] = None,
) -> str:
    """mark_paid + commit + WhatsApp confirmation, owner alert and Meta purchase event on a fresh confirmation."""
    try:
        result = order_lifecycle.mark_paid(db, order, rp_order_id, payment_id, signature)
    except order_lifecycle.PaymentMismatch as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    db.commit()
    db.refresh(order)
    if result == "paid":
        meta_capi.send_purchase(order, client)  # server-side copy of the Pixel's Purchase (deduplicated)
        _queue_owner_alert(background, order.id)
        _send_whatsapp_notification(db, order)
    return result


@app.post("/api/razorpay/verify")
def razorpay_verify_payment(payload: schemas.RazorpayVerifyRequest, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Verify the Razorpay checkout signature and mark the order as paid."""
    if not payload.razorpay_order_id or not payload.razorpay_payment_id or not payload.razorpay_signature:
        raise HTTPException(status_code=400, detail="Missing payment verification fields")

    # Signature proves Razorpay saw this payment on this Razorpay order...
    if not razorpay_helper.verify_payment_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    ):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    order = db.query(models.Order).options(joinedload(models.Order.items)).filter(
        models.Order.order_number == payload.order_number
    ).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # ...and mark_paid checks that Razorpay order is the one we created for THIS order.
    result = _apply_payment(db, order, payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature,
                            background,
                            client={"ip": ratelimit.client_ip(request), "user_agent": request.headers.get("user-agent", ""),
                                    "fbp": request.cookies.get("_fbp", ""), "fbc": request.cookies.get("_fbc", "")})
    if result == "needs_refund":
        raise HTTPException(
            status_code=409,
            detail="We received your payment but couldn't confirm this order. It will be refunded — please contact us.",
        )
    return {"verified": True, "status": order.status.value}


@app.post("/api/webhooks/razorpay")
async def razorpay_webhook(request: Request, background: BackgroundTasks):
    """Razorpay webhook (payment.captured / order.paid): confirms orders even if the
    shopper closed the tab before the browser could call /verify.

    Set it up in Razorpay Dashboard → Webhooks with URL
    https://loopstitch.online/api/webhooks/razorpay, events payment.captured + order.paid,
    and put the same secret in RAZORPAY_WEBHOOK_SECRET.
    """
    body = await request.body()
    if not razorpay_helper.verify_webhook_signature(body, request.headers.get("x-razorpay-signature", "")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    event = (await request.json()) if body else {}
    if event.get("event") not in ("payment.captured", "order.paid"):
        return {"status": "ignored"}
    payment = ((event.get("payload") or {}).get("payment") or {}).get("entity") or {}
    rp_order_id, payment_id = payment.get("order_id"), payment.get("id")
    if not rp_order_id or not payment_id:
        return {"status": "ignored"}

    db = SessionLocal()
    try:
        order = db.query(models.Order).options(joinedload(models.Order.items)).filter(
            models.Order.razorpay_order_id == rp_order_id
        ).with_for_update().first()
        if not order:
            return {"status": "unknown_order"}
        if int(payment.get("amount") or 0) != order_lifecycle.amount_due_paise(order):
            logger.warning("Razorpay webhook amount mismatch for %s: %s", order.order_number, payment.get("amount"))
            return {"status": "amount_mismatch"}
        try:
            result = _apply_payment(db, order, rp_order_id, payment_id, "webhook", background)
        except HTTPException as exc:
            logger.warning("Razorpay webhook for %s rejected: %s", order.order_number, exc.detail)
            return {"status": "rejected"}
        return {"status": result}
    finally:
        db.close()


# ============================================================
# WHATSAPP  (send order confirmation + webhook for status updates)
# ============================================================
def _build_items_summary(items: list) -> str:
    """Build a human-readable items summary like '2 items — Ronin Wave Tee × 1, Elite Soldier Tee × 1'."""
    total_qty = sum(i.quantity for i in items)
    parts = [f"{i.product_name}{f' ({i.color_name})' if i.color_name else ''} × {i.quantity}" for i in items]
    summary = ", ".join(parts[:3])
    if len(items) > 3:
        summary += f" +{len(items) - 3} more"
    return f"{total_qty} item{'s' if total_qty != 1 else ''} — {summary}"


def _build_payment_label(order) -> str:
    return whatsapp_helper.payment_label(order)


def _send_whatsapp_notification(db: Session, order) -> None:
    """Create a Notification record and send the WhatsApp template message."""
    if not whatsapp_helper.is_configured():
        return

    items = db.query(models.OrderItem).filter(models.OrderItem.order_id == order.id).all()
    items_summary = _build_items_summary(items)
    payment_label = _build_payment_label(order)
    total_str = f"₹{order.total:,.0f}"

    phone = order.customer_phone
    # Ensure E.164 format
    phone_digits = "".join(c for c in phone if c.isdigit())
    if not phone_digits.startswith("+"):
        if len(phone_digits) == 10:
            phone_digits = "+91" + phone_digits
        else:
            phone_digits = "+" + phone_digits

    body_params = whatsapp_helper.build_order_confirm_params(
        customer_name=order.customer_name,
        order_number=order.order_number,
        items_summary=items_summary,
        total=total_str,
        payment_method=payment_label,
    )

    notification = models.Notification(
        order_id=order.id,
        order_number=order.order_number,
        customer_name=order.customer_name,
        customer_phone=phone_digits,
        message_type="order_confirm",
        status="pending",
    )
    db.add(notification)
    db.flush()

    try:
        result = whatsapp_helper.send_template_message(
            phone=phone_digits,
            template_name=whatsapp_helper.ORDER_TEMPLATE,
            language_code=whatsapp_helper.TEMPLATE_LANG,
            body_params=body_params,
        )
        notification.whatsapp_message_id = result.get("message_id", "")
        notification.status = "sent"
        notification.sent_at = _utcnow()
    except Exception as exc:
        notification.status = "failed"
        notification.error_message = str(exc)[:500]
        logger.warning("WhatsApp send failed for order %s: %s", order.order_number, exc)

    db.commit()


WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
WHATSAPP_APP_SECRET = os.getenv("WHATSAPP_APP_SECRET", "")


@app.get("/api/webhooks/whatsapp")
def whatsapp_webhook_verify(request: Request):
    """Meta's one-time webhook verification handshake."""
    params = request.query_params
    if (
        WHATSAPP_VERIFY_TOKEN
        and params.get("hub.mode") == "subscribe"
        and secrets.compare_digest(params.get("hub.verify_token", ""), WHATSAPP_VERIFY_TOKEN)
    ):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@app.post("/api/webhooks/whatsapp")
async def whatsapp_webhook(request: Request, background: BackgroundTasks):
    """Meta Cloud API webhook — message status updates (sent / delivered / read / failed)
    and review-form answers (nfm_reply messages, saved in the background)."""
    raw = await request.body()
    if WHATSAPP_APP_SECRET:
        import hashlib
        import hmac
        expected = "sha256=" + hmac.new(WHATSAPP_APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, request.headers.get("x-hub-signature-256", "")):
            raise HTTPException(status_code=403, detail="Invalid signature")
    else:
        logger.warning("WHATSAPP_APP_SECRET not set — WhatsApp webhook calls are not verified")
    try:
        body = await request.json()
    except ValueError:
        return {"status": "ok"}
    entry = body.get("entry", [{}])
    if not entry:
        return {"status": "ok"}

    changes = entry[0].get("changes", [{}])
    if not changes:
        return {"status": "ok"}

    value = changes[0].get("value", {})
    for message in value.get("messages", []) or []:
        if message.get("type") == "interactive" and (message.get("interactive") or {}).get("type") == "nfm_reply":
            # photo downloads can take a while; answer Meta right away
            background.add_task(review_requests.handle_flow_reply, message, store_upload)
    statuses = value.get("statuses", [])
    db = SessionLocal()
    try:
        for status_update in statuses:
            msg_id = status_update.get("id", "")
            new_status = status_update.get("status", "")
            timestamp = status_update.get("timestamp", "")

            if not msg_id:
                continue

            notification = db.query(models.Notification).filter(
                models.Notification.whatsapp_message_id == msg_id
            ).first()
            if not notification:
                continue

            notification.status = new_status
            if new_status == "delivered" and timestamp:
                notification.delivered_at = datetime.datetime.fromtimestamp(int(timestamp), tz=datetime.timezone.utc).replace(tzinfo=None)
            elif new_status == "read" and timestamp:
                notification.read_at = datetime.datetime.fromtimestamp(int(timestamp), tz=datetime.timezone.utc).replace(tzinfo=None)
            elif new_status == "failed":
                errors = status_update.get("errors", [])
                notification.error_message = str(errors)[:500] if errors else "Delivery failed"

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("WhatsApp webhook processing error: %s", exc)
    finally:
        db.close()

    return {"status": "ok"}


# ============================================================
# ADMIN NOTIFICATIONS  (list + resend)
# ============================================================
@app.get("/api/admin/notifications", response_model=schemas.NotificationListResponse)
def admin_list_notifications(
    status_filter: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    q = db.query(models.Notification)
    if status_filter:
        q = q.filter(models.Notification.status == status_filter)
    total = q.count()
    items = q.order_by(models.Notification.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return schemas.NotificationListResponse(items=items, total=total)


@app.delete("/api/admin/notifications/{notification_id}")
def admin_delete_notification(notification_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    deleted = db.query(models.Notification).filter(models.Notification.id == notification_id).delete(synchronize_session=False)
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.commit()
    return {"deleted": 1}


@app.post("/api/admin/notifications/bulk-delete")
def admin_bulk_delete_notifications(payload: schemas.IdList, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    deleted = db.query(models.Notification).filter(models.Notification.id.in_(payload.ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@app.get("/api/admin/notifications/{notification_id}", response_model=schemas.NotificationOut)
def admin_get_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    n = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    return n


@app.post("/api/admin/notifications/{notification_id}/resend", response_model=schemas.NotificationOut)
def admin_resend_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    n = db.query(models.Notification).filter(models.Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not whatsapp_helper.is_configured():
        raise HTTPException(status_code=400, detail="WhatsApp is not configured")

    order = db.query(models.Order).options(joinedload(models.Order.items)).filter(
        models.Order.id == n.order_id
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Associated order not found")

    if n.message_type == owner_alerts.MESSAGE_TYPE:
        # owner alert: rebuild the values from the order and send to the same owner number
        n.status = "pending"
        n.error_message = ""
        db.flush()
        owner_alerts.deliver(n, owner_alerts.build_params(db, order))
        db.commit()
        db.refresh(n)
        return n

    if n.message_type == review_requests.REWARD_MESSAGE_TYPE:
        # same coupon again; plain text only reaches them within 24 h of their last message
        code = review_requests.reward_code(n)
        if not code:
            raise HTTPException(status_code=400, detail="No coupon code recorded on this notification")
        n.status = "pending"
        db.flush()
        review_requests.deliver_reward(n, order, code)
        if n.status == "sent":
            n.error_message = f"Coupon {code}"
        db.commit()
        db.refresh(n)
        return n

    if n.message_type == review_requests.THANKS_MESSAGE_TYPE:
        n.status = "pending"
        n.error_message = ""
        db.flush()
        try:
            result = whatsapp_helper.send_text_message(n.customer_phone, review_requests.thanks_text(order.customer_name))
            n.whatsapp_message_id = result.get("message_id", "")
            n.status = "sent"
            n.sent_at = _utcnow()
        except Exception as exc:
            n.status = "failed"
            n.error_message = str(exc)[:500]
        db.commit()
        db.refresh(n)
        return n

    if n.message_type == review_requests.MESSAGE_TYPE:
        n.status = "pending"
        n.error_message = ""
        db.flush()
        review_requests.deliver(n, order)
        db.commit()
        db.refresh(n)
        return n

    if n.message_type == "order_shipped":
        # tracking-id message: re-send with the same template + buttons
        n.status = "pending"
        n.error_message = ""
        db.flush()
        try:
            result = whatsapp_helper.send_shipped_message(
                n.customer_phone, order.customer_name, order.order_number,
                order.courier_name or delhivery_helper.COURIER_NAME, order.awb or "",
            )
            n.whatsapp_message_id = result.get("message_id", "")
            n.status = "sent"
            n.sent_at = _utcnow()
            order.shipped_msg_sent = True
        except Exception as exc:
            n.status = "failed"
            n.error_message = str(exc)[:500]
        db.commit()
        db.refresh(n)
        return n

    items = order.items
    items_summary = _build_items_summary(items)
    payment_label = _build_payment_label(order)
    total_str = f"₹{order.total:,.0f}"
    body_params = whatsapp_helper.build_order_confirm_params(
        customer_name=order.customer_name,
        order_number=order.order_number,
        items_summary=items_summary,
        total=total_str,
        payment_method=payment_label,
    )

    n.status = "pending"
    n.error_message = ""
    db.flush()

    try:
        result = whatsapp_helper.send_template_message(
            phone=n.customer_phone,
            template_name=whatsapp_helper.ORDER_TEMPLATE,
            language_code=whatsapp_helper.TEMPLATE_LANG,
            body_params=body_params,
        )
        n.whatsapp_message_id = result.get("message_id", "")
        n.status = "sent"
        n.sent_at = _utcnow()
    except Exception as exc:
        n.status = "failed"
        n.error_message = str(exc)[:500]

    db.commit()
    db.refresh(n)
    return n


# ============================================================
# OFFERS  (Buy X Get Y — admin managed, applied at checkout)
# ============================================================
def _offer_product_ids(offer: models.Offer) -> List[int]:
    ids = []
    for part in (offer.product_ids or "").split(","):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    return ids


def _offer_out(offer: models.Offer) -> schemas.OfferOut:
    return schemas.OfferOut(
        id=offer.id,
        name=offer.name,
        buy_quantity=offer.buy_quantity,
        get_quantity=offer.get_quantity,
        scope=offer.scope,
        category=offer.category or None,
        product_ids=_offer_product_ids(offer),
        is_active=offer.is_active,
        starts_at=offer.starts_at,
        ends_at=offer.ends_at,
        created_at=offer.created_at,
    )


def _apply_offer_fields(offer: models.Offer, payload) -> None:
    offer.name = payload.name.strip()
    offer.buy_quantity = payload.buy_quantity
    offer.get_quantity = payload.get_quantity
    offer.scope = payload.scope
    offer.category = (payload.category or "") if payload.scope == models.OfferScope.category else ""
    if payload.scope == models.OfferScope.products:
        unique_ids = sorted(set(int(pid) for pid in payload.product_ids))
        offer.product_ids = ",".join(str(pid) for pid in unique_ids)
    else:
        offer.product_ids = ""
    offer.is_active = payload.is_active
    offer.starts_at = _to_naive_utc(payload.starts_at)
    offer.ends_at = _to_naive_utc(payload.ends_at)


@app.get("/api/admin/offers")
def admin_list_offers(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    offers = db.query(models.Offer).order_by(models.Offer.created_at.desc()).all()
    return [_offer_out(o) for o in offers]


@app.post("/api/admin/offers")
def admin_create_offer(payload: schemas.OfferCreate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    offer = models.Offer(created_at=_utcnow())
    _apply_offer_fields(offer, payload)
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return _offer_out(offer)


@app.put("/api/admin/offers/{offer_id}")
def admin_update_offer(offer_id: int, payload: schemas.OfferUpdate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    offer = db.query(models.Offer).filter(models.Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    merged = schemas.OfferCreate(
        name=payload.name if payload.name is not None else offer.name,
        buy_quantity=payload.buy_quantity if payload.buy_quantity is not None else offer.buy_quantity,
        get_quantity=payload.get_quantity if payload.get_quantity is not None else offer.get_quantity,
        scope=payload.scope if payload.scope is not None else offer.scope,
        category=payload.category if payload.category is not None else offer.category,
        product_ids=payload.product_ids if payload.product_ids is not None else _offer_product_ids(offer),
        is_active=payload.is_active if payload.is_active is not None else offer.is_active,
        starts_at=payload.starts_at if payload.starts_at is not None else offer.starts_at,
        ends_at=payload.ends_at if payload.ends_at is not None else offer.ends_at,
    )
    _apply_offer_fields(offer, merged)
    db.commit()
    db.refresh(offer)
    return _offer_out(offer)


@app.patch("/api/admin/offers/{offer_id}/toggle")
def admin_toggle_offer(offer_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    offer = db.query(models.Offer).filter(models.Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    offer.is_active = not offer.is_active
    db.commit()
    return {"id": offer.id, "is_active": offer.is_active}


@app.delete("/api/admin/offers/{offer_id}")
def admin_delete_offer(offer_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    offer = db.query(models.Offer).filter(models.Offer.id == offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    db.delete(offer)
    db.commit()
    return {"detail": "Offer deleted"}


# ============================================================
# COUPONS  (percentage discount codes — validated at checkout)
# ============================================================
@app.post("/api/coupons/validate", response_model=schemas.CouponValidateResponse)
def validate_coupon_api(payload: schemas.CouponValidateRequest, db: Session = Depends(get_db)):
    """Public endpoint: check a code. Exact amounts come from /api/cart/quote, which knows the cart items."""
    coupon, reason = check_coupon(db, payload.code, payload.subtotal)
    if not coupon:
        return schemas.CouponValidateResponse(valid=False, message=reason or "Enter a coupon code.")
    kind = (coupon.discount_type or "percent")
    amount = round(payload.subtotal * (coupon.discount_percent or 0) / 100.0, 2) if kind == "percent" else (round(min(coupon.flat_amount or 0, payload.subtotal), 2) if kind == "flat" else 0.0)
    label = coupon_label(coupon)
    return schemas.CouponValidateResponse(
        valid=True, code=coupon.code, discount_type=kind, discount_percent=coupon.discount_percent or 0,
        discount_amount=amount, label=label, message=f"{label} applied!",
    )


def _coupon_out(coupon: models.Coupon) -> dict:
    data = schemas.CouponOut.model_validate(coupon).model_dump()
    data["discount_type"] = coupon.discount_type or "percent"
    data["label"] = coupon_label(coupon)
    return data


def _apply_coupon_fields(coupon: models.Coupon, payload: schemas.CouponBase) -> None:
    coupon.code = payload.code.strip().upper()
    coupon.discount_type = payload.discount_type
    coupon.discount_percent = payload.discount_percent if payload.discount_type == "percent" else 0
    coupon.flat_amount = payload.flat_amount if payload.discount_type == "flat" else 0
    coupon.buy_quantity = payload.buy_quantity if payload.discount_type == "bxgy" else 0
    coupon.get_quantity = payload.get_quantity if payload.discount_type == "bxgy" else 0
    coupon.max_uses = payload.max_uses
    coupon.min_order = payload.min_order
    coupon.is_active = payload.is_active
    coupon.starts_at = _to_naive_utc(payload.starts_at)
    coupon.ends_at = _to_naive_utc(payload.ends_at)


@app.get("/api/admin/coupons")
def admin_list_coupons(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return [_coupon_out(c) for c in db.query(models.Coupon).order_by(models.Coupon.created_at.desc()).all()]


@app.get("/api/admin/coupons/{coupon_id}")
def admin_get_coupon(coupon_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    coupon = db.query(models.Coupon).filter(models.Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    return _coupon_out(coupon)


@app.post("/api/admin/coupons")
def admin_create_coupon(payload: schemas.CouponCreate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    code = payload.code.strip().upper()
    if db.query(models.Coupon).filter(models.Coupon.code == code).first():
        raise HTTPException(status_code=400, detail="A coupon with this code already exists.")
    coupon = models.Coupon(created_at=_utcnow(), times_used=0)
    _apply_coupon_fields(coupon, payload)
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return _coupon_out(coupon)


@app.put("/api/admin/coupons/{coupon_id}")
def admin_update_coupon(coupon_id: int, payload: schemas.CouponUpdate, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    coupon = db.query(models.Coupon).filter(models.Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    new_code = payload.code.strip().upper()
    if db.query(models.Coupon).filter(models.Coupon.code == new_code, models.Coupon.id != coupon_id).first():
        raise HTTPException(status_code=400, detail="A coupon with this code already exists.")
    _apply_coupon_fields(coupon, payload)
    db.commit()
    db.refresh(coupon)
    return _coupon_out(coupon)


@app.patch("/api/admin/coupons/{coupon_id}/toggle")
def admin_toggle_coupon(coupon_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    coupon = db.query(models.Coupon).filter(models.Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    coupon.is_active = not coupon.is_active
    db.commit()
    return {"id": coupon.id, "is_active": coupon.is_active}


@app.delete("/api/admin/coupons/{coupon_id}")
def admin_delete_coupon(coupon_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    coupon = db.query(models.Coupon).filter(models.Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found")
    db.delete(coupon)
    db.commit()
    return {"detail": "Coupon deleted"}


# ============================================================
# ADMIN DASHBOARD STATS
# ============================================================
_BOT_UA = re.compile(r"bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|monitor|curl|python|wget", re.I)
_IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))


def _today_ist() -> datetime.date:
    return datetime.datetime.now(_IST).date()


@app.post("/api/products/{slug}/like")
def like_product(slug: str, payload: schemas.LikeIn, request: Request, db: Session = Depends(get_db)):
    """Visitor ❤ like (no login). The browser remembers it liked the product; this caps abuse per IP."""
    ratelimit.limit(request, "like", max_hits=60, window_seconds=60 * 60)
    product = db.query(models.Product).filter(models.Product.slug == slug, models.Product.is_active == True).first()  # noqa: E712
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    # atomic +1 / -1 so simultaneous likes don't overwrite each other; never below 0
    likes = models.Product.likes
    change = likes + 1 if payload.liked else case((likes > 0, likes - 1), else_=0)
    db.query(models.Product).filter(models.Product.id == product.id).update({models.Product.likes: change}, synchronize_session=False)
    db.commit()
    db.refresh(product)
    return {"likes": product.likes}


LIVE_WINDOW_SECONDS = 90  # tabs ping every 30s; two missed pings = gone


def _bump(db: Session, model, where: dict, counters: dict) -> None:
    """Atomic += on a daily counter row; the first hit of the day creates it
    (retry once if another worker created it at the same moment)."""
    cols = {getattr(model, name): getattr(model, name) + n for name, n in counters.items() if n}
    if not cols:
        return
    for _ in range(2):
        if db.query(model).filter_by(**where).update(cols, synchronize_session=False):
            db.commit()
            return
        try:
            db.add(model(**where, **counters))
            db.commit()
            return
        except IntegrityError:
            db.rollback()


def _seen_live(db: Session, sid: str, device: str, source: str, path: str) -> None:
    now = models._utcnow()
    seen = {"last_seen": now, "path": path[:200]}
    if not db.query(models.LiveVisitor).filter_by(sid=sid).update(seen, synchronize_session=False):
        try:
            db.add(models.LiveVisitor(sid=sid, device=device, source=source, **seen))
            db.flush()
        except IntegrityError:
            db.rollback()
        # a new tab is also the moment to clear out yesterday's rows
        db.query(models.LiveVisitor).filter(
            models.LiveVisitor.last_seen < now - datetime.timedelta(days=1)
        ).delete(synchronize_session=False)
    db.commit()


@app.post("/api/track", status_code=204)
def track_visit(payload: schemas.TrackIn, request: Request, db: Session = Depends(get_db)):
    """Storefront page-view ping: bumps today's anonymous totals. Bots are ignored."""
    user_agent = request.headers.get("user-agent", "")
    if _BOT_UA.search(user_agent):
        return Response(status_code=204)
    ratelimit.limit(request, "track", max_hits=600, window_seconds=60 * 60)
    today = _today_ist()
    device = visits_helper.device(user_agent)
    source = visits_helper.source(user_agent, payload.referrer, payload.utm_source, payload.click_id)
    if not payload.heartbeat:
        _bump(db, models.SiteVisit, {"day": today}, {"visits": int(payload.new_visit), "page_views": 1})
    if payload.new_visit and not payload.heartbeat:
        _bump(db, models.VisitBreakdown, {"day": today, "kind": "device", "label": device}, {"visits": 1})
        _bump(db, models.VisitBreakdown, {"day": today, "kind": "source", "label": source}, {"visits": 1})
    if re.fullmatch(r"[A-Za-z0-9-]{8,40}", payload.sid):
        _seen_live(db, payload.sid, device, source, payload.path)
    return Response(status_code=204)


@app.get("/api/admin/visitors")
def admin_visitors(days: int = 7, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    """Admin → Visitors: who is on the site now, and visits by device and by source.
    days=0 means all time."""
    today = _today_ist()
    since = today - datetime.timedelta(days=days - 1) if days > 0 else None
    now = models._utcnow()

    live_rows = db.query(models.LiveVisitor).filter(
        models.LiveVisitor.last_seen >= now - datetime.timedelta(seconds=LIVE_WINDOW_SECONDS)
    ).order_by(models.LiveVisitor.last_seen.desc()).all()

    daily_q = db.query(models.SiteVisit)
    split_q = db.query(models.VisitBreakdown.kind, models.VisitBreakdown.label, func.sum(models.VisitBreakdown.visits))
    if since:
        daily_q = daily_q.filter(models.SiteVisit.day >= since)
        split_q = split_q.filter(models.VisitBreakdown.day >= since)
    daily = daily_q.order_by(models.SiteVisit.day.desc()).all()
    split = {"device": [], "source": []}
    for kind, label, visits in split_q.group_by(models.VisitBreakdown.kind, models.VisitBreakdown.label).all():
        split.setdefault(kind, []).append({"label": label, "visits": int(visits or 0)})
    for rows in split.values():
        rows.sort(key=lambda r: -r["visits"])
    first_split_day = db.query(func.min(models.VisitBreakdown.day)).scalar()
    return {
        "live": {
            "count": len(live_rows),
            "visitors": [
                {"device": v.device, "source": v.source, "path": v.path,
                 "seconds_ago": max(0, int((now - v.last_seen).total_seconds()))}
                for v in live_rows[:50]
            ],
        },
        "visits": sum(d.visits for d in daily),
        "page_views": sum(d.page_views for d in daily),
        "devices": split["device"],
        "sources": split["source"],
        "daily": [{"day": d.day.isoformat(), "visits": d.visits, "page_views": d.page_views} for d in daily[:60]],
        # device / source counting started later than the plain visit counter
        "breakdown_since": first_split_day.isoformat() if first_split_day else None,
    }


@app.post("/api/cart-activity", status_code=204)
def cart_activity(
    payload: schemas.CartActivityIn, request: Request, db: Session = Depends(get_db),
    customer: Optional[models.Customer] = Depends(customer_auth.get_current_customer),
):
    """The shopper's cart changed: keep Admin → Carts up to date. An empty cart closes the
    current row as "ordered" (right after checkout) or "cleared" (they removed everything)."""
    user_agent = request.headers.get("user-agent", "")
    if _BOT_UA.search(user_agent):
        return Response(status_code=204)
    ratelimit.limit(request, "cart_activity", max_hits=300, window_seconds=60 * 60)
    now = _utcnow()
    row = db.query(models.CartLog).filter(
        models.CartLog.cart_id == payload.cart_id, models.CartLog.status == "active"
    ).order_by(models.CartLog.id.desc()).first()
    lines = [line for line in payload.items if line.quantity > 0]

    if not lines:
        if row:
            row.status = "ordered" if payload.reason == "ordered" else "cleared"
            row.updated_at = now
            if customer:
                row.customer_phone = customer.phone
            db.commit()
        return Response(status_code=204)

    if row is None:
        row = models.CartLog(
            cart_id=payload.cart_id, created_at=now, device=visits_helper.device(user_agent),
            source=visits_helper.source(user_agent, payload.referrer, payload.utm_source, payload.click_id),
        )
        db.add(row)
        db.query(models.CartLog).filter(
            models.CartLog.updated_at < now - datetime.timedelta(days=REPORT_KEEP_DAYS)
        ).delete(synchronize_session=False)
    count = sum(line.quantity for line in lines)
    row.items = json.dumps([line.model_dump() for line in lines])
    row.item_count = count
    row.peak_count = max(row.peak_count or 0, count)
    row.value = round(sum(line.price * line.quantity for line in lines), 2)
    row.ip = ratelimit.client_ip(request)[:64]
    row.updated_at = now
    if customer:
        row.customer_phone = customer.phone
    db.commit()
    return Response(status_code=204)


def _customer_names(db: Session, phones) -> dict:
    phones = {p for p in phones if p}
    if not phones:
        return {}
    return {c.phone: c.name for c in db.query(models.Customer).filter(models.Customer.phone.in_(phones)).all()}


@app.get("/api/admin/carts")
def admin_carts(status: str = "", days: int = 30, db: Session = Depends(get_db),
                current: models.Admin = Depends(auth.get_current_admin)):
    """Admin → Carts: every cart shoppers filled in the period, newest activity first."""
    query = db.query(models.CartLog)
    if days > 0:
        query = query.filter(models.CartLog.updated_at >= _utcnow() - datetime.timedelta(days=days))
    counts = {"active": 0, "cleared": 0, "ordered": 0}
    for state, n in query.with_entities(models.CartLog.status, func.count()).group_by(models.CartLog.status).all():
        counts[state] = n
    if status in counts:
        query = query.filter(models.CartLog.status == status)
    rows = query.order_by(models.CartLog.updated_at.desc()).limit(500).all()
    names = _customer_names(db, [r.customer_phone for r in rows])
    return {
        "counts": counts,
        "carts": [{
            "id": r.id, "status": r.status, "ip": r.ip, "device": r.device, "source": r.source,
            "customer_phone": r.customer_phone, "customer_name": names.get(r.customer_phone, ""),
            "items": json.loads(r.items or "[]"), "item_count": r.item_count, "peak_count": r.peak_count,
            "value": r.value, "created_at": r.created_at.isoformat() + "Z", "updated_at": r.updated_at.isoformat() + "Z",
        } for r in rows],
    }


@app.get("/api/admin/accounts")
def admin_accounts(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    """Admin → Accounts: customer accounts, and the log of customer and admin logins."""
    order_counts = dict(db.query(models.Order.customer_id, func.count()).filter(
        models.Order.customer_id.isnot(None)).group_by(models.Order.customer_id).all())
    last_login = dict(db.query(models.LoginEvent.who, func.max(models.LoginEvent.created_at)).filter(
        models.LoginEvent.kind == "customer", models.LoginEvent.ok == True  # noqa: E712
    ).group_by(models.LoginEvent.who).all())
    customers = db.query(models.Customer).order_by(models.Customer.created_at.desc()).limit(1000).all()
    events = db.query(models.LoginEvent).order_by(models.LoginEvent.created_at.desc(), models.LoginEvent.id.desc()).limit(300).all()
    names = _customer_names(db, [e.who for e in events if e.kind == "customer"])
    iso = lambda d: d.isoformat() + "Z" if d else None  # noqa: E731
    return {
        "customers": [{
            "id": c.id, "name": c.name, "phone": c.phone, "email": c.email, "joined": iso(c.created_at),
            "orders": order_counts.get(c.id, 0), "last_login": iso(last_login.get(c.phone)),
        } for c in customers],
        "logins": [{
            "id": e.id, "kind": e.kind, "who": e.who, "name": names.get(e.who, "") if e.kind == "customer" else "",
            "ok": e.ok, "detail": e.detail, "ip": e.ip, "device": e.device, "at": iso(e.created_at),
        } for e in events],
    }


@app.get("/api/admin/stats")
def admin_stats(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    total_products = db.query(models.Product).count()
    # Real orders only. Opening the payment screen creates a "pending" order that holds stock;
    # if the shopper backs out it is never paid (and turns "failed" after the timeout) — not a sale.
    paid_statuses = [models.OrderStatus.paid, models.OrderStatus.shipped, models.OrderStatus.delivered]
    cod_no_advance = and_(  # COD with nothing to pay online is a confirmed order while still "pending"
        models.Order.status == models.OrderStatus.pending,
        models.Order.payment_method == "cod",
        func.coalesce(models.Order.cod_advance_paid, 0) <= 0,
    )
    total_orders = db.query(models.Order).filter(or_(models.Order.status.in_(paid_statuses), cod_no_advance)).count()
    unpaid_checkouts = db.query(models.Order).filter(
        models.Order.status.in_([models.OrderStatus.pending, models.OrderStatus.failed]), ~cod_no_advance
    ).count()
    # only real sales: unpaid (pending), failed and cancelled orders are not revenue
    revenue_sum = db.query(func.coalesce(func.sum(models.Order.total), 0.0)).filter(
        models.Order.status.in_([models.OrderStatus.paid, models.OrderStatus.shipped, models.OrderStatus.delivered])
    ).scalar()
    low_stock = db.query(models.ProductSize).filter(models.ProductSize.stock <= 3, models.ProductSize.stock > 0).count()
    out_of_stock = db.query(models.ProductSize).filter(models.ProductSize.stock == 0).count()
    today = _today_ist()
    visit_rows = db.query(models.SiteVisit).all()
    def visit_sum(field, since=None):
        return sum(getattr(r, field) or 0 for r in visit_rows if since is None or r.day >= since)
    return {
        "visitors_today": visit_sum("visits", today),
        "visitors_7d": visit_sum("visits", today - datetime.timedelta(days=6)),
        "visitors_total": visit_sum("visits"),
        "page_views_today": visit_sum("page_views", today),
        "page_views_total": visit_sum("page_views"),
        "total_products": total_products,
        "total_orders": total_orders,
        "unpaid_checkouts": unpaid_checkouts,
        "revenue": float(revenue_sum),
        "low_stock_sizes": low_stock,
        "out_of_stock_sizes": out_of_stock,
    }


# ============================================================
# CUSTOM T-SHIRT — public
# ============================================================
CUSTOM_ALLOWED_TYPES = {**ALLOWED_IMAGE_TYPES, "application/pdf": ".pdf"}


@app.get("/api/custom/config", response_model=schemas.CustomConfigOut)
def get_custom_config(db: Session = Depends(get_db)):
    config = db.query(models.CustomTshirtConfig).first()
    if not config:
        raise HTTPException(status_code=404, detail="Custom t-shirt not configured")
    return config


@app.get("/api/custom/colors", response_model=List[schemas.CustomColorOut])
def get_custom_colors(db: Session = Depends(get_db)):
    return db.query(models.CustomTshirtColor).filter(
        models.CustomTshirtColor.is_active == True  # noqa: E712
    ).order_by(models.CustomTshirtColor.position).all()


def _is_our_custom_upload(url: str) -> bool:
    """Design links on a custom order must be files our own upload endpoint stored."""
    name = (url or "").rsplit("/", 1)[-1]
    if not re.fullmatch(r"custom-[0-9a-f]{32}\.(jpg|png|webp|gif|pdf)", name):
        return False
    if url == f"/uploads/custom/{name}":
        return True
    bucket = os.getenv("GCS_BUCKET_NAME", "")
    return bool(bucket) and url == f"https://storage.googleapis.com/{bucket}/{name}"


@app.post("/api/custom/designs/upload")
async def upload_custom_design(
    request: Request,
    file: UploadFile = File(...),
    print_area: str = Form("front", max_length=20),
    notes: str = Form("", max_length=1000),
):
    ratelimit.limit(request, "custom_upload", max_hits=20, window_seconds=60 * 60)
    if file.content_type not in CUSTOM_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    contents = b""
    while chunk := await file.read(8192):
        contents += chunk
        if len(contents) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 10 MB.")

    _check_file_matches_type(contents, file.content_type)
    fname = f"custom-{uuid.uuid4().hex}{CUSTOM_ALLOWED_TYPES[file.content_type]}"
    url = store_upload(contents, fname, file.content_type, "custom")
    file_type = "pdf" if file.content_type == "application/pdf" else "image"
    return {"file_url": url, "file_name": file.filename, "file_type": file_type, "print_area": print_area, "notes": notes}


@app.post("/api/custom/quote", response_model=schemas.CustomQuoteOut)
def custom_quote(payload: schemas.CustomQuoteRequest, db: Session = Depends(get_db)):
    config = db.query(models.CustomTshirtConfig).first()
    if not config:
        raise HTTPException(status_code=404, detail="Custom t-shirt not configured")

    total_pieces = sum(
        s.quantity for sel in payload.colors for s in sel.sizes
    )
    if total_pieces < max(config.min_order_qty or 0, 1):
        raise HTTPException(status_code=400, detail=f"Minimum order is {config.min_order_qty} pieces")

    base_total = total_pieces * config.base_price

    discount_pct = 0.0
    tiers = db.query(models.CustomTshirtQtyDiscount).order_by(models.CustomTshirtQtyDiscount.min_qty.desc()).all()
    for tier in tiers:
        if total_pieces >= tier.min_qty and (tier.max_qty is None or total_pieces <= tier.max_qty):
            discount_pct = tier.discount_percent
            break

    discount_amount = base_total * (discount_pct / 100)
    raw_settings = {r.key: r.value for r in db.query(models.Setting).all()}
    shipping_fee = float(raw_settings.get("delivery_fee", "45"))
    free_threshold = float(raw_settings.get("free_shipping_threshold", "1000"))
    if base_total >= free_threshold:
        shipping_fee = 0

    return schemas.CustomQuoteOut(
        total_pieces=total_pieces,
        base_price=config.base_price,
        subtotal=base_total,
        discount_percent=discount_pct,
        discount_amount=discount_amount,
        shipping_fee=shipping_fee,
        total=base_total - discount_amount + shipping_fee,
    )


@app.post("/api/custom/order", response_model=schemas.OrderOut)
def create_custom_order(
    payload: schemas.CustomOrderCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current: models.Customer = Depends(customer_auth.get_current_customer),
):
    config = db.query(models.CustomTshirtConfig).first()
    if not config or not config.is_active:
        raise HTTPException(status_code=400, detail="Custom t-shirt printing is not available")

    total_pieces = sum(
        s.quantity for sel in payload.colors for s in sel.sizes
    )
    if total_pieces < max(config.min_order_qty or 0, 1):
        raise HTTPException(status_code=400, detail=f"Minimum order is {config.min_order_qty} pieces")

    payment_method = payload.payment_method if payload.payment_method in ("cod", "online") else "cod"
    raw_settings = {r.key: r.value for r in db.query(models.Setting).all()}
    if payment_method == "cod" and raw_settings.get("cod_enabled", "false") != "true":
        raise HTTPException(status_code=400, detail="Cash on delivery is not available.")

    customer_id = None
    if current:
        customer_id = current.id
    else:
        phone_digits = "".join(c for c in payload.customer_phone if c.isdigit())
        if len(phone_digits) > 10:
            phone_digits = phone_digits[-10:]
        existing = db.query(models.Customer).filter(models.Customer.phone == phone_digits).first()
        if existing:
            customer_id = existing.id
        else:
            new_cust = models.Customer(phone=phone_digits, name=payload.customer_name, email=payload.customer_email)
            db.add(new_cust)
            db.flush()
            customer_id = new_cust.id

    order = models.Order(
        order_number=generate_order_number(),
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        shipping_address=payload.shipping_address,
        city=payload.city, state=payload.state, pincode=payload.pincode,
        status=models.OrderStatus.pending,
        payment_method=payment_method,
        customer_id=customer_id,
        order_type=models.OrderType.custom,
        custom_total_pieces=total_pieces,
    )
    db.add(order)
    db.flush()

    base_total = total_pieces * config.base_price
    discount_pct = 0.0
    tiers = db.query(models.CustomTshirtQtyDiscount).order_by(models.CustomTshirtQtyDiscount.min_qty.desc()).all()
    for tier in tiers:
        if total_pieces >= tier.min_qty and (tier.max_qty is None or total_pieces <= tier.max_qty):
            discount_pct = tier.discount_percent
            break
    discount_amount = base_total * (discount_pct / 100)

    for sel in payload.colors:
        color = db.query(models.CustomTshirtColor).filter(models.CustomTshirtColor.id == sel.color_id).first()
        if not color:
            raise HTTPException(status_code=400, detail=f"Color {sel.color_id} not found")
        for size_info in sel.sizes:
            qty = size_info.quantity
            if qty == 0:
                continue
            size_label = size_info.size
            order_item = models.OrderItem(
                order_id=order.id,
                product_id=None,
                product_name=f"Custom T-Shirt ({color.name})",
                color_id=color.id,
                color_name=color.name,
                size=size_label,
                quantity=qty,
                unit_price=config.base_price,
                line_discount=0,
                is_custom=True,
                print_area=None,
                design_notes=None,
            )
            db.add(order_item)

    for design in payload.designs:
        if not _is_our_custom_upload(design.file_url):
            raise HTTPException(status_code=400, detail="Please upload your design again.")
        custom_design = models.CustomTshirtDesign(
            order_id=order.id,
            file_url=design.file_url,
            file_name=design.file_name,
            file_type=design.file_type,
            print_area=design.print_area,
            notes=design.notes,
        )
        db.add(custom_design)

    shipping_fee = float(raw_settings.get("delivery_fee", "45"))
    free_threshold = float(raw_settings.get("free_shipping_threshold", "1000"))
    if base_total >= free_threshold:
        shipping_fee = 0

    order.subtotal = base_total
    order.discount_amount = discount_amount
    order.shipping_fee = shipping_fee
    order.total = base_total - discount_amount + shipping_fee

    if payment_method == "cod":
        advance_pct = float(raw_settings.get("cod_advance_percent", "10"))
        order.cod_advance_percent = advance_pct
        order.cod_advance_paid = order.total * (advance_pct / 100)

    db.commit()
    db.refresh(order)
    _alert_owner_if_cod_confirmed(background, order)
    return order


# ============================================================
# CUSTOM T-SHIRT — admin
# ============================================================
@app.get("/api/admin/custom/config", response_model=schemas.CustomConfigOut)
def admin_get_custom_config(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    config = db.query(models.CustomTshirtConfig).first()
    if not config:
        config = models.CustomTshirtConfig(base_price=299, min_order_qty=10, is_active=True)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


@app.patch("/api/admin/custom/config", response_model=schemas.CustomConfigOut)
def admin_update_custom_config(
    payload: schemas.CustomConfigUpdate,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    config = db.query(models.CustomTshirtConfig).first()
    if not config:
        config = models.CustomTshirtConfig(base_price=299, min_order_qty=10, is_active=True)
        db.add(config)
        db.flush()
    if payload.base_price is not None:
        config.base_price = payload.base_price
    if payload.min_order_qty is not None:
        config.min_order_qty = payload.min_order_qty
    if payload.is_active is not None:
        config.is_active = payload.is_active
    db.commit()
    db.refresh(config)
    return config


@app.get("/api/admin/custom/colors", response_model=List[schemas.CustomColorOut])
def admin_list_custom_colors(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return db.query(models.CustomTshirtColor).order_by(models.CustomTshirtColor.position).all()


@app.post("/api/admin/custom/colors", response_model=schemas.CustomColorOut)
def admin_create_custom_color(
    payload: schemas.CustomColorIn,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    existing = db.query(models.CustomTshirtColor).filter(models.CustomTshirtColor.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Color name already exists")
    color = models.CustomTshirtColor(**payload.model_dump())
    db.add(color)
    db.commit()
    db.refresh(color)
    return color


@app.patch("/api/admin/custom/colors/{color_id}", response_model=schemas.CustomColorOut)
def admin_update_custom_color(
    color_id: int,
    payload: schemas.CustomColorUpdate,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    color = db.query(models.CustomTshirtColor).filter(models.CustomTshirtColor.id == color_id).first()
    if not color:
        raise HTTPException(status_code=404, detail="Color not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(color, field, value)
    db.commit()
    db.refresh(color)
    return color


@app.delete("/api/admin/custom/colors/{color_id}")
def admin_delete_custom_color(
    color_id: int,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    color = db.query(models.CustomTshirtColor).filter(models.CustomTshirtColor.id == color_id).first()
    if not color:
        raise HTTPException(status_code=404, detail="Color not found")
    db.delete(color)
    db.commit()
    return {"detail": "Color deleted"}


@app.get("/api/admin/custom/discounts", response_model=List[schemas.CustomQtyDiscountOut])
def admin_list_custom_discounts(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return db.query(models.CustomTshirtQtyDiscount).order_by(models.CustomTshirtQtyDiscount.position).all()


@app.post("/api/admin/custom/discounts", response_model=schemas.CustomQtyDiscountOut)
def admin_create_custom_discount(
    payload: schemas.CustomQtyDiscountIn,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    tier = models.CustomTshirtQtyDiscount(**payload.model_dump())
    db.add(tier)
    db.commit()
    db.refresh(tier)
    return tier


@app.put("/api/admin/custom/discounts/{tier_id}", response_model=schemas.CustomQtyDiscountOut)
def admin_update_custom_discount(
    tier_id: int,
    payload: schemas.CustomQtyDiscountIn,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    tier = db.query(models.CustomTshirtQtyDiscount).filter(models.CustomTshirtQtyDiscount.id == tier_id).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Discount tier not found")
    for field, value in payload.model_dump().items():
        setattr(tier, field, value)
    db.commit()
    db.refresh(tier)
    return tier


@app.delete("/api/admin/custom/discounts/{tier_id}")
def admin_delete_custom_discount(
    tier_id: int,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    tier = db.query(models.CustomTshirtQtyDiscount).filter(models.CustomTshirtQtyDiscount.id == tier_id).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Discount tier not found")
    db.delete(tier)
    db.commit()
    return {"detail": "Discount tier deleted"}


@app.get("/api/admin/custom/orders")
def admin_list_custom_orders(
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    orders = db.query(models.Order).filter(
        models.Order.order_type == models.OrderType.custom
    ).order_by(models.Order.created_at.desc()).all()
    return [schemas.OrderOut.model_validate(o) for o in orders]


@app.get("/api/admin/custom/orders/{order_id}")
def admin_get_custom_order(
    order_id: int,
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    order = db.query(models.Order).filter(
        models.Order.id == order_id, models.Order.order_type == models.OrderType.custom
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Custom order not found")
    designs = db.query(models.CustomTshirtDesign).filter(
        models.CustomTshirtDesign.order_id == order.id
    ).all()
    out = schemas.OrderOut.model_validate(order)
    return {"order": out, "designs": [schemas.CustomDesignOut.model_validate(d) for d in designs]}


# ============================================================
# SUBSCRIBERS (notify me about the next drop)
# ============================================================
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.post("/api/subscribe")
def subscribe(payload: schemas.SubscribeIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    ratelimit.limit(request, "subscribe", max_hits=10, window_seconds=60 * 60)
    contact = payload.contact.strip().lower()
    if _EMAIL_RE.match(contact):
        kind = "email"
    else:
        digits = re.sub(r"\D", "", contact)
        if len(digits) < 10 or len(digits) > 13:
            raise HTTPException(status_code=422, detail="Enter a valid email or phone number.")
        contact, kind = digits[-10:], "phone"
    existing = db.query(models.Subscriber).filter(models.Subscriber.contact == contact).first()
    if not existing:
        sub = models.Subscriber(contact=contact, kind=kind, source=payload.source)
        db.add(sub)
        db.commit()
        # "You're on the list" email / WhatsApp — after the response, so sign-up stays instant
        background.add_task(launch_alerts.send_welcome, sub.id)
    elif existing.unsubscribed:  # signing up again opts back in
        existing.unsubscribed = False
        db.commit()
    return {"detail": "You're on the list."}


def _unsubscribe(s: int, t: str, db: Session) -> bool:
    sub = db.query(models.Subscriber).filter(models.Subscriber.id == s).first()
    if not sub or not hmac.compare_digest(t, launch_alerts.unsubscribe_token(sub.id, sub.contact)):
        return False
    sub.unsubscribed = True
    db.commit()
    return True


@app.get("/api/unsubscribe", response_class=HTMLResponse)
def unsubscribe_page(s: int = 0, t: str = "", db: Session = Depends(get_db)):
    """Link at the bottom of launch emails. No login: the token proves it's their link."""
    ok = _unsubscribe(s, t, db)
    message = "You're unsubscribed. We won't email you about drops again." if ok else "This unsubscribe link is invalid or has expired."
    return HTMLResponse(
        f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loopstitch</title></head><body style="margin:0;background:#0B0B0D;color:#F3F1EA;font-family:Arial,sans-serif;
display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><div style="font-family:Impact,Arial Narrow,sans-serif;font-size:28px;letter-spacing:1px">LOOPSTITCH<span style="color:#FF3B5C">.</span></div>
<p style="color:#A6A6AE;max-width:420px">{message}</p><a href="/" style="color:#E8FF52">Back to the store</a></div></body></html>""",
        status_code=200 if ok else 400,
    )


@app.post("/api/unsubscribe")
def unsubscribe_one_click(s: int = 0, t: str = "", db: Session = Depends(get_db)):
    """RFC 8058 one-click unsubscribe (the button Gmail shows next to the sender)."""
    if not _unsubscribe(s, t, db):
        raise HTTPException(status_code=400, detail="Invalid unsubscribe link")
    return {"detail": "Unsubscribed"}


@app.get("/api/admin/launch-alerts")
def admin_launch_alerts_status(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    subs = db.query(models.Subscriber).all()
    active = [x for x in subs if not x.unsubscribed]
    raw = _get_all_settings(db)
    return {
        "email_configured": mailer.is_configured(),
        "whatsapp_configured": whatsapp_helper.is_configured(),
        "total": len(active),
        "email": sum(1 for x in active if x.kind == "email"),
        "whatsapp": sum(1 for x in active if x.kind != "email"),
        "welcomed": sum(1 for x in active if x.welcomed_at),
        "sent": sum(1 for x in active if x.notified_at),
        "failed": sum(1 for x in active if not x.notified_at and x.notify_error),
        "unsubscribed": len(subs) - len(active),
        "sent_at": raw.get("launch_alerts_sent_at", ""),
        "launch_label": launch_alerts.launch_label(raw),
    }


@app.post("/api/admin/launch-alerts/test")
def admin_launch_alerts_test(payload: schemas.LaunchAlertTest, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    try:
        channel = launch_alerts.send_test(payload.contact, payload.kind, db)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Test failed: {exc}")
    label = "sign-up confirmation" if payload.kind == "welcome" else "1-minute launch reminder"
    return {"detail": f"Test {label} sent by {channel} to {payload.contact}"}


@app.post("/api/admin/launch-alerts/welcome-now")
def admin_launch_alerts_welcome_now(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    """Send 'You're on the list' to everyone who hasn't had it yet."""
    return launch_alerts.send_welcome_backlog(db)


@app.post("/api/admin/launch-alerts/send-now")
def admin_launch_alerts_send_now(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    """Send the launch reminder now to everyone not yet notified (also retries failures)."""
    counts = launch_alerts.send_pending(db)
    set_setting(db, "launch_alerts_sent_at", launch_alerts._utcnow().isoformat(timespec="seconds"))
    db.commit()
    return counts


@app.get("/api/admin/subscribers")
def admin_list_subscribers(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    rows = db.query(models.Subscriber).order_by(models.Subscriber.created_at.desc()).all()
    return [{"id": r.id, "contact": r.contact, "kind": r.kind, "source": r.source, "created_at": r.created_at,
             "welcomed_at": r.welcomed_at, "notified_at": r.notified_at, "notify_error": r.notify_error or "",
             "unsubscribed": bool(r.unsubscribed)} for r in rows]


# ============================================================
# REVIEWS (public submit -> admin approves)
# ============================================================
@app.get("/api/products/{slug}/reviews", response_model=schemas.ReviewSummary)
def product_reviews(slug: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.slug == slug).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    reviews = (
        db.query(models.Review)
        .filter(models.Review.product_id == product.id, models.Review.is_approved == True)  # noqa: E712
        .order_by(models.Review.created_at.desc())
        .all()
    )
    avg = round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else 0.0
    return schemas.ReviewSummary(average=avg, count=len(reviews), reviews=reviews)


@app.get("/api/reviews/featured", response_model=List[schemas.ReviewOut])
def featured_reviews(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Review)
        .filter(models.Review.is_approved == True, models.Review.rating >= 4)  # noqa: E712
        .order_by(models.Review.created_at.desc())
        .limit(30)
        .all()
    )
    return _one_per_order(rows)[:6]


@app.post("/api/products/{slug}/reviews")
def submit_review(slug: str, payload: schemas.ReviewIn, request: Request, db: Session = Depends(get_db)):
    ratelimit.limit(request, "review", max_hits=5, window_seconds=60 * 60)
    product = db.query(models.Product).filter(models.Product.slug == slug).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.add(models.Review(
        product_id=product.id, name=payload.name.strip(), rating=payload.rating,
        title=payload.title.strip(), body=payload.body.strip(), is_approved=False,
    ))
    db.commit()
    return {"detail": "Thanks! Your review will appear once it has been approved."}


@app.get("/api/admin/reviews", response_model=List[schemas.AdminReviewOut])
def admin_list_reviews(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    rows = db.query(models.Review).order_by(models.Review.created_at.desc()).all()
    return _one_per_order(rows)


def _one_per_order(rows: list) -> list:
    """A WhatsApp review is stored once per product in the order; keep the first copy only."""
    seen, out = set(), []
    for r in rows:
        if r.order_id is not None:
            if r.order_id in seen:
                continue
            seen.add(r.order_id)
        out.append(r)
    return out


def _review_copies(db: Session, review: models.Review) -> list:
    """The review plus its copies on the order's other products (approve / delete them together)."""
    if review.order_id is None:
        return [review]
    return db.query(models.Review).filter(models.Review.order_id == review.order_id).all()


@app.patch("/api/admin/reviews/{review_id}/toggle", response_model=schemas.AdminReviewOut)
def admin_toggle_review(review_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    approved = not review.is_approved
    for row in _review_copies(db, review):
        row.is_approved = approved
    db.commit()
    db.refresh(review)
    return review


@app.delete("/api/admin/reviews/{review_id}")
def admin_delete_review(review_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    for row in _review_copies(db, review):
        db.delete(row)
    db.commit()
    return {"detail": "Review deleted"}


# ============================================================
# ANNOUNCEMENTS (offer highlights managed from the admin)
# ============================================================
def _to_naive_utc(value: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)


def _apply_announcement(row: models.Announcement, payload: schemas.AnnouncementIn, db: Session) -> None:
    row.message = payload.message.strip()
    row.detail = payload.detail.strip()
    row.coupon_code = payload.coupon_code.strip().upper()
    if row.coupon_code and not db.query(models.Coupon).filter(models.Coupon.code == row.coupon_code).first():
        raise HTTPException(status_code=422, detail=f"There is no coupon called {row.coupon_code}. Create it under Coupons first, then pick it here.")
    link = payload.link_url.strip()
    # only same-site paths or https links, never javascript: URLs
    row.link_url = link if link.startswith("/") or link.startswith("https://") else ""
    row.link_label = payload.link_label.strip()
    row.style = payload.style
    row.placement = payload.placement
    row.is_active = payload.is_active
    row.starts_at = _to_naive_utc(payload.starts_at)
    row.ends_at = _to_naive_utc(payload.ends_at)


@app.get("/api/announcements", response_model=List[schemas.AnnouncementOut])
def public_announcements(db: Session = Depends(get_db)):
    now = _utcnow()
    rows = db.query(models.Announcement).filter(models.Announcement.is_active == True).order_by(models.Announcement.created_at.desc()).all()  # noqa: E712
    out = []
    for r in rows:
        if (r.starts_at and r.starts_at > now) or (r.ends_at and r.ends_at < now):
            continue
        item = schemas.AnnouncementOut.model_validate(r).model_dump()
        if r.coupon_code:
            # only advertise a code that shoppers can actually use right now (min order is checked in the cart)
            coupon, _ = check_coupon(db, r.coupon_code, float("inf"))
            item["coupon_code"] = coupon.code if coupon else ""
            item["coupon_label"] = coupon_label(coupon) if coupon else ""
        out.append(item)
    return out


@app.get("/api/admin/announcements", response_model=List[schemas.AnnouncementOut])
def admin_list_announcements(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return db.query(models.Announcement).order_by(models.Announcement.created_at.desc()).all()


@app.post("/api/admin/announcements", response_model=schemas.AnnouncementOut)
def admin_create_announcement(payload: schemas.AnnouncementIn, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = models.Announcement(created_at=_utcnow())
    _apply_announcement(row, payload, db)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.put("/api/admin/announcements/{announcement_id}", response_model=schemas.AnnouncementOut)
def admin_update_announcement(announcement_id: int, payload: schemas.AnnouncementIn, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Announcement not found")
    _apply_announcement(row, payload, db)
    db.commit()
    db.refresh(row)
    return row


@app.patch("/api/admin/announcements/{announcement_id}/toggle", response_model=schemas.AnnouncementOut)
def admin_toggle_announcement(announcement_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Announcement not found")
    row.is_active = not row.is_active
    db.commit()
    db.refresh(row)
    return row


@app.delete("/api/admin/announcements/{announcement_id}")
def admin_delete_announcement(announcement_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Announcement not found")
    db.delete(row)
    db.commit()
    return {"detail": "Announcement deleted"}


# ============================================================
# INSTAGRAM POSTS (admin pastes a public post/reel link; storefront embeds it)
# ============================================================
_IG_RE = re.compile(r"instagram\.com/(?:[A-Za-z0-9_.]+/)?(p|reels?|tv)/([A-Za-z0-9_-]{5,20})", re.IGNORECASE)


@app.get("/api/instagram", response_model=List[schemas.InstagramPostOut])
def public_instagram_posts(db: Session = Depends(get_db)):
    return (
        db.query(models.InstagramPost)
        .filter(models.InstagramPost.is_active == True)  # noqa: E712
        .order_by(models.InstagramPost.created_at.desc())
        .limit(6)
        .all()
    )


@app.get("/api/admin/instagram", response_model=List[schemas.InstagramPostOut])
def admin_list_instagram(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return db.query(models.InstagramPost).order_by(models.InstagramPost.created_at.desc()).all()


@app.post("/api/admin/instagram", response_model=schemas.InstagramPostOut)
def admin_add_instagram(payload: schemas.InstagramPostIn, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    match = _IG_RE.search(payload.url.strip())
    if not match:
        raise HTTPException(status_code=422, detail="That doesn't look like an Instagram post or reel link.")
    kind = "reel" if match.group(1).lower().startswith("reel") else match.group(1).lower()
    code = match.group(2)
    if db.query(models.InstagramPost).filter(models.InstagramPost.shortcode == code).first():
        raise HTTPException(status_code=409, detail="That post is already added.")
    row = models.InstagramPost(kind=kind, shortcode=code, created_at=_utcnow())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.patch("/api/admin/instagram/{post_id}/toggle", response_model=schemas.InstagramPostOut)
def admin_toggle_instagram(post_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.InstagramPost).filter(models.InstagramPost.id == post_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    row.is_active = not row.is_active
    db.commit()
    db.refresh(row)
    return row


@app.delete("/api/admin/instagram/{post_id}")
def admin_delete_instagram(post_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.InstagramPost).filter(models.InstagramPost.id == post_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(row)
    db.commit()
    return {"detail": "Post removed"}


# ============================================================
# INSTAGRAM VIDEOS (uploaded reels that autoplay muted on the storefront)
# ============================================================
ALLOWED_VIDEO_TYPES = {"video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov"}
MAX_VIDEO_SIZE = 25 * 1024 * 1024  # 25 MB
REELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "reels")
os.makedirs(REELS_DIR, exist_ok=True)


@app.get("/api/instagram/videos", response_model=List[schemas.InstagramVideoOut])
def public_instagram_videos(db: Session = Depends(get_db)):
    return (
        db.query(models.InstagramVideo)
        .filter(models.InstagramVideo.is_active == True)  # noqa: E712
        .order_by(models.InstagramVideo.created_at.desc())
        .limit(8)
        .all()
    )


@app.get("/api/admin/instagram/videos", response_model=List[schemas.InstagramVideoOut])
def admin_list_instagram_videos(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return db.query(models.InstagramVideo).order_by(models.InstagramVideo.created_at.desc()).all()


@app.post("/api/admin/instagram/videos", response_model=schemas.InstagramVideoOut)
async def admin_upload_instagram_video(
    file: UploadFile = File(...),
    link_url: str = Form(""),
    db: Session = Depends(get_db),
    current: models.Admin = Depends(auth.get_current_admin),
):
    ext = ALLOWED_VIDEO_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Upload an MP4, WebM or MOV video.")
    chunks, size = [], 0
    while chunk := await file.read(1024 * 256):
        size += len(chunk)
        if size > MAX_VIDEO_SIZE:
            raise HTTPException(status_code=400, detail="Video too large. Maximum size is 25 MB.")
        chunks.append(chunk)
    contents = b"".join(chunks)
    if not contents:
        raise HTTPException(status_code=400, detail="That file is empty.")

    link = link_url.strip()
    if link and not (link.startswith("https://www.instagram.com/") or link.startswith("https://instagram.com/")):
        raise HTTPException(status_code=422, detail="The link must be an Instagram address.")

    fname = f"{uuid.uuid4().hex}{ext}"
    url = store_upload(contents, fname, file.content_type, "reels")

    row = models.InstagramVideo(video_url=url, link_url=link, created_at=_utcnow())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.patch("/api/admin/instagram/videos/{video_id}/toggle", response_model=schemas.InstagramVideoOut)
def admin_toggle_instagram_video(video_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.InstagramVideo).filter(models.InstagramVideo.id == video_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Video not found")
    row.is_active = not row.is_active
    db.commit()
    db.refresh(row)
    return row


@app.delete("/api/admin/instagram/videos/{video_id}")
def admin_delete_instagram_video(video_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.InstagramVideo).filter(models.InstagramVideo.id == video_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Video not found")
    if row.video_url.startswith("/uploads/reels/"):
        try:
            os.remove(os.path.join(REELS_DIR, os.path.basename(row.video_url)))
        except OSError:
            pass
    elif os.getenv("GCS_BUCKET_NAME") and os.getenv("GCS_SERVICE_ACCOUNT_B64"):
        gcs.delete_from_gcs(gcs.get_filename_from_url(row.video_url))
    db.delete(row)
    db.commit()
    return {"detail": "Video removed"}


# ============================================================
# SITEMAP (served at /sitemap.xml via nginx)
# ============================================================
SITE_URL = os.getenv("SITE_URL", "https://loopstitch.online").rstrip("/")
STATIC_PAGES = [("/", "1.0"), ("/shop", "0.9"), ("/customize", "0.8"), ("/faq", "0.6"), ("/about", "0.5"), ("/terms", "0.3"), ("/privacy", "0.3")] \
    + [(info["path"], "0.8") for info in seo.PAGES.values() if info.get("landing")]


@app.get("/api/sitemap.xml")
def sitemap(db: Session = Depends(get_db)):
    from xml.sax.saxutils import escape
    urls = [f"<url><loc>{SITE_URL}{path}</loc><priority>{prio}</priority></url>" for path, prio in STATIC_PAGES]
    products = db.query(models.Product).filter(models.Product.is_active == True).all()  # noqa: E712
    for p in products:
        stamp = (p.updated_at or p.created_at)
        lastmod = f"<lastmod>{stamp.date().isoformat()}</lastmod>" if stamp else ""
        urls.append(f"<url><loc>{SITE_URL}/product/{escape(p.slug)}</loc>{lastmod}<priority>0.8</priority></url>")
    posts = db.query(models.BlogPost).filter(models.BlogPost.is_published == True).all()  # noqa: E712
    if posts:
        urls.append(f"<url><loc>{SITE_URL}/blog</loc><priority>0.6</priority></url>")
    for post in posts:
        stamp = post.updated_at or post.published_at
        lastmod = f"<lastmod>{stamp.date().isoformat()}</lastmod>" if stamp else ""
        urls.append(f"<url><loc>{SITE_URL}/blog/{escape(post.slug)}</loc>{lastmod}<priority>0.6</priority></url>")
    body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n"
    return Response(content=body, media_type="application/xml")


# ============================================================
# META (Facebook / Instagram) CATALOGUE FEED
# Commerce Manager → Catalogue → Data sources → Data feed → paste
# https://loopstitch.online/api/feeds/meta-catalog.csv  (Meta re-reads it on a schedule)
# ============================================================
META_FEED_COLUMNS = [
    "id", "item_group_id", "title", "description", "availability", "condition", "price", "sale_price",
    "link", "image_link", "additional_image_link", "brand", "google_product_category",
    "color", "size", "gender", "age_group",
]


def _meta_feed_rows(product: models.Product):
    """One row per colour + size (Meta's format for clothing), grouped by item_group_id."""
    link = f"{SITE_URL}/product/{product.slug}"
    on_sale = bool(product.compare_at_price and product.compare_at_price > product.price)
    money = lambda amount: f"{amount:.2f} INR"  # noqa: E731
    base = {
        "item_group_id": f"LS{product.id}",
        "title": seo.plain(product.name, 150),
        "description": seo.plain(product.description or product.name, 5000),
        "condition": "new",
        "price": money(product.compare_at_price if on_sale else product.price),
        "sale_price": money(product.price) if on_sale else "",
        "link": link,
        "brand": seo.BRAND,
        "google_product_category": "Apparel & Accessories > Clothing > Shirts & Tops",
        "gender": "unisex",
        "age_group": "adult",
    }
    colors = sorted(product.colors, key=lambda c: c.position)
    variants = [(c.id, c.name, c.images or product.images, c.sizes) for c in colors] or \
        [(0, product.colorway or "", product.images, product.sizes)]
    for color_id, color_name, images, sizes in variants:
        urls = [seo.absolute(img.url) for img in sorted(images, key=lambda i: (i.position, i.id))]
        if not urls:
            continue  # Meta rejects items without an image
        for size in sorted(sizes, key=lambda x: schemas.size_sort_key(x.size)):
            yield {
                **base,
                "id": f"LS{product.id}-{color_id}-{size.size}",
                "availability": "in stock" if (size.stock or 0) > 0 else "out of stock",
                "image_link": urls[0],
                "additional_image_link": ",".join(urls[1:10]),
                "color": color_name,
                "size": size.size,
            }


@app.get("/api/feeds/meta-catalog.csv")
def meta_catalog_feed(db: Session = Depends(get_db)):
    """Every active product as a Meta Commerce Manager data feed (CSV)."""
    products = (
        db.query(models.Product).options(*product_load_options())
        .filter(models.Product.is_active == True)  # noqa: E712
        .order_by(models.Product.id).all()
    )
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=META_FEED_COLUMNS)
    writer.writeheader()
    for product in products:
        for row in _meta_feed_rows(product):
            writer.writerow(row)
    return Response(content=out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Cache-Control": "public, max-age=3600"})


# ============================================================
# META CHECKOUT URL  (Commerce Manager -> Shops -> checkout on your website)
# Meta sends the shopper to  /checkout?products=<catalogue id>:<qty>,...&coupon=CODE
# The ids are the ones in the feed above; this turns them back into cart lines. Prices and
# totals are still worked out by the normal quote + order code when the shopper pays.
# ============================================================
_CATALOG_ID = re.compile(r"^LS(\d+)-(\d+)-(.+)$")
CHECKOUT_LINK_MAX_LINES = 30


@app.get("/api/checkout-link", response_model=schemas.CheckoutLinkOut)
def checkout_link(products: str = "", db: Session = Depends(get_db)):
    wanted = {}  # (product_id, color_id, size) -> quantity
    skipped = 0
    for entry in products.split(",")[:CHECKOUT_LINK_MAX_LINES]:
        catalog_id, _, qty = entry.strip().rpartition(":")
        match = _CATALOG_ID.match(catalog_id.strip())
        if not match or not qty.strip().isdigit() or int(qty) < 1:
            skipped += bool(entry.strip())
            continue
        key = (int(match.group(1)), int(match.group(2)), match.group(3).strip().upper())
        wanted[key] = wanted.get(key, 0) + int(qty)

    found = {}
    if wanted:
        rows = db.query(models.Product).options(*product_load_options()).filter(
            models.Product.id.in_({key[0] for key in wanted}), models.Product.is_active == True  # noqa: E712
        ).all()
        found = {p.id: p for p in rows}

    items = []
    for (product_id, color_id, size), quantity in wanted.items():
        product = found.get(product_id)
        color = next((c for c in product.colors if c.id == color_id), None) if product and color_id else None
        sizes = color.sizes if color else (product.sizes if product and not color_id else [])
        row = next((s for s in sizes if s.size.upper() == size and (color or s.color_id is None)), None)
        stock = (row.stock or 0) if row else 0
        if stock < 1:
            skipped += 1  # unknown, removed or sold out since Meta last read the feed
            continue
        size = row.size
        images = sorted((color.images if color and color.images else product.images), key=lambda i: (i.position, i.id))
        items.append({
            "key": f"{product.id}-{color.id if color else ''}-{size}",
            "productId": product.id, "slug": product.slug, "name": product.name, "price": product.price,
            "colorId": color.id if color else None,
            "color": color.name if color else (product.colorway or ""),
            "colorHex": color.hex_code if color else "",
            "image": images[0].url if images else "",
            "size": size, "quantity": min(quantity, stock, 50), "maxStock": stock,
        })
    return {"items": items, "skipped": skipped}


# ============================================================
# SERVER-RENDERED PAGES (nginx routes every public page here)
# The app shell is sent with the route's real <head> (title, description, canonical, Open Graph,
# JSON-LD) and its text already inside #root, so Google, WhatsApp and Instagram see the content
# without running JavaScript. While the launching-soon page is up, only the <head> is filled in.
# ============================================================
def _spa_response(page: Optional[str], status_code: int = 200):
    if page is None:
        # No built index.html (local dev): nginx falls back to the static app shell
        raise HTTPException(status_code=503, detail="index.html not available")
    return HTMLResponse(page, status_code=status_code, headers={"Cache-Control": "no-cache"})


@app.get("/api/render/product/{slug}", include_in_schema=False)
def render_product(slug: str, db: Session = Depends(get_db)):
    page = seo.load_index()
    product = db.query(models.Product).options(*product_load_options()).filter(
        models.Product.slug == slug, models.Product.is_active == True  # noqa: E712
    ).first()
    if page is None or product is None:
        return _spa_response(page, 404)
    return _spa_response(seo.product_page(page, product, with_body=not _launch_is_on(_get_all_settings(db))))


@app.get("/api/render/blog/{slug}", include_in_schema=False)
def render_blog(slug: str, db: Session = Depends(get_db)):
    page = seo.load_index()
    post = db.query(models.BlogPost).filter(models.BlogPost.slug == slug, models.BlogPost.is_published == True).first()  # noqa: E712
    if page is None or post is None:
        return _spa_response(page, 404)
    return _spa_response(seo.blog_page(page, post, with_body=not _launch_is_on(_get_all_settings(db))))


@app.get("/api/render/page/{key}", include_in_schema=False)
def render_static_page(key: str, db: Session = Depends(get_db)):
    """Home, shop, customize, faq, about, blog and the keyword landing pages."""
    page = seo.load_index()
    if page is None or key not in seo.PAGES:
        return _spa_response(page, 404)
    if _launch_is_on(_get_all_settings(db)):
        return _spa_response(page)  # visitors only see the launching-soon page: nothing to describe yet
    products = db.query(models.Product).options(*product_load_options()).filter(
        models.Product.is_active == True  # noqa: E712
    ).order_by(models.Product.created_at.desc()).all()
    posts = []
    if key == "blog":
        posts = db.query(models.BlogPost).filter(models.BlogPost.is_published == True).order_by(models.BlogPost.published_at.desc()).all()  # noqa: E712
    return _spa_response(seo.static_page(page, key, products, posts))


# ============================================================
# GOOGLE MERCHANT CENTER FEED  (free Shopping listings)
# ============================================================
@app.get("/api/feed/google.xml", include_in_schema=False)
def google_product_feed(db: Session = Depends(get_db)):
    from xml.sax.saxutils import escape
    products = db.query(models.Product).options(*product_load_options()).filter(models.Product.is_active == True).all()  # noqa: E712
    items = []
    for p in products:
        link = f"{seo.SITE_URL}/product/{p.slug}"
        description = seo.plain(p.meta_description or p.description or p.name, 4900)
        on_sale = p.compare_at_price and p.compare_at_price > p.price
        base_price = p.compare_at_price if on_sale else p.price
        colors = list(p.colors) or [None]
        for color in colors:
            imgs = [i.url for i in (color.images if color else p.images) or []] or [i.url for i in p.images or []]
            sizes = (color.sizes if color else p.sizes) or []
            for size in sizes:
                fields = {
                    "g:id": f"{p.id}-{color.id if color else 0}-{size.size}",
                    "g:item_group_id": str(p.id),
                    "g:title": f"{p.name} – Unisex Oversized T-Shirt" + (f" – {color.name}" if color else "") + f" – {size.size}",
                    "g:description": description,
                    "g:link": link,
                    "g:image_link": seo.absolute(imgs[0]) if imgs else seo.absolute(""),
                    "g:availability": "in_stock" if size.stock > 0 else "out_of_stock",
                    "g:price": f"{base_price:.2f} INR",
                    "g:condition": "new",
                    "g:brand": seo.BRAND,
                    "g:google_product_category": "212",
                    "g:product_type": "Unisex Oversized T-Shirts",
                    "g:gender": "unisex",
                    "g:age_group": "adult",
                    "g:size": size.size,
                    "g:identifier_exists": "no",
                }
                if on_sale:
                    fields["g:sale_price"] = f"{p.price:.2f} INR"
                if color:
                    fields["g:color"] = color.name
                extra = "".join(f"<g:additional_image_link>{escape(seo.absolute(u))}</g:additional_image_link>" for u in imgs[1:10])
                items.append("<item>" + "".join(f"<{k}>{escape(v)}</{k}>" for k, v in fields.items()) + extra + "</item>")
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>'
        f"<title>{seo.BRAND}</title><link>{seo.SITE_URL}</link><description>Unisex oversized t-shirts</description>\n"
        + "\n".join(items) + "\n</channel></rss>\n"
    )
    return Response(content=body, media_type="application/xml", headers={"Cache-Control": "public, max-age=3600"})


# ============================================================
# JOURNAL / BLOG
# ============================================================
def _unique_blog_slug(db: Session, base: str, exclude_id: Optional[int] = None) -> str:
    base = slugify(base) or "post"
    slug, n = base, 1
    while True:
        q = db.query(models.BlogPost).filter(models.BlogPost.slug == slug)
        if exclude_id is not None:
            q = q.filter(models.BlogPost.id != exclude_id)
        if not q.first():
            return slug
        n += 1
        slug = f"{base}-{n}"


def _apply_blog(row: models.BlogPost, payload: schemas.BlogPostIn, db: Session) -> None:
    row.title = payload.title.strip()
    row.slug = _unique_blog_slug(db, payload.slug or payload.title, row.id)
    row.excerpt = payload.excerpt.strip()
    row.body = payload.body.strip()
    cover = payload.cover_url.strip()
    row.cover_url = cover if cover.startswith("/uploads/") or cover.startswith("https://") else ""
    if payload.is_published and not row.published_at:
        row.published_at = _utcnow()
    row.is_published = payload.is_published


@app.get("/api/blog", response_model=List[schemas.BlogPostOut])
def public_blog_list(db: Session = Depends(get_db)):
    return db.query(models.BlogPost).filter(models.BlogPost.is_published == True).order_by(models.BlogPost.published_at.desc()).all()  # noqa: E712


@app.get("/api/blog/{slug}", response_model=schemas.BlogPostOut)
def public_blog_post(slug: str, db: Session = Depends(get_db)):
    post = db.query(models.BlogPost).filter(models.BlogPost.slug == slug, models.BlogPost.is_published == True).first()  # noqa: E712
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


@app.get("/api/admin/blog", response_model=List[schemas.BlogPostOut])
def admin_blog_list(db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    return db.query(models.BlogPost).order_by(models.BlogPost.created_at.desc()).all()


@app.post("/api/admin/blog", response_model=schemas.BlogPostOut)
def admin_blog_create(payload: schemas.BlogPostIn, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = models.BlogPost(created_at=_utcnow())
    _apply_blog(row, payload, db)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.put("/api/admin/blog/{post_id}", response_model=schemas.BlogPostOut)
def admin_blog_update(post_id: int, payload: schemas.BlogPostIn, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.BlogPost).filter(models.BlogPost.id == post_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    _apply_blog(row, payload, db)
    db.commit()
    db.refresh(row)
    return row


@app.delete("/api/admin/blog/{post_id}")
def admin_blog_delete(post_id: int, db: Session = Depends(get_db), current: models.Admin = Depends(auth.get_current_admin)):
    row = db.query(models.BlogPost).filter(models.BlogPost.id == post_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(row)
    db.commit()
    return {"detail": "Post deleted"}


@app.post("/api/admin/blog/cover")
async def admin_blog_cover(file: UploadFile = File(...), current: models.Admin = Depends(auth.get_current_admin)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, WebP or GIF image.")
    contents = b""
    while chunk := await file.read(8192):
        contents += chunk
        if len(contents) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=400, detail="Image too large. Maximum size is 10 MB.")
    _check_file_matches_type(contents, file.content_type)
    fname = f"{uuid.uuid4().hex}{ALLOWED_IMAGE_TYPES[file.content_type]}"
    url = store_upload(contents, fname, file.content_type, "products")
    return {"url": url}
