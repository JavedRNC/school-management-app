"""Endpoints that no other test calls, each with its happy path, the input it must refuse, and who may use it:
subjects and subject teachers, timetable slots, editing notices and holidays, banners, polls, leave allowance,
website listing, staff-attendance settings, transport vehicles and riders, fee batches, student data access, and the
admin's banners, app version, modules, school classes, data template, payments and plans."""
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
    if r.json()["user"]["must_change_password"]:
        r = c.post("/auth/password", json={"old_password": pw, "new_password": pw + "Xy#9"}, headers=h)
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['token']}"}
    return h


def admin(c):
    r = c.post("/auth/login", json={"school_code": "ADMIN", "login_id": "admin", "password": "admin123"})
    if r.status_code == 200:
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        if r.json()["user"]["must_change_password"]:
            r = c.post("/auth/password", json={"old_password": "admin123", "new_password": "Admin#2026"}, headers=h)
            h = {"Authorization": f"Bearer {r.json()['token']}"}
        return h
    return login(c, "admin", "ADMIN", "Admin#2026")


def actions(c, h, group):
    return [a["action"] for a in c.get("/school/audit", params={"group": group}, headers=h).json()]


# ---------------------------------------------------------------- school setup
@pytest.mark.tc("TC-B-107", "Subjects create rename usage and refusals")
@pytest.mark.sanity
@pytest.mark.regression
def test_subjects_create_rename_usage_and_refusals(c):
    p, t = login(c, "principal"), login(c, "T001")
    r = c.post("/subjects", json={"name": "  Robotics  "}, headers=p)
    assert r.status_code == 200 and r.json()["name"] == "Robotics"
    sid = r.json()["id"]
    assert c.post("/subjects", json={"name": "Robotics"}, headers=p).status_code == 409          # same name twice
    assert c.post("/subjects", json={"name": ""}, headers=p).status_code == 422
    assert c.post("/subjects", json={"name": "Chess"}, headers=t).status_code == 403             # teachers can't
    assert c.put(f"/subjects/{sid}", json={"name": "Robotics & AI"}, headers=p).json()["name"] == "Robotics & AI"
    other = c.get("/subjects", headers=p).json()[0]
    assert c.put(f"/subjects/{sid}", json={"name": other["name"]}, headers=p).status_code == 409   # rename onto another subject
    use = c.get(f"/subjects/{sid}/usage", headers=p).json()
    assert use == {"assignments": 0, "timetable": 0, "marks": 0, "posts": 0}
    busy = c.get(f"/subjects/{other['id']}/usage", headers=p).json()
    assert busy["assignments"] >= 1
    assert c.get(f"/subjects/{sid}/usage", headers=t).status_code == 403
    assert {"subject.created", "subject.renamed"} <= set(actions(c, p, "classes"))


@pytest.mark.tc("TC-B-108", "Subject teachers assign replace and remove")
@pytest.mark.sanity
@pytest.mark.regression
def test_subject_teachers_assign_replace_and_remove(c):
    p = login(c, "principal")
    teachers = c.get("/users", params={"role": "teacher"}, headers=p).json()
    cls = c.get("/classes", headers=p).json()[0]
    sub = c.post("/subjects", json={"name": "Music"}, headers=p).json()
    body = {"teacher_id": teachers[0]["id"], "class_id": cls["id"], "subject_id": sub["id"]}
    a = c.post("/assignments", json=body, headers=p).json()
    again = c.post("/assignments", json={**body, "teacher_id": teachers[1]["id"]}, headers=p).json()
    assert again["id"] == a["id"] and again["teacher_id"] == teachers[1]["id"]                    # replaced, not doubled
    student = c.get("/users", params={"role": "student"}, headers=p).json()[0]
    assert c.post("/assignments", json={**body, "teacher_id": student["id"]}, headers=p).status_code == 400   # not a teacher
    assert c.post("/assignments", json={**body, "subject_id": 999999}, headers=p).status_code == 404
    assert c.post("/assignments", json=body, headers=login(c, "T002")).status_code == 403
    assert c.delete(f"/assignments/{a['id']}", headers=p).json() == {"ok": True}
    assert c.delete(f"/assignments/{a['id']}", headers=p).status_code == 404
    acts = actions(c, p, "classes")
    assert {"subject_teacher.assigned", "subject_teacher.changed", "subject_teacher.removed"} <= set(acts)


