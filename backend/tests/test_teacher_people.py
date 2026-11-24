"""F40 v2 · The principal decides how far teachers may go with students and parents: edit, or add and edit.
Class teachers get it for their own class; any teacher can be given chosen classes. Checked here: every level, every refusal,
temporary passwords, linking an existing parent, plan limits, other schools, and the activity log."""
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

_CHANGED: dict[tuple[str, str], str] = {}


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


def raw(c, lid, pw, code="DEMO01"):
    return c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})


def login(c, lid, pw="demo123", code="DEMO01"):
    pw = _CHANGED.get((code, lid.lower()), pw)
    r = raw(c, lid, pw, code)
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    if r.json()["user"]["must_change_password"]:
        r = c.post("/auth/password", json={"old_password": pw, "new_password": pw + "Xy#9"}, headers=h)
        _CHANGED[(code, lid.lower())] = pw + "Xy#9"
        h = {"Authorization": f"Bearer {r.json()['token']}"}
    return h


def me(c, h):
    return c.get("/auth/me", headers=h).json()


def own_class(c, p, teacher_h):
    tid = me(c, teacher_h)["id"]
    return next(x for x in c.get("/classes", headers=p).json() if x["class_teacher_id"] == tid)


def policy(c, p, students, parents):
    r = c.put("/student-access/policy", json={"students": students, "parents": parents}, headers=p)
    assert r.status_code == 200, r.text
    return r.json()


def student_body(cls_id, login_id, **kw):
    return {"name": kw.pop("name", "New Student"), "login_id": login_id, "class_id": cls_id, **kw}


@pytest.mark.tc("TC-B-138", "Defaults: class teachers may edit their class, not add, no parents")
@pytest.mark.sanity
@pytest.mark.regression
def test_defaults(c):
    p, t1 = login(c, "principal"), login(c, "T001")
    a = c.get("/student-access", headers=p).json()
    assert a["class_teachers"] == {"students": "edit", "parents": "none"} and a["grants"] == []
    mine = c.get("/my-students", headers=t1).json()
    assert mine["can_add_students"] is False and mine["can_edit_parents"] is False and mine["can_add_parents"] is False
    assert mine["classes"][0]["students"] == "edit" and mine["classes"][0]["parents"] == "none"
    cls = own_class(c, p, t1)
    assert c.post("/my-students", json=student_body(cls["id"], "NEW001"), headers=t1).status_code == 403
    sid = mine["students"][0]["id"]
    assert c.post(f"/my-students/{sid}/parents", json={"name": "Dad", "mobile": "9811100001"}, headers=t1).status_code == 403


@pytest.mark.tc("TC-B-139", "Class teachers allowed to add: a new student gets a temporary password")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_class_teacher_adds_a_student(c):
    p, t1 = login(c, "principal"), login(c, "T001")
    policy(c, p, "add", "none")
    cls = own_class(c, p, t1)
    before = len(c.get(f"/classes/{cls['id']}/students", headers=p).json())
    r = c.post("/my-students", json=student_body(cls["id"], "ADM-901", name="  Riya Sen  ", roll_no=31, phone="9800000031",
                                                  dob="2014-06-01", blood_group="O+"), headers=t1)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["student"]["name"] == "Riya Sen" and out["student"]["class_id"] == cls["id"] and out["student"]["roll_no"] == 31
    cred = out["credentials"]
    assert cred["login_id"] == "ADM-901" and cred["school_code"] == "DEMO01" and len(cred["password"]) >= 8
    first = raw(c, "ADM-901", cred["password"])                     # the student signs in with it and must change it
    assert first.status_code == 200 and first.json()["user"]["must_change_password"] is True
    assert len(c.get(f"/classes/{cls['id']}/students", headers=p).json()) == before + 1
    log = c.get("/school/audit", params={"group": "people", "q": "ADM-901"}, headers=p).json()
    assert log[0]["action"] == "user.created" and "by teacher" in log[0]["detail"] and log[0]["actor_role"] == "teacher"
    assert cred["password"] not in str(log)                                 # never in the activity log
    policy(c, p, "edit", "none")


