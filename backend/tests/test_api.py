"""End-to-end API tests (Phase 1: multi-school). Run: pytest -q
Set TEST_DATABASE_URL to run against Postgres (that database is reset)."""
import os
import tempfile
from datetime import timedelta

if os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
else:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
os.environ["SEED_DEMO"] = "1"
os.environ.pop("ADMIN_PASSWORD", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.util import today  # noqa: E402

PW = "demo123"


@pytest.fixture(scope="module")
def client():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as c:
        yield c


def login(c, code, lid, pw=PW, expect=200):
    r = c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})
    assert r.status_code == expect, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"} if expect == 200 else r


def P(c):
    return login(c, "DEMO01", "principal")


def admin(c):
    r = c.post("/auth/login", json={"school_code": "ADMIN", "login_id": "admin", "password": "admin123"})
    if r.status_code == 200:
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        if r.json()["user"]["must_change_password"]:
            assert c.post("/auth/password", json={"old_password": "admin123", "new_password": "Admin#2026"}, headers=h).status_code == 200
        return h
    return login(c, "ADMIN", "admin", "Admin#2026")


def first_school_day(c, h, start, step=1, n=40):
    """Find a day that is (or isn't) a school day by probing attendance sheet."""
    d = start
    for _ in range(n):
        r = c.get("/attendance", params={"class_id": 1, "day": d.isoformat()}, headers=h).json()
        yield d, r["is_school_day"]
        d += timedelta(days=step)


# ---------------------------------------------------------------- login & passwords
def test_login_school_code(client):
    login(client, "demo01", "PRINCIPAL")  # case-insensitive
    assert login(client, "NOPE", "principal", expect=401).json()["detail"] == "School code not found"
    login(client, "DEMO01", "principal", "wrong", expect=401)
    login(client, "DEMO02", "principal")
    assert client.get("/classes").status_code == 401


def test_lockout_after_5_wrong(client):
    for _ in range(5):
        login(client, "DEMO01", "T005", "bad", expect=401)
    r = login(client, "DEMO01", "T005", PW, expect=429)
    assert "Too many" in r.json()["detail"]
    h = P(client)
    t5 = next(u for u in client.get("/users", params={"role": "teacher"}, headers=h).json() if u["login_id"] == "T005")
    client.put(f"/users/{t5['id']}", json={"password": "reset123"}, headers=h)  # principal reset unlocks
    login(client, "DEMO01", "T005", "reset123")


def test_temp_password_flow(client):
    h = P(client)
    r = client.post("/users", json={"name": "New Teacher", "login_id": "T099", "password": "temp123", "role": "teacher"}, headers=h)
    assert r.status_code == 200 and r.json()["must_change_password"] is True
    assert client.post("/users", json={"name": "x", "login_id": "T099", "password": "temp123", "role": "teacher"}, headers=h).status_code == 409
    assert client.post("/users", json={"name": "x", "login_id": "abc123", "password": "abc123", "role": "teacher"}, headers=h).status_code == 400
    t = login(client, "DEMO01", "T099", "temp123")
    r = client.get("/classes", headers=t)
    assert r.status_code == 403 and r.json()["detail"] == "PASSWORD_CHANGE_REQUIRED"
    assert client.get("/auth/me", headers=t).json()["must_change_password"] is True
    assert client.post("/auth/password", json={"old_password": "temp123", "new_password": "temp123"}, headers=t).status_code == 400
    assert client.post("/auth/password", json={"old_password": "temp123", "new_password": "t099"}, headers=t).status_code == 400
    assert client.post("/auth/password", json={"old_password": "temp123", "new_password": "mine#456"}, headers=t).json()["must_change_password"] is False
    assert client.get("/classes", headers=t).status_code == 200


# ---------------------------------------------------------------- tenancy
def test_school_isolation(client):
    h1, h2 = P(client), login(client, "DEMO02", "principal")
    c1 = {c["name"] for c in client.get("/classes", headers=h1).json()}
    c2 = client.get("/classes", headers=h2).json()
    assert c1 == {"8-A", "8-B", "9-A"} and [c["name"] for c in c2] == ["5-A"]
    assert client.get("/classes/1/students", headers=h2).status_code == 404
    u1 = client.get("/users", params={"role": "student"}, headers=h1).json()[0]
    assert client.put(f"/users/{u1['id']}", json={"name": "hack"}, headers=h2).status_code == 404
    assert len(client.get("/users", params={"role": "student"}, headers=h2).json()) == 3
    # same login ID can exist in two schools
    assert login(client, "DEMO02", "T001") and login(client, "DEMO01", "T001")
    d2 = client.get("/dashboard", headers=h2).json()
    assert d2["overview"]["students"] == 3


