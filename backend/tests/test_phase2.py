"""Phase 2: leaves, banners, polls/consent, GPS staff attendance, transport."""
import os
import tempfile
from datetime import timedelta

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.util import today  # noqa: E402

SCHOOL = (23.3441, 85.3096)


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        h = login(client, "principal")
        # make every day a school day and clear holidays so date-dependent tests are stable
        client.put("/school/settings", json={"working_days": [0, 1, 2, 3, 4, 5, 6]}, headers=h)
        for hol in client.get("/holidays", headers=h).json():
            client.delete(f"/holidays/{hol['id']}", headers=h)
        yield client


def login(c, lid, code="DEMO01", pw="demo123"):
    r = c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    if r.json()["user"]["role"] == "parent" and not r.json()["user"]["consent_at"]:
        c.post("/auth/consent", headers=h)
    return h


# ---------------------------------------------------------------- modules gating
def test_basic_plan_blocks_modules(c):
    h2 = login(c, "principal", "DEMO02")
    for path in ("/leaves", "/polls", "/transport/overview", "/staff-attendance/day"):
        r = c.get(path, headers=h2)
        assert r.status_code == 403 and "MODULE_NOT_ENABLED" in r.json()["detail"], path
    # text banners are core; image banners need Communication
    assert c.post("/banners", json={"title": "Hello"}, headers=h2).status_code == 200
    r = c.post("/banners", json={"title": "Pic", "image_url": "https://x.org/a.png"}, headers=h2)
    assert r.status_code == 403


# ---------------------------------------------------------------- leaves
def test_teacher_leave_flow(c):
    t = login(c, "T001")
    start = today() + timedelta(days=10)
    r = c.post("/leaves", json={"leave_type": "casual", "start_date": start.isoformat(), "end_date": (start + timedelta(days=1)).isoformat(),
                                "reason": "Wedding"}, headers=t)
    assert r.status_code == 200 and r.json()["status"] == "pending" and r.json()["days"] == 2
    lid = r.json()["id"]
    assert c.post("/leaves", json={"leave_type": "casual", "start_date": start.isoformat()}, headers=t).status_code == 409
    assert c.post("/leaves", json={"leave_type": "family", "start_date": (start + timedelta(days=5)).isoformat()}, headers=t).status_code == 400
    assert c.post(f"/leaves/{lid}/decide", json={"approve": True}, headers=t).status_code == 403  # can't approve own
    h = login(c, "principal")
    inbox = c.get("/leaves", params={"scope": "inbox", "status": "pending"}, headers=h).json()
    assert any(x["id"] == lid and x["can_decide"] for x in inbox)
    d = c.post(f"/leaves/{lid}/decide", json={"approve": True, "comment": "Enjoy"}, headers=h).json()
    assert d["status"] == "approved" and d["decided_by_name"]
    assert c.post(f"/leaves/{lid}/decide", json={"approve": False}, headers=h).status_code == 409
    bal = c.get("/leaves/balance", headers=t).json()
    casual = next(x for x in bal["types"] if x["type"] == "casual")
    assert casual["used"] >= 2 and casual["left"] == casual["quota"] - casual["used"]
    # cancel an approved future leave
    assert c.post(f"/leaves/{lid}/cancel", headers=t).status_code == 200
    # coordinator can view staff leave? no — only student leaves
    co = login(c, "coord")
    assert all(x["kind"] == "student" for x in c.get("/leaves", params={"scope": "inbox"}, headers=co).json())
    # VP can approve staff leave
    t2 = login(c, "T002")
    lr = c.post("/leaves", json={"leave_type": "sick", "start_date": (today() + timedelta(days=20)).isoformat()}, headers=t2).json()
    assert c.post(f"/leaves/{lr['id']}/decide", json={"approve": False, "comment": "Exams"}, headers=login(c, "vp")).json()["status"] == "rejected"