@pytest.mark.tc("TC-B-140", "Adding a student: every refusal")
@pytest.mark.sanity
@pytest.mark.regression
def test_add_student_refusals(c):
    p, t1 = login(c, "principal"), login(c, "T001")
    policy(c, p, "add", "none")
    cls = own_class(c, p, t1)
    other = next(x for x in c.get("/classes", headers=p).json() if x["id"] != cls["id"])
    taken = c.get("/users", params={"role": "student"}, headers=p).json()[0]["login_id"]
    cases = [
        (student_body(other["id"], "NEW002"), 403),                         # not their class
        (student_body(999999, "NEW003"), 403),                              # no such class
        (student_body(cls["id"], taken), 409),                              # admission no. already used
        (student_body(cls["id"], taken.lower()), 409),                      # … also in other letters
        (student_body(cls["id"], "has space"), 400),
        (student_body(cls["id"], "NEW004", name="   "), 400),
        (student_body(cls["id"], "NEW005", blood_group="Z+"), 400),
        (student_body(cls["id"], "NEW006", roll_no=0), 422),
        ({"name": "X", "class_id": cls["id"]}, 422),                        # no admission no.
    ]
    for body, want in cases:
        r = c.post("/my-students", json=body, headers=t1)
        assert r.status_code == want, (body, r.status_code, r.text)
    # whatever else is sent (role, password, permissions) is ignored: it is always a student with a temporary password
    r = c.post("/my-students", json={**student_body(cls["id"], "NEW007"), "role": "principal", "password": "Mine#1234",
                                     "permissions": {"fees": "edit"}}, headers=t1)
    assert r.status_code == 200
    u = next(x for x in c.get("/users", params={"role": "student"}, headers=p).json() if x["login_id"] == "NEW007")
    assert u["role"] == "student" and u["permissions"] is None
    assert raw(c, "NEW007", "Mine#1234").status_code == 401
    # other roles can't use the teacher door
    for who in ("principal", "vp", "2026001", "9876500003"):
        assert c.post("/my-students", json=student_body(cls["id"], "NEW008"), headers=login(c, who)).status_code == 403, who
    policy(c, p, "edit", "none")


@pytest.mark.tc("TC-B-141", "The plan's student limit also applies to teachers")
@pytest.mark.regression
def test_student_limit_applies(c):
    from app.db import SessionLocal
    from app.models import School

    p, t1 = login(c, "principal"), login(c, "T001")
    policy(c, p, "add", "none")
    cls = own_class(c, p, t1)
    with SessionLocal() as db:
        s = db.query(School).filter(School.code == "DEMO01").one()
        old, count = s.max_students, len(c.get("/users", params={"role": "student"}, headers=p).json())
        s.max_students = count
        db.commit()
    try:
        r = c.post("/my-students", json=student_body(cls["id"], "FULL01"), headers=t1)
        assert r.status_code == 409 and "allows up to" in r.json()["detail"]
    finally:
        with SessionLocal() as db:
            db.query(School).filter(School.code == "DEMO01").one().max_students = old
            db.commit()
        policy(c, p, "edit", "none")


