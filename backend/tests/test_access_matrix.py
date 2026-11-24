"""Every API endpoint, called by every kind of person: who may sign in to what, what each role may read and change,
paid modules, and that nothing crashes on junk input. The endpoint list comes from the app itself, so a new endpoint is
checked automatically — and an unexpected new door for students, parents or teachers fails here."""
import os
import re
import tempfile

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import ratelimit  # noqa: E402
from app.main import app  # noqa: E402

# Open to anyone (no sign-in).
PUBLIC = {"POST /auth/login", "GET /app/version", "GET /public/schools", "POST /public/onboarding", "POST /public/onboarding/status", "GET /"}

# What each role may read (GET endpoints without an id in the path). Changing this list is a product decision.
COMMON = {"/assignments", "/auth/me", "/banners/active", "/classes", "/exams", "/holidays", "/leaves", "/leaves/balance", "/polls", "/posts",
          "/school/bell", "/school/leave-quotas", "/school/me", "/staff-attendance/settings", "/subjects", "/timetable"}
READS = {
    "student": COMMON | {"/fees/me", "/me/attendance", "/me/marks", "/transport/me"},
    "parent": COMMON | {"/fees/me", "/me/attendance", "/me/children", "/me/marks", "/transport/me"},
    "teacher": COMMON | {"/leaves/today", "/my-students", "/payroll/me", "/staff-attendance/me"},
    "coordinator": COMMON | {"/banners", "/dashboard", "/leaves/today", "/payroll/me", "/staff-attendance/me", "/transport/overview",
                             "/transport/students", "/users"},
    "vice_principal": COMMON | {"/archive", "/banners", "/dashboard", "/fees/batches", "/fees/claims", "/fees/config", "/fees/payments",
                                "/fees/students", "/fees/summary", "/leaves/today", "/payroll/me", "/school/audit", "/staff-attendance/day",
                                "/staff-attendance/me", "/staff-attendance/report", "/transport/overview", "/transport/students", "/users"},
}
# The only change a student or parent can make with an empty request (the privacy notice they accept at first sign-in).
STUDENT_WRITES_OK = {"POST /auth/consent"}
# Paid modules that the Basic plan (DEMO02) does not have, and an endpoint of each.
NOT_ON_BASIC = {"fees": "/fees/summary", "payroll": "/payroll/runs", "transport": "/transport/overview", "communication": "/polls",
                "staff_attendance": "/staff-attendance/day", "leaves": "/leaves"}


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def _login(c, code, lid, pw="demo123"):
    ratelimit.reset()
    r = c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    if r.json()["user"]["must_change_password"]:
        r = c.post("/auth/password", json={"old_password": pw, "new_password": pw + "Xy#9"}, headers=h)
        h = {"Authorization": f"Bearer {r.json()['token']}"}
    return h


@pytest.fixture(scope="module")
def people(c):
    return {"anon": {}, "student": _login(c, "DEMO01", "2026001"), "parent": _login(c, "DEMO01", "9876500001"),
            "teacher": _login(c, "DEMO01", "T001"), "coordinator": _login(c, "DEMO01", "coord"), "vice_principal": _login(c, "DEMO01", "vp"),
            "basic_principal": _login(c, "DEMO02", "principal"), "admin": _login(c, "ADMIN", "admin", "admin123")}


def endpoints():
    for path, ops in app.openapi()["paths"].items():
        for m in ops:
            if m in ("get", "post", "put", "delete"):
                yield m.upper(), path


@pytest.fixture(scope="module")
def sweep(c, people):
    """Every endpoint × every role, with a made-up id (999999) and an empty body. {"METHOD /path": {role: status}}."""
    out = {}
    for m, path in endpoints():
        url = re.sub(r"\{[^}]+\}", "999999", path)
        row = {}
        for role, h in people.items():
            ratelimit.reset()
            r = c.request(m, url, headers=h, **({"json": {}} if m in ("POST", "PUT") else {}))
            row[role] = r.status_code
        out[f"{m} {path}"] = row
    return out


@pytest.mark.tc("TC-B-128", "There are endpoints to check")
@pytest.mark.regression
def test_there_are_endpoints_to_check(sweep):
    assert len(sweep) > 150


@pytest.mark.tc("TC-B-129", "Nothing crashes on junk input for anyone")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_nothing_crashes_on_junk_input_for_anyone(sweep):
    crashed = {k: v for k, v in sweep.items() if any(s >= 500 for s in v.values())}
    assert not crashed, f"server errors on junk input: {crashed}"


@pytest.mark.tc("TC-B-130", "Every endpoint needs sign in except the public ones")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_every_endpoint_needs_sign_in_except_the_public_ones(sweep):
    open_doors = sorted(k for k, v in sweep.items() if v["anon"] != 401 and k not in PUBLIC)
    assert not open_doors, f"reachable without signing in: {open_doors}"
    for k in PUBLIC:
        assert k in sweep, f"public endpoint {k} no longer exists — update PUBLIC"


@pytest.mark.tc("TC-B-131", "Each role reads exactly what it should")
@pytest.mark.regression
@pytest.mark.parametrize("role", sorted(READS))
def test_each_role_reads_exactly_what_it_should(sweep, role):
    got = {k[4:] for k, v in sweep.items() if k.startswith("GET ") and "{" not in k and v[role] < 300 and k not in PUBLIC}
    assert got - READS[role] == set(), f"{role} can now also read: {sorted(got - READS[role])}"
    assert READS[role] - got == set(), f"{role} can no longer read: {sorted(READS[role] - got)}"


