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
    finally:
        assert c.post(f"/archive/user/{uid}/restore", headers=h).status_code == 200
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


def test_replace_import_warns_and_clears_payroll(c, h):
    from app.db import SessionLocal
    from app.models import PayrollRun, Payslip, SalaryStructure, School
    from sqlalchemy import func, select

    back = c.get("/data/backup", headers=h)
    assert back.status_code == 200, back.text
    files = {"file": ("b.xlsx", back.content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = c.post("/data/import", data={"mode": "replace"}, files=files, headers=h)        # no confirm = preview
    assert r.status_code == 200, r.text
    assert any("Payroll is not part of this file" in w for w in r.json().get("warnings", [])), r.json().get("warnings")
    with SessionLocal() as db:      # a preview deletes nothing
        sid = db.scalar(select(School.id).where(School.code == "DEMO01"))
        assert db.scalar(select(func.count()).select_from(SalaryStructure).where(SalaryStructure.school_id == sid)) > 0
        assert db.scalar(select(func.count()).select_from(PayrollRun).where(PayrollRun.school_id == sid)) > 0
        assert db.scalar(select(func.count()).select_from(Payslip).where(Payslip.school_id == sid)) > 0


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
    assert out.stdout.strip() == "{'Premium': True, 'Standard': False} 10", out.stderr


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