@pytest.mark.tc("TC-B-109", "Timetable slot set clear and checks")
@pytest.mark.sanity
@pytest.mark.regression
def test_timetable_slot_set_clear_and_checks(c):
    p = login(c, "principal")
    cls = c.get("/classes", headers=p).json()[0]
    a = next(x for x in c.get("/assignments", headers=p).json() if x["class_id"] == cls["id"])
    body = {"class_id": cls["id"], "day": 5, "period": 6, "subject_id": a["subject_id"], "teacher_id": a["teacher_id"]}
    for clash in c.get("/timetable", params={"class_id": cls["id"]}, headers=p).json():
        if clash["day"] == 5 and clash["period"] == 6:
            c.delete(f"/timetable/{clash['id']}", headers=p)
    slot = c.put("/timetable", json=body, headers=p)
    assert slot.status_code == 200, slot.text
    assert c.put("/timetable", json={**body, "day": 9}, headers=p).status_code in (400, 422)
    assert c.put("/timetable", json={**body, "period": 0}, headers=p).status_code in (400, 422)
    assert c.put("/timetable", json={**body, "period": 99}, headers=p).status_code in (400, 422)
    assert c.delete(f"/timetable/{slot.json()['id']}", headers=login(c, "T001")).status_code == 403
    assert c.delete(f"/timetable/{slot.json()['id']}", headers=p).json() == {"ok": True}
    assert c.delete(f"/timetable/{slot.json()['id']}", headers=p).status_code == 404
    assert {"timetable.changed", "timetable.cleared"} <= set(actions(c, p, "classes"))


# ---------------------------------------------------------------- notices, calendar, banners, polls
@pytest.mark.tc("TC-B-110", "Editing a notice only by its author or a manager")
@pytest.mark.sanity
@pytest.mark.regression
def test_editing_a_notice_only_by_its_author_or_a_manager(c):
    p, t1, t2 = login(c, "principal"), login(c, "T001"), login(c, "T002")
    cls = next(x for x in c.get("/assignments", headers=t1).json())["class_id"]
    post = c.post("/posts", json={"kind": "homework", "title": "Read chapter 3", "class_id": cls}, headers=t1).json()
    r = c.put(f"/posts/{post['id']}", json={"kind": "homework", "title": "Read chapter 4", "class_id": cls}, headers=t1)
    assert r.status_code == 200 and r.json()["title"] == "Read chapter 4"
    assert c.put(f"/posts/{post['id']}", json={"kind": "homework", "title": "Hacked", "class_id": cls}, headers=t2).status_code == 403
    assert c.put(f"/posts/{post['id']}", json={"kind": "homework", "title": "No class"}, headers=t1).status_code == 400
    assert c.put(f"/posts/{post['id']}", json={"kind": "notice", "title": "Whole school"}, headers=t1).status_code == 403   # teachers can't post to everyone
    assert c.put(f"/posts/{post['id']}", json={"kind": "homework", "title": "Checked by principal", "class_id": cls}, headers=p).status_code == 200
    log = c.get("/school/audit", params={"group": "notices", "q": "Read chapter"}, headers=p).json()
    assert any(x["action"] == "homework.edited" and "Read chapter 3 → Read chapter 4" in x["detail"] for x in log)


