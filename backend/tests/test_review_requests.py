"""WhatsApp review form: request after delivery, answers -> reviews with photos (review_requests.py)."""
import base64
import datetime
import hashlib
import hmac
import io
import json
import os

import pytest
from PIL import Image

from app import main, models, review_requests
from app import whatsapp as whatsapp_helper


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def make_order(db, product_id, phone="9876543210", delivered_days_ago=3, status=models.OrderStatus.delivered, number="LS-1001"):
    order = models.Order(
        order_number=number, customer_name="Arjun Kumar", customer_email="a@example.com",
        customer_phone=phone, shipping_address="12 St", status=status, total=999,
        delivered_at=None if delivered_days_ago is None else _utcnow() - datetime.timedelta(days=delivered_days_ago),
    )
    db.add(order)
    db.flush()
    db.add(models.OrderItem(order_id=order.id, product_id=product_id, product_name="Tee", size="M", quantity=1, unit_price=999))
    db.commit()
    return order.id


@pytest.fixture
def sent(monkeypatch):
    calls = []

    def fake_send(phone, customer_name, order_number, flow_token):
        calls.append({"phone": phone, "name": customer_name, "order": order_number, "token": flow_token})
        return {"message_id": f"wamid.REVIEW{len(calls)}"}

    monkeypatch.setattr(whatsapp_helper, "is_configured", lambda: True)
    monkeypatch.setattr(whatsapp_helper, "send_review_message", fake_send)
    return calls


@pytest.fixture(autouse=True)
def texts(monkeypatch):
    """Plain WhatsApp texts (the reward coupon) instead of calling Meta."""
    calls = []

    def fake_text(phone, text):
        calls.append({"phone": phone, "text": text})
        return {"message_id": f"wamid.TEXT{len(calls)}"}

    monkeypatch.setattr(whatsapp_helper, "send_text_message", fake_text)
    return calls


@pytest.fixture
def stored(monkeypatch):
    """Photos the webhook saves, instead of writing to cloud storage / disk."""
    files = {}

    def fake_store(contents, fname, content_type, subdir):
        files[fname] = contents
        return f"/uploads/{subdir}/{fname}"

    monkeypatch.setattr(main, "store_upload", fake_store)
    return files


def png_bytes(size=(40, 30)):
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buf, "PNG")
    return buf.getvalue()


def flow_reply(order_id, phone="919876543210", rating="5", feedback="Great fit!", photos=None, token=None, documents=None):
    answers = {"flow_token": token or review_requests.flow_token(order_id), "rating": rating, "feedback": feedback}
    if photos is not None:
        answers["photos"] = photos
    if documents is not None:
        answers["documents"] = documents
    return {"entry": [{"changes": [{"value": {"messages": [{
        "from": phone, "id": "wamid.IN1", "type": "interactive",
        "interactive": {"type": "nfm_reply", "nfm_reply": {"name": "flow", "body": "Sent", "response_json": json.dumps(answers)}},
    }]}}]}]}


# ---------------------------------------------------------------- token
def test_flow_token_round_trip_and_rejects_forgery():
    token = review_requests.flow_token(42)
    assert review_requests.order_id_from_token(token) == 42
    assert review_requests.order_id_from_token(token.replace("rv.42.", "rv.43.")) is None
    assert review_requests.order_id_from_token("rv.42.deadbeef") is None
    assert review_requests.order_id_from_token("") is None


# ---------------------------------------------------------------- sending
def test_sends_once_after_delay(db, product, sent):
    order_id = make_order(db, product, delivered_days_ago=3)
    assert review_requests.send_due(db) == 1
    assert sent[0]["order"] == "LS-1001" and sent[0]["phone"] == "+919876543210"
    assert review_requests.order_id_from_token(sent[0]["token"]) == order_id
    n = db.query(models.Notification).filter_by(message_type="order_review").one()
    assert n.status == "sent" and n.whatsapp_message_id == "wamid.REVIEW1"
    assert review_requests.send_due(db) == 0  # never twice
    assert len(sent) == 1


