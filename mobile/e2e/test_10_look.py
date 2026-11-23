"""The default appearance (Chalk): colours, fonts and the sign-in screen."""
import re

from playwright.sync_api import expect

from conftest import CHALK, WEB, bg_of, css, dismiss_popups, go, open_app, sign_in_demo


def test_sign_in_screen_uses_the_chalk_look(phone):
    open_app(phone)
    title = phone.get_by_text("Prangan", exact=True).first
    expect(phone.get_by_text("प्रांगण")).to_be_visible()
    expect(phone.get_by_text("Sign in with the details your school gave you.")).to_be_visible()
    # page ground, ink and fonts
    assert bg_of(title) == CHALK["ground"]
    assert "Bricolage" in css(title, "font-family")
    assert "Mukta" in css(phone.get_by_text("Sign in with the details your school gave you."), "font-family")
    # the one primary action is solid chalkboard green with white text
    sign_in = phone.get_by_role("button", name="Sign in", exact=True)
    expect(sign_in).to_be_visible()
    assert bg_of(sign_in.get_by_text("Sign in", exact=True)) == CHALK["green"]
    # nothing was chosen on this phone, so the default theme is in use
    assert phone.evaluate("localStorage.getItem('app_theme')") is None
    # demo accounts and registration stay reachable
    for role in ["Principal", "Teacher", "Student", "Parent"]:
        expect(phone.get_by_role("button", name=re.compile(f"^Demo: {role},"))).to_be_visible()
    expect(phone.get_by_role("link", name="Register your school")).to_be_visible()


def test_typed_sign_in_and_a_wrong_password(phone):
    open_app(phone)
    boxes = phone.get_by_role("textbox")
    boxes.nth(0).fill("demo01")
    expect(boxes.nth(0)).to_have_value("DEMO01")            # school code is upper-cased as you type
    boxes.nth(1).fill("T001")
    boxes.nth(2).fill("wrong-password")
    phone.get_by_role("button", name="Sign in", exact=True).click()
    expect(phone.get_by_text(re.compile("password", re.I)).last).to_be_visible()
    assert "/teacher" not in phone.url
    boxes.nth(2).fill("demo123")
    phone.get_by_role("button", name="Sign in", exact=True).click()
    phone.wait_for_url(re.compile(r"/teacher"))
    dismiss_popups(phone)
    expect(phone.get_by_text("Your class")).to_be_visible()


def test_a_phone_in_dark_mode_gets_dark_chalk(new_phone):
    page = new_phone(scheme="dark")
    open_app(page)
    assert bg_of(page.get_by_text("Prangan", exact=True).first) == CHALK["ground_dark"]


def test_me_shows_appearance_with_chalk_chosen(phone):
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    go(phone, "/teacher/profile")
    row = phone.get_by_text("Appearance", exact=True)
    expect(row).to_be_visible()
    expect(phone.get_by_text("Chalk · follows your phone’s dark mode")).to_be_visible()
    row.click()
    group = phone.get_by_role("radiogroup", name="Appearance")
    expect(group).to_be_visible()
    radios = group.get_by_role("radio")
    expect(radios).to_have_count(3)
    expect(group.get_by_role("radio", name=re.compile("^Chalk\\."))).to_have_attribute("aria-checked", "true")
    expect(group.get_by_role("radio", name=re.compile("^Register\\."))).to_have_attribute("aria-checked", "false")
    expect(group.get_by_role("radio", name=re.compile("^Marigold Night\\."))).to_have_attribute("aria-checked", "false")


def test_tab_bar_marks_the_open_tab_in_green(phone):
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    today = phone.get_by_role("tab", name="Today")
    expect(today).to_have_attribute("aria-selected", "true")
    expect(phone.get_by_role("tab", name="Attendance")).to_have_attribute("aria-selected", "false")
    assert css(today.get_by_text("Today", exact=True), "color") == CHALK["green"]
    phone.get_by_role("tab", name="Attendance").click()
    expect(phone.get_by_role("tab", name="Attendance")).to_have_attribute("aria-selected", "true")
    assert phone.url.startswith(WEB)
