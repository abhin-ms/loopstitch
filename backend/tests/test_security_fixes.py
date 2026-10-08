"""Regression tests for the payment, stock, order-access, upload and OTP fixes."""
import datetime
import hashlib
import hmac
import json
import logging

from app import models, order_lifecycle
from conftest import customer_token, place_order, stock


def checkout_signature(rp_order_id, payment_id, secret="rzp_test_secret"):
    return hmac.new(secret.encode(), f"{rp_order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def verify(client, order_number, rp_order_id, payment_id="pay_1"):
    return client.post("/api/razorpay/verify", json={
        "razorpay_order_id": rp_order_id, "razorpay_payment_id": payment_id,
        "razorpay_signature": checkout_signature(rp_order_id, payment_id), "order_number": order_number,
    })


# ---------------------------------------------------------------- payments
def test_razorpay_amount_comes_from_the_order_not_the_browser(client, product, fake_razorpay):
    order = place_order(client, product)
    r = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"], "amount": 1})
    assert r.status_code == 200
    assert r.json()["amount"] == round(order["total"] * 100)
    assert fake_razorpay["created"][0]["amount"] == round(order["total"] * 100)


def test_payment_for_a_different_razorpay_order_is_rejected(client, product, fake_razorpay):
    order = place_order(client, product)
    client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]})
    # genuine signature, but for a ₹1 Razorpay order the attacker made some other way
    r = verify(client, order["order_number"], "order_ONE_RUPEE")
    assert r.status_code == 400
    assert "not for this order" in r.json()["detail"]


def test_matching_payment_marks_paid_and_cannot_be_reused(client, db, product, fake_razorpay):
    a = place_order(client, product, phone="9000000001")
    b = place_order(client, product, phone="9000000002")
    rp_a = client.post("/api/razorpay/create-order", json={"order_number": a["order_number"]}).json()["order_id"]
    rp_b = client.post("/api/razorpay/create-order", json={"order_number": b["order_number"]}).json()["order_id"]

    r = verify(client, a["order_number"], rp_a, "pay_A")
    assert r.status_code == 200 and r.json()["status"] == "paid"
    # repeat call is harmless
    assert verify(client, a["order_number"], rp_a, "pay_A").json()["status"] == "paid"
    # same payment can't confirm order B
    assert verify(client, b["order_number"], rp_a, "pay_A").status_code == 400
    assert verify(client, b["order_number"], rp_b, "pay_A").status_code == 400
    db.expire_all()
    assert db.query(models.Order).filter_by(order_number=b["order_number"]).first().status == models.OrderStatus.pending


def test_create_order_reuses_razorpay_order_and_refuses_paid_orders(client, product, fake_razorpay):
    order = place_order(client, product)
    first = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).json()["order_id"]
    again = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).json()["order_id"]
    assert first == again and len(fake_razorpay["created"]) == 1
    verify(client, order["order_number"], first)
    assert client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).status_code == 409


def test_razorpay_webhook_confirms_order(client, db, product, fake_razorpay):
    order = place_order(client, product)
    rp = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).json()
    body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {
        "id": "pay_W", "order_id": rp["order_id"], "amount": rp["amount"], "status": "captured"}}}}).encode()
    bad = client.post("/api/webhooks/razorpay", content=body, headers={"x-razorpay-signature": "nope"})
    assert bad.status_code == 400
    sig = hmac.new(b"rzp_webhook_secret", body, hashlib.sha256).hexdigest()
    r = client.post("/api/webhooks/razorpay", content=body, headers={"x-razorpay-signature": sig})
    assert r.json()["status"] == "paid"
    db.expire_all()
    assert db.query(models.Order).filter_by(order_number=order["order_number"]).first().status == models.OrderStatus.paid


# ---------------------------------------------------------------- stock
def _age(db, order_number, minutes):
    o = db.query(models.Order).filter_by(order_number=order_number).first()
    o.created_at = datetime.datetime.utcnow() - datetime.timedelta(minutes=minutes)
    db.commit()


def test_unpaid_orders_give_stock_back_after_timeout(client, db, product, fake_razorpay):
    a = place_order(client, product, phone="9000000001")
    place_order(client, product, phone="9000000002")
    assert stock(db, product) == 0
    _age(db, a["order_number"], 31)
    assert order_lifecycle.expire_unpaid_orders(db) == 1
    assert stock(db, product) == 1
    db.expire_all()
    assert db.query(models.Order).filter_by(order_number=a["order_number"]).first().status == models.OrderStatus.failed
    assert order_lifecycle.expire_unpaid_orders(db) == 0  # never released twice


def test_expiry_confirms_orders_that_razorpay_says_are_paid(client, db, product, fake_razorpay):
    order = place_order(client, product)
    rp = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).json()
    fake_razorpay["payments"][rp["order_id"]] = [{"id": "pay_late", "status": "captured", "amount": rp["amount"]}]
    _age(db, order["order_number"], 45)
    assert order_lifecycle.expire_unpaid_orders(db) == 0
    db.expire_all()
    assert db.query(models.Order).filter_by(order_number=order["order_number"]).first().status == models.OrderStatus.paid
    assert stock(db, product) == 1


def test_late_payment_on_expired_order_revives_it_if_stock_allows(client, db, product, fake_razorpay):
    order = place_order(client, product)
    rp = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).json()["order_id"]
    _age(db, order["order_number"], 31)
    order_lifecycle.expire_unpaid_orders(db)
    assert stock(db, product) == 2
    assert verify(client, order["order_number"], rp).json()["status"] == "paid"
    assert stock(db, product) == 1


