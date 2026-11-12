"""Web portal additions: onboarding workflow, paged schools, export, web sessions, rate limits, CORS, push tokens."""
import io
import os
import tempfile

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import ratelimit  # noqa: E402
from app.main import app  # noqa: E402

FORM = {"school_name": "Sunrise Public School", "reg_no": "JH-2026-0099", "category": "Secondary", "board": "CBSE",
        "address": "12 Station Road", "state": "Jharkhand", "district": "Ranchi", "city": "Ranchi", "pin": "834001",
        "principal_name": "Asha Verma", "contact_name": "Rohit Kumar", "designation": "Manager", "mobile": "+91 98765 43210",
        "email": "Office@Sunrise.example", "contact_method": "WhatsApp", "students": 450, "teachers": 22,
        "message": "Please call after 3 pm", "consent_privacy": True, "consent_contact": True}


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def _fresh_limits():
    ratelimit.reset()
    yield


def login(c, code, lid, pw, client="app"):
    return c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw, "client": client})


def admin_h(c, client="app"):
    from sqlalchemy import select

    from app.auth import hash_password
    from app.db import SessionLocal
    from app.models import Role, User
    with SessionLocal() as db:
        a = db.scalar(select(User).where(User.role == Role.admin))
        a.password_hash, a.must_change_password = hash_password("Admin#2026"), False
        db.commit()
    return {"Authorization": f"Bearer {login(c, 'ADMIN', 'admin', 'Admin#2026', client).json()['token']}"}


def principal_h(c, code="DEMO01", client="app"):
    return {"Authorization": f"Bearer {login(c, code, 'principal', 'demo123', client).json()['token']}"}


def test_public_form_validation_and_duplicates(c):
    bad = c.post("/public/onboarding", json={**FORM, "pin": "12", "mobile": "12345", "email": "nope"})
    assert bad.status_code == 422
    assert c.post("/public/onboarding", json={**FORM, "consent_contact": False}).status_code == 400
    r = c.post("/public/onboarding", json=FORM)
    assert r.status_code == 201, r.text
    ref = r.json()["reference"]
    assert ref.startswith("PRN-") and r.json()["status"] == "PENDING"
    # same school again (same registration number / same mobile + name) is refused without leaking the reference
    again = c.post("/public/onboarding", json={**FORM, "mobile": "9123456780", "email": "other@x.example"})
    assert again.status_code == 409 and ref not in again.text
    again = c.post("/public/onboarding", json={**FORM, "reg_no": "", "school_name": "SUNRISE  public school"})
    assert again.status_code == 409
    # bots that fill the trap field get a fake success and nothing is stored
    bot = c.post("/public/onboarding", json={**FORM, "school_name": "Bot School", "reg_no": "X1", "mobile": "9000000001",
                                             "email": "b@b.example", "website": "http://spam.example"})
    assert bot.status_code == 201
    h = admin_h(c)
    assert c.get("/admin/onboarding", headers=h).json()["total"] == 1
    # applicant status lookup needs reference AND the mobile used
    assert c.get("/public/onboarding/status", params={"reference": ref, "mobile": "9999999999"}).status_code == 404
    s = c.get("/public/onboarding/status", params={"reference": ref.lower(), "mobile": "98765 43210"}).json()
    assert s["status"] == "PENDING" and s["school_name"] == "Sunrise Public School" and "email" not in s


def test_public_form_rate_limit(c):
    codes = [c.post("/public/onboarding", json={**FORM, "school_name": f"Flood School {i}", "reg_no": f"F-{i}",
                                                "mobile": f"98000000{i:02d}", "email": f"f{i}@x.example"}).status_code for i in range(7)]
    assert codes[:5] == [201] * 5 and codes[5:] == [429, 429]