@pytest.mark.tc("TC-B-142", "Parents: edit only, then add a new parent or link an existing one")
@pytest.mark.sanity
@pytest.mark.regression
def test_parents_edit_and_add(c):
    p, t1 = login(c, "principal"), login(c, "T001")
    cls = own_class(c, p, t1)
    policy(c, p, "edit", "edit")
    mine = c.get("/my-students", headers=t1).json()
    assert mine["can_edit_parents"] and not mine["can_add_parents"]
    with_parent = next(s for s in mine["students"] if s["parents"])
    par = with_parent["parents"][0]
    assert c.put(f"/my-students/parents/{par['id']}", json={"email": "dad@example.com"}, headers=t1).json()["email"] == "dad@example.com"
    lonely = c.post("/users", json={"name": "No Parent Yet", "login_id": "NOPAR1", "password": "Start#123", "role": "student",
                                    "class_id": cls["id"]}, headers=p).json()
    assert c.post(f"/my-students/{lonely['id']}/parents", json={"name": "Mum", "mobile": "9811100002"}, headers=t1).status_code == 403
    # now add
    policy(c, p, "edit", "add")
    r = c.post(f"/my-students/{lonely['id']}/parents", json={"name": "Meena Devi", "mobile": "9811100002", "relation": "Mother"}, headers=t1)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["linked_existing"] is False and out["credentials"]["login_id"] == "9811100002" and out["parent"]["relation"] == "Mother"
    assert raw(c, "9811100002", out["credentials"]["password"]).json()["user"]["must_change_password"] is True
    # the same mobile for a second child links the same account (no new password)
    second = c.post("/users", json={"name": "Sibling", "login_id": "NOPAR2", "password": "Start#123", "role": "student",
                                    "class_id": cls["id"]}, headers=p).json()
    again = c.post(f"/my-students/{second['id']}/parents", json={"name": "Whatever", "mobile": "9811100002", "relation": "Mother"}, headers=t1).json()
    assert again["linked_existing"] is True and again["credentials"] is None and again["parent"]["id"] == out["parent"]["id"]
    parent = next(u for u in c.get("/users", params={"role": "parent"}, headers=p).json() if u["login_id"] == "9811100002")
    assert sorted(parent["children_ids"]) == sorted([lonely["id"], second["id"]]) and parent["name"] == "Meena Devi"
    # refusals
    sid = lonely["id"]
    cases = [({"name": "X", "mobile": "12345"}, 422), ({"name": "X", "mobile": "1234567890"}, 400),
             ({"name": "X", "mobile": "9811100003", "relation": "Uncle"}, 400), ({"name": " ", "mobile": "9811100003"}, 400),
             ({"name": "Meena", "mobile": "9811100002", "relation": "Mother"}, 409)]          # already linked
    for body, want in cases:
        assert c.post(f"/my-students/{sid}/parents", json=body, headers=t1).status_code == want, body
    c.post("/users", json={"name": "Mobile Teacher", "login_id": "9811100009", "password": "Start#123", "role": "teacher"}, headers=p)
    assert c.post(f"/my-students/{sid}/parents", json={"name": "X", "mobile": "9811100009"}, headers=t1).status_code == 409   # a teacher's account
    acts = [a["detail"] for a in c.get("/school/audit", params={"group": "people", "q": "9811100002"}, headers=p).json()]
    assert any("linked to Sibling" in d for d in acts) and any(d.startswith("parent Meena Devi") and "by teacher" in d for d in acts)
    policy(c, p, "edit", "none")


@pytest.mark.tc("TC-B-143", "Any teacher can be given chosen classes with their own levels")
@pytest.mark.sanity
@pytest.mark.regression
def test_grants_with_levels(c):
    p, t4 = login(c, "principal"), login(c, "T004")
    tid = me(c, t4)["id"]
    cls = c.get("/classes", headers=p).json()
    r = c.put(f"/student-access/teachers/{tid}", json={"classes": [cls[2]["id"]], "students": "add", "parents": "add"}, headers=p)
    g = next(x for x in r.json()["grants"] if x["teacher_id"] == tid)
    assert g["students"] == "add" and g["parents"] == "add" and g["classes"] == [cls[2]["id"]]
    mine = c.get("/my-students", headers=t4).json()
    assert [k["id"] for k in mine["classes"]] == [cls[2]["id"]] and mine["can_add_students"] and mine["can_add_parents"]
    made = c.post("/my-students", json=student_body(cls[2]["id"], "GRANT1"), headers=t4)
    assert made.status_code == 200
    assert c.post("/my-students", json=student_body(cls[0]["id"], "GRANT2"), headers=t4).status_code == 403
    # downgrade: edit only → adding stops, editing still works
    c.put(f"/student-access/teachers/{tid}", json={"classes": [cls[2]["id"]], "students": "edit", "parents": "none"}, headers=p)
    assert c.post("/my-students", json=student_body(cls[2]["id"], "GRANT3"), headers=t4).status_code == 403
    assert c.put(f"/my-students/{made.json()['student']['id']}", json={"roll_no": 77}, headers=t4).status_code == 200
    # bad levels
    for bad in ({"classes": "all", "students": "delete"}, {"classes": "all", "students": "none"}, {"classes": "all", "parents": "maybe"}):
        assert c.put(f"/student-access/teachers/{tid}", json=bad, headers=p).status_code == 422, bad
    log = c.get("/school/audit", params={"group": "people", "q": "add and edit students"}, headers=p).json()
    assert log and log[0]["action"] == "student_access.granted"
    c.delete(f"/student-access/teachers/{tid}", headers=p)