@pytest.mark.tc("TC-B-111", "Editing a holiday checks the dates")
@pytest.mark.sanity
@pytest.mark.regression
def test_editing_a_holiday_checks_the_dates(c):
    p = login(c, "principal")
    d = today() + timedelta(days=40)
    h = c.post("/holidays", json={"name": "Foundation day", "start_date": d.isoformat(), "end_date": d.isoformat(), "kind": "holiday"}, headers=p).json()
    r = c.put(f"/holidays/{h['id']}", json={"name": "Foundation day", "start_date": d.isoformat(), "end_date": (d + timedelta(days=1)).isoformat(), "kind": "holiday"}, headers=p)
    assert r.status_code == 200 and r.json()["end_date"] == (d + timedelta(days=1)).isoformat()
    bad = c.put(f"/holidays/{h['id']}", json={"name": "X", "start_date": d.isoformat(), "end_date": (d - timedelta(days=1)).isoformat(), "kind": "holiday"}, headers=p)
    assert bad.status_code in (400, 422)
    assert c.put(f"/holidays/{h['id']}", json={"name": "X", "start_date": d.isoformat(), "end_date": d.isoformat()}, headers=login(c, "T001")).status_code == 403
    assert c.put("/holidays/999999", json={"name": "X", "start_date": d.isoformat(), "end_date": d.isoformat()}, headers=p).status_code == 404
    assert "calendar.edited" in actions(c, p, "notices")
    c.delete(f"/holidays/{h['id']}", headers=p)


@pytest.mark.tc("TC-B-112", "Banners list edit and who sees them")
@pytest.mark.sanity
@pytest.mark.regression
def test_banners_list_edit_and_who_sees_them(c):
    p = login(c, "principal")
    b = c.post("/banners", json={"title": "Sports week", "roles": ["parent"]}, headers=p).json()
    assert any(x["id"] == b["id"] for x in c.get("/banners", headers=p).json())
    r = c.put(f"/banners/{b['id']}", json={"title": "Sports week moved", "roles": ["parent", "student"], "color": "green"}, headers=p)
    assert r.status_code == 200 and r.json()["title"] == "Sports week moved" and r.json()["color"] == "green"
    assert c.put(f"/banners/{b['id']}", json={"title": "", "roles": ["parent"]}, headers=p).status_code == 422
    assert c.put(f"/banners/{b['id']}", json={"title": "X"}, headers=login(c, "T001")).status_code == 403
    assert c.get("/banners", headers=login(c, "2026001")).status_code == 403                     # students see only the live ones
    live = [x["title"] for x in c.get("/banners/active", headers=login(c, "2026001")).json()]
    assert "Sports week moved" in live
    c.delete(f"/banners/{b['id']}", headers=p)
    assert "Sports week moved" not in [x["title"] for x in c.get("/banners/active", headers=login(c, "2026001")).json()]
    assert {"banner.edited", "banner.removed"} <= set(actions(c, p, "notices"))


@pytest.mark.tc("TC-B-113", "Removing a poll")
@pytest.mark.sanity
@pytest.mark.regression
def test_removing_a_poll(c):
    p = login(c, "principal")
    poll = c.post("/polls", json={"kind": "poll", "title": "Picnic place", "options": ["Zoo", "Park"], "audience": ["parent"]}, headers=p).json()
    assert c.delete(f"/polls/{poll['id']}", headers=login(c, "T001")).status_code == 403
    assert c.delete(f"/polls/{poll['id']}", headers=p).json() == {"ok": True}
    assert all(x["id"] != poll["id"] for x in c.get("/polls", headers=p).json())
    assert c.delete(f"/polls/{poll['id']}", headers=p).status_code in (404, 409)
    assert "poll.removed" in actions(c, p, "notices")


# ---------------------------------------------------------------- settings
@pytest.mark.tc("TC-B-114", "Leave allowance read by all set by the principal")
@pytest.mark.sanity
@pytest.mark.regression
def test_leave_allowance_read_by_all_set_by_the_principal(c):
    p = login(c, "principal")
    before = c.get("/school/leave-quotas", headers=p).json()
    assert set(before) >= {"casual", "sick", "earned"}
    assert c.get("/school/leave-quotas", headers=login(c, "T001")).json() == before
    r = c.put("/school/leave-quotas", json={"casual": 10, "sick": 8}, headers=p)
    assert r.status_code == 200 and r.json()["casual"] == 10 and r.json()["sick"] == 8 and r.json()["earned"] == before["earned"]
    for bad in ({"casual": -1}, {"sick": 400}, {"earned": "many"}):
        assert c.put("/school/leave-quotas", json=bad, headers=p).status_code == 400, bad
    assert c.put("/school/leave-quotas", json={"casual": 99}, headers=login(c, "T001")).status_code == 403
    assert c.put("/school/leave-quotas", json={"casual": 99}, headers=login(c, "vp")).status_code == 403     # VP has settings: view
    c.put("/school/leave-quotas", json=before, headers=p)


