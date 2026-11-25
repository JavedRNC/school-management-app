"""F40 teachers editing student and parent details, and the wider audit log (old → new values, filters)."""
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
from app.util import today  # noqa: E402


def login(c, lid, code="DEMO01", pw="demo123"):
    r = c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


def classes(c, h):
    return {k["name"]: k for k in c.get("/classes", headers=h).json()}


def audit(c, h, **params):
    r = c.get("/school/audit", params=params, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.tc("TC-B-087", "Class teacher edits own class only")
@pytest.mark.sanity
@pytest.mark.regression
def test_class_teacher_edits_own_class_only(c):
    p = login(c, "principal")
    t1 = login(c, "T001")
    mine = c.get("/my-students", headers=t1).json()
    assert len(mine["classes"]) == 1 and mine["classes"][0]["why"] == "class teacher"
    assert mine["can_edit_parents"] is False and all(s["parents"] == [] for s in mine["students"])
    own = mine["students"][0]
    r = c.put(f"/my-students/{own['id']}", json={"phone": "9000000001", "address": "12, Main Road"}, headers=t1)
    assert r.status_code == 200 and r.json()["phone"] == "9000000001"
    # another class's student is refused
    other_cls = next(k for k in classes(c, p).values() if k["id"] != mine["classes"][0]["id"])
    other = c.get(f"/classes/{other_cls['id']}/students", headers=p).json()[0]
    assert c.put(f"/my-students/{other['id']}", json={"phone": "1"}, headers=t1).status_code == 403
    # login id, class and password can't be sent through this door
    r = c.put(f"/my-students/{own['id']}", json={"login_id": "x", "class_id": other_cls["id"], "password": "abcdef12"}, headers=t1)
    assert r.status_code == 200
    me = next(u for u in c.get("/users", params={"role": "student"}, headers=p).json() if u["id"] == own["id"])
    assert me["login_id"] == own["login_id"] and me["class_id"] == own["class_id"]
    student_login = c.post("/auth/login", json={"school_code": "DEMO01", "login_id": own["login_id"], "password": "abcdef12"})
    assert student_login.status_code == 401, "the password sent through the teacher door was not set"
    # parents are off by default
    pid = next(u for u in c.get("/users", params={"role": "student"}, headers=p).json() if u["id"] == own["id"])["parent_ids"][0]
    assert c.put(f"/my-students/parents/{pid}", json={"phone": "1"}, headers=t1).status_code == 403
    # the change is in the audit log with old → new
    row = audit(c, p, group="people", actor_id=c.get("/auth/me", headers=t1).json()["id"])[0]
    assert "by teacher" in row["detail"] and "→ 9000000001" in row["detail"] and row["actor_role"] == "teacher"
    # non-class teacher sees nothing; students and principals can't use the teacher door
    assert c.get("/my-students", headers=login(c, "T004")).json()["classes"] == []
    assert c.get("/my-students", headers=p).status_code == 403


@pytest.mark.tc("TC-B-088", "Principal grants and switches")
@pytest.mark.sanity
@pytest.mark.regression
def test_principal_grants_and_switches(c):
    p = login(c, "principal")
    t4 = login(c, "T004")
    tid = c.get("/auth/me", headers=t4).json()["id"]
    cls = list(classes(c, p).values())
    r = c.put(f"/student-access/teachers/{tid}", json={"classes": [cls[1]["id"]], "parents": True}, headers=p)
    assert r.status_code == 200 and r.json()["grants"][0]["teacher_id"] == tid
    mine = c.get("/my-students", headers=t4).json()
    assert [k["id"] for k in mine["classes"]] == [cls[1]["id"]] and mine["can_edit_parents"]
    s = next(x for x in mine["students"] if x["parents"])
    par = s["parents"][0]
    r = c.put(f"/my-students/parents/{par['id']}", json={"name": "Mr. Changed Name", "login_id": "nope"}, headers=t4)
    assert r.status_code == 200 and r.json()["name"] == "Mr. Changed Name" and r.json()["login_id"] == par["login_id"]
    # "all" classes
    c.put(f"/student-access/teachers/{tid}", json={"classes": "all", "parents": False}, headers=p)
    mine = c.get("/my-students", headers=t4).json()
    assert len(mine["classes"]) == len(cls) and not mine["can_edit_parents"]
    assert c.put(f"/my-students/parents/{par['id']}", json={"phone": "1"}, headers=t4).status_code == 403
    # bad input and wrong people
    assert c.put(f"/student-access/teachers/{tid}", json={"classes": [], "parents": False}, headers=p).status_code == 400
    assert c.put(f"/student-access/teachers/{tid}", json={"classes": [99999]}, headers=p).status_code == 400
    pid = c.get("/auth/me", headers=p).json()["id"]
    assert c.put(f"/student-access/teachers/{pid}", json={"classes": "all"}, headers=p).status_code == 404
    assert c.put(f"/student-access/teachers/{tid}", json={"classes": "all"}, headers=login(c, "vp")).status_code == 403
    # remove the grant → access gone
    assert c.delete(f"/student-access/teachers/{tid}", headers=p).status_code == 200
    assert c.get("/my-students", headers=t4).json()["classes"] == []
    # class teachers can be switched off, and given parent access
    c.put("/student-access/policy", json={"class_teachers": True, "class_teachers_parents": True}, headers=p)
    assert c.get("/my-students", headers=login(c, "T001")).json()["can_edit_parents"]
    c.put("/student-access/policy", json={"class_teachers": False, "class_teachers_parents": True}, headers=p)
    off = c.get("/my-students", headers=login(c, "T001")).json()
    assert off["classes"] == [] and not off["can_edit_parents"]
    c.put("/student-access/policy", json={"class_teachers": True, "class_teachers_parents": False}, headers=p)
    acts = {a["action"] for a in audit(c, p, group="people")}
    assert {"student_access.granted", "student_access.removed", "student_access.policy"} <= acts


@pytest.mark.tc("TC-B-089", "Replaced class teacher loses access at once")
@pytest.mark.sanity
@pytest.mark.regression
def test_replaced_class_teacher_loses_access_at_once(c):
    p = login(c, "principal")
    t1 = login(c, "T001")
    cid = c.get("/my-students", headers=t1).json()["classes"][0]["id"]
    sid = c.get("/my-students", headers=t1).json()["students"][0]["id"]
    k = next(x for x in classes(c, p).values() if x["id"] == cid)
    t5 = c.get("/users", params={"role": "teacher"}, headers=p).json()
    new_t = next(t for t in t5 if t["login_id"] == "T005")
    assert c.put(f"/classes/{cid}", json={"name": k["name"], "class_teacher_id": new_t["id"]}, headers=p).status_code == 200
    assert c.get("/my-students", headers=t1).json()["classes"] == []
    assert c.put(f"/my-students/{sid}", json={"phone": "2"}, headers=t1).status_code == 403
    assert c.get("/my-students", headers=login(c, "T005")).json()["classes"][0]["id"] == cid
    row = audit(c, p, group="classes")[0]
    assert row["action"] == "class.updated" and "class teacher:" in row["detail"] and "T005" in row["detail"]
    c.put(f"/classes/{cid}", json={"name": k["name"], "class_teacher_id": k["class_teacher_id"]}, headers=p)


@pytest.mark.tc("TC-B-090", "More actions are audited with old and new")
@pytest.mark.sanity
@pytest.mark.regression
def test_more_actions_are_audited_with_old_and_new(c):
    p = login(c, "principal")
    users = c.get("/users", params={"role": "student"}, headers=p).json()
    s = users[0]
    c.put(f"/users/{s['id']}", json={"phone": "9111111111", "name": s["name"] + " K"}, headers=p)
    row = audit(c, p, q=s["login_id"])[0]
    assert row["action"] == "user.updated" and f"name: {s['name']} → {s['name']} K" in row["detail"] and "9111111111" in row["detail"]
    # exam create/update, subject create, posts, holidays
    e = c.post("/exams", json={"name": "Unit Test 9", "date": today().isoformat(), "max_marks": 25}, headers=p).json()
    c.put(f"/exams/{e['id']}", json={"name": "Unit Test 9", "date": today().isoformat(), "max_marks": 30}, headers=p)
    assert "max marks: 25" in audit(c, p, group="marks")[0]["detail"]
    post = c.post("/posts", json={"kind": "notice", "title": "Audit notice", "body": "Hello"}, headers=p).json()
    c.delete(f"/posts/{post['id']}", headers=p)
    acts = [a["action"] for a in audit(c, p, group="notices")]
    assert acts[:2] == ["notice.removed", "notice.posted"]
    # marks: who changed what
    t = login(c, "T001")
    mine = c.get("/my-students", headers=t).json()
    cid = mine["classes"][0]["id"]
    sub = next(a for a in c.get("/assignments", headers=t).json() if a["class_id"] == cid)
    rows = c.get("/marks", params={"exam_id": e["id"], "class_id": cid, "subject_id": sub["subject_id"]}, headers=t).json()
    assert c.post("/marks", json={"exam_id": e["id"], "class_id": cid, "subject_id": sub["subject_id"],
                                  "records": [{"student_id": rows[0]["student_id"], "score": 20}]}, headers=t).status_code == 200
    c.post("/marks", json={"exam_id": e["id"], "class_id": cid, "subject_id": sub["subject_id"],
                           "records": [{"student_id": rows[0]["student_id"], "score": 22}]}, headers=t)
    m = audit(c, p, group="marks")[0]
    assert m["action"] == "marks.saved" and "20 → 22" in m["detail"] and m["actor_role"] == "teacher"
    # wrong password for a real account is recorded for the school
    assert c.post("/auth/login", json={"school_code": "DEMO01", "login_id": "T002", "password": "wrong-one"}).status_code == 401
    assert audit(c, p, group="people")[0]["action"] == "login.failed"
    # filters: date range, paging, bad group
    assert audit(c, p, date_from=today().isoformat(), date_to=today().isoformat())
    assert audit(c, p, date_to="2000-01-01") == []
    first = audit(c, p, limit=2)
    older = audit(c, p, before_id=first[-1]["id"], limit=2)
    assert len(first) == 2 and all(o["id"] < first[-1]["id"] for o in older)
    assert c.get("/school/audit", params={"group": "nope"}, headers=p).status_code == 400