@pytest.mark.tc("TC-B-144", "Own class and a grant together: the higher level wins")
@pytest.mark.regression
def test_levels_combine(c):
    p, t1 = login(c, "principal"), login(c, "T001")
    tid, cls = me(c, t1)["id"], own_class(c, p, t1)
    policy(c, p, "edit", "none")
    c.put(f"/student-access/teachers/{tid}", json={"classes": [cls["id"]], "students": "add", "parents": "edit"}, headers=p)
    k = c.get("/my-students", headers=t1).json()["classes"][0]
    assert k["students"] == "add" and k["parents"] == "edit"
    policy(c, p, "none", "none")                                             # class teachers switched off: the grant still counts
    k = c.get("/my-students", headers=t1).json()["classes"][0]
    assert k["why"] == "given by principal" and k["students"] == "add"
    c.delete(f"/student-access/teachers/{tid}", headers=p)
    assert c.get("/my-students", headers=t1).json()["classes"] == []
    policy(c, p, "edit", "none")


@pytest.mark.tc("TC-B-145", "Policy rules: no parents without students, old switches still accepted, logged")
@pytest.mark.regression
def test_policy_rules(c):
    p = login(c, "principal")
    assert policy(c, p, "none", "add")["class_teachers"] == {"students": "none", "parents": "none"}
    assert c.put("/student-access/policy", json={"students": "all"}, headers=p).status_code == 422
    out = c.put("/student-access/policy", json={"class_teachers": True, "class_teachers_parents": True}, headers=p).json()
    assert out["class_teachers"] == {"students": "edit", "parents": "edit"}
    assert c.put("/student-access/policy", json={"students": "add"}, headers=p).json()["class_teachers"] == {"students": "add", "parents": "edit"}
    log = c.get("/school/audit", params={"group": "people", "q": "class teachers"}, headers=p).json()
    assert any("edit students → add and edit students" in x["detail"] for x in log)
    for who in ("vp", "T001", "coord"):
        assert c.put("/student-access/policy", json={"students": "add"}, headers=login(c, who)).status_code == 403
    policy(c, p, "edit", "none")


@pytest.mark.tc("TC-B-146", "Another school's teacher and principal can't reach these students")
@pytest.mark.regression
def test_other_school_is_kept_out(c):
    p, p2 = login(c, "principal"), login(c, "principal", code="DEMO02")
    policy(c, p2, "add", "add")
    t2 = login(c, "T001", code="DEMO02")                                     # class teacher in school 2
    s1 = c.get("/users", params={"role": "student"}, headers=p).json()[0]
    k1 = c.get("/classes", headers=p).json()[0]
    assert c.put(f"/my-students/{s1['id']}", json={"name": "Hijack"}, headers=t2).status_code == 404
    assert c.post(f"/my-students/{s1['id']}/parents", json={"name": "X", "mobile": "9811100005"}, headers=t2).status_code == 404
    assert c.post("/my-students", json=student_body(k1["id"], "XS1"), headers=t2).status_code == 403
    t1 = next(u for u in c.get("/users", params={"role": "teacher"}, headers=p).json() if u["login_id"] == "T001")
    assert c.put(f"/student-access/teachers/{t1['id']}", json={"classes": "all"}, headers=p2).status_code == 404
    # school 2's own class teacher can add there
    mine = c.get("/my-students", headers=t2).json()
    assert mine["can_add_students"]
    assert c.post("/my-students", json=student_body(mine["classes"][0]["id"], "S2NEW1"), headers=t2).status_code == 200