@pytest.mark.tc("TC-B-115", "Website listing by the principal and the admin")
@pytest.mark.sanity
@pytest.mark.regression
def test_website_listing_by_the_principal_and_the_admin(c):
    p, a = login(c, "principal"), admin(c)
    me = c.get("/school/me", headers=p).json()
    got = c.get("/school/showcase", headers=p).json()
    assert {"show", "city"} <= set(got)
    assert c.get("/school/showcase", headers=login(c, "vp")).status_code == 403
    r = c.put(f"/admin/schools/{me['id']}/showcase", json={"show": True, "city": "Ranchi"}, headers=a)
    assert r.status_code == 200 and r.json()["show"] is True
    assert c.get("/school/showcase", headers=p).json()["city"] == "Ranchi"
    assert any(s["city"] == "Ranchi" and s["name"] == me["name"] for s in c.get("/public/schools").json()["schools"])
    assert c.put("/admin/schools/999999/showcase", json={"show": True}, headers=a).status_code == 404
    assert c.put(f"/admin/schools/{me['id']}/showcase", json={"show": True}, headers=p).status_code == 403
    c.put(f"/admin/schools/{me['id']}/showcase", json={"show": False, "city": ""}, headers=a)
    assert all(s["name"] != me["name"] for s in c.get("/public/schools").json()["schools"])


@pytest.mark.tc("TC-B-116", "Staff attendance settings are readable by staff")
@pytest.mark.sanity
@pytest.mark.regression
def test_staff_attendance_settings_are_readable_by_staff(c):
    p = login(c, "principal")
    s = c.get("/staff-attendance/settings", headers=p).json()
    assert {"radius_m", "late_after", "configured"} <= set(s)
    assert c.get("/staff-attendance/settings", headers=login(c, "T001")).json()["radius_m"] == s["radius_m"]


# ---------------------------------------------------------------- transport, fees
@pytest.mark.tc("TC-B-117", "Vehicles edit remove and riders list")
@pytest.mark.sanity
@pytest.mark.regression
def test_vehicles_edit_remove_and_riders_list(c):
    p = login(c, "principal")
    v = c.post("/transport/vehicles", json={"number": "JH01 AB 1234", "capacity": 30}, headers=p).json()
    r = c.put(f"/transport/vehicles/{v['id']}", json={"number": "JH01 AB 1234", "capacity": 35, "driver_name": "Raju"}, headers=p)
    assert r.status_code == 200 and r.json()["capacity"] == 35 and r.json()["driver_name"] == "Raju"
    assert c.put(f"/transport/vehicles/{v['id']}", json={"number": "X", "capacity": 500}, headers=p).status_code == 422
    assert c.put(f"/transport/vehicles/{v['id']}", json={"number": "X"}, headers=login(c, "T001")).status_code == 403
    route = c.post("/transport/routes", json={"name": "Route Z", "vehicle_id": v["id"], "stops": [{"name": "Gate"}]}, headers=p).json()
    kid = c.get("/users", params={"role": "student"}, headers=p).json()[0]
    c.put("/transport/students", json={"student_ids": [kid["id"]], "route_id": route["id"]}, headers=p)
    riders = c.get("/transport/students", params={"route_id": route["id"]}, headers=p).json()
    assert [x["student_id"] for x in riders] == [kid["id"]]
    assert c.get("/transport/students", headers=login(c, "2026001")).status_code == 403
    assert c.delete(f"/transport/vehicles/{v['id']}", headers=p).json() == {"ok": True}
    ov = c.get("/transport/overview", headers=p).json()
    assert all(x["id"] != v["id"] for x in ov["vehicles"])
    assert next(x for x in ov["routes"] if x["id"] == route["id"])["vehicle_id"] is None           # the route keeps going without it
    c.put("/transport/students", json={"student_ids": [kid["id"]], "route_id": None}, headers=p)
    acts = set(actions(c, p, "transport"))
    assert {"transport.vehicle.edited", "transport.vehicle.removed", "transport.riders.assigned", "transport.riders.removed"} <= acts