# ---------------------------------------------------------------- working days, calendar, attendance rules
def test_working_days_and_holidays(client):
    h = P(client)
    me = client.get("/school/me", headers=h).json()
    assert me["working_days"] == [0, 1, 2, 3, 4, 5] and "core" in me["modules"]
    # make today a holiday
    t0 = today()
    hol = client.post("/holidays", json={"name": "Test holiday", "start_date": t0.isoformat()}, headers=h).json()
    assert client.get("/school/me", headers=h).json()["today_is_school_day"] is False
    sheet = client.get("/attendance", params={"class_id": 1, "day": t0.isoformat()}, headers=h).json()
    assert sheet["is_school_day"] is False and sheet["reason"] == "Test holiday"
    rec = [{"student_id": r["student_id"], "present": True} for r in sheet["rows"]]
    assert client.post("/attendance", json={"class_id": 1, "date": t0.isoformat(), "records": rec}, headers=h).status_code == 400
    assert client.post("/attendance", json={"class_id": 1, "date": t0.isoformat(), "records": rec, "override": True}, headers=h).status_code == 200
    t = login(client, "DEMO01", "T001")
    assert client.post("/attendance", json={"class_id": 1, "date": t0.isoformat(), "records": rec, "override": True}, headers=t).status_code == 400
    # archive holiday -> school day again; restore it
    assert client.delete(f"/holidays/{hol['id']}", headers=h).status_code == 200
    assert any(a["kind"] == "holiday" and a["id"] == hol["id"] for a in client.get("/archive", headers=h).json())
    assert client.post(f"/archive/holiday/{hol['id']}/restore", headers=h).status_code == 200
    client.delete(f"/holidays/{hol['id']}", headers=h)
    # events don't close school
    ev = client.post("/holidays", json={"name": "Science fair", "start_date": t0.isoformat(), "kind": "event"}, headers=h).json()
    assert ev["is_off"] is False and client.get("/school/me", headers=h).json()["today_is_school_day"] in (True, False)
    client.delete(f"/holidays/{ev['id']}", headers=h)
    # national quick-add is idempotent
    n1 = client.post("/holidays/national", params={"year": 2030}, headers=h).json()
    n2 = client.post("/holidays/national", params={"year": 2030}, headers=h).json()
    assert len(n1) == 3 and n2 == []
    # weekly off: change working days to exclude today's weekday
    wd = [d for d in range(7) if d != t0.weekday()]
    assert client.put("/school/settings", json={"working_days": wd}, headers=h).json()["today_is_school_day"] is False
    assert client.put("/school/settings", json={"working_days": []}, headers=h).status_code == 400
    client.put("/school/settings", json={"working_days": [0, 1, 2, 3, 4, 5]}, headers=h)


def test_teacher_attendance_locks(client):
    t = login(client, "DEMO01", "T003")  # class teacher of 9-A
    t0 = today()
    sheet = client.get("/attendance", params={"class_id": 3, "day": (t0 - timedelta(days=1)).isoformat()}, headers=t).json()
    assert sheet["can_edit"] is False and "locked" in sheet["lock_reason"]
    rec = [{"student_id": r["student_id"], "present": True} for r in sheet["rows"]]
    assert client.post("/attendance", json={"class_id": 3, "date": (t0 - timedelta(days=1)).isoformat(), "records": rec}, headers=t).status_code == 400
    assert client.post("/attendance", json={"class_id": 3, "date": (t0 + timedelta(days=1)).isoformat(), "records": rec}, headers=P(client)).status_code == 400
    today_sheet = client.get("/attendance", params={"class_id": 3, "day": t0.isoformat()}, headers=t).json()
    if today_sheet["is_school_day"]:
        assert today_sheet["can_edit"]
        assert client.post("/attendance", json={"class_id": 3, "date": t0.isoformat(), "records": rec}, headers=t).status_code == 200
        assert client.get("/attendance", params={"class_id": 3, "day": t0.isoformat()}, headers=t).json()["marked_by"] == "Sunita Singh"
    # other subject teacher may mark too (optional)
    t5 = login(client, "DEMO01", "T002")
    assert client.get("/attendance", params={"class_id": 3, "day": t0.isoformat()}, headers=t5).status_code == 200


def test_dashboard_flags_class_teacher(client):
    h = P(client)
    d = client.get("/dashboard", headers=h).json()
    assert d["overview"]["students"] == 24 and d["overview"]["parents"] == 23
    for u in d["unmarked_classes"]:
        assert "class_teacher" in u
    assert d["academics"]["exam"]["name"] == "Half Yearly"