def test_admin_workflow_to_onboarded_school(c):
    h = admin_h(c)
    lst = c.get("/admin/onboarding", params={"q": "sunrise", "status": "PENDING"}, headers=h).json()
    assert lst["total"] == 1
    rid = lst["items"][0]["id"]
    assert c.get("/admin/onboarding", params={"q": "43210"}, headers=h).json()["total"] == 1       # by contact number
    assert c.get("/admin/onboarding", params={"q": "JH-2026"}, headers=h).json()["total"] == 1     # by registration number
    assert c.get("/admin/onboarding", params={"q": "100%_"}, headers=h).json()["total"] == 0       # wildcards are literal
    d = c.get(f"/admin/onboarding/{rid}", headers=h).json()
    assert d["events"][0]["kind"] == "created" and d["email"] == "office@sunrise.example" and d["mobile"] == "9876543210"
    # can't create the school before approval; reject needs a reason; illegal jumps refused
    assert c.post(f"/admin/onboarding/{rid}/onboard", json={"code": "SUN01"}, headers=h).status_code == 400
    assert c.post(f"/admin/onboarding/{rid}/status", json={"status": "REJECTED"}, headers=h).status_code == 400
    assert c.post(f"/admin/onboarding/{rid}/status", json={"status": "ONBOARDED"}, headers=h).status_code == 400
    c.post(f"/admin/onboarding/{rid}/notes", json={"note": "Called, principal is interested"}, headers=h)
    c.post(f"/admin/onboarding/{rid}/assign", headers=h)
    r = c.post(f"/admin/onboarding/{rid}/status", json={"status": "ADDITIONAL_INFORMATION_REQUIRED", "remarks": "Please share the affiliation number"}, headers=h)
    assert r.status_code == 200
    pub = c.get("/public/onboarding/status", params={"reference": d["reference"], "mobile": "9876543210"}).json()
    assert pub["message"] == "Please share the affiliation number" and "Called" not in str(pub)   # notes stay internal
    assert c.post(f"/admin/onboarding/{rid}/status", json={"status": "APPROVED", "remarks": "ok"}, headers=h).status_code == 200
    ob = c.post(f"/admin/onboarding/{rid}/onboard", json={"code": "sun01"}, headers=h)
    assert ob.status_code == 200, ob.text
    cred = ob.json()["credentials"]
    assert cred["school_code"] == "SUN01" and len(cred["password"]) >= 8 and ob.headers["cache-control"] == "no-store"
    req = ob.json()["request"]
    assert req["status"] == "ONBOARDED" and req["school"]["code"] == "SUN01"
    hist = [(e["kind"], e["from_status"], e["to_status"]) for e in req["events"]]
    assert ("status", "APPROVED", "ONBOARDED") in hist and ("status", "PENDING", "ADDITIONAL_INFORMATION_REQUIRED") in hist
    assert all(e["actor_name"] for e in req["events"])
    # no second school from the same request, and the same school can't apply again
    assert c.post(f"/admin/onboarding/{rid}/onboard", json={"code": "SUN02"}, headers=h).status_code == 400
    assert c.post("/public/onboarding", json={**FORM, "mobile": "9111111111", "email": "n@n.example"}).status_code == 409
    # the principal signs in with the one-time password and must change it; the password is not stored readable
    lg = login(c, "SUN01", cred["login_id"], cred["password"])
    assert lg.status_code == 200 and lg.json()["user"]["must_change_password"] is True
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import AuditLog, OnboardingEvent, User
    with SessionLocal() as db:
        blob = " ".join([a.detail for a in db.scalars(select(AuditLog))] + [e.remarks for e in db.scalars(select(OnboardingEvent))]
                        + [u.password_hash for u in db.scalars(select(User))])
        assert cred["password"] not in blob
    # paged list finds it by registration number and city; details are attached
    pg = c.get("/admin/schools-page", params={"q": "jh-2026-0099"}, headers=h).json()
    assert pg["total"] == 1 and pg["items"][0]["code"] == "SUN01" and pg["items"][0]["city"] == "Ranchi"
    summary = c.get("/admin/onboarding/summary", headers=h).json()
    assert summary["by_status"]["ONBOARDED"] == 1 and summary["total"] >= 1


def test_schools_page_export_trends(c):
    h = admin_h(c)
    pg = c.get("/admin/schools-page", params={"size": 2, "page": 1, "sort": "code"}, headers=h).json()
    assert pg["total"] >= 3 and len(pg["items"]) == 2 and pg["items"][0]["code"] <= pg["items"][1]["code"]
    assert c.get("/admin/schools-page", params={"size": 9999}, headers=h).json()["size"] == 100
    assert c.get("/admin/schools-page", params={"status": "nope"}, headers=h).json()["total"] == 0
    x = c.get("/admin/schools-export", headers=h)
    assert x.status_code == 200 and x.content[:2] == b"PK" and "Prangan-Schools-" in x.headers["content-disposition"]
    from openpyxl import load_workbook
    ws = load_workbook(io.BytesIO(x.content)).active
    codes = [r[0] for r in ws.iter_rows(min_row=2, values_only=True)]
    assert "SUN01" in codes and "DEMO01" in codes
    t = c.get("/admin/trends", params={"months": 6}, headers=h).json()
    assert len(t["months"]) == 6 and sum(t["schools_joined"]) >= 3 and sum(t["requests"]) >= 1
    d = c.put("/admin/schools/1/details", json={"reg_no": "JH-2026-0099"}, headers=h)
    assert d.status_code == 409                                                        # registration numbers are unique


