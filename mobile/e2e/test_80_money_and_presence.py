"""Fees for parents, payslips for staff, a teacher's GPS check-in, and a parent asking leave for a child."""
import datetime as dt
import json

import pytest
from playwright.sync_api import expect

from conftest import TODAY, call, go, sign_in_demo, token_for

SCHOOL_GATE = {"latitude": 23.3441, "longitude": 85.3096, "accuracy": 12}       # real GPS never reports 0 m


@pytest.mark.tc("TC-A-027", "Parent sees what is due and the payments made")
@pytest.mark.sanity
@pytest.mark.regression
def test_parent_fees_screen(phone):
    tok = token_for("9876500001")
    call("POST", "/auth/consent", tok)
    _, fees = call("GET", "/fees/me", tok)
    sign_in_demo(phone, "Parent", "Two children")
    go(phone, "/more/fees/my")
    # TC-A-027.1 — The screen names the child shown
    expect(phone.get_by_text("Fees", exact=True).first).to_be_visible()
    expect(phone.get_by_text(fees["student"]["name"]).first).to_be_visible()
    # TC-A-027.2 — Dues or 'Nothing due', and payments or 'No payments yet', match the server
    if not [i for i in fees.get("items", []) if i.get("balance", 0) > 0]:
        expect(phone.get_by_text("Nothing due")).to_be_visible()
    if not fees.get("payments"):
        expect(phone.get_by_text("No payments yet")).to_be_visible()
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-028", "Teacher sees their own payslips")
@pytest.mark.sanity
@pytest.mark.regression
def test_teacher_payslips(phone):
    _, mine = call("GET", "/payroll/me", token_for("T001"))
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    go(phone, "/more/payroll/my")
    # TC-A-028.1 — The latest locked month is shown, or 'No payslips yet'
    expect(phone.get_by_text("My payslips").first).to_be_visible()
    if mine["payslips"]:
        expect(phone.get_by_text(f"Latest: {mine['payslips'][0]['month_label']}")).to_be_visible()
    else:
        expect(phone.get_by_text("No payslips yet")).to_be_visible()
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-029", "Teacher checks in at the school gate with GPS")
@pytest.mark.sanity
@pytest.mark.regression
def test_teacher_checks_in_with_gps(browser):
    tok = token_for("T003")
    _, before = call("GET", "/staff-attendance/me", tok)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="Asia/Kolkata", locale="en-IN",
                              geolocation=SCHOOL_GATE, permissions=["geolocation"])
    page = ctx.new_page()
    page.set_default_timeout(15000)
    try:
        from conftest import WEB, dismiss_popups
        page.goto(WEB + "/")
        boxes = page.get_by_role("textbox")
        expect(boxes.first).to_be_visible()
        boxes.nth(0).fill("DEMO01")
        boxes.nth(1).fill("T003")
        boxes.nth(2).fill("demo123")
        page.get_by_role("button", name="Sign in", exact=True).click()
        page.wait_for_url(lambda u: "/teacher" in u, timeout=20000)
        dismiss_popups(page)
        record = (before.get("today") or {}).get("record") or {}
        if not record.get("check_in_at"):
            # TC-A-029.1 — Standing at the gate, Check in records today's arrival
            page.get_by_role("button", name="Check in").first.click()
            expect(page.get_by_text("Checked in ✓ Have a great day!")).to_be_visible(timeout=20000)   # several readings take a few seconds
            _, after = call("GET", "/staff-attendance/me", tok)
            got = (after.get("today") or {}).get("record") or {}
            assert got.get("check_in_at") and got.get("in_distance_m", 999) < 50, json.dumps(after)[:400]
        # TC-A-029.2 — The card then offers Check out
        expect(page.get_by_role("button", name="Check out").first).to_be_visible()
    finally:
        ctx.close()


@pytest.mark.tc("TC-A-030", "Parent asks leave for a child")
@pytest.mark.sanity
@pytest.mark.regression
def test_parent_asks_leave_for_a_child(phone):
    tok = token_for("9876500001")
    call("POST", "/auth/consent", tok)
    _, kids = call("GET", "/me/children", tok)
    day = TODAY + dt.timedelta(days=50)
    while day.weekday() == 6:
        day += dt.timedelta(days=1)
    reason = f"Doctor visit {TODAY.isoformat()}"
    try:
        sign_in_demo(phone, "Parent", "Two children")
        go(phone, "/more/leaves")
        # TC-A-030.1 — The parent's leave form is for the chosen child
        phone.get_by_role("button", name=f"Apply leave for {kids[0]['name'].split()[0]}").click()
        expect(phone.get_by_text(f"Leave for {kids[0]['name'].split()[0]}", exact=True)).to_be_visible()
        # TC-A-030.2 — Date and reason are sent; the class teacher's inbox gets it
        phone.get_by_role("textbox", name="Date").fill(day.isoformat())
        phone.get_by_label("Reason").fill(reason)
        phone.get_by_role("button", name="Send request").click()
        expect(phone.get_by_text(f"Leave request sent for {kids[0]['name'].split()[0]}")).to_be_visible()
        expect(phone.get_by_text(reason).first).to_be_visible()
        _, mine = call("GET", "/leaves", tok)
        req = next(x for x in mine if x["reason"] == reason)
        assert req["status"] == "pending" and req["user_name"] == kids[0]["name"]
    finally:
        _, mine = call("GET", "/leaves", tok)
        for x in mine:
            if x["reason"] == reason and x["status"] in ("pending", "approved"):
                call("POST", f"/leaves/{x['id']}/cancel", tok)
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-033", "A location that jumps while checking in is refused as fake")
@pytest.mark.sanity
@pytest.mark.regression
def test_a_jumping_location_is_refused(browser):
    tok = token_for("T004")
    _, before = call("GET", "/staff-attendance/me", tok)
    if ((before.get("today") or {}).get("record") or {}).get("check_in_at"):
        pytest.skip("T004 already checked in today")
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, timezone_id="Asia/Kolkata", locale="en-IN",
                              geolocation=SCHOOL_GATE, permissions=["geolocation"])
    page = ctx.new_page()
    page.set_default_timeout(15000)
    try:
        from conftest import WEB, dismiss_popups
        page.goto(WEB + "/")
        boxes = page.get_by_role("textbox")
        expect(boxes.first).to_be_visible()
        boxes.nth(0).fill("DEMO01")
        boxes.nth(1).fill("T004")
        boxes.nth(2).fill("demo123")
        page.get_by_role("button", name="Sign in", exact=True).click()
        page.wait_for_url(lambda u: "/teacher" in u, timeout=20000)
        dismiss_popups(page)
        # TC-A-033.1 — While the app takes its readings the phone "moves" 2 km in a second: the app is told it's a fake location
        page.get_by_role("button", name="Check in").first.click()
        page.wait_for_timeout(1300)
        ctx.set_geolocation({"latitude": SCHOOL_GATE["latitude"] + 0.018, "longitude": SCHOOL_GATE["longitude"], "accuracy": 12})
        expect(page.get_by_text("A fake-location app seems to be on. Turn it off to check in.").first).to_be_visible(timeout=20000)
        # TC-A-033.2 — Nothing is recorded and the attempt is in the principal's activity log
        _, after = call("GET", "/staff-attendance/me", tok)
        assert not ((after.get("today") or {}).get("record") or {}).get("check_in_at")
        _, log = call("GET", "/school/audit", token_for("principal"), query={"group": "attendance", "q": "T004"})
        assert any(x["action"] == "staff_attendance.fake_location" for x in log)
    finally:
        ctx.close()
