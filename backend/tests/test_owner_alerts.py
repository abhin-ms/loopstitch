"""Owner WhatsApp alert for every confirmed order (owner_alerts.py)."""
import datetime
import hashlib
import hmac
import json
import re

import pytest

from app import models, order_lifecycle
from app import whatsapp as whatsapp_helper
from conftest import place_order

OWNERS = ["+916238860673", "+919544875330"]
IST_TIME = re.compile(r"^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} (AM|PM)$")


@pytest.fixture
def sent(monkeypatch):
    """Pretend WhatsApp is configured and record every template the app sends."""
    calls = []

    def fake_send(phone, template_name, language_code, body_params, is_authentication=False):
        calls.append({"phone": phone, "template": template_name, "params": list(body_params)})
        return {"message_id": f"wamid.TEST{len(calls)}"}

    monkeypatch.setattr(whatsapp_helper, "is_configured", lambda: True)
    monkeypatch.setattr(whatsapp_helper, "send_template_message", fake_send)
    return calls


def owner_alerts(calls):
    return [c for c in calls if c["template"] == whatsapp_helper.ADMIN_ORDER_TEMPLATE]


def checkout_signature(rp_order_id, payment_id, secret="rzp_test_secret"):
    return hmac.new(secret.encode(), f"{rp_order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def verify(client, order, rp, payment_id="pay_1"):
    r = client.post("/api/razorpay/verify", json={
        "razorpay_order_id": rp, "razorpay_payment_id": payment_id,
        "razorpay_signature": checkout_signature(rp, payment_id), "order_number": order["order_number"],
    })
    assert r.status_code == 200, r.text


def pay(client, order, payment_id="pay_1"):
    rp = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).json()["order_id"]
    verify(client, order, rp, payment_id)
    return rp


def enable_cod(db, advance_percent):
    db.add(models.Setting(key="cod_enabled", value="true"))
    db.add(models.Setting(key="cod_advance_percent", value=str(advance_percent)))
    db.commit()


def test_paid_order_alerts_both_owners_with_the_five_values(client, db, product, fake_razorpay, sent):
    order = place_order(client, product, qty=2)
    assert owner_alerts(sent) == []  # nothing until it's paid
    pay(client, order)

    alerts = owner_alerts(sent)
    assert [a["phone"] for a in alerts] == OWNERS
    name, count, amount, method, when = alerts[0]["params"]
    assert (name, count, amount, method) == ("Test", "2", f"₹{order['total']:,.0f}", "Online (Razorpay)")
    assert IST_TIME.match(when), when

    db.expire_all()
    rows = db.query(models.Notification).filter_by(message_type="admin_new_order").all()
    assert sorted(r.customer_phone for r in rows) == OWNERS
    assert all(r.status == "sent" for r in rows)


def test_repeated_confirmations_alert_only_once(client, db, product, fake_razorpay, sent):
    order = place_order(client, product)
    rp = pay(client, order)
    verify(client, order, rp)  # browser retries /verify
    body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {
        "id": "pay_1", "order_id": rp, "amount": round(order["total"] * 100), "status": "captured"}}}}).encode()
    sig = hmac.new(b"rzp_webhook_secret", body, hashlib.sha256).hexdigest()
    client.post("/api/webhooks/razorpay", content=body, headers={"x-razorpay-signature": sig})  # webhook arrives too

    assert len(owner_alerts(sent)) == 2


def test_unpaid_checkout_sends_no_alert(client, db, product, fake_razorpay, sent):
    place_order(client, product)
    assert owner_alerts(sent) == []
    assert db.query(models.Notification).count() == 0