def test_student_leave_by_parent(c):
    par = login(c, "9876500001")
    kids = c.get("/me/children", headers=par).json()
    kid = kids[0]
    d = today()
    r = c.post("/leaves", json={"leave_type": "sick", "start_date": d.isoformat(), "reason": "Fever", "student_id": kid["id"]}, headers=par)
    assert r.status_code == 200 and r.json()["kind"] == "student" and r.json()["user_id"] == kid["id"]
    lid = r.json()["id"]
    other = login(c, "9876500003")
    assert c.post("/leaves", json={"leave_type": "sick", "start_date": d.isoformat(), "student_id": kid["id"]}, headers=other).status_code == 403
    assert any(x["id"] == lid for x in c.get("/leaves", headers=par).json())
    # class teacher of the child's class approves
    classes = {x["id"]: x for x in c.get("/classes", headers=login(c, "principal")).json()}
    ct_id = classes[kid["class_id"]]["class_teacher_id"]
    teachers = c.get("/users", params={"role": "teacher"}, headers=login(c, "principal")).json()
    ct = next(t for t in teachers if t["id"] == ct_id)
    th = login(c, ct["login_id"])
    inbox = c.get("/leaves", params={"scope": "inbox"}, headers=th).json()
    assert any(x["id"] == lid and x["can_decide"] for x in inbox)
    other_teacher = next(t for t in teachers if t["id"] != ct_id and t["login_id"].startswith("T00"))
    assert c.post(f"/leaves/{lid}/decide", json={"approve": True}, headers=login(c, other_teacher["login_id"])).status_code == 403
    assert c.post(f"/leaves/{lid}/decide", json={"approve": True}, headers=th).status_code == 200
    # attendance sheet flags the child; absence on leave doesn't count against %
    sheet = c.get("/attendance", params={"class_id": kid["class_id"], "day": d.isoformat()}, headers=th).json()
    row = next(x for x in sheet["rows"] if x["student_id"] == kid["id"])
    assert row["on_leave"] is True
    before = c.get("/me/attendance", params={"student_id": kid["id"]}, headers=par).json()
    recs = [{"student_id": x["student_id"], "present": x["student_id"] != kid["id"]} for x in sheet["rows"]]
    assert c.post("/attendance", json={"class_id": kid["class_id"], "date": d.isoformat(), "records": recs}, headers=th).status_code == 200
    after = c.get("/me/attendance", params={"student_id": kid["id"]}, headers=par).json()
    had_today = before["recent"] and before["recent"][0]["date"] == d.isoformat()
    assert after["total_days"] == before["total_days"] - (1 if had_today else 0)   # leave day not counted
    assert after["recent"][0]["leave"] is True
    today_list = c.get("/leaves/today", headers=th).json()
    assert any(s["user_id"] == kid["id"] for s in today_list["students"])
    assert c.post("/leaves", json={"leave_type": "sick", "start_date": d.isoformat()}, headers=login(c, "2026001")).status_code == 403


# ---------------------------------------------------------------- banners
def test_banners(c):
    h = login(c, "principal")
    b = c.post("/banners", json={"title": "Parents only", "roles": ["parent"], "popup": True, "image_url": "https://example.org/a.jpg"}, headers=h).json()
    assert b["popup"] and b["image_url"]
    assert c.post("/banners", json={"title": "x", "image_url": "http://insecure"}, headers=h).status_code == 400
    par = login(c, "9876500001")
    stu = login(c, "2026002")
    assert any(x["id"] == b["id"] for x in c.get("/banners/active", headers=par).json())
    assert all(x["id"] != b["id"] for x in c.get("/banners/active", headers=stu).json())
    future = c.post("/banners", json={"title": "Later", "start_date": (today() + timedelta(days=3)).isoformat()}, headers=h).json()
    assert all(x["id"] != future["id"] for x in c.get("/banners/active", headers=par).json())
    t = login(c, "T001")
    assert c.post("/banners", json={"title": "Teacher"}, headers=t).status_code == 403
    assert c.delete(f"/banners/{b['id']}", headers=h).status_code == 200
    assert any(a["kind"] == "banner" for a in c.get("/archive", headers=h).json())
    # platform banner by admin shows in every school
    r = c.post("/auth/login", json={"school_code": "ADMIN", "login_id": "admin", "password": "admin123"}).json()
    a = {"Authorization": f"Bearer {r['token']}"}
    c.post("/auth/password", json={"old_password": "admin123", "new_password": "Admin#2026"}, headers=a)
    pb = c.post("/admin/banners", json={"title": "New features this week"}, headers=a).json()
    assert any(x["id"] == pb["id"] and x["platform"] for x in c.get("/banners/active", headers=login(c, "principal", "DEMO02")).json())