def test_admin_cancel_restores_stock_once_and_reopen_takes_it_again(client, db, product, admin_token):
    order = place_order(client, product)
    oid = db.query(models.Order).filter_by(order_number=order["order_number"]).first().id
    h = {"Authorization": f"Bearer {admin_token}"}
    for _ in range(2):
        assert client.patch(f"/api/admin/orders/{oid}/status", json={"status": "cancelled"}, headers=h).status_code == 200
    assert stock(db, product) == 2
    assert client.patch(f"/api/admin/orders/{oid}/status", json={"status": "pending"}, headers=h).status_code == 200
    assert stock(db, product) == 1


# ---------------------------------------------------------------- order access
def test_only_the_owner_or_admin_can_view_an_order(client, product, admin_token):
    order = place_order(client, product, phone="9000000001")
    place_order(client, product, phone="9111111111")  # creates the stranger's customer row
    url = f"/api/orders/{order['order_number']}"

    stranger = client.get(url, headers={"Authorization": f"Bearer {customer_token('9111111111')}"})
    assert stranger.status_code == 404
    assert client.get(url + "/invoice", headers={"Authorization": f"Bearer {customer_token('9111111111')}"}).status_code == 404
    assert client.get(url).status_code == 401
    assert client.get(url, headers={"Authorization": f"Bearer {customer_token('9000000001')}"}).status_code == 200
    assert client.get(url, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200


def test_customer_token_is_not_an_admin_token(client, product, db):
    db.add(models.Admin(username="9000000001", hashed_password="x"))  # worst case: admin named like a phone
    db.commit()
    place_order(client, product, phone="9000000001")
    r = client.get("/api/admin/orders", headers={"Authorization": f"Bearer {customer_token('9000000001')}"})
    assert r.status_code == 401


# ---------------------------------------------------------------- uploads
def test_upload_extension_is_chosen_by_server(client):
    html = client.post("/api/custom/designs/upload", files={"file": ("x.html", b"<script>alert(1)</script>", "image/png")})
    assert html.status_code == 400
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    ok = client.post("/api/custom/designs/upload", files={"file": ("evil.html", png, "image/png")})
    assert ok.status_code == 200 and ok.json()["file_url"].endswith(".png")


def test_custom_order_rejects_foreign_design_links(client, db):
    db.add(models.CustomTshirtConfig(base_price=299, min_order_qty=1, is_active=True))
    db.add(models.CustomTshirtColor(name="Black", hex_code="#000", is_active=True, position=0))
    db.commit()
    color_id = db.query(models.CustomTshirtColor).first().id
    body = {
        "customer_name": "T", "customer_email": "t@example.com", "customer_phone": "9000000001",
        "shipping_address": "x", "payment_method": "online",
        "colors": [{"color_id": color_id, "sizes": [{"size": "M", "quantity": 2}, {"size": "L", "quantity": 0}]}],
        "designs": [{"file_url": "javascript:alert(1)", "file_name": "a", "file_type": "image", "print_area": "front"}],
    }
    assert client.post("/api/custom/order", json=body).status_code == 400
    body["designs"] = []
    r = client.post("/api/custom/order", json=body)
    assert r.status_code == 200 and len(r.json()["items"]) == 1  # the zero-quantity size is skipped
    body["colors"][0]["sizes"][0]["quantity"] = -5
    assert client.post("/api/custom/order", json=body).status_code == 422


# ---------------------------------------------------------------- OTP + abuse limits
def test_otp_is_never_logged_and_burns_after_five_wrong_guesses(client, db, caplog):
    caplog.set_level(logging.DEBUG)
    assert client.post("/api/auth/send-otp", json={"phone": "9222222222"}).status_code == 200
    code = db.query(models.OTP).filter_by(phone="9222222222").first().otp_code
    assert code not in caplog.text

    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/auth/verify-otp", json={"phone": "9222222222", "otp": wrong}).status_code == 400
    # the right code no longer works once it has been burned
    assert client.post("/api/auth/verify-otp", json={"phone": "9222222222", "otp": code}).status_code == 400


def test_otp_happy_path_and_resend_wait(client, db):
    assert client.post("/api/auth/send-otp", json={"phone": "9333333333"}).status_code == 200
    assert client.post("/api/auth/send-otp", json={"phone": "9333333333"}).status_code == 429
    code = db.query(models.OTP).filter_by(phone="9333333333").first().otp_code
    r = client.post("/api/auth/verify-otp", json={"phone": "+91 93333 33333", "otp": code})
    assert r.status_code == 200 and r.json()["access_token"]


def test_send_otp_is_rate_limited_per_ip(client):
    codes = [client.post("/api/auth/send-otp", json={"phone": f"94000000{i:02d}"}).status_code for i in range(7)]
    assert codes[:5] == [200] * 5 and 429 in codes[5:]


def test_huge_quantities_are_rejected(client, product):
    r = client.post("/api/cart/quote", json={"items": [{"product_id": product, "size": "M", "quantity": 10**9}]})
    assert r.status_code == 422


def test_whatsapp_webhook_verification_handshake(client):
    ok = client.get("/api/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42"})
    assert ok.status_code == 200 and ok.text == "42"
    bad = client.get("/api/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "loopstitch_webhook", "hub.challenge": "42"})
    assert bad.status_code == 403
