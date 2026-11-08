import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.util import last_school_day as today  # noqa: E402


@pytest.fixture(scope="module")
def client():
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
