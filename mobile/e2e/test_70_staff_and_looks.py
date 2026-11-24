"""Teachers, the vice principal and the principal in the app, and the other two looks (Register, Marigold Night)."""
import datetime as dt
import re

import pytest
from playwright.sync_api import expect

from conftest import CHALK, TODAY, bg_of, call, css, go, sign_in_demo, token_for

NIGHT_SURFACE = "rgb(22, 31, 51)"          # Marigold Night card / tab-bar colour


def school_day(after: int) -> dt.date:
    """A weekday some days ahead (the demo school works Monday to Saturday)."""
    d = TODAY + dt.timedelta(days=after)
    while d.weekday() == 6:
        d += dt.timedelta(days=1)
    return d


@pytest.mark.tc("TC-A-022", "Teacher posts homework from the app")
@pytest.mark.sanity
@pytest.mark.regression
def test_teacher_posts_homework(phone):
    tok = token_for("T001")
    title = f"Exercise 5.{TODAY.day} from the app"
    try:
        sign_in_demo(phone, "Teacher", "Attendance & marks")
        go(phone, "/teacher/posts")
        # TC-A-022.1 — New homework opens the form; a title is required
        phone.get_by_role("button", name="New homework").click()
        expect(phone.get_by_text("Create post")).to_be_visible()
        phone.get_by_text("Homework", exact=True).last.click()
        phone.get_by_role("button", name="Post homework").click()
        expect(phone.get_by_text("Title is required")).to_be_visible()
        # TC-A-022.2 — With a title it is posted for the class and students see it
        phone.get_by_label("Title").fill(title)
        phone.get_by_label("Details").fill("Questions 1 to 10")
        phone.get_by_role("button", name="Post homework").click()
        expect(phone.get_by_text("Homework posted")).to_be_visible()
        expect(phone.get_by_text(title).first).to_be_visible()
        _, posts = call("GET", "/posts", tok, query={"kind": "homework"})
        mine = next(p for p in posts if p["title"] == title)
        assert mine["class_id"] and mine["due_date"]
    finally:
        _, posts = call("GET", "/posts", tok)
        for p in posts:
            if p["title"] == title:
                call("DELETE", f"/posts/{p['id']}", tok)
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-023", "Teacher asks for leave; the principal sees it to approve")
@pytest.mark.sanity
@pytest.mark.regression
def test_teacher_asks_for_leave(phone):
    tok = token_for("T001")
    day = school_day(45).isoformat()
    reason = f"Family function {TODAY.isoformat()}"
    try:
        sign_in_demo(phone, "Teacher", "Attendance & marks")
        go(phone, "/more/leaves")
        my = phone.get_by_role("button", name="My leaves")
        if my.count():
            my.first.click()
        # TC-A-023.1 — Apply for leave opens the form with the leave types
        phone.get_by_role("button", name="Apply for leave").click()
        expect(phone.get_by_text("Apply for leave").last).to_be_visible()
        # TC-A-023.2 — A date and reason are sent; the request is pending
        phone.get_by_role("textbox", name="Date").fill(day)
        phone.get_by_label("Reason").fill(reason)
        phone.get_by_role("button", name="Send request").click()
        expect(phone.get_by_text("Leave request sent")).to_be_visible()             # the server has answered
        expect(phone.get_by_text(reason).first).to_be_visible()
        _, mine = call("GET", "/leaves", tok, query={"scope": "mine"})
        req = next(x for x in mine if x["reason"] == reason)
        assert req["status"] == "pending" and req["start_date"] == day
        # TC-A-023.3 — The principal has it waiting for a decision
        _, inbox = call("GET", "/leaves", token_for("principal"), query={"scope": "inbox", "status": "pending"})
        assert any(x["id"] == req["id"] for x in inbox)
    finally:
        _, mine = call("GET", "/leaves", tok, query={"scope": "mine"})
        for x in mine:
            if x["reason"] == reason and x["status"] in ("pending", "approved"):
                call("POST", f"/leaves/{x['id']}/cancel", tok)
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-024", "Principal adds a student in the app")
@pytest.mark.sanity
@pytest.mark.regression
def test_principal_adds_a_student(phone):
    tok = token_for("principal")
    login_id = f"APP{TODAY.strftime('%d%H')}{dt.datetime.now().strftime('%M%S')}"
    try:
        sign_in_demo(phone, "Principal", "Insights & admin")
        go(phone, "/principal/people")
        # TC-A-024.1 — People opens on students; Add person asks for a name and login ID
        phone.get_by_role("button", name="Add person").click()
        expect(phone.get_by_text("Add person").last).to_be_visible()
        phone.get_by_role("button", name="Create account").click()
        expect(phone.get_by_text("Name is required")).to_be_visible()
        # TC-A-024.2 — A new student is created with a temporary password that is shown once
        phone.get_by_label("Full name").fill("App Added Student")
        phone.get_by_label(re.compile("Admission no")).fill(login_id)
        phone.get_by_role("button", name="Create account").click()
        expect(phone.get_by_text("Account created")).to_be_visible()
        _, users = call("GET", "/users", tok, query={"role": "student"})
        made = next(u for u in users if u["login_id"] == login_id)
        assert made["must_change_password"] is True and made["class_id"]
    finally:
        _, users = call("GET", "/users", tok, query={"role": "student"})
        for u in users:
            if u["login_id"] == login_id:
                call("DELETE", f"/users/{u['id']}", tok)