# ---------------------------------------------------------------- polls & consent
def test_consent_and_polls(c):
    h = login(c, "principal")
    classes = c.get("/classes", headers=h).json()
    f = c.post("/polls", json={"kind": "consent", "title": "Zoo trip", "audience": ["parent"], "class_ids": [classes[0]["id"]],
                               "deadline": (today() + timedelta(days=3)).isoformat(), "amount": 150}, headers=h).json()
    assert f["options"] == ["Yes", "No"] and f["eligible"] > 0
    par = login(c, "9876500001")   # has a child in 8-A and one in 8-B
    mine = next(p for p in c.get("/polls", headers=par).json() if p["id"] == f["id"])
    assert len(mine["my_targets"]) == 1
    kid = mine["my_targets"][0]["student_id"]
    assert c.post(f"/polls/{f['id']}/respond", json={"choices": [0]}, headers=par).status_code == 403   # must pick child
    r = c.post(f"/polls/{f['id']}/respond", json={"choices": [0], "student_id": kid, "comment": "OK"}, headers=par)
    assert r.status_code == 200 and r.json()["my_targets"][0]["response"]["choices"] == [0]
    assert c.post(f"/polls/{f['id']}/respond", json={"choices": [0, 1], "student_id": kid}, headers=par).status_code == 400
    res = c.get(f"/polls/{f['id']}/results", headers=h).json()
    assert res["responded"] == 1 and res["counts"] == [1, 0] and len(res["pending"]) == res["eligible"] - 1
    assert c.get(f"/polls/{f['id']}/results", headers=par).status_code == 403
    p = c.post("/polls", json={"kind": "poll", "title": "Lunch menu", "options": ["Rice", "Roti", "Both"], "multi": True,
                               "audience": ["teacher"]}, headers=h).json()
    t = login(c, "T001")
    assert c.post(f"/polls/{p['id']}/respond", json={"choices": [0, 1]}, headers=t).status_code == 200
    assert c.post(f"/polls/{p['id']}/respond", json={"choices": [0]}, headers=par).status_code == 403
    assert c.post("/polls", json={"kind": "poll", "title": "x", "options": ["one"]}, headers=h).status_code == 400
    c.post(f"/polls/{p['id']}/close", headers=h)
    assert c.post(f"/polls/{p['id']}/respond", json={"choices": [2]}, headers=t).status_code == 409