@pytest.mark.tc("TC-B-118", "Fee batches are listed")
@pytest.mark.sanity
@pytest.mark.regression
def test_fee_batches_are_listed(c):
    p = login(c, "principal")
    b = c.post("/fees/batches", json={"title": "Annual day", "amount": 150, "target": "school"}, headers=p)
    assert b.status_code == 200, b.text
    rows = c.get("/fees/batches", headers=p).json()
    assert any(x["title"] == "Annual day" for x in rows)
    assert c.get("/fees/batches", headers=login(c, "T001")).status_code == 403
    assert c.get("/fees/batches", headers=login(c, "vp")).status_code == 200                      # VP may view fees


@pytest.mark.tc("TC-B-119", "Student access settings are read by the principal only")
@pytest.mark.sanity
@pytest.mark.regression
def test_student_access_settings_are_read_by_the_principal_only(c):
    p = login(c, "principal")
    a = c.get("/student-access", headers=p).json()
    assert a["class_teachers"] == {"students": "edit", "parents": "none"} and a["grants"] == []
    for who in ("vp", "T001", "2026001"):
        assert c.get("/student-access", headers=login(c, who)).status_code == 403, who


# ---------------------------------------------------------------- platform admin
@pytest.mark.tc("TC-B-120", "Admin banners list edit remove")
@pytest.mark.sanity
@pytest.mark.regression
def test_admin_banners_list_edit_remove(c):
    a = admin(c)
    b = c.post("/admin/banners", json={"title": "New features", "roles": ["principal"]}, headers=a).json()
    assert any(x["id"] == b["id"] for x in c.get("/admin/banners", headers=a).json())
    r = c.put(f"/admin/banners/{b['id']}", json={"title": "New features are here", "roles": ["principal"]}, headers=a)
    assert r.status_code == 200 and r.json()["title"] == "New features are here"
    assert c.put("/admin/banners/999999", json={"title": "X"}, headers=a).status_code == 404
    school_banner = c.post("/banners", json={"title": "School only"}, headers=login(c, "principal")).json()
    assert c.put(f"/admin/banners/{school_banner['id']}", json={"title": "X"}, headers=a).status_code == 404   # not a platform banner
    assert c.delete(f"/admin/banners/{b['id']}", headers=a).json() == {"ok": True}
    assert all(x["id"] != b["id"] for x in c.get("/admin/banners", headers=a).json())
    log = [x["action"] for x in c.get("/admin/audit", headers=a).json()]
    assert {"platform.banner.edited", "platform.banner.removed"} <= set(log)


@pytest.mark.tc("TC-B-121", "Admin app version modules and plans")
@pytest.mark.sanity
@pytest.mark.regression
def test_admin_app_version_modules_and_plans(c):
    a = admin(c)
    v = c.get("/admin/app-version", headers=a).json()
    assert {"min_build", "latest_build", "url", "message"} <= set(v)
    mods = c.get("/admin/modules", headers=a).json()
    assert "core" in str(mods) and "fees" in str(mods)
    r = c.post("/admin/plans", json={"name": "Starter", "modules": ["core", "fees"], "price_per_student": 9}, headers=a)
    assert r.status_code == 200 and "core" in r.json()["modules"]
    assert c.post("/admin/plans", json={"name": "Starter", "modules": ["core"], "price_per_student": 9}, headers=a).status_code == 409
    assert c.post("/admin/plans", json={"name": "Bad", "modules": ["core"], "price_per_student": -1}, headers=a).status_code == 422
    assert c.post("/admin/plans", json={"name": "X", "modules": ["core"], "price_per_student": 1}, headers=login(c, "principal")).status_code == 403
    assert "plan.created" in [x["action"] for x in c.get("/admin/audit", headers=a).json()]


