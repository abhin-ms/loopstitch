"""Test setup: a throwaway SQLite database and fake Razorpay keys, set before the app is imported."""
import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp()
os.environ.update(
    SECRET_KEY="test-secret-key-" + "x" * 32,
    DATABASE_URL=f"sqlite:///{_tmp}/test.db",
    RAZORPAY_KEY_ID="rzp_test_key",
    RAZORPAY_KEY_SECRET="rzp_test_secret",
    RAZORPAY_WEBHOOK_SECRET="rzp_webhook_secret",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN="verify-me",
    GCS_SERVICE_ACCOUNT_B64="",
)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import auth, models, ratelimit  # noqa: E402
from app import razorpay as razorpay_helper  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    ratelimit.reset()
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def fake_razorpay(monkeypatch):
    """Record Razorpay orders the app creates instead of calling the real API."""
    created = []
    payments = {}

    def create_order(amount_paise, currency="INR", receipt="", notes=None):
        rp = {"id": f"order_TEST{len(created) + 1}", "amount": amount_paise, "currency": currency}
        created.append(rp)
        return rp

    monkeypatch.setattr(razorpay_helper, "create_order", create_order)
    monkeypatch.setattr(razorpay_helper, "order_payments", lambda rp_id: payments.get(rp_id, []))
    return {"created": created, "payments": payments}


@pytest.fixture
def product(db):
    p = models.Product(name="Tee", slug="tee", price=999, is_active=True)
    db.add(p)
    db.flush()
    db.add(models.ProductSize(product_id=p.id, size="M", stock=2))
    db.commit()
    return p.id


@pytest.fixture
def admin_token(db):
    db.add(models.Admin(username="boss", hashed_password=auth.hash_password("pw")))
    db.commit()
    return auth.create_access_token({"sub": "boss", "role": "admin"})


def stock(db, product_id, size="M"):
    db.expire_all()
    return db.query(models.ProductSize).filter_by(product_id=product_id, size=size).first().stock


def place_order(client, product_id, phone="9000000001", qty=1, method="online", headers=None):
    r = client.post("/api/orders", headers=headers or {}, json={
        "customer_name": "Test", "customer_email": "t@example.com", "customer_phone": phone,
        "shipping_address": "12 Secret St", "pincode": "560100", "payment_method": method,
        "items": [{"product_id": product_id, "size": "M", "quantity": qty}],
    })
    assert r.status_code == 200, r.text
    return r.json()["order"]


def customer_token(phone):
    from app import customer_auth
    return customer_auth.create_customer_token(phone)