def test_skips_recent_old_and_undelivered(db, product, sent):
    make_order(db, product, delivered_days_ago=1, number="LS-1")
    make_order(db, product, delivered_days_ago=45, number="LS-2")
    make_order(db, product, delivered_days_ago=None, number="LS-3")
    make_order(db, product, delivered_days_ago=5, status=models.OrderStatus.shipped, number="LS-4")
    assert review_requests.send_due(db) == 0
    assert sent == []


def test_failed_send_is_logged_and_resendable(db, product, client, admin_token, monkeypatch):
    monkeypatch.setattr(whatsapp_helper, "is_configured", lambda: True)

    def boom(*a, **k):
        raise RuntimeError("template not approved")

    monkeypatch.setattr(whatsapp_helper, "send_review_message", boom)
    make_order(db, product)
    review_requests.send_due(db)
    n = db.query(models.Notification).filter_by(message_type="order_review").one()
    assert n.status == "failed" and "not approved" in n.error_message

    monkeypatch.setattr(whatsapp_helper, "send_review_message", lambda *a: {"message_id": "wamid.OK"})
    r = client.post(f"/api/admin/notifications/{n.id}/resend", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200 and r.json()["status"] == "sent"


def test_admin_marking_delivered_starts_countdown(db, product, client, admin_token):
    order_id = make_order(db, product, delivered_days_ago=None, status=models.OrderStatus.shipped)
    r = client.patch(f"/api/admin/orders/{order_id}/status", json={"status": "delivered"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.get(models.Order, order_id).delivered_at is not None


# ---------------------------------------------------------------- receiving
def test_form_answers_become_review_with_photos(db, product, client, stored, admin_token, monkeypatch):
    monkeypatch.setattr(whatsapp_helper, "download_media", lambda media_id: png_bytes())
    order_id = make_order(db, product)
    photos = [{"file_name": "a.jpg", "mime_type": "image/jpeg", "id": "111"},
              {"file_name": "b.jpg", "mime_type": "image/jpeg", "id": "222"}]
    r = client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, photos=photos))
    assert r.status_code == 200

    review = db.query(models.Review).one()
    assert (review.rating, review.body, review.name, review.source) == (5, "Great fit!", "Arjun K.", "whatsapp")
    assert review.is_approved is False and review.order_id == order_id
    assert len(review.photos) == 2 and all(u.startswith("/uploads/reviews/review_LS-1001_") for u in review.photos)
    for data in stored.values():  # re-encoded as JPEG
        assert Image.open(io.BytesIO(data)).format == "JPEG"

    # hidden until approved, then shown with its photos
    assert client.get("/api/products/tee/reviews").json()["count"] == 0
    client.patch(f"/api/admin/reviews/{review.id}/toggle", headers={"Authorization": f"Bearer {admin_token}"})
    data = client.get("/api/products/tee/reviews").json()
    assert data["count"] == 1 and data["reviews"][0]["photos"] == review.photos
    assert "order_id" not in data["reviews"][0]


def test_review_without_photos_gets_thank_you_only(db, product, client, stored, texts):
    order_id = make_order(db, product)
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, rating="4", feedback="", photos=[]))
    review = db.query(models.Review).one()
    assert review.rating == 4 and review.photos == []
    assert db.query(models.Coupon).count() == 0
    assert len(texts) == 1 and "Thanks for your review, Arjun" in texts[0]["text"]
    assert db.query(models.Notification).filter_by(message_type="review_thanks").one().status == "sent"


