import os
import tempfile

# Default: throwaway SQLite. Set TEST_DATABASE_URL to run against Postgres (DB is reset).
if os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
else:
    _db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
    os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.util import last_school_day as today  # noqa: E402


@pytest.fixture(scope="module")
def client():
    from app.db import Base, engine

    Base.metadata.drop_all(engine)
    with TestClient(app) as c:
        yield c


def login(client, email):
    r = client.post("/auth/login", json={"email": email, "password": "demo123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_login_and_roles(client):
    assert client.post("/auth/login", json={"email": "principal@school.com", "password": "x"}).status_code == 401
    h = login(client, "principal@school.com")
    assert client.get("/auth/me", headers=h).json()["role"] == "principal"
    assert client.get("/classes").status_code == 401


def test_dashboard(client):
    h = login(client, "principal@school.com")
    d = client.get("/dashboard", headers=h).json()
    assert d["overview"]["students"] == 24 and d["overview"]["classes"] == 3
    assert d["unmarked_classes"] == [{"class_id": 3, "class_name": "9-A"}]
    assert d["overview"]["classes_marked"] == 2
    assert d["academics"]["exam"]["name"] == "Half Yearly"
    assert len(d["attendance_trend"]) >= 20
    assert all(r["attendance_percent"] is not None for r in d["at_risk"])
    s = login(client, "aarav@school.com")
    assert client.get("/dashboard", headers=s).status_code == 403


def test_teacher_attendance_and_marks(client):
    t = login(client, "priya@school.com")  # Social Science, class teacher of none
    classes = client.get("/classes", headers=t).json()
    assert len(classes) == 3
    cid = classes[2]["id"]
    rows = client.get("/attendance", params={"class_id": cid, "day": today().isoformat()}, headers=t).json()
    assert all(r["present"] is None for r in rows)
    recs = [{"student_id": r["student_id"], "present": i % 4 != 0} for i, r in enumerate(rows)]
    r = client.post("/attendance", json={"class_id": cid, "date": today().isoformat(), "records": recs}, headers=t)
    assert r.status_code == 200, r.text
    h = login(client, "principal@school.com")
    assert client.get("/dashboard", headers=h).json()["unmarked_classes"] == []

    subj = {s["name"]: s["id"] for s in client.get("/subjects", headers=t).json()}
    exam = client.get("/exams", headers=t).json()[0]
    marks = [{"student_id": rows[0]["student_id"], "score": 77}]
    ok = client.post("/marks", json={"exam_id": exam["id"], "class_id": cid, "subject_id": subj["Social Science"],
                                     "records": marks}, headers=t)
    assert ok.status_code == 200
    bad = client.post("/marks", json={"exam_id": exam["id"], "class_id": cid, "subject_id": subj["Mathematics"],
                                      "records": marks}, headers=t)
    assert bad.status_code == 403
    too_high = client.post("/marks", json={"exam_id": exam["id"], "class_id": cid,
                                           "subject_id": subj["Social Science"],
                                           "records": [{"student_id": rows[0]["student_id"], "score": 500}]},
                           headers=t)
    assert too_high.status_code == 400


def test_student_views(client):
    s = login(client, "aarav@school.com")
    att = client.get("/me/attendance", headers=s).json()
    assert att["total_days"] > 20 and 0 <= att["percent"] <= 100
    cards = client.get("/me/marks", headers=s).json()
    assert [c["exam"] for c in cards] == ["Half Yearly", "Unit Test 1"]
    assert len(cards[0]["subjects"]) == 5
    tt = client.get("/timetable", headers=s).json()
    assert len(tt) == 30
    posts = client.get("/posts", headers=s).json()
    assert {p["kind"] for p in posts} == {"notice", "homework"}
    assert all(p["class_id"] in (None, 1) for p in posts)
    assert client.post("/posts", json={"kind": "notice", "title": "x"}, headers=s).status_code == 403
    assert client.get("/classes/2/students", headers=s).status_code == 403


def test_principal_setup(client):
    h = login(client, "principal@school.com")
    c = client.post("/classes", json={"name": "10-A"}, headers=h).json()
    u = client.post("/users", json={"name": "New Kid", "email": "newkid@school.com", "password": "secret1",
                                    "role": "student", "class_id": c["id"], "roll_no": 1}, headers=h)
    assert u.status_code == 200, u.text
    dup = client.post("/users", json={"name": "Dup", "email": "NEWKID@school.com", "password": "secret1",
                                      "role": "teacher"}, headers=h)
    assert dup.status_code == 409
    assert client.post("/auth/login", json={"email": "newkid@school.com", "password": "secret1"}).status_code == 200
    teacher = client.get("/users", params={"role": "teacher"}, headers=h).json()[0]
    sub = client.get("/subjects", headers=h).json()[0]
    # clash: teacher already teaches somewhere Mon P1? pick their own slot from timetable
    slot = next(e for e in client.get("/timetable", params={"class_id": 1}, headers=h).json()
                if e["teacher_id"] == teacher["id"])
    clash = client.put("/timetable", json={"class_id": c["id"], "day": slot["day"], "period": slot["period"],
                                           "subject_id": sub["id"], "teacher_id": teacher["id"]}, headers=h)
    assert clash.status_code == 409
    n = client.post("/posts", json={"kind": "notice", "title": "Holiday", "body": "School closed"}, headers=h)
    assert n.status_code == 200 and n.json()["class_id"] is None


def test_delete_class(client):
    h = login(client, "principal@school.com")
    full = client.get("/classes", headers=h).json()[0]
    r = client.delete(f"/classes/{full['id']}", headers=h)
    assert r.status_code == 409 and "student" in r.json()["detail"]
    c = client.post("/classes", json={"name": "Temp-Z"}, headers=h).json()
    client.post("/posts", json={"kind": "notice", "title": "x", "class_id": c["id"]}, headers=h)
    t = login(client, "anita@school.com")
    assert client.delete(f"/classes/{c['id']}", headers=t).status_code == 403
    assert client.delete(f"/classes/{c['id']}", headers=h).status_code == 200
    assert all(x["id"] != c["id"] for x in client.get("/classes", headers=h).json())
    assert client.delete(f"/classes/{c['id']}", headers=h).status_code == 404


def test_principal_crud_users(client):
    h = login(client, "principal@school.com")
    me = client.get("/auth/me", headers=h).json()
    assert client.delete(f"/users/{me['id']}", headers=h).status_code == 400
    s = client.get("/users", params={"role": "student"}, headers=h).json()[0]
    classes = client.get("/classes", headers=h).json()
    other = next(c for c in classes if c["id"] != s["class_id"])
    r = client.put(f"/users/{s['id']}", json={"name": "Renamed Kid", "email": "RENAMED@school.com", "class_id": other["id"], "roll_no": 99}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "renamed@school.com" and r.json()["class_id"] == other["id"]
    assert client.put(f"/users/{s['id']}", json={"class_id": None}, headers=h).status_code == 400
    assert client.put(f"/users/{s['id']}", json={"email": "principal@school.com"}, headers=h).status_code == 409
    assert client.put(f"/users/{s['id']}", json={"password": "newpass1"}, headers=h).status_code == 200
    assert client.post("/auth/login", json={"email": "renamed@school.com", "password": "newpass1"}).status_code == 200
    assert client.delete(f"/users/{s['id']}", headers=h).json()["active"] is False
    assert client.post("/auth/login", json={"email": "renamed@school.com", "password": "newpass1"}).status_code == 401
    removed = client.get("/users", params={"active": False}, headers=h).json()
    assert any(u["id"] == s["id"] for u in removed)
    assert client.put(f"/users/{s['id']}", json={"active": True}, headers=h).json()["active"] is True


def test_principal_crud_subjects_exams_posts(client):
    h = login(client, "principal@school.com")
    sub = client.post("/subjects", json={"name": "Drawing"}, headers=h).json()
    assert client.put(f"/subjects/{sub['id']}", json={"name": "Art"}, headers=h).json()["name"] == "Art"
    assert client.put(f"/subjects/{sub['id']}", json={"name": "Science"}, headers=h).status_code == 409
    teacher = client.get("/users", params={"role": "teacher"}, headers=h).json()[0]
    client.post("/assignments", json={"teacher_id": teacher["id"], "class_id": 1, "subject_id": sub["id"]}, headers=h)
    u = client.get(f"/subjects/{sub['id']}/usage", headers=h).json()
    assert u["assignments"] == 1
    assert client.delete(f"/subjects/{sub['id']}", headers=h).status_code == 200
    assert all(a["subject_id"] != sub["id"] for a in client.get("/assignments", headers=h).json())

    exams = client.get("/exams", headers=h).json()
    hy = next(e for e in exams if e["name"] == "Half Yearly")
    assert hy["mark_count"] > 0
    assert client.put(f"/exams/{hy['id']}", json={"name": "Half Yearly", "date": hy["date"], "max_marks": 10}, headers=h).status_code == 409
    assert client.put(f"/exams/{hy['id']}", json={"name": "Mid Term", "date": hy["date"], "max_marks": 100}, headers=h).json()["name"] == "Mid Term"
    ut = next(e for e in exams if e["name"] == "Unit Test 1")
    assert client.delete(f"/exams/{ut['id']}", headers=h).status_code == 200
    assert all(c["exam"] != "Unit Test 1" for c in client.get("/me/marks", headers=login(client, "diya@school.com")).json())

    post = client.post("/posts", json={"kind": "notice", "title": "Old"}, headers=h).json()
    r = client.put(f"/posts/{post['id']}", json={"kind": "notice", "title": "New title", "body": "b"}, headers=h)
    assert r.status_code == 200 and r.json()["title"] == "New title"
    t = login(client, "anita@school.com")
    assert client.put(f"/posts/{post['id']}", json={"kind": "notice", "title": "hack"}, headers=t).status_code == 403
    cls = client.get("/classes", headers=h).json()[0]
    assert client.put(f"/classes/{cls['id']}", json={"name": cls["name"], "class_teacher_id": None}, headers=h).json()["class_teacher_id"] is None
    assert client.put(f"/classes/{cls['id']}", json={"name": cls["name"], "class_teacher_id": 1}, headers=h).status_code == 400