@pytest.mark.tc("TC-B-132", "Students and parents cannot change school data")
@pytest.mark.regression
@pytest.mark.parametrize("role", ["student", "parent"])
def test_students_and_parents_cannot_change_school_data(sweep, role):
    changed = sorted(k for k, v in sweep.items() if not k.startswith("GET ") and v[role] < 300 and k not in PUBLIC | STUDENT_WRITES_OK)
    assert not changed, f"{role} got a success from: {changed}"


@pytest.mark.tc("TC-B-133", "Admin endpoints are for the platform admin only")
@pytest.mark.regression
@pytest.mark.parametrize("role", ["student", "parent", "teacher", "coordinator", "vice_principal", "basic_principal"])
def test_admin_endpoints_are_for_the_platform_admin_only(sweep, role):
    leaks = sorted(f"{k}={v[role]}" for k, v in sweep.items() if re.match(r"^\w+ /admin(/|$)", k) and v[role] != 403)
    assert not leaks, f"{role} is not refused by: {leaks}"


@pytest.mark.tc("TC-B-134", "The admin has no school of their own")
@pytest.mark.regression
def test_the_admin_has_no_school_of_their_own(sweep):
    for k in ("GET /school/me", "GET /users", "GET /classes", "GET /dashboard"):
        assert sweep[k]["admin"] in (400, 403, 404), k


@pytest.mark.tc("TC-B-135", "Teachers cannot manage the school")
@pytest.mark.regression
def test_teachers_cannot_manage_the_school(sweep):
    manager_only = [k for k in sweep if re.match(r"^(POST|PUT|DELETE) /(users|classes|subjects|exams|holidays|banners|timetable|assignments|fees|payroll|transport|school/(settings|bell|leave-quotas|support-access|showcase)|student-access|data)", k)]
    assert manager_only
    allowed = sorted(f"{k}={sweep[k]['teacher']}" for k in manager_only if sweep[k]["teacher"] not in (401, 403))
    assert not allowed, f"a teacher is not refused by: {allowed}"


@pytest.mark.tc("TC-B-136", "Paid modules are refused on a smaller plan")
@pytest.mark.regression
@pytest.mark.parametrize("module,path", sorted(NOT_ON_BASIC.items()))
def test_paid_modules_are_refused_on_a_smaller_plan(c, people, module, path):
    r = c.get(path, headers=people["basic_principal"])
    assert r.status_code == 403 and f"MODULE_NOT_ENABLED:{module}" in r.json()["detail"], (path, r.status_code, r.text)


@pytest.mark.tc("TC-B-137", "One school cannot touch another schools records")
@pytest.mark.regression
def test_one_school_cannot_touch_another_schools_records(c, people):
    p1 = _login(c, "DEMO01", "principal")
    p2 = people["basic_principal"]
    ids = {
        "user": c.get("/users", params={"role": "student"}, headers=p1).json()[0]["id"],
        "class": c.get("/classes", headers=p1).json()[0]["id"],
        "subject": c.get("/subjects", headers=p1).json()[0]["id"],
        "exam": c.get("/exams", headers=p1).json()[0]["id"],
        "post": c.get("/posts", headers=p1).json()[0]["id"],
        "assignment": c.get("/assignments", headers=p1).json()[0]["id"],
    }
    tries = [("PUT", f"/users/{ids['user']}", {"name": "Taken over"}), ("DELETE", f"/users/{ids['user']}", None),
             ("GET", f"/classes/{ids['class']}/students", None), ("PUT", f"/classes/{ids['class']}", {"name": "X"}),
             ("DELETE", f"/classes/{ids['class']}", None), ("PUT", f"/subjects/{ids['subject']}", {"name": "X"}),
             ("GET", f"/subjects/{ids['subject']}/usage", None), ("DELETE", f"/subjects/{ids['subject']}", None),
             ("PUT", f"/exams/{ids['exam']}", {"name": "X", "date": "2026-01-01", "max_marks": 10}), ("DELETE", f"/exams/{ids['exam']}", None),
             ("PUT", f"/posts/{ids['post']}", {"kind": "notice", "title": "X"}), ("DELETE", f"/posts/{ids['post']}", None),
             ("DELETE", f"/assignments/{ids['assignment']}", None),
             ("GET", "/attendance", {"class_id": ids["class"], "day": "2026-01-05"}), ("GET", "/marks", {"exam_id": ids["exam"], "class_id": ids["class"], "subject_id": ids["subject"]})]
    for m, url, body in tries:
        r = c.request(m, url, headers=p2, **({"params": body} if m == "GET" and body else {"json": body} if body else {}))
        assert r.status_code in (403, 404), (m, url, r.status_code, r.text)
    # nothing in school 1 changed
    assert c.get("/users", params={"role": "student"}, headers=p1).json()[0]["name"] != "Taken over"
    assert any(x["id"] == ids["class"] for x in c.get("/classes", headers=p1).json())
    assert any(x["id"] == ids["post"] for x in c.get("/posts", headers=p1).json())