# ---------------------------------------------------------------- archive
def test_archive_and_restore(client):
    h = P(client)
    assert client.delete("/classes/1", headers=h).status_code == 409
    c = client.post("/classes", json={"name": "Temp-Z"}, headers=h).json()
    assert client.delete(f"/classes/{c['id']}", headers=h).status_code == 200
    assert all(x["id"] != c["id"] for x in client.get("/classes", headers=h).json())
    assert client.post("/classes", json={"name": "Temp-Z"}, headers=h).status_code == 409  # name kept in archive
    assert client.post(f"/archive/class/{c['id']}/restore", headers=h).status_code == 200
    assert any(x["id"] == c["id"] for x in client.get("/classes", headers=h).json())
    # subject archive hides marks from report card; restore brings them back
    s = login(client, "DEMO01", "2026002")
    before = client.get("/me/marks", headers=s).json()[0]
    sci = next(x for x in client.get("/subjects", headers=h).json() if x["name"] == "Science")
    client.delete(f"/subjects/{sci['id']}", headers=h)
    mid = client.get("/me/marks", headers=s).json()[0]
    assert len(mid["subjects"]) == len(before["subjects"]) - 1
    assert all(e["subject_id"] != sci["id"] for e in client.get("/timetable", headers=s).json())
    client.post(f"/archive/subject/{sci['id']}/restore", headers=h)
    assert len(client.get("/me/marks", headers=s).json()[0]["subjects"]) == len(before["subjects"])
    # exam archive
    ex = client.get("/exams", headers=h).json()[-1]
    client.delete(f"/exams/{ex['id']}", headers=h)
    assert all(card["exam_id"] != ex["id"] for card in client.get("/me/marks", headers=s).json())
    client.post(f"/archive/exam/{ex['id']}/restore", headers=h)
    # post archive
    p = client.post("/posts", json={"kind": "notice", "title": "Oops"}, headers=h).json()
    client.delete(f"/posts/{p['id']}", headers=h)
    assert all(x["id"] != p["id"] for x in client.get("/posts", headers=h).json())
    kinds = {a["kind"] for a in client.get("/archive", headers=h).json()}
    assert "post" in kinds
    # user remove/restore via archive
    st = client.get("/users", params={"role": "student"}, headers=h).json()[-1]
    client.delete(f"/users/{st['id']}", headers=h)
    login(client, "DEMO01", st["login_id"], expect=401)
    assert client.post(f"/archive/user/{st['id']}/restore", headers=h).status_code == 200
    login(client, "DEMO01", st["login_id"])


# ---------------------------------------------------------------- parents
def test_parent_views(client):
    par = login(client, "DEMO01", "9876500001")
    kids = client.get("/me/children", headers=par).json()
    assert len(kids) == 2
    a, b = kids
    att_a = client.get("/me/attendance", params={"student_id": a["id"]}, headers=par).json()
    att_b = client.get("/me/attendance", params={"student_id": b["id"]}, headers=par).json()
    assert att_a["total_days"] > 10 and att_b["total_days"] > 10
    assert client.get("/me/marks", params={"student_id": b["id"]}, headers=par).status_code == 200
    other = login(client, "DEMO01", "9876500003")
    assert client.get("/me/attendance", params={"student_id": a["id"]}, headers=other).status_code == 403
    tt = client.get("/timetable", params={"student_id": b["id"]}, headers=par).json()
    assert {e["class_id"] for e in tt} == {b["class_id"]}
    posts = client.get("/posts", params={"student_id": a["id"], "kind": "homework"}, headers=par).json()
    assert all(p["class_id"] in (None, a["class_id"]) for p in posts)
    assert client.get("/dashboard", headers=par).status_code == 403
    assert client.post("/auth/consent", headers=par).json()["consent_at"] is not None
    # principal creates a parent linked to a child
    h = P(client)
    st = client.get("/users", params={"role": "student", "class_id": 2}, headers=h).json()[0]
    r = client.post("/users", json={"name": "Mrs. Test", "login_id": "9000000001", "password": "temp999", "role": "parent",
                                    "children_ids": [st["id"]]}, headers=h)
    assert r.status_code == 200 and r.json()["children_ids"] == [st["id"]]
    assert client.post("/users", json={"name": "x", "login_id": "9000000002", "password": "temp999", "role": "parent",
                                       "children_ids": [99999]}, headers=h).status_code == 400


