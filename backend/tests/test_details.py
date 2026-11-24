"""Detailed API scenarios: sign-in and passwords, people, classes and exams, attendance and marks rights, what students
and parents may see (only their own child), notices by audience, leaves, school settings, the dashboard and the archive."""
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

PW = "demo123"


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


def raw_login(c, lid, pw=PW, code="DEMO01", **extra):
    return c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw, **extra})


_CHANGED: dict[tuple[str, str], str] = {}       # accounts whose first-sign-in password this module already changed


def login(c, lid, pw=PW, code="DEMO01"):
    pw = _CHANGED.get((code, lid.lower()), pw)
    r = raw_login(c, lid, pw, code)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    if r.json()["user"]["must_change_password"]:
        r = c.post("/auth/password", json={"old_password": pw, "new_password": pw + "Xy#9"}, headers=h)
        assert r.status_code == 200, r.text
        _CHANGED[(code, lid.lower())] = pw + "Xy#9"
        h = {"Authorization": f"Bearer {r.json()['token']}"}
    return h


def me(c, h):
    return c.get("/auth/me", headers=h).json()


# ---------------------------------------------------------------- sign-in and passwords
@pytest.mark.tc("TC-B-091", "Sign in details")
@pytest.mark.sanity
@pytest.mark.regression
def test_sign_in_details(c):
    assert raw_login(c, "principal", code="demo01").status_code == 200                      # code in small letters
    assert raw_login(c, "PRINCIPAL").status_code == 200                                      # login ID is not case-sensitive
    assert raw_login(c, "principal", code="").status_code in (401, 422)
    assert raw_login(c, "", "x").status_code in (401, 422)
    r = raw_login(c, "principal", client="web")
    assert r.status_code == 200
    assert raw_login(c, "T001", client="web").status_code == 403                             # the web portal is for principals and admins
    assert c.get("/auth/me").status_code == 401
    assert c.get("/auth/me", headers={"Authorization": "Bearer not-a-token"}).status_code == 401
    assert c.get("/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401
    u = r.json()["user"]
    assert u["role"] == "principal" and "password_hash" not in u and "password" not in u


@pytest.mark.tc("TC-B-092", "Password change rules")
@pytest.mark.sanity
@pytest.mark.regression
def test_password_change_rules(c):
    p = login(c, "principal")
    t = c.post("/users", json={"name": "Rule Tester", "login_id": "RT01", "password": "Start#123", "role": "teacher"}, headers=p).json()
    first = raw_login(c, "RT01", "Start#123").json()
    h = {"Authorization": f"Bearer {first['token']}"}
    assert first["user"]["must_change_password"] is True
    assert c.get("/classes", headers=h).json()["detail"] == "PASSWORD_CHANGE_REQUIRED"     # nothing else until it is changed
    for bad in ("short", "RT01", "x" * 80):
        r = c.post("/auth/password", json={"old_password": "Start#123", "new_password": bad}, headers=h)
        assert r.status_code == 400, (bad, r.text)
    assert c.post("/auth/password", json={"old_password": "wrong", "new_password": "Good#Pass12"}, headers=h).status_code in (400, 401)
    r = c.post("/auth/password", json={"old_password": "Start#123", "new_password": "Good#Pass12"}, headers=h)
    assert r.status_code == 200
    assert c.get("/auth/me", headers=h).status_code == 401                                  # the old session ends
    new = {"Authorization": f"Bearer {r.json()['token']}"}
    assert c.get("/classes", headers=new).status_code == 200
    assert raw_login(c, "RT01", "Start#123").status_code == 401 and raw_login(c, "RT01", "Good#Pass12").status_code == 200
    assert c.put(f"/users/{me(c, p)['id']}", json={"password": "Other#Pass1"}, headers=p).status_code == 400   # own password: Me → Change password
    c.delete(f"/users/{t['id']}", headers=p)


@pytest.mark.tc("TC-B-093", "Consent is recorded once")
@pytest.mark.sanity
@pytest.mark.regression
def test_consent_is_recorded_once(c):
    h = login(c, "9876500002")
    first = c.post("/auth/consent", headers=h)
    assert first.status_code == 200
    at = me(c, h)["consent_at"]
    assert at
    c.post("/auth/consent", headers=h)
    assert me(c, h)["consent_at"] == at


# ---------------------------------------------------------------- people
@pytest.mark.tc("TC-B-094", "People create validation")
@pytest.mark.sanity
@pytest.mark.regression
def test_people_create_validation(c):
    p = login(c, "principal")
    cls = c.get("/classes", headers=p).json()[0]
    base = {"name": "New Kid", "login_id": "NK001", "password": "Start#123", "role": "student", "class_id": cls["id"]}
    assert c.post("/users", json={**base, "class_id": None}, headers=p).status_code == 400          # a student needs a class
    assert c.post("/users", json={**base, "class_id": 999999}, headers=p).status_code == 404
    assert c.post("/users", json={**base, "password": "NK001x"[:5]}, headers=p).status_code == 422
    assert c.post("/users", json={**base, "password": "nk001"}, headers=p).status_code in (400, 422)  # same as the login ID
    assert c.post("/users", json={**base, "role": "principal"}, headers=p).status_code == 403
    assert c.post("/users", json={**base, "role": "admin"}, headers=p).status_code == 403
    ok = c.post("/users", json=base, headers=p)
    assert ok.status_code == 200 and ok.json()["must_change_password"] is True
    assert c.post("/users", json={**base, "login_id": "nk001"}, headers=p).status_code == 409       # sign-in ignores capitals, so must the IDs
    assert c.post("/users", json={**base, "login_id": "NK001"}, headers=p).status_code == 409
    parent = {"name": "Guardian", "login_id": "9000011111", "password": "Start#123", "role": "parent"}
    assert c.post("/users", json={**parent, "children_ids": [999999]}, headers=p).status_code == 400
    assert c.post("/users", json={**parent, "children_ids": [me(c, login(c, 'T001'))["id"]]}, headers=p).status_code == 400   # a teacher is not a child
    made = c.post("/users", json={**parent, "children_ids": [ok.json()["id"]]}, headers=p).json()
    assert made["children_ids"] == [ok.json()["id"]]
    assert c.post("/users", json={**base, "login_id": "NK002"}, headers=login(c, "coord")).status_code == 403   # coordinator: people view only
    assert c.post("/users", json={**base, "login_id": "NK003"}, headers=login(c, "vp")).status_code == 200      # VP: people edit


@pytest.mark.tc("TC-B-095", "People update rules")
@pytest.mark.sanity
@pytest.mark.regression
def test_people_update_rules(c):
    p, vp = login(c, "principal"), login(c, "vp")
    principal_id = me(c, p)["id"]
    assert c.put(f"/users/{principal_id}", json={"name": "New name"}, headers=vp).status_code == 403          # only the admin changes the principal
    assert c.put(f"/users/{principal_id}", json={"active": False}, headers=p).status_code == 400             # can't remove yourself
    assert c.delete(f"/users/{principal_id}", headers=p).status_code == 400
    coord = next(u for u in c.get("/users", headers=p).json() if u["role"] == "coordinator")
    assert c.put(f"/users/{coord['id']}", json={"name": "Changed by VP"}, headers=vp).status_code == 403      # only the principal manages VP/coordinators
    r = c.put(f"/users/{coord['id']}", json={"permissions": {"fees": "edit", "nonsense": "edit", "people": "superuser"}}, headers=p)
    perms = r.json()["permissions"]
    assert perms["fees"] == "edit" and "nonsense" not in perms and perms["people"] in ("none", "view", "edit")
    t = next(u for u in c.get("/users", params={"role": "teacher"}, headers=p).json())
    r = c.put(f"/users/{t['id']}", json={"class_id": 1, "roll_no": 5, "permissions": {"fees": "edit"}}, headers=p).json()
    assert r["class_id"] is None and r["roll_no"] is None and r["permissions"] is None                    # only for students / staff roles
    cls = c.get("/classes", headers=p).json()[0]
    s = c.post("/users", json={"name": "Reset Me", "login_id": "RS001", "password": "Start#123", "role": "student", "class_id": cls["id"]}, headers=p).json()
    taken = c.get("/users", params={"role": "student"}, headers=p).json()[0]["login_id"]
    assert c.put(f"/users/{s['id']}", json={"login_id": taken.lower()}, headers=p).status_code == 409   # someone else's ID in small letters
    assert c.put(f"/users/{s['id']}", json={"login_id": "rs001"}, headers=p).status_code == 200         # their own, in other letters
    r = c.put(f"/users/{s['id']}", json={"password": "Reset#123"}, headers=p).json()
    assert r["must_change_password"] is True
    assert raw_login(c, s["login_id"], "Reset#123").status_code == 200
    assert c.put("/users/999999", json={"name": "X"}, headers=p).status_code == 404


@pytest.mark.tc("TC-B-096", "People list filters and coordinator scope")
@pytest.mark.sanity
@pytest.mark.regression
def test_people_list_filters_and_coordinator_scope(c):
    p, co = login(c, "principal"), login(c, "coord")
    cls = c.get("/classes", headers=p).json()
    first = c.get("/users", params={"role": "student", "class_id": cls[0]["id"]}, headers=p).json()
    assert first and all(u["class_id"] == cls[0]["id"] and u["role"] == "student" for u in first)
    scope = next(u for u in c.get("/users", headers=p).json() if u["role"] == "coordinator")["scope_class_ids"]
    seen = {u["class_id"] for u in c.get("/users", params={"role": "student"}, headers=co).json()}
    assert seen <= set(scope)                                                               # a coordinator sees only their classes
    removed = c.get("/users", params={"active": "false"}, headers=p).json()
    assert all(u["active"] is False for u in removed)


# ---------------------------------------------------------------- classes and exams
@pytest.mark.tc("TC-B-097", "Classes rules")
@pytest.mark.sanity
@pytest.mark.regression
def test_classes_rules(c):
    p = login(c, "principal")
    cls = c.get("/classes", headers=p).json()
    assert c.post("/classes", json={"name": cls[0]["name"]}, headers=p).status_code == 409
    assert c.post("/classes", json={"name": "10-Z", "class_teacher_id": me(c, login(c, "2026001"))["id"]}, headers=p).status_code == 400   # a student can't lead a class
    assert c.delete(f"/classes/{cls[0]['id']}", headers=p).status_code == 409                     # it has students
    new = c.post("/classes", json={"name": "10-Z"}, headers=p).json()
    assert new["student_count"] == 0
    assert c.put(f"/classes/{new['id']}", json={"name": cls[0]["name"]}, headers=p).status_code == 409
    assert c.get(f"/classes/{new['id']}/students", headers=p).json() == []
    t1 = login(c, "T001")
    taught = {a["class_id"] for a in c.get("/assignments", headers=t1).json()} | {x["id"] for x in cls if x["class_teacher_id"] == me(c, t1)["id"]}
    assert taught == {x["id"] for x in c.get("/classes", headers=t1).json()}                    # a teacher's class list is the classes they teach
    assert c.get(f"/classes/{new['id']}/students", headers=t1).status_code == 403               # … and no other class
    assert c.get(f"/classes/{cls[0]['id']}/students", headers=login(c, "2026001")).status_code == 403
    assert c.delete(f"/classes/{new['id']}", headers=p).json() == {"ok": True}
    assert {"class.created", "class.archived"} <= {a["action"] for a in c.get("/school/audit", params={"group": "classes"}, headers=p).json()}


@pytest.mark.tc("TC-B-098", "Exams rules")
@pytest.mark.sanity
@pytest.mark.regression
def test_exams_rules(c):
    p = login(c, "principal")
    assert c.post("/exams", json={"name": "", "date": today().isoformat()}, headers=p).status_code == 422
    assert c.post("/exams", json={"name": "X", "date": today().isoformat(), "max_marks": 0}, headers=p).status_code == 422
    assert c.post("/exams", json={"name": "X", "date": today().isoformat()}, headers=login(c, "T001")).status_code == 403
    e = c.post("/exams", json={"name": "Quiz A", "date": today().isoformat(), "max_marks": 20}, headers=p).json()
    assert e["mark_count"] == 0
    assert c.put(f"/exams/{e['id']}", json={"name": "Quiz A", "date": today().isoformat(), "max_marks": 25}, headers=p).json()["max_marks"] == 25
    assert c.delete(f"/exams/{e['id']}", headers=p).json() == {"ok": True}
    assert all(x["id"] != e["id"] for x in c.get("/exams", headers=p).json())


# ---------------------------------------------------------------- attendance and marks rights
@pytest.mark.tc("TC-B-099", "Attendance rights and checks")
@pytest.mark.sanity
@pytest.mark.regression
def test_attendance_rights_and_checks(c):
    p, t1 = login(c, "principal"), login(c, "T001")
    mine = next(x for x in c.get("/classes", headers=p).json() if x["class_teacher_id"] == me(c, t1)["id"])
    other = c.post("/classes", json={"name": "Att-Other"}, headers=p).json()                 # a class T001 has nothing to do with
    stranger = c.post("/users", json={"name": "Other Kid", "login_id": "OK001", "password": "Start#123", "role": "student",
                                      "class_id": other["id"]}, headers=p).json()
    day = today().isoformat()
    assert c.get("/attendance", params={"class_id": other["id"], "day": day}, headers=t1).status_code == 403
    assert c.post("/attendance", json={"class_id": other["id"], "date": day, "records": []}, headers=t1).status_code == 403
    sheet = c.get("/attendance", params={"class_id": mine["id"], "day": day}, headers=t1).json()
    if sheet["is_school_day"]:
        r = c.post("/attendance", json={"class_id": mine["id"], "date": day, "records": [{"student_id": stranger["id"], "present": True}]}, headers=t1)
        assert r.status_code == 400                                                          # a student of another class
    future = (today() + timedelta(days=1)).isoformat()
    assert c.post("/attendance", json={"class_id": mine["id"], "date": future, "records": []}, headers=p).status_code == 400
    assert c.post("/attendance", json={"class_id": mine["id"], "date": day, "records": []}, headers=login(c, "2026001")).status_code == 403
    assert c.post("/attendance", json={"class_id": mine["id"], "date": day, "records": []}, headers=login(c, "9876500001")).status_code == 403
    c.delete(f"/users/{stranger['id']}", headers=p)
    c.delete(f"/classes/{other['id']}", headers=p)


@pytest.mark.tc("TC-B-100", "Marks rights and checks")
@pytest.mark.sanity
@pytest.mark.regression
def test_marks_rights_and_checks(c):
    p, t1 = login(c, "principal"), login(c, "T001")
    a = c.get("/assignments", headers=t1).json()[0]
    exam = c.post("/exams", json={"name": "Rights test", "date": today().isoformat(), "max_marks": 10}, headers=p).json()
    q = {"exam_id": exam["id"], "class_id": a["class_id"], "subject_id": a["subject_id"]}
    demo = {u["id"] for u in c.get("/users", params={"role": "student"}, headers=p).json() if u["login_id"].startswith("2026")}
    rows = c.get("/marks", params=q, headers=t1).json()
    sid = next(r["student_id"] for r in rows if r["student_id"] in demo)
    assert c.post("/marks", json={**q, "records": [{"student_id": sid, "score": 11}]}, headers=t1).status_code == 400   # above max
    assert c.post("/marks", json={**q, "records": [{"student_id": sid, "score": -1}]}, headers=t1).status_code in (400, 422)
    assert c.post("/marks", json={**q, "records": [{"student_id": sid, "score": 7.5}]}, headers=t1).json()["saved"] == 1
    subjects = {x["id"] for x in c.get("/subjects", headers=p).json()}
    teaches = {x["subject_id"] for x in c.get("/assignments", headers=t1).json() if x["class_id"] == a["class_id"]}
    not_mine = next(iter(subjects - teaches), None)
    if not_mine:
        r = c.post("/marks", json={**q, "subject_id": not_mine, "records": [{"student_id": sid, "score": 5}]}, headers=t1)
        assert r.status_code == 403                                                          # a subject they don't teach
    assert c.post("/marks", json={**q, "records": [{"student_id": sid, "score": 5}]}, headers=login(c, "2026001")).status_code == 403
    student = next(u for u in c.get("/users", params={"role": "student"}, headers=p).json() if u["id"] == sid)
    card = c.get("/me/marks", headers=login(c, student["login_id"])).json()
    assert any(x["exam"] == "Rights test" and x["subjects"][0]["score"] == 7.5 for x in card)


# ---------------------------------------------------------------- what students and parents see
@pytest.mark.tc("TC-B-101", "Parents see only their own children")
@pytest.mark.sanity
@pytest.mark.regression
def test_parents_see_only_their_own_children(c):
    p = login(c, "principal")
    parent = login(c, "9876500001")                                                      # has two children in the demo
    kids = c.get("/me/children", headers=parent).json()
    assert len(kids) == 2
    stranger = next(u for u in c.get("/users", params={"role": "student"}, headers=p).json() if u["id"] not in {k["id"] for k in kids})
    for path in ("/me/attendance", "/me/marks", "/timetable", "/fees/me", "/transport/me"):
        assert c.get(path, params={"student_id": kids[1]["id"]}, headers=parent).status_code == 200, path
        assert c.get(path, params={"student_id": stranger["id"]}, headers=parent).status_code in (403, 404), path
    st = login(c, "2026001")
    assert c.get("/me/children", headers=st).status_code == 403
    assert c.get("/me/attendance", params={"student_id": stranger["id"]}, headers=st).json() == c.get("/me/attendance", headers=st).json()   # a student only ever sees themself
    assert c.get("/users", headers=st).status_code == 403 and c.get("/dashboard", headers=st).status_code == 403


@pytest.mark.tc("TC-B-102", "Notices reach only their audience")
@pytest.mark.sanity
@pytest.mark.regression
def test_notices_reach_only_their_audience(c):
    p = login(c, "principal")
    cls = c.get("/classes", headers=p).json()
    c.post("/posts", json={"kind": "notice", "title": "For everyone"}, headers=p)
    c.post("/posts", json={"kind": "homework", "title": "Only class one", "class_id": cls[0]["id"]}, headers=p)
    c.post("/posts", json={"kind": "homework", "title": "Only class two", "class_id": cls[1]["id"]}, headers=p)
    in_one = next(u for u in c.get(f"/classes/{cls[0]['id']}/students", headers=p).json() if u["login_id"].startswith("2026"))
    titles = {x["title"] for x in c.get("/posts", headers=login(c, in_one["login_id"])).json()}
    assert "For everyone" in titles and "Only class one" in titles and "Only class two" not in titles
    hw = c.get("/posts", params={"kind": "homework"}, headers=p).json()
    assert hw and all(x["kind"] == "homework" for x in hw)
    assert c.post("/posts", json={"kind": "notice", "title": "x"}, headers=login(c, "2026001")).status_code == 403
    assert c.post("/posts", json={"kind": "other", "title": "x"}, headers=p).status_code == 422


# ---------------------------------------------------------------- leaves
@pytest.mark.tc("TC-B-103", "Leave rules")
@pytest.mark.sanity
@pytest.mark.regression
def test_leave_rules(c):
    t = login(c, "T004")
    start = today() + timedelta(days=30)
    assert c.post("/leaves", json={"leave_type": "holiday", "start_date": start.isoformat()}, headers=t).status_code in (400, 422)
    assert c.post("/leaves", json={"leave_type": "casual", "start_date": start.isoformat(),
                                   "end_date": (start - timedelta(days=2)).isoformat()}, headers=t).status_code in (400, 422)
    ok = c.post("/leaves", json={"leave_type": "casual", "start_date": start.isoformat(), "reason": "Wedding"}, headers=t)
    assert ok.status_code == 200, ok.text
    again = c.post("/leaves", json={"leave_type": "sick", "start_date": start.isoformat()}, headers=t)
    assert again.status_code in (400, 409)                                                   # overlaps a request already made
    lid = ok.json()["id"]
    assert c.post(f"/leaves/{lid}/decide", json={"approve": True}, headers=t).status_code in (403, 404)   # can't approve your own
    assert c.post(f"/leaves/{lid}/cancel", headers=login(c, "T005")).status_code == 404               # only the person who asked
    assert c.post(f"/leaves/{lid}/cancel", headers=t).json() == {"ok": True}
    assert c.post(f"/leaves/{lid}/cancel", headers=t).status_code == 409
    p = login(c, "principal")
    assert "leave.cancelled" in {a["action"] for a in c.get("/school/audit", params={"group": "leaves"}, headers=p).json()}
    bal = c.get("/leaves/balance", headers=t).json()
    assert {x["type"] for x in bal["types"]} >= {"casual", "sick", "earned"}


# ---------------------------------------------------------------- settings, dashboard, archive
@pytest.mark.tc("TC-B-104", "School settings rules")
@pytest.mark.sanity
@pytest.mark.regression
def test_school_settings_rules(c):
    p = login(c, "principal")
    assert c.put("/school/settings", json={"name": ""}, headers=p).status_code == 422
    assert c.put("/school/settings", json={"working_days": [7]}, headers=p).status_code in (400, 422)
    assert c.put("/school/settings", json={"working_days": []}, headers=p).status_code in (400, 422)
    before = c.get("/school/me", headers=p).json()
    r = c.put("/school/settings", json={"phone": "0651-1234567", "board": "ICSE"}, headers=p)
    assert r.status_code == 200 and r.json()["phone"] == "0651-1234567" and r.json()["board"] == "ICSE"
    assert c.put("/school/settings", json={"phone": "1"}, headers=login(c, "vp")).status_code == 403
    assert c.put("/school/settings", json={"phone": "1"}, headers=login(c, "T001")).status_code == 403
    c.put("/school/settings", json={"phone": before["phone"], "board": before["board"]}, headers=p)
    log = c.get("/school/audit", params={"group": "settings", "q": "ICSE"}, headers=p).json()
    assert log


@pytest.mark.tc("TC-B-105", "Dashboard numbers match the school")
@pytest.mark.sanity
@pytest.mark.regression
def test_dashboard_numbers_match_the_school(c):
    p = login(c, "principal")
    d = c.get("/dashboard", headers=p).json()
    users = c.get("/users", headers=p).json()
    assert d["overview"]["students"] == sum(1 for u in users if u["role"] == "student")
    assert d["overview"]["teachers"] == sum(1 for u in users if u["role"] == "teacher")
    assert d["overview"]["classes"] == len(c.get("/classes", headers=p).json())
    assert c.get("/dashboard", headers=login(c, "T001")).status_code == 403


@pytest.mark.tc("TC-B-106", "Archive restores every kind")
@pytest.mark.sanity
@pytest.mark.regression
def test_archive_restores_every_kind(c):
    p = login(c, "principal")
    d = today() + timedelta(days=90)
    made = {
        "subject": c.post("/subjects", json={"name": "Archive me"}, headers=p).json()["id"],
        "exam": c.post("/exams", json={"name": "Archive me", "date": d.isoformat()}, headers=p).json()["id"],
        "post": c.post("/posts", json={"kind": "notice", "title": "Archive me"}, headers=p).json()["id"],
        "holiday": c.post("/holidays", json={"name": "Archive me", "start_date": d.isoformat()}, headers=p).json()["id"],
        "banner": c.post("/banners", json={"title": "Archive me"}, headers=p).json()["id"],
    }
    for kind, path in (("subject", "/subjects"), ("exam", "/exams"), ("post", "/posts"), ("holiday", "/holidays"), ("banner", "/banners")):
        assert c.delete(f"{path}/{made[kind]}", headers=p).status_code == 200, kind
    listed = {(a["kind"], a["id"]) for a in c.get("/archive", headers=p).json()}
    assert {(k, v) for k, v in made.items()} <= listed
    for kind, i in made.items():
        assert c.post(f"/archive/{kind}/{i}/restore", headers=p).status_code == 200, kind
    assert not ({(k, v) for k, v in made.items()} & {(a["kind"], a["id"]) for a in c.get("/archive", headers=p).json()})
    assert c.post("/archive/nonsense/1/restore", headers=p).status_code in (400, 404)
    assert c.get("/archive", headers=login(c, "T001")).status_code == 403
