"""Phase 3: fees, rollouts, payments, receipts, UPI claims, reports."""
import os
import tempfile

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.routers.fees import academic_year, amount_in_words  # noqa: E402
from app.util import today  # noqa: E402


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


def login(c, lid, code="DEMO01", pw="demo123"):
    r = c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    if r.json()["user"]["role"] == "parent" and not r.json()["user"]["consent_at"]:
        c.post("/auth/consent", headers=h)
    return h


def test_words_and_year():
    assert amount_in_words(0) == "Rupees Zero Only"
    assert amount_in_words(1500) == "Rupees One Thousand Five Hundred Only"
    assert amount_in_words(125000.5) == "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only"
    assert amount_in_words(23_45_67_891) == "Rupees Twenty Three Crore Forty Five Lakh Sixty Seven Thousand Eight Hundred Ninety One Only"
    from datetime import date
    assert academic_year(date(2026, 3, 31)) == "2025-26" and academic_year(date(2026, 4, 1)) == "2026-27"


def test_module_and_permissions(c):
    h2 = login(c, "principal", "DEMO02")   # Basic plan → no fees module
    r = c.get("/fees/summary", headers=h2)
    assert r.status_code == 403 and "MODULE_NOT_ENABLED" in r.json()["detail"]
    assert c.get("/fees/summary", headers=login(c, "T001")).status_code == 403
    assert c.get("/fees/summary", headers=login(c, "coord")).status_code == 403     # coordinator: none
    hv = login(c, "vp")                                                               # VP: view only
    assert c.get("/fees/summary", headers=hv).status_code == 200
    assert c.put("/fees/config", json={"monthly_amount": 1}, headers=hv).status_code == 403


def test_generation_is_idempotent_with_overrides(c):
    h = login(c, "principal")
    cfg = c.get("/fees/config", headers=h).json()
    nine_a = next(x for x in cfg["classes"] if x["name"] == "9-A")
    assert nine_a["amount"] == 1800 and nine_a["custom"]
    assert next(x for x in cfg["classes"] if x["name"] == "8-A")["amount"] == 1500
    p = cfg["current_period"]
    r = c.post("/fees/generate", json={"period": p}, headers=h).json()
    assert r["new_items"] == 0                      # already billed by seed/lazy generation
    # a month nobody billed: preview then generate, then again → nothing new
    y, m = map(int, p.split("-"))
    nxt = f"{y + (m == 12):04d}-{m % 12 + 1:02d}"
    pv = c.post("/fees/generate", json={"period": nxt, "preview": True}, headers=h).json()
    assert pv["new_items"] == 24 + 14 and pv["students"] == 24
    expected = 16 * 1500 + 8 * 1800 + 10 * 600 + 4 * 800
    assert pv["new_amount"] == expected
    assert c.post("/fees/generate", json={"period": nxt}, headers=h).json()["new_items"] == 38
    assert c.post("/fees/generate", json={"period": nxt}, headers=h).json()["new_items"] == 0
    assert c.post("/fees/generate", json={"period": "2099-01"}, headers=h).status_code == 400


def test_payment_allocation_receipt_and_cancel(c):
    h = login(c, "principal")
    rows = c.get("/fees/students?status=overdue", headers=h).json()
    s = rows[0]
    led = c.get(f"/fees/students/{s['id']}", headers=h).json()
    before = led["totals"]["outstanding"]
    oldest = [i for i in led["items"] if i["balance"] > 0][0]
    # too much for one selected item
    r = c.post("/fees/payments", json={"student_id": s["id"], "amount": oldest["balance"] + 1, "mode": "cash",
                                       "item_ids": [oldest["id"]]}, headers=h)
    assert r.status_code == 400
    assert c.post("/fees/payments", json={"student_id": s["id"], "amount": 10, "mode": "cheque"}, headers=h).status_code == 400
    # partial, oldest first
    r = c.post("/fees/payments", json={"student_id": s["id"], "amount": 500, "mode": "cash"}, headers=h)
    assert r.status_code == 200, r.text
    rc = r.json()
    assert rc["receipt_no"].startswith("GVPS/") and rc["amount_words"] == "Rupees Five Hundred Only"
    assert rc["lines"][0]["title"] == oldest["title"] and rc["balance_after"] == before - 500
    n1 = int(rc["receipt_no"].rsplit("/", 1)[1])
    r2 = c.post("/fees/payments", json={"student_id": s["id"], "amount": 100, "mode": "upi", "reference": "123456789012"}, headers=h).json()
    assert int(r2["receipt_no"].rsplit("/", 1)[1]) == n1 + 1
    # cancel restores the balance
    assert c.post(f"/fees/payments/{rc['id']}/cancel", json={"reason": "Wrong student"}, headers=h).status_code == 200
    assert c.get(f"/fees/students/{s['id']}", headers=h).json()["totals"]["outstanding"] == before - 100
    assert c.post(f"/fees/payments/{rc['id']}/cancel", json={"reason": "again"}, headers=h).status_code == 400
    # concession can't go below paid; waive an unpaid charge
    item = c.post("/fees/items", json={"student_id": s["id"], "title": "Library fine", "amount": 50}, headers=h).json()
    assert c.put(f"/fees/items/{item['id']}", json={"amount": 0, "reason": "first time"}, headers=h).json()["waived"]