# ---------------------------------------------------------------- roles & permissions
def test_vice_principal_and_coordinator(client):
    vp = login(client, "DEMO01", "vp")
    assert client.get("/dashboard", headers=vp).status_code == 200
    assert client.post("/classes", json={"name": "VP-class"}, headers=vp).status_code == 200
    assert client.put("/school/settings", json={"name": "x"}, headers=vp).status_code == 403
    assert client.post("/users", json={"name": "c", "login_id": "c2", "password": "temp123", "role": "coordinator"}, headers=vp).status_code == 403
    co = login(client, "DEMO01", "coord")
    assert {c["name"] for c in client.get("/classes", headers=co).json()} == {"8-A", "8-B"}
    assert client.get("/attendance", params={"class_id": 3, "day": today().isoformat()}, headers=co).status_code == 403
    assert client.get("/attendance", params={"class_id": 1, "day": today().isoformat()}, headers=co).status_code == 200
    assert client.post("/users", json={"name": "x", "login_id": "x1", "password": "temp123", "role": "student", "class_id": 1}, headers=co).status_code == 403
    assert client.post("/classes", json={"name": "nope"}, headers=co).status_code == 403
    # principal limits the coordinator
    h = P(client)
    cu = next(u for u in client.get("/users", params={"role": "coordinator"}, headers=h).json())
    client.put(f"/users/{cu['id']}", json={"permissions": {"exams": "view"}}, headers=h)
    assert client.post("/marks", json={"exam_id": 1, "class_id": 1, "subject_id": 1, "records": []}, headers=co).status_code == 403
    # DEMO02 (Basic plan) can't add extra roles
    h2 = login(client, "DEMO02", "principal")
    r = client.post("/users", json={"name": "v", "login_id": "vp", "password": "temp123", "role": "vice_principal"}, headers=h2)
    assert r.status_code == 403 and "extra_roles" in r.json()["detail"]
    assert client.post("/users", json={"name": "p", "login_id": "p2", "password": "temp123", "role": "principal"}, headers=h).status_code == 403


def test_teacher_flows_still_work(client):
    t = login(client, "DEMO01", "T005", "reset123")
    client.post("/auth/password", json={"old_password": "reset123", "new_password": "teach#55"}, headers=t)
    t = login(client, "DEMO01", "T005", "teach#55")
    subj = {s["name"]: s["id"] for s in client.get("/subjects", headers=t).json()}
    exam = client.get("/exams", headers=t).json()[0]
    st = client.get("/classes/3/students", headers=t).json()[0]
    ok = client.post("/marks", json={"exam_id": exam["id"], "class_id": 3, "subject_id": subj["Social Science"],
                                     "records": [{"student_id": st["id"], "score": 77}]}, headers=t)
    assert ok.status_code == 200
    bad = client.post("/marks", json={"exam_id": exam["id"], "class_id": 3, "subject_id": subj["Mathematics"],
                                      "records": [{"student_id": st["id"], "score": 7}]}, headers=t)
    assert bad.status_code == 403
    hw = client.post("/posts", json={"kind": "homework", "title": "Map work", "class_id": 3, "subject_id": subj["Social Science"]}, headers=t)
    assert hw.status_code == 200
    assert client.post("/posts", json={"kind": "notice", "title": "School-wide"}, headers=t).status_code == 403


# ---------------------------------------------------------------- admin, privacy, subscriptions
def test_admin_privacy_and_audit(client):
    a = admin(client)
    ov = client.get("/admin/overview", headers=a).json()
    assert ov["schools"] == 2 and ov["students"] >= 27
    assert client.get("/admin/overview", headers=P(client)).status_code == 403
    schools = {s["code"]: s for s in client.get("/admin/schools", headers=a).json()}
    sid = schools["DEMO01"]["id"]
    users = client.get(f"/admin/schools/{sid}/users", params={"role": "parent"}, headers=a).json()
    assert "X" in users[0]["phone"] and users[0]["name"]  # masked phone, name visible
    studs = client.get(f"/admin/schools/{sid}/users", params={"role": "student"}, headers=a).json()
    assert studs[0]["address"].startswith("Hidden") and studs[0]["dob"] is None
    # principal sees admin's access in the audit log
    h = P(client)
    assert any(x["action"] == "admin.viewed_people" for x in client.get("/school/audit", headers=h).json())
    # principal grants support access -> full details
    client.post("/school/support-access", params={"hours": 2}, headers=h)
    studs = client.get(f"/admin/schools/{sid}/users", params={"role": "student"}, headers=a).json()
    assert "Lalpur" in studs[0]["address"]
    client.delete("/school/support-access", headers=h)
    assert client.get(f"/admin/schools/{sid}/users", params={"role": "student"}, headers=a).json()[0]["dob"] is None
    # admin resets principal password -> temporary
    pr = client.get(f"/admin/schools/{sid}/users", params={"role": "principal"}, headers=a).json()[0]
    client.put(f"/admin/schools/{sid}/users/{pr['id']}", json={"password": "newtemp1"}, headers=a)
    hp = login(client, "DEMO01", "principal", "newtemp1")
    assert client.get("/classes", headers=hp).json()["detail"] == "PASSWORD_CHANGE_REQUIRED"
    assert client.post("/auth/password", json={"old_password": "newtemp1", "new_password": PW}, headers=hp).status_code == 200
    assert client.get("/classes", headers=P(client)).status_code == 200


