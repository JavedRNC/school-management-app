"""Payroll (F36): salaries, monthly payroll, locking, payments, own payslips, privacy between people and schools."""
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
from app.migrate import SCHEMA_VERSION  # noqa: E402
from app.util import today  # noqa: E402

SCHOOL = (23.3441, 85.3096)
THIS = f"{today().year:04d}-{today().month:02d}"


def login(c, lid, code="DEMO01", pw="demo123"):
    r = c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def admin(c):
    r = c.post("/auth/login", json={"school_code": "ADMIN", "login_id": "admin", "password": "admin123"})
    if r.status_code == 200:
        hh = {"Authorization": f"Bearer {r.json()['token']}"}
        if r.json()["user"]["must_change_password"]:
            ch = c.post("/auth/password", json={"old_password": "admin123", "new_password": "Admin#2026"}, headers=hh)
            assert ch.status_code == 200
            hh = {"Authorization": f"Bearer {ch.json()['token']}"}
        return hh
    return login(c, "admin", "ADMIN", "Admin#2026")


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        h = login(client, "principal")
        client.put("/school/settings", json={"working_days": [0, 1, 2, 3, 4, 5, 6]}, headers=h)
        for hol in client.get("/holidays", headers=h).json():
            client.delete(f"/holidays/{hol['id']}", headers=h)
        yield client


@pytest.fixture(scope="module")
def h(c):
    return login(c, "principal")


def staff(c, h):
    return {r["login_id"]: r for r in c.get("/payroll/staff", headers=h).json()["rows"]}


def fresh_month(c, h):
    """Delete or reopen whatever exists for this month so a test starts clean."""
    for r in c.get("/payroll/runs", headers=h).json()["runs"]:
        if r["month"] != THIS:
            continue
        if r["status"] == "final":
            for p in c.get(f"/payroll/runs/{r['id']}", headers=h).json()["payslips"]:
                if p["status"] == "paid":
                    assert c.post(f"/payroll/payslips/{p['id']}/undo-payment", json={"reason": "test reset"}, headers=h).status_code == 200
            assert c.post(f"/payroll/runs/{r['id']}/reopen", headers=h).status_code == 200
        assert c.delete(f"/payroll/runs/{r['id']}", headers=h).status_code == 200


# ---------------------------------------------------------------- who may use it
def test_only_the_principal_manages_payroll(c, h):
    for lid in ("vp", "coord", "T001"):
        hh = login(c, lid)
        assert c.get("/payroll/staff", headers=hh).status_code == 403, lid
        assert c.get("/payroll/runs", headers=hh).status_code == 403, lid
        assert c.post("/payroll/runs", json={"month": THIS}, headers=hh).status_code == 403, lid
        assert c.get("/payroll/config", headers=hh).status_code == 403, lid
    for lid in ("2026001", "9876500001"):
        hh = login(c, lid)
        if lid.startswith("98"):
            c.post("/auth/consent", headers=hh)
        assert c.get("/payroll/me", headers=hh).status_code == 403, lid
    assert c.get("/payroll/staff").status_code == 401


def test_module_is_needed(c):
    h2 = login(c, "principal", "DEMO02")           # Basic plan
    r = c.get("/payroll/staff", headers=h2)
    assert r.status_code == 403 and "MODULE_NOT_ENABLED:payroll" in r.json()["detail"]


def test_demo_has_last_month_paid(c, h):
    runs = c.get("/payroll/runs", headers=h).json()["runs"]
    assert runs and runs[0]["status"] == "final" and runs[0]["unpaid_count"] == 0 and runs[0]["people"] >= 5
    assert c.get("/payroll/staff", headers=h).json()["with_salary"] >= 5


# ---------------------------------------------------------------- salaries
def test_set_salary_and_its_rules(c, h):
    t = staff(c, h)["T001"]
    r = c.put(f"/payroll/staff/{t['user_id']}", json={
        "basic": 30000, "allowances": [{"name": "  House   rent ", "amount": 6000}, {"name": "Travel", "amount": 1500.555}],
        "deductions": [{"name": "Provident fund", "amount": 3600}], "note": " senior "}, headers=h)
    assert r.status_code == 200, r.text
    s = r.json()["salary"]
    assert s["allowances"][0]["name"] == "House rent" and s["allowances"][1]["amount"] == 1500.56
    assert s["gross"] == 37500.56 and s["total_deductions"] == 3600 and s["net"] == 33900.56 and s["note"] == "senior"
    bad = [{"basic": -1}, {"basic": 20000000},
           {"basic": 100, "allowances": [{"name": "", "amount": 5}]},
           {"basic": 100, "allowances": [{"name": "A", "amount": 0}]},
           {"basic": 100, "allowances": [{"name": "A", "amount": 0.004}]},
           {"basic": 100, "allowances": [{"name": "A", "amount": 5}, {"name": "a", "amount": 6}]},
           {"basic": 100, "deductions": [{"name": "Too much", "amount": 500}]},
           {"basic": 100, "allowances": [{"name": f"L{i}", "amount": 1} for i in range(13)]}]
    for body in bad:
        assert c.put(f"/payroll/staff/{t['user_id']}", json=body, headers=h).status_code in (400, 422), body
    # a student, a parent or another school's teacher never gets a salary
    student_id = c.get("/users", params={"role": "student"}, headers=h).json()[0]["id"]
    assert c.put(f"/payroll/staff/{student_id}", json={"basic": 100}, headers=h).status_code == 404
    assert c.put("/payroll/staff/999999", json={"basic": 100}, headers=h).status_code == 404


def test_salary_amounts_stay_out_of_the_activity_log(c, h):
    t = staff(c, h)["T002"]
    c.put(f"/payroll/staff/{t['user_id']}", json={"basic": 31234}, headers=h)
    rows = c.get("/school/audit", headers=h).json()
    mine = [x for x in rows if x["action"].startswith("payroll.")]
    assert mine and not any("31234" in (x.get("detail") or "") for x in mine)


