"""Students and parents in the app: the privacy notice, home, results, timetable and homework, and switching children."""
import re

import pytest
from playwright.sync_api import expect

from conftest import TODAY, call, go, sign_in_demo, token_for

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@pytest.mark.tc("TC-A-017", "Parent sees the privacy notice first and must agree")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_parent_must_agree_to_the_privacy_notice_first(phone):
    tok = token_for("9876500001")
    _, me = call("GET", "/auth/me", tok)
    sign_in_demo(phone, "Parent", "Two children")
    if me["consent_at"] is None:
        # TC-A-017.1 — The notice opens before anything else and Agree is off until the box is ticked
        expect(phone.get_by_text("Your privacy", exact=True)).to_be_visible()
        agree = phone.get_by_role("button", name="Agree and continue")
        expect(agree).to_be_disabled()
        # TC-A-017.2 — Ticking the box and agreeing opens the parent's home and is saved
        phone.get_by_role("checkbox", name="I am the parent/guardian and I agree").click()
        expect(agree).to_be_enabled()
        agree.click()
    expect(phone.get_by_role("tab", name="Home", exact=True)).to_have_attribute("aria-selected", "true")
    _, me = call("GET", "/auth/me", tok)
    assert me["consent_at"], "the agreement is saved on the server"
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-018", "Student home: attendance, homework due, results and notices")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_student_home_shows_their_own_numbers(phone):
    tok = token_for("2026001")
    _, me = call("GET", "/auth/me", tok)
    _, att = call("GET", "/me/attendance", tok)
    sign_in_demo(phone, "Student", "Results & homework")
    # TC-A-018.1 — Greets the student by first name
    expect(phone.get_by_text(re.compile(rf"^{re.escape(me['name'].split()[0])}"))).to_be_visible()
    # TC-A-018.2 — Attendance shows the same days as the server
    expect(phone.get_by_text(f"{att['present_days']} of {att['total_days']} days")).to_be_visible()
    # TC-A-018.3 — Homework due, results tile, today's classes and notices are shown
    expect(phone.get_by_text("Homework due")).to_be_visible()
    expect(phone.get_by_text("Today's classes")).to_be_visible()
    expect(phone.get_by_text("Notices", exact=True)).to_be_visible()
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-019", "Student results, timetable and homework tabs")
@pytest.mark.sanity
@pytest.mark.regression
def test_student_results_timetable_and_homework(phone):
    tok = token_for("2026001")
    _, cards = call("GET", "/me/marks", tok)
    _, slots = call("GET", "/timetable", tok)
    _, posts = call("GET", "/posts", tok, query={"kind": "homework"})
    sign_in_demo(phone, "Student", "Results & homework")
    # TC-A-019.1 — Results: the latest exam and each of its subjects with the score
    phone.get_by_role("tab", name="Results").click()
    if cards:
        latest = cards[0]
        expect(phone.get_by_text(re.compile(rf"^{re.escape(latest['exam'])}")).first).to_be_visible()
        for s in latest["subjects"][:3]:
            expect(phone.get_by_text(s["subject"], exact=True).first).to_be_visible()
    else:
        expect(phone.get_by_text("No results yet")).to_be_visible()
    # TC-A-019.2 — Timetable: the subjects of the class are listed
    phone.get_by_role("tab", name="Timetable").click()
    expect(phone.get_by_text("Timetable", exact=True).first).to_be_visible()
    if slots:
        expect(phone.get_by_text(slots[0]["subject_name"], exact=True).first).to_be_visible()
    # TC-A-019.3 — Homework: the class's homework titles are listed
    phone.get_by_role("tab", name="Homework").click()
    expect(phone.get_by_text("Homework", exact=True).first).to_be_visible()
    for p in posts[:2]:
        if not p.get("due_date") or p["due_date"] >= TODAY.isoformat():
            expect(phone.get_by_text(p["title"]).first).to_be_visible()
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-020", "Parent with two children switches between them")
@pytest.mark.sanity
@pytest.mark.regression
def test_parent_switches_between_two_children(phone):
    tok = token_for("9876500001")
    call("POST", "/auth/consent", tok)
    _, kids = call("GET", "/me/children", tok)
    assert len(kids) == 2
    sign_in_demo(phone, "Parent", "Two children")
    # TC-A-020.1 — Both children are offered; the first is shown
    for k in kids:
        expect(phone.get_by_text(k["name"].split()[0], exact=True).first).to_be_visible()
    expect(phone.get_by_text(kids[0]["name"], exact=True).first).to_be_visible()
    # TC-A-020.2 — Choosing the second child shows their name and their attendance
    phone.get_by_text(kids[1]["name"].split()[0], exact=True).first.click()
    expect(phone.get_by_text(kids[1]["name"], exact=True).first).to_be_visible()
    _, att = call("GET", "/me/attendance", tok, query={"student_id": kids[1]["id"]})
    expect(phone.get_by_text(f"{att['present_days']} of {att['total_days']} days")).to_be_visible()
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-021", "Signed-in students cannot open staff screens")
@pytest.mark.regression
def test_a_student_cannot_open_staff_screens(phone):
    sign_in_demo(phone, "Student", "Results & homework")
    # TC-A-021.1 — Typing a teacher or principal address sends the student back to their own home
    for path in ("/teacher/attendance", "/principal/people", "/more/student-access"):
        go(phone, path)
        expect(phone.get_by_role("tab", name="Results")).to_be_visible()
        assert "/teacher" not in phone.url and "/principal" not in phone.url and "student-access" not in phone.url, path