def test_admin_schools_plans_subscription(client):
    a = admin(client)
    plans = {p["name"]: p for p in client.get("/admin/plans", headers=a).json()}
    assert set(plans) == {"Basic", "Standard", "Premium"}
    r = client.put(f"/admin/plans/{plans['Standard']['id']}", json={"name": "Standard", "modules": plans["Standard"]["modules"],
                                                                      "price_per_student": 20, "min_monthly": 1000}, headers=a)
    assert r.json()["price_per_student"] == 20
    new = client.post("/admin/schools", json={"code": "NEW01", "name": "New School", "plan_id": plans["Standard"]["id"],
                                             "principal_name": "Mr. New", "principal_password": "start123"}, headers=a)
    assert new.status_code == 200, new.text
    nid = new.json()["id"]
    assert new.json()["status"] == "trial"
    assert client.post("/admin/schools", json={"code": "new01", "name": "dup", "principal_name": "x", "principal_password": "start123"}, headers=a).status_code == 409
    hp = login(client, "NEW01", "principal", "start123")
    assert client.get("/classes", headers=hp).json()["detail"] == "PASSWORD_CHANGE_REQUIRED"
    client.post("/auth/password", json={"old_password": "start123", "new_password": "newpass9"}, headers=hp)
    assert client.get("/school/me", headers=hp).json()["subscription"]["estimate"]["amount"] == 1000  # minimum applies
    # expire → read-only
    past = (today() - timedelta(days=40)).isoformat()
    client.put(f"/admin/schools/{nid}", json={"trial_until": past, "valid_until": past}, headers=a)
    assert client.get("/school/me", headers=hp).json()["status"] == "expired"
    assert client.get("/classes", headers=hp).status_code == 200
    r = client.post("/classes", json={"name": "1-A"}, headers=hp)
    assert r.status_code == 402
    # payment extends validity
    pay = client.post(f"/admin/schools/{nid}/payments", json={"amount": 1000, "paid_on": today().isoformat(), "method": "UPI"}, headers=a)
    assert pay.status_code == 200
    assert client.get(f"/admin/schools/{nid}", headers=a).json()["status"] == "active"
    assert client.post("/classes", json={"name": "1-A"}, headers=hp).status_code == 200
    # free / sponsored + custom modules
    d = client.put(f"/admin/schools/{nid}", json={"is_free": True, "custom_modules": ["extra_roles"]}, headers=a).json()
    assert d["status"] == "free" and d["subscription"]["estimate"]["amount"] == 0
    assert set(d["subscription"]["modules"]) == {"core", "extra_roles"}
    assert client.put(f"/admin/schools/{nid}", json={"custom_modules": ["bogus"]}, headers=a).status_code == 400
    # suspend blocks login
    client.put(f"/admin/schools/{nid}", json={"suspended": True}, headers=a)
    assert login(client, "NEW01", "principal", "newpass9", expect=403)
    client.put(f"/admin/schools/{nid}", json={"suspended": False}, headers=a)
    assert len(client.get("/admin/audit", params={"school_id": nid}, headers=a).json()) >= 3


def test_legacy_schema_is_reset(tmp_path):
    """v1 single-school DB (no meta table) is reset to the multi-school schema."""
    import sqlite3
    import subprocess
    import sys

    db = tmp_path / "legacy.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)")
    con.execute("INSERT INTO users (email) VALUES ('old@school.com')")
    con.commit()
    con.close()
    code = ("from app.migrate import migrate; migrate(); import sqlite3; c=sqlite3.connect(%r); "
            "cols=[r[1] for r in c.execute('PRAGMA table_info(users)')]; "
            "print('school_id' in cols, c.execute('select value from meta').fetchone()[0])") % str(db)
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         env={**os.environ, "DATABASE_URL": f"sqlite:///{db}"}, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert out.stdout.strip() == "True 2", out.stderr