@pytest.mark.tc("TC-B-122", "Admin school classes payments and template")
@pytest.mark.sanity
@pytest.mark.regression
def test_admin_school_classes_payments_and_template(c):
    a, p = admin(c), login(c, "principal")
    sid = c.get("/school/me", headers=p).json()["id"]
    classes = c.get(f"/admin/schools/{sid}/classes", headers=a).json()
    assert classes and {"id", "name", "student_count"} <= set(classes[0])
    assert c.get("/admin/schools/999999/classes", headers=a).status_code == 404
    c.post(f"/admin/schools/{sid}/payments", json={"amount": 999, "paid_on": today().isoformat(), "method": "upi", "reference": "UTRCHECK1", "extend_valid_until": False}, headers=a)
    assert c.post(f"/admin/schools/{sid}/payments", json={"amount": 0, "paid_on": today().isoformat()}, headers=a).status_code == 422
    pays = c.get(f"/admin/schools/{sid}/payments", headers=a).json()
    assert any(x["reference"] == "UTRCHECK1" for x in pays)
    # the data template needs the school's support access
    c.delete("/school/support-access", headers=p)
    assert c.get(f"/admin/schools/{sid}/data/template", headers=a).status_code == 403
    c.post("/school/support-access", params={"hours": 1}, headers=p)
    r = c.get(f"/admin/schools/{sid}/data/template", headers=a)
    assert r.status_code == 200 and r.content[:2] == b"PK"
    c.delete("/school/support-access", headers=p)


@pytest.mark.tc("TC-B-123", "Admin school details and adding people with support access")
@pytest.mark.sanity
@pytest.mark.regression
def test_admin_school_details_and_adding_people_with_support_access(c):
    a, p = admin(c), login(c, "principal")
    sid = c.get("/school/me", headers=p).json()["id"]
    d = c.get(f"/admin/schools/{sid}/details", headers=a).json()
    assert "pin" in d
    r = c.put(f"/admin/schools/{sid}/details", json={**{k: d.get(k) or "" for k in ("reg_no", "category", "state", "district", "city", "email", "contact_name")},
                                                       "pin": "834001", "city": "Ranchi"}, headers=a)
    assert r.status_code == 200 and c.get(f"/admin/schools/{sid}/details", headers=a).json()["pin"] == "834001"
    assert c.put(f"/admin/schools/{sid}/details", json={"pin": "12345"}, headers=a).status_code == 422
    assert c.get("/admin/schools/999999/details", headers=a).status_code == 404
    body = {"name": "Support Added", "login_id": "SUP01", "password": "Start#123", "role": "teacher"}
    c.delete("/school/support-access", headers=p)
    assert c.post(f"/admin/schools/{sid}/users", json=body, headers=a).status_code == 403             # not without the school's permission
    c.post("/school/support-access", params={"hours": 1}, headers=p)
    made = c.post(f"/admin/schools/{sid}/users", json=body, headers=a)
    assert made.status_code == 200 and made.json()["must_change_password"] is True
    assert c.post(f"/admin/schools/{sid}/users", json={**body, "login_id": "sup01"}, headers=a).status_code == 409
    assert c.post(f"/admin/schools/{sid}/users", json={**body, "login_id": "ADM2", "role": "admin"}, headers=a).status_code == 400
    c.delete("/school/support-access", headers=p)
    assert "admin.user.created" in [x["action"] for x in c.get("/school/audit", headers=p).json()]     # the school sees what support did