def test_photo_earns_single_use_20_percent_coupon(db, product, client, stored, texts, monkeypatch):
    monkeypatch.setattr(whatsapp_helper, "download_media", lambda media_id: png_bytes())
    order_id = make_order(db, product)
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, rating="2", photos=[{"id": "1"}]))

    coupon = db.query(models.Coupon).one()
    assert coupon.code.startswith("THANKS") and coupon.discount_percent == 20 and coupon.max_uses == 1
    assert coupon.ends_at is None  # never expires
    assert len(texts) == 1 and texts[0]["phone"] == "+919876543210"
    assert coupon.code in texts[0]["text"] and "20% off" in texts[0]["text"]
    n = db.query(models.Notification).filter_by(message_type="review_reward").one()
    assert n.status == "sent" and review_requests.reward_code(n) == coupon.code

    # Meta re-delivering the same answers must not hand out a second coupon
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, photos=[{"id": "1"}]))
    assert db.query(models.Coupon).count() == 1 and len(texts) == 1


def test_files_screen_documents_are_saved_and_rewarded(db, product, client, stored, texts, monkeypatch):
    monkeypatch.setattr(whatsapp_helper, "download_media", lambda media_id: png_bytes())
    order_id = make_order(db, product)
    docs = [{"file_name": "tee.png", "mime_type": "image/png", "id": "9"}]
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, documents=docs))
    review = db.query(models.Review).one()
    assert len(review.photos) == 1
    assert len(texts) == 1


def test_failed_coupon_message_keeps_code_and_can_be_resent(db, product, client, stored, admin_token, monkeypatch):
    monkeypatch.setattr(whatsapp_helper, "download_media", lambda media_id: png_bytes())

    def boom(phone, text):
        raise RuntimeError("outside 24h window")

    monkeypatch.setattr(whatsapp_helper, "send_text_message", boom)
    order_id = make_order(db, product)
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, photos=[{"id": "1"}]))
    n = db.query(models.Notification).filter_by(message_type="review_reward").one()
    code = db.query(models.Coupon).one().code
    assert n.status == "failed" and code in n.error_message

    monkeypatch.setattr(whatsapp_helper, "send_text_message", lambda phone, text: {"message_id": "wamid.T"})
    monkeypatch.setattr(whatsapp_helper, "is_configured", lambda: True)
    r = client.post(f"/api/admin/notifications/{n.id}/resend", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200 and r.json()["status"] == "sent" and code in r.json()["error_message"]


def test_ignores_wrong_number_forged_token_and_duplicates(db, product, client, stored):
    order_id = make_order(db, product)
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, phone="919999999999"))
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, token=f"rv.{order_id}.0000"))
    assert db.query(models.Review).count() == 0
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id))
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id))
    assert db.query(models.Review).count() == 1


def test_bad_photo_is_skipped_not_fatal(db, product, client, stored, monkeypatch):
    monkeypatch.setattr(whatsapp_helper, "download_media", lambda media_id: b"not an image")
    order_id = make_order(db, product)
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id, photos=[{"id": "1"}, {"cdn_url": "https://evil.example/x", "encryption_metadata": {}}]))
    review = db.query(models.Review).one()
    assert review.photos == [] and stored == {}


def test_multi_product_order_shows_once(db, product, client, stored, admin_token):
    p2 = models.Product(name="Hoodie", slug="hoodie", price=1999, is_active=True)
    db.add(p2)
    db.commit()
    order_id = make_order(db, product)
    db.add(models.OrderItem(order_id=order_id, product_id=p2.id, product_name="Hoodie", size="M", quantity=1, unit_price=1999))
    db.commit()
    client.post("/api/webhooks/whatsapp", json=flow_reply(order_id))
    assert db.query(models.Review).count() == 2

    headers = {"Authorization": f"Bearer {admin_token}"}
    listed = client.get("/api/admin/reviews", headers=headers).json()
    assert len(listed) == 1
    client.patch(f"/api/admin/reviews/{listed[0]['id']}/toggle", headers=headers)
    assert client.get("/api/products/tee/reviews").json()["count"] == 1
    assert client.get("/api/products/hoodie/reviews").json()["count"] == 1
    assert len(client.get("/api/reviews/featured").json()) == 1
    client.delete(f"/api/admin/reviews/{listed[0]['id']}", headers=headers)
    assert db.query(models.Review).count() == 0