def test_permissions_admin_vs_principal_vs_public(c):
    p = principal_h(c)
    for path in ("/admin/onboarding", "/admin/onboarding/summary", "/admin/onboarding/1", "/admin/schools-page",
                 "/admin/schools-export", "/admin/trends", "/admin/schools/1/details", "/admin/schools/1/data/history"):
        assert c.get(path, headers=p).status_code == 403, path
        assert c.get(path).status_code == 401, path
    for path, body in (("/admin/onboarding/1/status", {"status": "REJECTED", "remarks": "because"}),
                       ("/admin/onboarding/1/onboard", {"code": "HACK1"}), ("/admin/onboarding/1/notes", {"note": "x"}),
                       ("/admin/onboarding/1/assign", {})):
        assert c.post(path, json=body, headers=p).status_code == 403, path
    assert c.put("/admin/schools/1/details", json={}, headers=p).status_code == 403
    # a principal sees only their own school's import/export history; the other school's audit rows never appear
    c.get("/data/template", headers=p)
    mine = c.get("/data/history", headers=p).json()
    assert mine and all(a["action"].startswith("data.") for a in mine)
    other = c.get("/data/history", headers=principal_h(c, "DEMO02")).json()
    assert not {a["id"] for a in mine} & {a["id"] for a in other}
    # admin needs the school's support access for its data history
    assert c.get("/admin/schools/1/data/history", headers=admin_h(c)).status_code == 403
    t = login(c, "DEMO01", "teacher1", "demo123")
    if t.status_code == 200:
        assert c.get("/data/history", headers={"Authorization": f"Bearer {t.json()['token']}"}).status_code == 403


def test_web_sessions(c):
    # only Admin and Principal may sign in to the portal; a wrong password never reveals the role
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Role, User
    with SessionLocal() as db:
        t = db.scalar(select(User).where(User.role == Role.teacher, User.school_id.is_not(None)))
        tlogin, tschool = t.login_id, t.school_id
        from app.models import School
        tcode = db.get(School, tschool).code
    assert login(c, tcode, tlogin, "demo123", "app").status_code == 200
    assert login(c, tcode, tlogin, "demo123", "web").status_code == 403
    assert login(c, tcode, tlogin, "wrong-pw", "web").status_code == 401
    assert login(c, "DEMO01", "principal", "demo123", "nonsense").status_code == 422
    import jwt
    web = login(c, "DEMO01", "principal", "demo123", "web").json()["token"]
    appt = login(c, "DEMO01", "principal", "demo123", "app").json()["token"]
    cw, ca = jwt.decode(web, options={"verify_signature": False}), jwt.decode(appt, options={"verify_signature": False})
    assert cw["web"] is True and cw["exp"] - ca["exp"] < -6 * 86400 + 13 * 3600
    assert c.get("/auth/me", headers={"Authorization": f"Bearer {web}"}).status_code == 200
    # changing the password ends the web session (the app session is kept so the forced-change flow works)
    assert c.post("/auth/password", json={"old_password": "demo123", "new_password": "demo1234"},
                  headers={"Authorization": f"Bearer {web}"}).status_code == 200
    assert c.get("/auth/me", headers={"Authorization": f"Bearer {web}"}).status_code == 401
    assert c.post("/auth/password", json={"old_password": "demo1234", "new_password": "demo123"},
                  headers={"Authorization": f"Bearer {appt}"}).status_code == 200
    # forged / tampered tokens
    assert c.get("/auth/me", headers={"Authorization": "Bearer " + web[:-3] + "abc"}).status_code == 401
    forged = jwt.encode({"sub": "1", "role": "admin", "sid": None}, "x" * 40, algorithm="HS256")
    assert c.get("/admin/overview", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_login_rate_limit_per_address(c):
    codes = {login(c, "DEMO02", f"nobody{i}", "x").status_code for i in range(30)}
    assert codes == {401}
    assert login(c, "DEMO02", "principal", "demo123").status_code == 429


def test_cors_and_headers(c):
    def pre(origin):
        return c.options("/auth/login", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
    assert pre("https://prangan-portal.onrender.com").headers.get("access-control-allow-origin") == "https://prangan-portal.onrender.com"
    assert pre("https://javedrnc.github.io").status_code == 200
    for bad in ("https://evil.example", "https://prangan-portal.onrender.com.evil.example", "https://xprangan-portal.onrender.com",
                "http://localhost:5173"):
        assert pre(bad).headers.get("access-control-allow-origin") is None, bad
    r = c.get("/")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"


def test_push_tokens(c):
    p = principal_h(c)
    tok = "fcm-token-" + "a" * 60
    assert c.post("/push/register", json={"token": tok}).status_code == 401
    assert c.post("/push/register", json={"token": "short"}, headers=p).status_code == 422
    assert c.post("/push/register", json={"token": tok}, headers=p).json() == {"ok": True}
    # the same phone signing in as someone else moves the token; the first user can no longer remove it
    h2 = principal_h(c, "DEMO02")
    assert c.post("/push/register", json={"token": tok}, headers=h2).status_code == 200
    c.post("/push/unregister", json={"token": tok}, headers=p)
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import PushToken
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PushToken).where(PushToken.token == tok)) == 1
    from app import push
    assert push.configured() is False
    push.notify([1], "t", "b")            # not configured: a quiet no-op
