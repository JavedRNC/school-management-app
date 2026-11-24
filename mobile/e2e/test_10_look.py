"""The default appearance (Chalk): colours, fonts and the sign-in screen."""
import pytest
import re

from playwright.sync_api import expect

from conftest import CHALK, WEB, bg_of, css, dismiss_popups, go, open_app, sign_in_demo


@pytest.mark.tc("TC-A-001", "Sign-in screen in the Chalk look")
@pytest.mark.smoke
@pytest.mark.regression
def test_sign_in_screen_uses_the_chalk_look(phone):
    open_app(phone)
    title = phone.get_by_text("Prangan", exact=True).first
    # TC-A-001.1 — Name in Hindi and English and the sign-in text are shown
    expect(phone.get_by_text("प्रांगण")).to_be_visible()
    expect(phone.get_by_text("Sign in with the details your school gave you.")).to_be_visible()
    # TC-A-001.2 — Paper ground, Bricolage and Mukta fonts
    assert bg_of(title) == CHALK["ground"]
    assert "Bricolage" in css(title, "font-family")
    assert "Mukta" in css(phone.get_by_text("Sign in with the details your school gave you."), "font-family")
    # TC-A-001.3 — Sign in is solid green
    sign_in = phone.get_by_role("button", name="Sign in", exact=True)
    expect(sign_in).to_be_visible()
    assert bg_of(sign_in.get_by_text("Sign in", exact=True)) == CHALK["green"]
    # TC-A-001.4 — Default theme when nothing was chosen
    assert phone.evaluate("localStorage.getItem('app_theme')") is None
    # TC-A-001.5 — Demo buttons and Register your school are shown
    for role in ["Principal", "Teacher", "Student", "Parent"]:
        expect(phone.get_by_role("button", name=re.compile(f"^Demo: {role},"))).to_be_visible()
    expect(phone.get_by_role("link", name="Register your school")).to_be_visible()


@pytest.mark.tc("TC-A-002", "Typed sign-in and a wrong password")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_typed_sign_in_and_a_wrong_password(phone):
    open_app(phone)
    boxes = phone.get_by_role("textbox")
    boxes.nth(0).fill("demo01")
    # TC-A-002.1 — School code is upper-cased as you type
    expect(boxes.nth(0)).to_have_value("DEMO01")            # school code is upper-cased as you type
    boxes.nth(1).fill("T001")
    boxes.nth(2).fill("wrong-password")
    phone.get_by_role("button", name="Sign in", exact=True).click()
    # TC-A-002.2 — A wrong password shows the message and stays on sign-in
    expect(phone.get_by_text("Wrong school code, login ID or password")).to_be_visible()
    assert "/teacher" not in phone.url
    # TC-A-002.3 — The right password opens the teacher home
    boxes.nth(2).fill("demo123")
    phone.get_by_role("button", name="Sign in", exact=True).click()
    phone.wait_for_url(re.compile(r"/teacher"))
    dismiss_popups(phone)
    expect(phone.get_by_text("Your class")).to_be_visible()


@pytest.mark.tc("TC-A-003", "Dark-mode phone gets dark Chalk")
@pytest.mark.regression
def test_a_phone_in_dark_mode_gets_dark_chalk(new_phone):
    page = new_phone(scheme="dark")
    open_app(page)
    # TC-A-003.1 — The ground is the dark Chalk colour
    assert bg_of(page.get_by_text("Prangan", exact=True).first) == CHALK["ground_dark"]


@pytest.mark.tc("TC-A-004", "Me → Appearance shows Chalk chosen")
@pytest.mark.sanity
@pytest.mark.regression
def test_me_shows_appearance_with_chalk_chosen(phone):
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    go(phone, "/teacher/profile")
    row = phone.get_by_text("Appearance", exact=True)
    expect(row).to_be_visible()
    # TC-A-004.1 — Appearance row says Chalk
    expect(phone.get_by_text("Chalk · follows your phone’s dark mode")).to_be_visible()
    row.click()
    group = phone.get_by_role("radiogroup", name="Appearance")
    expect(group).to_be_visible()
    radios = group.get_by_role("radio")
    # TC-A-004.2 — Three themes, Chalk selected
    expect(radios).to_have_count(3)
    expect(group.get_by_role("radio", name=re.compile("^Chalk\\."))).to_have_attribute("aria-checked", "true")
    expect(group.get_by_role("radio", name=re.compile("^Register\\."))).to_have_attribute("aria-checked", "false")
    expect(group.get_by_role("radio", name=re.compile("^Marigold Night\\."))).to_have_attribute("aria-checked", "false")


@pytest.mark.tc("TC-A-005", "Tab bar marks the open tab in green")
@pytest.mark.regression
def test_tab_bar_marks_the_open_tab_in_green(phone):
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    today = phone.get_by_role("tab", name="Today")
    # TC-A-005.1 — Today is selected and green
    expect(today).to_have_attribute("aria-selected", "true")
    expect(phone.get_by_role("tab", name="Attendance")).to_have_attribute("aria-selected", "false")
    assert css(today.get_by_text("Today", exact=True), "color") == CHALK["green"]
    # TC-A-005.2 — Tapping Attendance selects it
    phone.get_by_role("tab", name="Attendance").click()
    expect(phone.get_by_role("tab", name="Attendance")).to_have_attribute("aria-selected", "true")
    assert phone.url.startswith(WEB)