# ---------------------------------------------------------------- encrypted CDN photos
def test_decrypt_flow_media(monkeypatch):
    from cryptography.hazmat.primitives import padding
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    plain = png_bytes()
    key, hkey, iv = os.urandom(32), os.urandom(32), os.urandom(16)
    padder = padding.PKCS7(128).padder()
    enc = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    ciphertext = enc.update(padder.update(plain) + padder.finalize()) + enc.finalize()
    blob = ciphertext + hmac.new(hkey, iv + ciphertext, hashlib.sha256).digest()[:10]
    meta = {k: base64.b64encode(v).decode() for k, v in {
        "encryption_key": key, "hmac_key": hkey, "iv": iv,
        "encrypted_hash": hashlib.sha256(blob).digest(), "plaintext_hash": hashlib.sha256(plain).digest(),
    }.items()}

    class FakeResp:
        status_code = 200
        content = blob

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, **k):
            return FakeResp()

    monkeypatch.setattr(whatsapp_helper.httpx, "Client", FakeClient)
    assert whatsapp_helper.decrypt_flow_media("https://mmg.whatsapp.net/x", meta) == plain
    FakeResp.content = blob[:-1] + bytes([blob[-1] ^ 1])
    with pytest.raises(RuntimeError):
        whatsapp_helper.decrypt_flow_media("https://mmg.whatsapp.net/x", meta)


def test_admin_can_send_review_form_now_by_phone(db, product, client, admin_token, sent):
    headers = {"Authorization": f"Bearer {admin_token}"}
    make_order(db, product, phone="9876543210", delivered_days_ago=None, status=models.OrderStatus.paid, number="LS-OLD")
    order_id = make_order(db, product, phone="+91 98765 43210", delivered_days_ago=None, status=models.OrderStatus.shipped, number="LS-NEW")
    make_order(db, product, phone="9876543210", delivered_days_ago=None, status=models.OrderStatus.cancelled, number="LS-CANCELLED")

    r = client.post("/api/admin/review-requests/send", json={"phone": "919876543210"}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "sent" and r.json()["order_number"] in ("LS-OLD", "LS-NEW")
    assert len(sent) == 1

    r = client.post("/api/admin/review-requests/send", json={"order_id": order_id}, headers=headers)
    assert r.json()["order_number"] == "LS-NEW" and review_requests.order_id_from_token(sent[1]["token"]) == order_id

    assert client.post("/api/admin/review-requests/send", json={"phone": "911111111111"}, headers=headers).status_code == 404
    assert client.post("/api/admin/review-requests/send", json={"phone": "919876543210"}).status_code == 401


def test_admin_test_endpoint_creates_dummy_order_and_full_flow_works(db, product, client, admin_token, sent, stored, texts, monkeypatch):
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/api/admin/review-requests/test", json={"phone": "916238860673", "name": "Abhin"}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "sent" and body["order_number"].startswith("TEST-") and body["phone"] == "+916238860673"
    order = db.get(models.Order, body["order_id"])
    assert order.status == models.OrderStatus.cancelled  # never counts as a sale
    assert len(sent) == 1 and sent[0]["name"] == "Abhin"

    # submitting the form on that number saves the review and sends the coupon
    monkeypatch.setattr(whatsapp_helper, "download_media", lambda media_id: png_bytes())
    client.post("/api/webhooks/whatsapp", json=flow_reply(order.id, phone="916238860673", photos=[{"id": "1"}]))
    assert db.query(models.Review).filter_by(order_id=order.id).count() == 1
    assert db.query(models.Coupon).count() == 1 and len(texts) == 1

    assert client.post("/api/admin/review-requests/test", json={"phone": "916238860673"}).status_code == 401