def test_whatsapp_failure_never_breaks_the_payment(client, db, product, fake_razorpay, monkeypatch):
    def failing_send(phone, template_name, language_code, body_params, is_authentication=False):
        if template_name == whatsapp_helper.ADMIN_ORDER_TEMPLATE:
            raise RuntimeError("WhatsApp API error (400): template not approved")
        return {"message_id": "wamid.CUSTOMER"}

    monkeypatch.setattr(whatsapp_helper, "is_configured", lambda: True)
    monkeypatch.setattr(whatsapp_helper, "send_template_message", failing_send)
    order = place_order(client, product)
    pay(client, order)

    db.expire_all()
    assert db.query(models.Order).filter_by(order_number=order["order_number"]).first().status == models.OrderStatus.paid
    rows = db.query(models.Notification).filter_by(message_type="admin_new_order").all()
    assert len(rows) == 2 and all(r.status == "failed" and "not approved" in r.error_message for r in rows)


def test_cod_with_nothing_to_pay_online_alerts_when_placed(client, db, product, sent):
    enable_cod(db, 0)
    order = place_order(client, product, method="cod")
    alerts = owner_alerts(sent)
    assert len(alerts) == 2
    assert alerts[0]["params"][3] == "Cash on delivery"
    assert alerts[0]["params"][2] == f"₹{order['total']:,.0f}"


def test_cod_with_advance_alerts_only_after_the_advance_is_paid(client, db, product, fake_razorpay, sent):
    enable_cod(db, 10)
    order = place_order(client, product, method="cod")
    assert owner_alerts(sent) == []
    pay(client, order)
    alerts = owner_alerts(sent)
    assert len(alerts) == 2 and alerts[0]["params"][3] == "COD — 10% paid online"


def test_payment_found_by_the_expiry_check_also_alerts(client, db, product, fake_razorpay, sent):
    order = place_order(client, product)
    rp = client.post("/api/razorpay/create-order", json={"order_number": order["order_number"]}).json()
    fake_razorpay["payments"][rp["order_id"]] = [{"id": "pay_late", "status": "captured", "amount": rp["amount"]}]
    o = db.query(models.Order).filter_by(order_number=order["order_number"]).first()
    o.created_at = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(minutes=45)
    db.commit()

    order_lifecycle.expire_unpaid_orders(db)
    assert len(owner_alerts(sent)) == 2


def test_failed_owner_alert_can_be_resent_from_admin(client, db, product, fake_razorpay, admin_token, monkeypatch):
    state = {"fail": True}

    def flaky_send(phone, template_name, language_code, body_params, is_authentication=False):
        if template_name == whatsapp_helper.ADMIN_ORDER_TEMPLATE and state["fail"]:
            raise RuntimeError("temporary failure")
        return {"message_id": "wamid.OK"}

    monkeypatch.setattr(whatsapp_helper, "is_configured", lambda: True)
    monkeypatch.setattr(whatsapp_helper, "send_template_message", flaky_send)
    order = place_order(client, product)
    pay(client, order)
    failed = db.query(models.Notification).filter_by(message_type="admin_new_order").first()
    assert failed.status == "failed"

    state["fail"] = False
    r = client.post(f"/api/admin/notifications/{failed.id}/resend", headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "sent" and r.json()["message_type"] == "admin_new_order"


def test_nothing_is_sent_when_whatsapp_is_not_configured(client, db, product, fake_razorpay, monkeypatch):
    calls = []
    monkeypatch.setattr(whatsapp_helper, "send_template_message", lambda *a, **k: calls.append(1))
    order = place_order(client, product)
    pay(client, order)
    assert calls == []
    assert db.query(models.Notification).filter_by(message_type="admin_new_order").count() == 0


def test_india_time_and_clean_values():
    utc = datetime.datetime(2026, 10, 11, 12, 46)  # naive UTC, as stored
    assert whatsapp_helper.format_ist(utc) == "11 Oct 2026, 6:16 PM"
    assert whatsapp_helper.format_ist(datetime.datetime(2026, 10, 11, 18, 35)) == "12 Oct 2026, 12:05 AM"
    params = whatsapp_helper.build_admin_order_params("  Rahul\n\tMenon  ", 3, 1798, "Online (Razorpay)", utc)
    assert params == ["Rahul Menon", "3", "₹1,798", "Online (Razorpay)", "11 Oct 2026, 6:16 PM"]
    assert whatsapp_helper.build_admin_order_params("", 1, 999.4, "Cash on delivery", utc)[0] == "Customer"