@pytest.mark.tc("TC-A-025", "Vice principal sees only what their rights allow")
@pytest.mark.sanity
@pytest.mark.regression
def test_vice_principal_rights_in_the_app(phone):
    _, vp = call("GET", "/auth/me", token_for("vp"))
    sign_in_demo(phone, "Vice Principal", "Limited admin")
    # TC-A-025.1 — The VP lands on the principal-style home
    expect(phone.get_by_role("tab", name="Insights")).to_be_visible()
    # TC-A-025.2 — Student data access is the principal's alone: the VP is sent back
    go(phone, "/more/student-access")
    expect(phone.get_by_role("tab", name="Insights")).to_be_visible()
    assert "student-access" not in phone.url
    assert vp["permissions"]["fees"] == "view"
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-026", "Register and Marigold Night looks can be chosen and are remembered")
@pytest.mark.sanity
@pytest.mark.regression
def test_register_and_night_looks(phone):
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    go(phone, "/teacher/profile")
    today_tab = phone.get_by_role("tab", name="Me")
    chalk_ink = css(today_tab.get_by_text("Me", exact=True), "color")
    assert chalk_ink == CHALK["green"]
    phone.get_by_text("Appearance", exact=True).click()
    group = phone.get_by_role("radiogroup", name="Appearance")
    # TC-A-026.1 — Register: saved on the phone, and the app redraws in its blue ink straight away
    group.get_by_role("radio", name=re.compile(r"^Register\.")).click()
    expect(group.get_by_role("radio", name=re.compile(r"^Register\."))).to_have_attribute("aria-checked", "true")
    assert phone.evaluate("localStorage.getItem('app_theme')") == "register"
    expect(phone.get_by_role("radio", name=re.compile(r"^Chalk\."))).to_have_attribute("aria-checked", "false")
    # TC-A-026.2 — Marigold Night: dark navy surfaces even on a light phone
    group.get_by_role("radio", name=re.compile(r"^Marigold Night\.")).click()
    expect(group.get_by_role("radio", name=re.compile(r"^Marigold Night\."))).to_have_attribute("aria-checked", "true")
    assert phone.evaluate("localStorage.getItem('app_theme')") == "night"
    phone.wait_for_timeout(600)
    assert bg_of(today_tab) == NIGHT_SURFACE
    # TC-A-026.3 — After a reload the chosen look is still in use
    phone.reload()
    expect(phone.get_by_role("tab", name="Me")).to_be_visible()
    phone.wait_for_timeout(800)
    assert bg_of(phone.get_by_role("tab", name="Me")) == NIGHT_SURFACE
    phone.evaluate("localStorage.removeItem('app_theme')")                    # back to the default for the other tests
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]