@pytest.mark.tc("TC-B-124", "Fee setup saves and refuses bad values")
@pytest.mark.sanity
@pytest.mark.regression
def test_fee_setup_saves_and_refuses_bad_values(c):
    p = login(c, "principal")
    cfg = c.get("/fees/config", headers=p).json()
    cls = c.get("/classes", headers=p).json()[0]
    body = {"monthly_amount": 1100, "class_amounts": {str(cls["id"]): 1300}, "due_day": 12, "upi_id": "school@sbi", "receipt_prefix": "RCPT"}
    r = c.put("/fees/config", json=body, headers=p)
    assert r.status_code == 200, r.text
    got = c.get("/fees/config", headers=p).json()
    assert got["monthly_amount"] == 1100 and got["due_day"] == 12 and got["upi_id"] == "school@sbi"
    assert next(x for x in got["classes"] if x["id"] == cls["id"])["amount"] == 1300
    for bad in ({**body, "due_day": 31}, {**body, "monthly_amount": -5}, {**body, "class_amounts": {"999999": 10}}, {**body, "upi_id": "not a upi"}):
        assert c.put("/fees/config", json=bad, headers=p).status_code in (400, 422), bad
    assert c.put("/fees/config", json=body, headers=login(c, "vp")).status_code == 403                 # VP: fees view only
    c.put("/fees/config", json={k: cfg[k] for k in ("monthly_amount", "due_day", "upi_id", "receipt_prefix") if k in cfg}, headers=p)


@pytest.mark.tc("TC-B-125", "Staff attendance location saves and refuses bad values")
@pytest.mark.sanity
@pytest.mark.regression
def test_staff_attendance_location_saves_and_refuses_bad_values(c):
    p = login(c, "principal")
    r = c.put("/staff-attendance/settings", json={"lat": 23.3441, "lng": 85.3096, "radius_m": 200, "late_after": "08:45"}, headers=p)
    assert r.status_code == 200 and r.json()["radius_m"] == 200 and r.json()["late_after"] == "08:45" and r.json()["configured"] is True
    for bad in ({"lat": 123, "lng": 85}, {"lat": 23, "lng": 85, "radius_m": 10}, {"lat": 23, "lng": 85, "late_after": "25:99"}):
        assert c.put("/staff-attendance/settings", json=bad, headers=p).status_code == 422, bad
    assert c.put("/staff-attendance/settings", json={"lat": 1, "lng": 1}, headers=login(c, "T001")).status_code == 403
    assert "staff_attendance.location_set" in actions(c, p, "attendance")


@pytest.mark.tc("TC-B-126", "Editing a route and its stops")
@pytest.mark.sanity
@pytest.mark.regression
def test_editing_a_route_and_its_stops(c):
    p = login(c, "principal")
    r = c.post("/transport/routes", json={"name": "Route E", "stops": [{"name": "Gate", "pickup_time": "07:00"}, {"name": "Chowk"}]}, headers=p).json()
    stops = r["stops"]
    edit = c.put(f"/transport/routes/{r['id']}", json={"name": "Route East", "stops": [{"id": stops[0]["id"], "name": "Main gate", "pickup_time": "07:05"},
                                                                                       {"name": "Bus stand"}]}, headers=p)
    assert edit.status_code == 200, edit.text
    names = [s["name"] for s in edit.json()["stops"]]
    assert edit.json()["name"] == "Route East" and names == ["Main gate", "Bus stand"]                # Chowk removed, order kept
    kid = c.get("/users", params={"role": "student"}, headers=p).json()[1]
    stop_id = next(s["id"] for s in edit.json()["stops"] if s["name"] == "Bus stand")
    c.put("/transport/students", json={"student_ids": [kid["id"]], "route_id": r["id"], "stop_id": stop_id}, headers=p)
    blocked = c.put(f"/transport/routes/{r['id']}", json={"name": "Route East", "stops": [{"name": "Main gate"}]}, headers=p)
    assert blocked.status_code == 409                                                               # a stop with a student can't go
    assert c.put(f"/transport/routes/{r['id']}", json={"name": "", "stops": []}, headers=p).status_code == 422
    assert c.put(f"/transport/routes/{r['id']}", json={"name": "X", "vehicle_id": 999999}, headers=p).status_code == 404
    c.put("/transport/students", json={"student_ids": [kid["id"]], "route_id": None}, headers=p)
    assert "transport.route.edited" in actions(c, p, "transport")