# ---------------------------------------------------------------- a month from start to end
def test_prepare_edit_lock_pay(c, h):
    fresh_month(c, h)
    s = staff(c, h)
    c.put(f"/payroll/staff/{s['T001']['user_id']}", json={"basic": 30000, "allowances": [{"name": "House rent", "amount": 6000}],
                                                        "deductions": [{"name": "Provident fund", "amount": 3600}]}, headers=h)
    r = c.post("/payroll/runs", json={"month": THIS}, headers=h)
    assert r.status_code == 200, r.text
    run, slips = r.json()["run"], {p["login_id"]: p for p in r.json()["payslips"]}
    assert run["status"] == "draft" and run["people"] == len(slips) and run["lop_enabled"] is False
    p = slips["T001"]
    assert p["gross"] == 36000 and p["total_deductions"] == 3600 and p["net"] == 32400 and p["slip_no"] is None and p["lop_days"] == 0
    assert c.post("/payroll/runs", json={"month": THIS}, headers=h).status_code == 409          # one payroll a month

    # staff can't see a payslip while it is still a draft
    ht = login(c, "T001")
    assert all(x["month"] != THIS for x in c.get("/payroll/me", headers=ht).json()["payslips"])
    assert c.get(f"/payroll/payslips/{p['id']}", headers=ht).status_code == 404

    # this month's extras and unpaid days
    r = c.put(f"/payroll/payslips/{p['id']}", json={"lop_days": 1.5, "extra_earnings": [{"name": "Exam duty", "amount": 1000}],
                                                    "extra_deductions": [{"name": "Advance", "amount": 2000}], "note": "ok"}, headers=h)
    assert r.status_code == 200, r.text
    e = r.json()
    cut = round(36000 * 1.5 / e["days_in_month"])
    assert e["lop_amount"] == cut and e["gross"] == 37000 and e["total_deductions"] == 3600 + 2000 + cut and e["net"] == 37000 - 5600 - cut
    assert e["lop_manual"] is True
    assert c.put(f"/payroll/payslips/{p['id']}", json={"lop_days": 1.3}, headers=h).status_code == 400
    assert c.put(f"/payroll/payslips/{p['id']}", json={"lop_days": 40}, headers=h).status_code in (400, 422)
    assert c.put(f"/payroll/payslips/{p['id']}", json={"extra_deductions": [{"name": "Huge", "amount": 900000}]}, headers=h).status_code == 400
    assert c.get(f"/payroll/payslips/{p['id']}", headers=h).json()["payslip"]["net"] == e["net"]     # the refused edit changed nothing

    # recalculating picks up a new salary but keeps this month's hand-made lines
    c.put(f"/payroll/staff/{s['T001']['user_id']}", json={"basic": 32000, "allowances": [{"name": "House rent", "amount": 6000}]}, headers=h)
    r = c.post(f"/payroll/runs/{run['id']}/recalculate", headers=h)
    e = {x["login_id"]: x for x in r.json()["payslips"]}["T001"]
    assert e["basic"] == 32000 and e["lop_days"] == 1.5 and e["extra_earnings"][0]["name"] == "Exam duty" and e["deductions"] == []

    # nothing can be paid before locking
    pay = {"paid_on": str(today()), "mode": "bank", "reference": "NEFT1"}
    assert c.post(f"/payroll/payslips/{p['id']}/pay", json=pay, headers=h).status_code == 409
    r = c.post(f"/payroll/runs/{run['id']}/finalize", headers=h)
    assert r.status_code == 200, r.text
    locked = {x["login_id"]: x for x in r.json()["payslips"]}
    assert r.json()["run"]["status"] == "final" and locked["T001"]["slip_no"].startswith("GVPS-SAL/" + THIS.replace("-", "") + "/")
    assert len({x["slip_no"] for x in locked.values()}) == len(locked)
    # reopening and locking again keeps every payslip number with the same person
    assert c.post(f"/payroll/runs/{run['id']}/reopen", headers=h).status_code == 200
    assert all(x["month"] != THIS for x in c.get("/payroll/me", headers=ht).json()["payslips"])      # hidden again while open
    relocked = {x["login_id"]: x["slip_no"] for x in c.post(f"/payroll/runs/{run['id']}/finalize", headers=h).json()["payslips"]}
    assert relocked == {k: v["slip_no"] for k, v in locked.items()}
    # locked means locked
    assert c.put(f"/payroll/payslips/{p['id']}", json={"note": "x"}, headers=h).status_code == 409
    assert c.post(f"/payroll/runs/{run['id']}/recalculate", headers=h).status_code == 409
    assert c.delete(f"/payroll/runs/{run['id']}", headers=h).status_code == 409
    assert c.post(f"/payroll/runs/{run['id']}/finalize", headers=h).status_code == 409
    # a later change of salary or name does not touch a locked payslip
    c.put(f"/payroll/staff/{s['T001']['user_id']}", json={"basic": 99000}, headers=h)
    assert c.get(f"/payroll/payslips/{p['id']}", headers=h).json()["payslip"]["basic"] == 32000

    # payment rules
    assert c.post(f"/payroll/payslips/{p['id']}/pay", json={**pay, "mode": "bitcoin"}, headers=h).status_code == 400
    assert c.post(f"/payroll/payslips/{p['id']}/pay", json={**pay, "paid_on": str(today() + timedelta(days=1))}, headers=h).status_code == 400
    assert c.post(f"/payroll/payslips/{p['id']}/pay", json={**pay, "paid_on": str(today().replace(day=1) - timedelta(days=1))}, headers=h).status_code == 400
    r = c.post(f"/payroll/payslips/{p['id']}/pay", json=pay, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "paid" and r.json()["reference"] == "NEFT1"
    assert c.post(f"/payroll/payslips/{p['id']}/pay", json=pay, headers=h).status_code == 409
    assert c.post(f"/payroll/runs/{run['id']}/reopen", headers=h).status_code == 409             # a paid salary blocks reopening

    # the teacher now sees it, and only their own
    mine = c.get("/payroll/me", headers=ht).json()["payslips"]
    assert mine[0]["month"] == THIS and mine[0]["status"] == "paid" and all(x["user_id"] == s["T001"]["user_id"] for x in mine)
    assert c.get(f"/payroll/payslips/{p['id']}", headers=ht).status_code == 200
    other = locked["T002"]["id"]
    assert c.get(f"/payroll/payslips/{other}", headers=ht).status_code == 404
    assert c.post(f"/payroll/payslips/{other}/pay", json=pay, headers=ht).status_code == 403

    # pay everyone else at once, then nothing is left
    r = c.post(f"/payroll/runs/{run['id']}/pay", json={"paid_on": str(today()), "mode": "cash"}, headers=h)
    assert r.status_code == 200 and r.json()["paid"] == len(locked) - 1 and r.json()["run"]["unpaid_count"] == 0
    assert c.post(f"/payroll/runs/{run['id']}/pay", json={"paid_on": str(today()), "mode": "cash"}, headers=h).status_code == 409
    # the first payment was not overwritten by "pay all"
    assert c.get(f"/payroll/payslips/{p['id']}", headers=h).json()["payslip"]["mode"] == "bank"

    # undoing needs a reason and is recorded
    assert c.post(f"/payroll/payslips/{p['id']}/undo-payment", json={"reason": ""}, headers=h).status_code == 422
    r = c.post(f"/payroll/payslips/{p['id']}/undo-payment", json={"reason": "wrong person"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "unpaid" and r.json()["paid_on"] is None
    assert c.post(f"/payroll/payslips/{p['id']}/undo-payment", json={"reason": "again"}, headers=h).status_code == 409


def test_months_allowed(c, h):
    nxt = (today().replace(day=28) + timedelta(days=5))
    assert c.post("/payroll/runs", json={"month": f"{nxt.year:04d}-{nxt.month:02d}"}, headers=h).status_code == 400
    assert c.post("/payroll/runs", json={"month": "2019-01"}, headers=h).status_code == 400
    for bad in ("2026-13", "2026-1", "nope", ""):
        assert c.post("/payroll/runs", json={"month": bad}, headers=h).status_code == 422, bad


def test_other_schools_never_see_it(c, h):
    run = c.get("/payroll/runs", headers=h).json()["runs"][0]
    slip = c.get(f"/payroll/runs/{run['id']}", headers=h).json()["payslips"][0]
    a = admin(c)
    rows = c.get("/admin/schools", headers=a).json()
    two = next(x for x in rows if x["code"] == "DEMO02")
    r = c.put(f"/admin/schools/{two['id']}", json={"custom_modules": ["core", "payroll"]}, headers=a)
    assert r.status_code == 200, r.text
    h2 = login(c, "principal", "DEMO02")
    assert c.get("/payroll/staff", headers=h2).status_code == 200
    assert c.get(f"/payroll/runs/{run['id']}", headers=h2).status_code == 404
    assert c.get(f"/payroll/payslips/{slip['id']}", headers=h2).status_code == 404
    assert c.put(f"/payroll/payslips/{slip['id']}", json={"note": "x"}, headers=h2).status_code == 404
    assert c.post(f"/payroll/payslips/{slip['id']}/pay", json={"paid_on": str(today()), "mode": "cash"}, headers=h2).status_code == 404
    assert c.delete(f"/payroll/runs/{run['id']}", headers=h2).status_code == 404
    assert c.put(f"/payroll/staff/{slip['user_id']}", json={"basic": 5}, headers=h2).status_code == 404
    assert c.post("/payroll/runs", json={"month": THIS}, headers=h2).status_code == 400      # nobody has a salary there
    assert c.get("/payroll/runs", headers=h2).json()["runs"] == []
    # the platform admin has no way into a school's payroll
    for path in ("/payroll/staff", "/payroll/runs", f"/payroll/payslips/{slip['id']}"):
        assert c.get(path, headers=a).status_code == 403, path


# ---------------------------------------------------------------- pay cut for absence
def months_back(n):
    y, m = today().year, today().month - n
    while m < 1:
        y, m = y - 1, m + 12
    return f"{y:04d}-{m:02d}"


def test_absence_cut_uses_staff_attendance(c, h):
    """A finished month two months back: nothing else writes attendance there, so the count is the same on any day this runs."""
    import calendar
    from datetime import date

    from app.db import SessionLocal
    from app.models import User
    with SessionLocal() as db:                      # the demo accounts were made a moment ago: pretend they joined long before
        for u in db.query(User).filter(User.school_id == 1):
            u.created_at = u.created_at - timedelta(days=200)
        db.commit()
    month = months_back(2)
    y, m = int(month[:4]), int(month[5:])
    n = calendar.monthrange(y, m)[1]
    assert c.put("/payroll/config", json={"lop_enabled": True, "lop_basis": "working", "slip_prefix": "gv/sal"}, headers=h).json()["slip_prefix"] == "GV/SAL"
    s = staff(c, h)
    c.put(f"/payroll/staff/{s['T003']['user_id']}", json={"basic": 30000}, headers=h)
    c.put(f"/payroll/staff/{s['T004']['user_id']}", json={"basic": 30015, "deductions": [{"name": "Provident fund", "amount": 3600}]}, headers=h)
    for d in range(2, n + 1):                       # T003: present every day but the 1st. T004: never.
        assert c.post("/staff-attendance/manual", json={"user_id": s["T003"]["user_id"], "date": str(date(y, m, d)), "present": True}, headers=h).status_code == 200
    r = c.post("/payroll/runs", json={"month": month}, headers=h)
    assert r.status_code == 200, r.text
    run = r.json()["run"]
    slips = {p["login_id"]: p for p in r.json()["payslips"]}
    assert run["lop_enabled"] is True and run["lop_basis"] == "working" and run["working_days"] == n and run["counted_until"] == str(date(y, m, n))
    me = slips["T003"]
    day = int(30000 / n + 0.5)                      # one school day's pay, half a rupee rounded up
    assert me["absent_days"] == 1 and me["lop_days"] == 1 and me["lop_amount"] == day and me["net"] == 30000 - day
    assert slips["principal"]["absent_days"] == 0 and slips["principal"]["lop_days"] == 0       # the principal doesn't check in
    # absent all month with a fixed deduction: the cut is kept and stops at zero pay, it is never dropped
    gone = slips["T004"]
    assert gone["absent_days"] == n and gone["lop_days"] == n and gone["net"] == 0 and gone["lop_amount"] == 30015 - 3600
    assert all(p["net"] >= 0 for p in slips.values())
    # half a rupee rounds up, the same as the preview in the portal and the app (30015 / 30 days = 1000.5)
    if n == 30:
        r = c.put(f"/payroll/payslips/{gone['id']}", json={"lop_days": 1}, headers=h)
        assert r.json()["lop_amount"] == 1001, r.text
    # the principal forgives the day; working it out again keeps that decision
    r = c.put(f"/payroll/payslips/{me['id']}", json={"lop_days": 0}, headers=h)
    assert r.json()["lop_amount"] == 0 and r.json()["lop_manual"] is True and r.json()["absent_days"] == 1
    again = {p["login_id"]: p for p in c.post(f"/payroll/runs/{run['id']}/recalculate", headers=h).json()["payslips"]}["T003"]
    assert again["lop_days"] == 0 and again["net"] == 30000
    # switching the rule off stops the cut on the next calculation
    c.put("/payroll/config", json={"lop_enabled": False, "lop_basis": "calendar", "slip_prefix": "GVPS-SAL"}, headers=h)
    r = c.post(f"/payroll/runs/{run['id']}/recalculate", headers=h).json()
    assert r["run"]["lop_enabled"] is False and all(p["lop_days"] == 0 or p["lop_manual"] for p in r["payslips"])
    assert c.delete(f"/payroll/runs/{run['id']}", headers=h).status_code == 200


def test_today_is_not_counted_as_absent(c, h):
    """Preparing this month's payroll in the morning must not cut a day's pay from everyone who has not checked in yet."""
    fresh_month(c, h)
    c.put("/payroll/config", json={"lop_enabled": True, "lop_basis": "calendar", "slip_prefix": "GVPS-SAL"}, headers=h)
    try:
        s = staff(c, h)
        t = today()
        c.put(f"/payroll/staff/{s['T003']['user_id']}", json={"basic": 30000}, headers=h)
        for d in range(1, t.day):
            c.post("/staff-attendance/manual", json={"user_id": s["T003"]["user_id"], "date": str(t.replace(day=d)), "present": True}, headers=h)
        c.post("/staff-attendance/manual", json={"user_id": s["T003"]["user_id"], "date": str(t), "present": False}, headers=h)     # not in yet today
        r = c.post("/payroll/runs", json={"month": THIS}, headers=h).json()
        assert r["run"]["counted_until"] == (str(t - timedelta(days=1)) if t.day > 1 else None)
        me = {p["login_id"]: p for p in r["payslips"]}["T003"]
        assert me["absent_days"] == 0 and me["lop_amount"] == 0 and me["net"] == 30000
        assert c.delete(f"/payroll/runs/{r['run']['id']}", headers=h).status_code == 200
    finally:
        c.put("/payroll/config", json={"lop_enabled": False, "lop_basis": "calendar", "slip_prefix": "GVPS-SAL"}, headers=h)


def test_config_rules(c, h):
    for body in ({"lop_basis": "weekly"}, {"slip_prefix": ""}, {"slip_prefix": "has space"}, {"slip_prefix": "X" * 13}):
        assert c.put("/payroll/config", json=body, headers=h).status_code == 422, body
    h2 = login(c, "principal", "DEMO02")           # has payroll (previous test) but not staff attendance
    assert c.get("/payroll/config", headers=h2).json()["attendance_available"] is False
    assert c.put("/payroll/config", json={"lop_enabled": True}, headers=h2).status_code == 400


def test_staff_who_leave_are_paid_up_to_the_day_they_left(c, h):
    """Uses a finished month and a set leaving date, so it does not depend on today's date or the time of day."""
    import calendar
    from datetime import date, datetime

    from app.db import SessionLocal
    from app.models import User
    month = months_back(3)
    y, m = int(month[:4]), int(month[5:])
    n = calendar.monthrange(y, m)[1]
    s = staff(c, h)
    uid = s["T005"]["user_id"]
    c.put(f"/payroll/staff/{uid}", json={"basic": 30000}, headers=h)
    run = c.post("/payroll/runs", json={"month": month}, headers=h).json()
    slip = next(p for p in run["payslips"] if p["user_id"] == uid)
    assert slip["net"] == 30000 and slip["note"] == ""
    assert c.put(f"/payroll/payslips/{slip['id']}", json={"extra_earnings": [{"name": "Final dues", "amount": 5000}]}, headers=h).status_code == 200
    assert c.delete(f"/users/{uid}", headers=h).status_code == 200

    def leave(on):
        with SessionLocal() as db:
            db.get(User, uid).archived_at = on
            db.commit()
    try:
        assert "T005" not in staff(c, h)                                                      # no longer on the salary list
        # left on the 10th (noon in India): paid for 10 days, the hand-made line stays, the payslip says so
        leave(datetime(y, m, 10, 6, 30))
        kept = next(p for p in c.post(f"/payroll/runs/{run['run']['id']}/recalculate", headers=h).json()["payslips"] if p["user_id"] == uid)
        cut = int(30000 * (n - 10) / n + 0.5)
        assert kept["lop_days"] == n - 10 and kept["lop_amount"] == cut and kept["net"] == 35000 - cut
        assert kept["extra_earnings"] == [{"name": "Final dues", "amount": 5000}] and kept["note"].startswith("Left the school on 10 ")
        # the principal tries another number, then types the worked-out one again: it follows the leaving day once more
        assert c.put(f"/payroll/payslips/{slip['id']}", json={"lop_days": 3, "extra_earnings": kept["extra_earnings"], "note": kept["note"]}, headers=h).json()["lop_manual"] is True
        assert c.put(f"/payroll/payslips/{slip['id']}", json={"lop_days": n - 10, "extra_earnings": kept["extra_earnings"], "note": kept["note"]}, headers=h).json()["lop_manual"] is False
        # removing an already-removed person again (an edit from the people screen) does not move the leaving day
        assert c.put(f"/users/{uid}", json={"active": False}, headers=h).status_code == 200
        again = next(p for p in c.post(f"/payroll/runs/{run['run']['id']}/recalculate", headers=h).json()["payslips"] if p["user_id"] == uid)
        assert again["lop_days"] == n - 10
        # late evening UTC on the last day of the month before is already the 1st in India: still this month's payslip
        leave(datetime(y, m, 1, 0, 0) - timedelta(hours=2))
        first = next(p for p in c.post(f"/payroll/runs/{run['run']['id']}/recalculate", headers=h).json()["payslips"] if p["user_id"] == uid)
        assert first["lop_days"] == n - 1
        # left before the month began: not in this month at all
        leave(datetime(y, m, 1, 0, 0) - timedelta(days=3))
        assert not any(p["user_id"] == uid for p in c.post(f"/payroll/runs/{run['run']['id']}/recalculate", headers=h).json()["payslips"])
        # back with the school: full pay again and the note about leaving is gone
        leave(datetime(y, m, 10, 6, 30))
        c.post(f"/payroll/runs/{run['run']['id']}/recalculate", headers=h)
        assert c.post(f"/archive/user/{uid}/restore", headers=h).status_code == 200
        back = next(p for p in c.post(f"/payroll/runs/{run['run']['id']}/recalculate", headers=h).json()["payslips"] if p["user_id"] == uid)
        assert back["lop_days"] == 0 and back["net"] == 30000 and back["note"] == ""      # (the payslip was made afresh a step earlier)
    finally:
        c.post(f"/archive/user/{uid}/restore", headers=h)
        assert c.delete(f"/payroll/runs/{run['run']['id']}", headers=h).status_code == 200


def test_a_payslip_number_is_never_given_to_someone_else(c, h):
    month = months_back(4)
    s = staff(c, h)
    a, b = s["T001"]["user_id"], s["T002"]["user_id"]
    c.put(f"/payroll/staff/{b}", json={"basic": 0}, headers=h)                                 # T002 starts outside payroll
    run = c.post("/payroll/runs", json={"month": month}, headers=h).json()["run"]
    first = {p["login_id"]: p["slip_no"] for p in c.post(f"/payroll/runs/{run['id']}/finalize", headers=h).json()["payslips"]}
    top = max(first.values())
    holder = next(k for k, v in first.items() if v == top)
    assert c.post(f"/payroll/runs/{run['id']}/reopen", headers=h).status_code == 200
    c.put(f"/payroll/staff/{s[holder]['user_id']}", json={"basic": 0}, headers=h)             # the holder of the highest number drops out
    c.put(f"/payroll/staff/{b}", json={"basic": 21000}, headers=h)                            # and someone new comes in
    c.post(f"/payroll/runs/{run['id']}/recalculate", headers=h)
    second = {p["login_id"]: p["slip_no"] for p in c.post(f"/payroll/runs/{run['id']}/finalize", headers=h).json()["payslips"]}
    assert holder not in second and second["T002"] > top, (first, second)
    assert all(second[k] == v for k, v in first.items() if k in second)
    assert c.post(f"/payroll/runs/{run['id']}/reopen", headers=h).status_code == 200
    assert c.delete(f"/payroll/runs/{run['id']}", headers=h).status_code == 200
    c.put(f"/payroll/staff/{s[holder]['user_id']}", json={"basic": 30000}, headers=h)
    assert a


def test_read_only_school_cannot_change_payroll(c, h):
    a = admin(c)
    rows = c.get("/admin/schools", headers=a).json()
    one = next(x for x in rows if x["code"] == "DEMO01")
    past = str(today() - timedelta(days=60))
    assert c.put(f"/admin/schools/{one['id']}", json={"is_free": False, "valid_until": past, "trial_until": None, "grace_days": 0}, headers=a).status_code == 200
    try:
        assert c.get("/payroll/staff", headers=h).status_code == 200
        assert c.post("/payroll/runs", json={"month": THIS}, headers=h).status_code == 402
    finally:
        assert c.put(f"/admin/schools/{one['id']}", json={"is_free": True}, headers=a).status_code == 200


def test_upgrade_gives_payroll_to_the_top_plan_only(tmp_path):
    """A database made before payroll: the plan holding every other module gains it; smaller plans and custom schools don't."""
    import subprocess
    import sys

    db = tmp_path / "old.db"
    code = (
        "from app.migrate import migrate; migrate();"
        "from app.db import SessionLocal; from app.models import Plan, Meta; from app.perms import MODULES;"
        "db=SessionLocal(); old=[m for m in MODULES if m!='payroll'];"
        "db.add(Plan(name='Premium', modules=old)); db.add(Plan(name='Standard', modules=['core','fees']));"
        "db.get(Meta,'schema_version').value='9'; db.commit(); db.close();"
        "migrate(); db=SessionLocal();"
        "print({p.name: 'payroll' in p.modules for p in db.query(Plan)}, db.get(Meta,'schema_version').value)")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         env={**os.environ, "DATABASE_URL": f"sqlite:///{db}", "SEED_DEMO": "0"}, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert out.stdout.strip() == f"{{'Premium': True, 'Standard': False}} {SCHEMA_VERSION}", out.stderr


def test_upgrade_falls_back_to_the_biggest_plan(tmp_path):
    """If the Admin trimmed the plans so none has every module, the biggest one still gets payroll (the demo school is on it)."""
    import subprocess
    import sys

    db = tmp_path / "old2.db"
    code = (
        "from app.migrate import migrate; migrate();"
        "from app.db import SessionLocal; from app.models import Plan, Meta;"
        "db=SessionLocal(); db.add(Plan(name='Premium', modules=['core','fees','leaves'])); db.add(Plan(name='Basic', modules=['core']));"
        "db.get(Meta,'schema_version').value='9'; db.commit(); db.close();"
        "migrate(); migrate(); db=SessionLocal();"
        "print({p.name: p.modules.count('payroll') for p in db.query(Plan)})")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         env={**os.environ, "DATABASE_URL": f"sqlite:///{db}", "SEED_DEMO": "0"}, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert out.stdout.strip() == "{'Premium': 1, 'Basic': 0}", out.stderr



# ---------------------------------------------------------------- payroll in the Excel backup
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PAY_SHEETS = ["Payroll settings", "Salaries", "Salary lines", "Payroll months", "Payslips", "Payslip lines"]


def download(c, path, hh):
    from app.routers import data
    data._last_export.clear()                       # one backup per 20 seconds per school: not a limit these tests are about
    r = c.get(path, headers=hh)
    assert r.status_code == 200, r.text
    return r.content


def book(content):
    import io

    from openpyxl import load_workbook
    return load_workbook(io.BytesIO(content))


def rows(wb, name):
    ws = wb[name]
    head = [x.value for x in ws[1]]
    return [dict(zip(head, [c.value for c in r])) for r in ws.iter_rows(min_row=2)]


def save(wb):
    import io
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def send(c, hh, content, mode, confirm=False, path="/data/import"):
    data = {"mode": mode}
    if confirm:
        data.update(confirm="true", confirm_code="DEMO01", password="demo123")
    r = c.post(path, data=data, files={"file": ("b.xlsx", content, XLSX)}, headers=hh)
    assert r.status_code == 200, r.text
    return r.json()


def ensure_draft(c, h):
    """A month still being prepared, with this-month-only lines and hand-set unpaid days (made once, reused by later tests)."""
    month = months_back(5)
    run = next((r for r in c.get("/payroll/runs", headers=h).json()["runs"] if r["month"] == month), None)
    if run and run["status"] == "draft":
        return month
    if run:
        assert c.post(f"/payroll/runs/{run['id']}/reopen", headers=h).status_code == 200
        return month
    draft = c.post("/payroll/runs", json={"month": month}, headers=h).json()
    first = draft["payslips"][0]
    assert c.put(f"/payroll/payslips/{first['id']}", json={"lop_days": 1.5, "extra_earnings": [{"name": "Exam duty", "amount": 750.5}],
                                                          "extra_deductions": [{"name": "Advance", "amount": 1000}], "note": "check"},
                 headers=h).status_code == 200
    return month


def school_id():
    from app.db import SessionLocal
    from app.models import School
    with SessionLocal() as db:
        return db.query(School).filter(School.code == "DEMO01").one().id


def support_access(on: bool):
    from datetime import datetime

    from app.db import SessionLocal
    from app.models import School
    with SessionLocal() as db:
        db.query(School).filter(School.code == "DEMO01").one().support_access_until = datetime(2100, 1, 1) if on else None
        db.commit()


def snapshot_of_payroll(c, h):
    """Everything payroll holds, by employee code and month, so two schools' states can be compared."""
    staff_rows = c.get("/payroll/staff", headers=h).json()["rows"]
    out = {"config": {k: v for k, v in c.get("/payroll/config", headers=h).json().items() if k != "attendance_available"},
           "salaries": {r["login_id"]: {k: r["salary"][k] for k in ("basic", "allowances", "deductions", "note")} for r in staff_rows if r["salary"]},
           "months": {}}
    keep = ("slip_no", "name", "role", "basic", "allowances", "deductions", "extra_earnings", "extra_deductions", "absent_days", "lop_days",
            "lop_manual", "lop_amount", "gross", "total_deductions", "net", "note", "status", "paid_on", "mode", "reference")
    for run in c.get("/payroll/runs", headers=h).json()["runs"]:
        detail = c.get(f"/payroll/runs/{run['id']}", headers=h).json()
        out["months"][run["month"]] = {"status": run["status"], "days": run["days_in_month"], "working": run["working_days"],
                                       "lop": run["lop_enabled"], "basis": run["lop_basis"], "counted_until": run["counted_until"],
                                       "slips": {p["login_id"]: {k: p[k] for k in keep} for p in detail["payslips"]}}
    return out


def test_backup_has_payroll_but_template_and_admin_copy_do_not(c, h):
    wb = book(download(c, "/data/backup", h))
    for name in PAY_SHEETS:
        assert name in wb.sheetnames, name
    sal = rows(wb, "Salaries")
    assert len(sal) == c.get("/payroll/staff", headers=h).json()["with_salary"] and all(r["Basic pay ₹"] is not None for r in sal)
    assert {r["Type"] for r in rows(wb, "Salary lines")} == {"Allowance", "Deduction"}
    months = rows(wb, "Payroll months")
    assert months and {r["Status"] for r in months} <= {"draft", "final"}
    slips = rows(wb, "Payslips")
    assert slips and all(r["Month ref"] in {m["Ref"] for m in months} for r in slips)
    meta = {r["key"]: r["value"] for r in rows(wb, "_meta")}
    assert int(meta["payroll_rows"]) > 0
    assert any("salary" in str(r.get("Prangan") or "") for r in rows(wb, "Read me"))
    # the setup template never carries salaries
    assert not set(PAY_SHEETS) & set(book(download(c, "/data/template", h)).sheetnames)
    # nor does the platform admin's copy, even with support access
    a = admin(c)
    support_access(True)
    try:
        wa = book(download(c, f"/admin/schools/{school_id()}/data/backup", a))
        assert not set(PAY_SHEETS) & set(wa.sheetnames)
        assert int({r["key"]: r["value"] for r in rows(wa, "_meta")}["payroll_rows"]) == 0
    finally:
        support_access(False)


def test_replace_with_the_backup_brings_payroll_back_exactly(c, h):
    from datetime import datetime

    from app.db import SessionLocal
    from app.models import Meta, PayrollRun, User
    ensure_draft(c, h)
    # a month that was locked and reopened keeps its payslip numbers
    reopened = months_back(6)
    run = c.post("/payroll/runs", json={"month": reopened}, headers=h).json()["run"]
    numbered = {p["login_id"]: p["slip_no"] for p in c.post(f"/payroll/runs/{run['id']}/finalize", headers=h).json()["payslips"]}
    assert c.post(f"/payroll/runs/{run['id']}/reopen", headers=h).status_code == 200
    # someone who left long ago and so is not in that month
    with SessionLocal() as db:
        t4 = db.query(User).filter(User.school_id == school_id(), User.login_id == "T004").one()
        t4.active, t4.archived_at = False, datetime(2020, 5, 10, 6, 30)
        db.commit()
    c.post(f"/payroll/runs/{run['id']}/recalculate", headers=h)
    c.put("/payroll/config", json={"lop_enabled": False, "lop_basis": "working", "slip_prefix": "RT-SAL"}, headers=h)
    before = snapshot_of_payroll(c, h)
    def tops():
        """The highest payslip number given in each month (counter or numbers on the payslips): the next one comes after it."""
        with SessionLocal() as db:
            out = {}
            for r in db.query(PayrollRun).filter(PayrollRun.school_id == school_id()):
                m = db.get(Meta, f"payroll_seq:{r.id}")
                nums = [int(p["slip_no"].rsplit("/", 1)[-1]) for p in before["months"][r.month]["slips"].values() if p["slip_no"]]
                out[r.month] = max([int(m.value) if m else 0] + nums)
            return out
    seq_before = tops()
    content = download(c, "/data/backup", h)

    preview = send(c, h, content, "replace")
    assert preview["ok"] and preview["verified"], preview["errors"]
    assert not any("has no payroll" in w for w in preview["warnings"]), preview["warnings"]
    counts = {x["sheet"]: x for x in preview["sheets"]}
    assert counts["Salaries"]["add"] == len(rows(book(content), "Salaries")) and counts["Payroll months"]["add"] == len(before["months"])

    done = send(c, h, content, "replace", confirm=True)
    assert done["saved"], done
    after = snapshot_of_payroll(c, h)
    assert after == before
    assert tops() == seq_before                     # payslip numbers that were given never come back
    assert {k: v["slip_no"] for k, v in after["months"][reopened]["slips"].items()} == {k: v for k, v in numbered.items() if k != "T004"}
    # the person who left in 2020 is restored with that day, so working the month out again still leaves them out
    run2 = next(r for r in c.get("/payroll/runs", headers=h).json()["runs"] if r["month"] == reopened)
    again = c.post(f"/payroll/runs/{run2['id']}/recalculate", headers=h).json()
    assert "T004" not in {p["login_id"] for p in again["payslips"]}
    relocked = c.post(f"/payroll/runs/{run2['id']}/finalize", headers=h).json()["payslips"]
    assert {p["login_id"]: p["slip_no"] for p in relocked} == {k: v for k, v in numbered.items() if k != "T004"}
    # staff see their restored payslips
    mine = c.get("/payroll/me", headers=login(c, "T001", pw="demo123")).json()["payslips"] if c.post(
        "/auth/login", json={"school_code": "DEMO01", "login_id": "T001", "password": "demo123"}).status_code == 200 else None
    if mine is not None:
        assert all(p["run_status"] == "final" for p in mine)
    # the undo backup saved before Replace holds salaries: only the principal may download it
    assert c.get("/data/snapshot/file", headers=h).status_code == 200
    a = admin(c)
    support_access(True)
    try:
        r = c.get(f"/admin/schools/{school_id()}/data/snapshot/file", headers=a)
        assert r.status_code == 403 and "salaries" in r.json()["detail"] and "send" not in r.json()["detail"]
    finally:
        support_access(False)
        with SessionLocal() as db:
            t4 = db.query(User).filter(User.school_id == school_id(), User.login_id == "T004").one()
            t4.active, t4.archived_at = True, None
            db.commit()


def test_merge_adds_missing_months_and_never_doubles(c, h):
    ensure_draft(c, h)
    content = download(c, "/data/backup", h)
    before = snapshot_of_payroll(c, h)
    r = send(c, h, content, "merge", confirm=True)
    counts = {x["sheet"]: x for x in r["sheets"]}
    assert counts["Payroll months"]["add"] == 0 and counts["Payslips"]["add"] == 0 and counts["Salaries"]["add"] == 0
    assert sum("kept as it is in the app" in w for w in r["warnings"]) == len(before["months"])     # each kept month is named
    assert snapshot_of_payroll(c, h) == before
    # a month deleted in the app comes back from the backup, salaries changed since are put back as they were
    draft = next(m for m, x in before["months"].items() if x["status"] == "draft")
    run_id = next(r["id"] for r in c.get("/payroll/runs", headers=h).json()["runs"] if r["month"] == draft)
    assert c.delete(f"/payroll/runs/{run_id}", headers=h).status_code == 200
    t1 = staff(c, h)["T001"]
    c.put(f"/payroll/staff/{t1['user_id']}", json={"basic": 1}, headers=h)
    r = send(c, h, content, "merge", confirm=True)
    counts = {x["sheet"]: x for x in r["sheets"]}
    assert counts["Payroll months"]["add"] == 1 and counts["Salaries"]["update"] == 1
    assert snapshot_of_payroll(c, h) == before


def test_an_edited_backup_never_restores_payroll(c, h):
    wb = book(download(c, "/data/backup", h))
    ws = wb["Payslips"]
    head = [x.value for x in ws[1]]
    ws.cell(row=2, column=head.index("Net pay ₹") + 1, value=999999)       # someone raises their own pay in Excel
    edited = save(wb)
    r = send(c, h, edited, "merge")
    assert not r["verified"] and not any(x["sheet"] in PAY_SHEETS for x in r["sheets"])
    assert any("only restored from an unchanged backup" in w for w in r["warnings"])
    r = send(c, h, edited, "replace")
    assert not r["ok"] and any("isn't an unchanged backup" in e["message"] for e in r["errors"])


def test_payroll_rows_are_checked_like_the_payroll_screens(c, h, monkeypatch):
    """Even a file that passes the backup check is refused when its payroll doesn't add up (a file from an older or faulty server)."""
    from app import dataimport
    monkeypatch.setattr(dataimport.Book, "verified_for", lambda self, code: True)
    ensure_draft(c, h)
    base = download(c, "/data/backup", h)

    def broken(edit):
        wb = book(base)
        edit(wb)
        r = send(c, h, save(wb), "replace")         # preview only: nothing is saved
        assert not r["ok"]
        return " | ".join(f"{e['sheet']}: {e['message']}" for e in r["errors"])

    def cell(wb, sheet, row, header, value):
        ws = wb[sheet]
        head = [x.value for x in ws[1]]
        ws.cell(row=row, column=head.index(header) + 1).value = value       # (ws.cell(..., value=None) would leave the cell as it was)

    def first_row(wb, sheet, header, test):
        ws = wb[sheet]
        head = [x.value for x in ws[1]]
        for i, r in enumerate(ws.iter_rows(min_row=2), start=2):
            if test(r[head.index(header)].value):
                return i
        raise AssertionError(f"no row on {sheet}")

    assert "totals don't match" in broken(lambda wb: cell(wb, "Payslips", 2, "Net pay ₹", 999999))
    assert "no staff member or principal" in broken(lambda wb: cell(wb, "Payslips", 2, "Employee code", "NOBODY"))
    assert "no staff member or principal" in broken(lambda wb: cell(wb, "Salaries", 2, "Employee code", "2026001"))   # a student
    def lines_without_salary(wb):
        who = rows(wb, "Salary lines")[0]["Employee code"]
        cell(wb, "Salaries", first_row(wb, "Salaries", "Employee code", lambda v: v == who), "Employee code", None)
    msg = broken(lines_without_salary)
    assert "no row on the Salaries sheet" in msg and "Salaries: is required" in msg
    def pay_below_deductions(wb):
        who = next(r["Employee code"] for r in rows(wb, "Salary lines") if r["Type"] == "Deduction")
        i = first_row(wb, "Salaries", "Employee code", lambda v: v == who)
        cell(wb, "Salaries", i, "Basic pay ₹", 1)
        ws = wb["Salary lines"]                     # and no allowances either
        for r in list(ws.iter_rows(min_row=2)):
            if r[0].value == who and r[1].value == "Allowance":
                for x in r:
                    x.value = None
    assert "deductions are more than the pay" in broken(pay_below_deductions)
    assert "use Allowance" in broken(lambda wb: cell(wb, "Salary lines", 2, "Type", "Bonus"))

    def paid_in_draft(wb):
        draft_ref = next(r["Ref"] for r in rows(wb, "Payroll months") if r["Status"] == "draft")
        i = first_row(wb, "Payslips", "Month ref", lambda v: v == draft_ref)
        cell(wb, "Payslips", i, "Status", "paid")
        cell(wb, "Payslips", i, "How paid", "bank")
    assert "a paid salary needs a locked month" in broken(paid_in_draft)

    def same_number(wb):
        final_ref = next(r["Ref"] for r in rows(wb, "Payroll months") if r["Status"] == "final")
        mine = [r for r in rows(wb, "Payslips") if r["Month ref"] == final_ref]
        assert len(mine) >= 2
        i = first_row(wb, "Payslips", "Ref", lambda v: v == mine[1]["Ref"])
        cell(wb, "Payslips", i, "Payslip no.", mine[0]["Payslip no."])
    assert "used twice in the month" in broken(same_number)
    assert "don't fit this month" in broken(lambda wb: cell(wb, "Payroll months", 2, "Days in month", 40))
    assert "should end in a number" in broken(lambda wb: cell(wb, "Payslips", 2, "Payslip no.", "SAL/202601/²"))
    assert "doesn't follow from the unpaid days" in broken(lambda wb: cell(wb, "Payslips", 2, "Unpaid days", 3))
    assert "whole or half days" in broken(lambda wb: cell(wb, "Payslips", 2, "Unpaid days", 1.3))

    def paid_tomorrow(wb):
        i = first_row(wb, "Payslips", "Status", lambda v: v == "paid")
        cell(wb, "Payslips", i, "Paid on", str(today() + timedelta(days=1)))
    assert "a paid salary needs" in broken(paid_tomorrow)
    nxt = today().replace(day=28) + timedelta(days=5)
    assert "hasn't started" in broken(lambda wb: cell(wb, "Payroll months", 2, "Month (YYYY-MM)", f"{nxt.year:04d}-{nxt.month:02d}"))

    def same_month_twice(wb):
        ws = wb["Payroll months"]
        head = [x.value for x in ws[1]]
        ws.cell(row=3, column=head.index("Month (YYYY-MM)") + 1).value = ws.cell(row=2, column=head.index("Month (YYYY-MM)") + 1).value
    assert "appears twice" in broken(same_month_twice)
    assert "use YYYY-MM" in broken(lambda wb: cell(wb, "Payroll months", 2, "Month (YYYY-MM)", "2026-13"))
    assert "use Days in the month or School days" in broken(lambda wb: cell(wb, "Payroll settings", 3, "Value", "weekly"))


def test_replace_with_a_file_without_payroll_warns(c, h):
    from app.db import SessionLocal
    from app.models import PayrollRun, School
    from sqlalchemy import func, select
    r = send(c, h, download(c, "/data/template", h), "replace")             # preview of a setup template
    assert any("This file has no payroll" in w for w in r["warnings"]), r["warnings"]
    with SessionLocal() as db:                                               # a preview deletes nothing
        sid = db.scalar(select(School.id).where(School.code == "DEMO01"))
        assert db.scalar(select(func.count()).select_from(PayrollRun).where(PayrollRun.school_id == sid)) > 0


def test_the_platform_admin_can_neither_restore_nor_delete_payroll(c, h):
    content = download(c, "/data/backup", h)             # the principal's own backup, as if they sent it to support
    before = snapshot_of_payroll(c, h)
    a = admin(c)
    sid = school_id()
    support_access(True)
    try:
        t1 = staff(c, h)["T001"]
        c.put(f"/payroll/staff/{t1['user_id']}", json={"basic": 1}, headers=h)
        r = send(c, a, content, "merge", confirm=True, path=f"/admin/schools/{sid}/data/import")
        assert r["saved"] and any("only the principal can restore staff salaries" in w for w in r["warnings"])
        assert not any(x["sheet"] in PAY_SHEETS for x in r["sheets"])
        assert staff(c, h)["T001"]["salary"]["basic"] == 1                                    # not touched by the admin's import
        r = send(c, a, content, "replace", path=f"/admin/schools/{sid}/data/import")           # preview is refused too
        assert not r["ok"] and any("Only the principal can use Replace" in e["message"] for e in r["errors"])
        assert c.get("/payroll/runs", headers=h).json()["runs"]                                # nothing deleted
    finally:
        support_access(False)
        c.put(f"/payroll/staff/{staff(c, h)['T001']['user_id']}", json={k: before["salaries"]["T001"][k] for k in ("basic", "allowances", "deductions", "note")},
              headers=h)
