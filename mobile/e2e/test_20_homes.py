"""Home screens in the default appearance: the principal's attendance card and the teacher's class card."""
import re

from playwright.sync_api import expect

from conftest import CHALK, bg_of, call, css, sign_in_demo, token_for


def test_principal_home_shows_todays_attendance_in_the_green_card(phone):
    tok = token_for("principal")
    _, dash = call("GET", "/dashboard", tok)
    sign_in_demo(phone, "Principal", "Insights & admin")
    expect(phone.get_by_role("tab", name="Insights")).to_have_attribute("aria-selected", "true")
    expect(phone.get_by_text("Dr. Meenakshi Rao")).to_be_visible()

    label = "Attendance today" if dash["today_is_school_day"] else "Last school day"
    heading = phone.get_by_text(re.compile(f"^{label}")).first
    expect(heading).to_be_visible()
    assert bg_of(heading) == CHALK["green"]

    pct = dash["overview"]["attendance_today_percent"]
    card = phone.get_by_label(re.compile(r"^Attendance (\d+ percent|not marked)"))
    expect(card).to_be_visible()
    if pct is not None:
        expect(phone.get_by_text(f"{round(pct)}%", exact=True).first).to_be_visible()
        assert "Bricolage" in css(phone.get_by_text(f"{round(pct)}%", exact=True).first, "font-family")
    # every class gets a line; classes that haven't marked are named, also for screen readers
    for c in dash["attendance_today"][:5]:
        expect(card.get_by_text(c["class_name"], exact=True)).to_be_visible()
    if dash["unmarked_classes"]:
        first = dash["unmarked_classes"][0]["class_name"]
        expect(card.get_by_text(re.compile(f"^Not marked: .*{re.escape(first)}"))).to_be_visible()
        assert "Not marked:" in (card.get_attribute("aria-label") or "")
    else:
        expect(card.get_by_text(re.compile(r"^All \d+ classes marked"))).to_be_visible()
    # the totals below the card
    for tile in ["Students", "Teachers", "Parents", "Classes"]:
        expect(phone.get_by_text(tile, exact=True).first).to_be_visible()


def test_teacher_home_shows_their_class_with_a_marigold_button(phone):
    tok = token_for("T001")
    _, me = call("GET", "/auth/me", tok)
    _, classes = call("GET", "/classes", tok)
    mine = next(c for c in classes if c["class_teacher_id"] == me["id"])
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    expect(phone.get_by_text("Your class")).to_be_visible()
    name = phone.get_by_text(mine["name"], exact=True).first
    expect(name).to_be_visible()
    assert bg_of(name) == CHALK["green"]
    expect(phone.get_by_text(f"{mine['student_count']} students")).to_be_visible()
    button = phone.get_by_role("button", name="Mark attendance")
    expect(button).to_be_visible()
    assert bg_of(button.get_by_text("Mark attendance")) == CHALK["marigold"]
    button.click()
    phone.wait_for_url(re.compile(r"/teacher/attendance"))
    expect(phone.get_by_text("Attendance", exact=True).first).to_be_visible()