def test_batch_rollout_preview_exclusions_and_withdraw(c):
    h = login(c, "principal")
    cfg = c.get("/fees/config", headers=h).json()
    eight = [x["id"] for x in cfg["classes"] if x["name"].startswith("8-")]
    studs = c.get(f"/fees/students?class_id={eight[0]}", headers=h).json()
    body = {"title": "Exam fee", "amount": 250, "target": "classes", "class_ids": eight, "exclude_ids": [studs[0]["id"]]}
    pv = c.post("/fees/batches", json={**body, "preview": True}, headers=h).json()
    assert pv["count"] == 15 and pv["total"] == 3750
    b = c.post("/fees/batches", json=body, headers=h).json()
    assert b["count"] == 15 and b["target_label"] == "8-A, 8-B"
    # pay one, then withdraw → unpaid voided, paid kept
    sid = studs[1]["id"]
    item = next(i for i in c.get(f"/fees/students/{sid}", headers=h).json()["items"] if i["batch_id"] == b["id"])
    c.post("/fees/payments", json={"student_id": sid, "amount": 250, "mode": "cash", "item_ids": [item["id"]]}, headers=h)
    r = c.delete(f"/fees/batches/{b['id']}", headers=h).json()
    assert r == {"ok": True, "voided": 14, "kept_paid": 1}
    assert c.post("/fees/batches", json={"title": "X", "amount": 5, "target": "students"}, headers=h).status_code in (400, 422)


def test_parent_upi_claim_confirm_and_reject(c):
    hp = login(c, "9876500002")
    h = login(c, "principal")
    me = c.get("/fees/me", headers=hp).json()
    assert me["upi"]["enabled"] and me["upi"]["upi_id"] == "greenvalley@sbi"
    due = [i for i in me["items"] if i["balance"] > 0]
    amt = due[0]["balance"]
    assert c.post("/fees/me/claim", json={"amount": amt, "reference": "abc"}, headers=hp).status_code == 422
    r = c.post("/fees/me/claim", json={"amount": amt, "reference": "998877665544", "item_ids": [due[0]["id"]]}, headers=hp)
    assert r.status_code == 200, r.text
    assert c.post("/fees/me/claim", json={"amount": amt, "reference": "998877665544"}, headers=hp).status_code == 409
    claims = c.get("/fees/claims", headers=h).json()
    mine = next(x for x in claims if x["reference"] == "998877665544")
    rc = c.post(f"/fees/claims/{mine['id']}/confirm", headers=h)
    assert rc.status_code == 200 and rc.json()["receipt_no"]
    assert c.post(f"/fees/claims/{mine['id']}/confirm", headers=h).status_code == 400
    # parent can open their own receipt, another parent can't
    assert c.get(f"/fees/receipts/{mine['id']}", headers=hp).status_code == 200
    assert c.get(f"/fees/receipts/{mine['id']}", headers=login(c, "9876500003")).status_code == 403
    # reject flow
    r = c.post("/fees/me/claim", json={"amount": 1, "reference": "111122223333"}, headers=hp).json()
    assert c.post(f"/fees/claims/{r['id']}/reject", json={"reason": "UTR not found in bank"}, headers=h).status_code == 200
    st = {p["reference"]: p["status"] for p in c.get("/fees/me", headers=hp).json()["payments"]}
    assert st["111122223333"] == "rejected" and st["998877665544"] == "confirmed"


def test_summary_and_reports(c):
    h = login(c, "principal")
    s = c.get("/fees/summary", headers=h).json()
    assert s["configured"] and s["upi_enabled"] and s["billed_this_month"]
    assert s["defaulters"] >= 4 and s["outstanding"] > 0 and len(s["trend"]) == 14
    assert sum(x["students"] for x in s["by_class"]) == 24
    rep = c.get(f"/fees/payments?date_from={today().replace(day=1)}", headers=h).json()
    assert rep["total"] == round(sum(rep["by_mode"].values()), 2)
    # student sees own ledger
    hs = login(c, "2026001")
    assert c.get("/fees/me", headers=hs).status_code == 200