@pytest.mark.tc("TC-B-127", "Admin data history and undo copy")
@pytest.mark.sanity
@pytest.mark.regression
def test_admin_data_history_and_undo_copy(c):
    a, p2 = admin(c), login(c, "principal", code="DEMO02")
    sid = c.get("/school/me", headers=p2).json()["id"]
    backup = c.get("/data/backup", headers=p2)
    assert backup.status_code == 200
    up = c.post("/data/import", headers=p2, files={"file": ("backup.xlsx", backup.content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                data={"mode": "replace", "confirm": "true", "confirm_code": "DEMO02", "password": "demo123"})
    assert up.status_code == 200 and up.json()["saved"] is True, up.text
    c.delete("/school/support-access", headers=p2)
    assert c.get(f"/admin/schools/{sid}/data/history", headers=a).status_code == 403
    assert c.get(f"/admin/schools/{sid}/data/snapshot/file", headers=a).status_code == 403
    c.post("/school/support-access", params={"hours": 1}, headers=p2)
    hist = c.get(f"/admin/schools/{sid}/data/history", headers=a).json()
    assert any("replace" in (h.get("action") or "") for h in hist), hist
    f = c.get(f"/admin/schools/{sid}/data/snapshot/file", headers=a)
    assert f.status_code == 200 and f.content[:2] == b"PK"
    c.delete("/school/support-access", headers=p2)


@pytest.mark.tc("TC-B-155", "Platform support sees that contact details changed, not the details, until the school allows it")
@pytest.mark.sanity
@pytest.mark.regression
def test_activity_log_hides_contact_details_from_support(c):
    a, p = admin(c), login(c, "principal")
    sid = c.get("/school/me", headers=p).json()["id"]
    c.delete("/school/support-access", headers=p)
    c.put("/school/settings", json={"share_contact_with_admin": False}, headers=p)
    kid = c.post("/users", json={"name": "Private Kid", "login_id": "PRIV01", "password": "Start#123", "role": "student",
                                 "class_id": c.get("/classes", headers=p).json()[0]["id"]}, headers=p).json()
    c.put(f"/users/{kid['id']}", json={"email": "kid.private@mail.in", "address": "Flat 2; Block B, Secret Street", "dob": "2013-02-03",
                                       "phone": "9876512345", "name": "Private Kid R"}, headers=p)
    school_view = c.get("/school/audit", params={"q": "PRIV01"}, headers=p).json()[0]["detail"]
    assert "kid.private@mail.in" in school_view and "Secret Street" in school_view          # the school itself sees everything
    seen = next(x["detail"] for x in c.get("/admin/audit", params={"school_id": sid}, headers=a).json() if "PRIV01" in x["detail"])
    for secret in ("kid.private@mail.in", "Secret Street", "Block B", "2013-02-03", "9876512345"):
        assert secret not in seen, secret                                                    # an address with "; " in it too
    assert "email changed (hidden)" in seen and "name: Private Kid → Private Kid R" in seen
    c.post("/school/support-access", params={"hours": 1}, headers=p)                        # with support access it is visible
    seen = next(x["detail"] for x in c.get("/admin/audit", params={"school_id": sid}, headers=a).json() if "PRIV01" in x["detail"])
    assert "kid.private@mail.in" in seen
    c.delete("/school/support-access", headers=p)


@pytest.mark.tc("TC-B-156", "Activity search treats % and _ as plain text")
@pytest.mark.regression
def test_activity_search_is_literal(c):
    p = login(c, "principal")
    for x in c.get("/school/audit", params={"q": "%"}, headers=p).json():                  # "%" finds only text with a real %
        assert "%" in x["detail"] + x["action"] + x["actor_name"]
    c.post("/subjects", json={"name": "100% Maths_A"}, headers=p)
    hits = c.get("/school/audit", params={"q": "100% maths_a"}, headers=p).json()
    assert hits and all("100% Maths_A" in x["detail"] for x in hits)
    assert c.get("/school/audit", params={"q": "100_ maths%a"}, headers=p).json() == []