# ---------------------------------------------------------------- GPS staff attendance
def test_staff_check_in(c):
    t = login(c, "T005")
    st = c.get("/staff-attendance/me", headers=t).json()
    assert st["settings"]["configured"] is True and st["today"]["is_school_day"] is True
    far = {"lat": SCHOOL[0] + 0.01, "lng": SCHOOL[1], "accuracy": 10}
    r = c.post("/staff-attendance/check-in", json=far, headers=t)
    assert r.status_code == 403 and "m from school" in r.json()["detail"]
    assert c.post("/staff-attendance/check-in", json={"lat": SCHOOL[0], "lng": SCHOOL[1], "mocked": True}, headers=t).status_code == 400
    assert c.post("/staff-attendance/check-in", json={"lat": SCHOOL[0], "lng": SCHOOL[1], "accuracy": 500}, headers=t).status_code == 400
    assert c.post("/staff-attendance/check-out", json={"lat": SCHOOL[0], "lng": SCHOOL[1]}, headers=t).status_code == 409
    near = {"lat": SCHOOL[0] + 0.0005, "lng": SCHOOL[1], "accuracy": 12}   # ~55 m
    r = c.post("/staff-attendance/check-in", json=near, headers=t)
    assert r.status_code == 200 and 40 < r.json()["in_distance_m"] < 70
    assert c.post("/staff-attendance/check-in", json=near, headers=t).status_code == 409
    assert c.post("/staff-attendance/check-out", json=near, headers=t).json()["check_out_at"]
    h = login(c, "principal")
    board = c.get("/staff-attendance/day", headers=h).json()
    assert next(r for r in board["rows"] if r["login_id"] == "T005")["status"] in ("present", "late")
    rep = c.get("/staff-attendance/report", headers=h).json()
    assert rep["rows"] and all(0 <= r["percent"] <= 100 for r in rep["rows"])
    # manual mark + permissions
    t3 = next(r for r in board["rows"] if r["login_id"] == "T003")
    assert c.post("/staff-attendance/manual", json={"user_id": t3["user_id"], "date": today().isoformat(), "note": "Phone issue"}, headers=h).status_code == 200
    assert c.get("/staff-attendance/day", headers=t).status_code == 403
    assert c.put("/staff-attendance/settings", json={"lat": 1, "lng": 1}, headers=login(c, "vp")).status_code == 403
    assert c.post("/staff-attendance/check-in", json=near, headers=login(c, "2026001")).status_code == 403


# ---------------------------------------------------------------- transport
def test_transport(c):
    h = login(c, "principal")
    ov = c.get("/transport/overview", headers=h).json()
    assert len(ov["vehicles"]) == 2 and ov["riders"] == 14
    assert any("Insurance" in a["items"] for a in ov["alerts"])
    v = c.post("/transport/vehicles", json={"number": "JH01 ZZ 9999", "capacity": 2, "driver_name": "Test", "driver_phone": "9000000000"}, headers=h).json()
    r = c.post("/transport/routes", json={"name": "Route 3", "vehicle_id": v["id"], "stops": [
        {"name": "A", "pickup_time": "07:00", "drop_time": "14:00"}, {"name": "B", "pickup_time": "07:10"}]}, headers=h).json()
    assert [s["name"] for s in r["stops"]] == ["A", "B"]
    assert c.post("/transport/routes", json={"name": "bad", "stops": [{"name": "x", "pickup_time": "7am"}]}, headers=h).status_code == 422
    studs = c.get("/users", params={"role": "student"}, headers=h).json()
    ids = [s["id"] for s in studs[-3:]]
    stop_a = r["stops"][0]["id"]
    assert c.put("/transport/students", json={"student_ids": ids, "route_id": r["id"], "stop_id": stop_a}, headers=h).json()["assigned"] == 3
    ov = c.get("/transport/overview", headers=h).json()
    assert any("Over capacity" in a["items"] for a in ov["alerts"])
    # can't remove a stop or archive a route with riders
    assert c.put(f"/transport/routes/{r['id']}", json={"name": "Route 3", "vehicle_id": v["id"], "stops": [{"id": r["stops"][1]["id"], "name": "B"}]}, headers=h).status_code == 409
    assert c.delete(f"/transport/routes/{r['id']}", headers=h).status_code == 409
    # student sees the bus
    s_login = studs[-1]["login_id"]
    me = c.get("/transport/me", headers=login(c, s_login)).json()
    assert me["assigned"] and me["stop"] == "A" and me["driver_phone"] == "9000000000"
    assert c.put("/transport/students", json={"student_ids": ids, "route_id": None}, headers=h).json()["removed"] == 3
    assert c.get("/transport/me", headers=login(c, s_login)).json() == {"assigned": False}
    assert c.delete(f"/transport/routes/{r['id']}", headers=h).status_code == 200
    assert c.post("/transport/vehicles", json={"number": "X"}, headers=login(c, "coord")).status_code == 403
    assert c.get("/transport/overview", headers=login(c, "T001")).status_code == 403
