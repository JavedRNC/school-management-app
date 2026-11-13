"""Phone layout, keyboard use, accessibility basics, read-only subscriptions, and what people see when something goes wrong."""
import re

import pytest

from conftest import TAG, _open, call, ok
from helpers import dialog, go, heading, no_sideways_scroll, tab, toast

SCHOOL_PAGES = [("/school", "E2E Test School"), ("/school/people", "People"), ("/school/classes", "Classes & subjects"), ("/school/timetable", "Timetable"), ("/school/attendance", "Attendance"),
                ("/school/exams", "Exams & marks"), ("/school/notices", "Notices & homework"), ("/school/calendar", "Calendar"), ("/school/leaves", "Leaves"), ("/school/staff", "Staff attendance"),
                ("/school/fees", "Fees"), ("/school/transport", "Transport"), ("/school/polls", "Polls & consent forms"), ("/school/banners", "Banners"), ("/school/data", "Import & export"),
                ("/school/settings", "Settings"), ("/school/activity", "Activity"), ("/account", "Account")]
ADMIN_PAGES = [("/admin", "Platform dashboard"), ("/admin/schools", "Schools"), ("/admin/requests", "School onboarding requests"), ("/admin/plans", "Plans & pricing"), ("/admin/banners", "Announcements"),
               ("/admin/updates", "App updates"), ("/admin/audit", "Activity log"), ("/account", "Account")]


def check_page(page, path, title):
    go(page, path)
    heading(page, title)
    page.locator(".skel").first.wait_for(state="detached")                         # loading has finished
    assert page.locator(".alert.bad").count() == 0, f"{path} shows an error"
    no_sideways_scroll(page)
    assert page.title().startswith(title), "each page names itself in the browser tab"
    # every box, list and switch that can be typed in or changed has a name a screen reader can say
    unnamed = page.evaluate("""() => [...document.querySelectorAll('main input, main select, main textarea, main button, main [role=switch]')].filter((e) => {
        if (e.type === 'hidden' || e.offsetParent === null) return false;
        const byLabel = e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`);
        return !(byLabel || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.closest('label') || (e.tagName === 'BUTTON' && e.textContent.trim()));
    }).map((e) => e.outerHTML.slice(0, 120))""")
    assert not unnamed, f"{path}: controls without a name: {unnamed}"


@pytest.mark.parametrize("path,title", SCHOOL_PAGES, ids=[p for p, _ in SCHOOL_PAGES])
def test_every_school_page_fits_a_phone_and_names_its_controls(principal_phone, seeded, path, title):
    check_page(principal_phone, path, title)


@pytest.mark.parametrize("path,title", ADMIN_PAGES, ids=[p for p, _ in ADMIN_PAGES])
def test_every_admin_page_fits_a_phone_and_names_its_controls(browser, admin, request, path, title):
    ctx, page = _open(browser, admin, phone=True)
    try:
        check_page(page, path, title)
        assert not page.problems, page.problems
    finally:
        ctx.close()


def test_phone_menu_reaches_every_page_and_forms_fill_the_screen(principal_phone, seeded):
    page = principal_phone
    go(page, "/school")
    heading(page, "E2E Test School")
    assert not page.locator("aside.side").is_visible(), "the side menu is replaced by the bottom bar on a phone"
    bar = page.locator("nav.bottomnav")
    bar.get_by_role("link", name="People").wait_for()
    bar.get_by_role("button", name="More pages").click()
    sheet = page.get_by_role("dialog", name="All pages")
    sheet.get_by_role("link", name="Transport").click()
    heading(page, "Transport")
    sheet.wait_for(state="detached")                                               # the sheet closes after choosing
    go(page, "/school/people")
    page.get_by_role("button", name="Add student").click()
    box = dialog(page).bounding_box()
    assert box["width"] >= 388, "a form uses the whole width of the phone"
    no_sideways_scroll(page)
    page.locator("td[data-label='Login ID']").first.wait_for()                     # tables become labelled cards


def test_forms_work_from_the_keyboard_and_keep_focus_inside(principal_page, seeded):
    page = principal_page
    go(page, "/school/classes")
    heading(page, "Classes & subjects")
    opener = page.get_by_role("button", name="Add class")
    opener.focus()
    page.keyboard.press("Enter")
    form = dialog(page)
    assert form.get_by_label("Class name").evaluate("e => e === document.activeElement"), "typing can start straight away"
    for _ in range(12):                                                            # Tab never leaves the open form
        page.keyboard.press("Tab")
        assert page.evaluate("document.activeElement.closest('[role=dialog]') !== null")
    page.keyboard.press("Escape")
    form.wait_for(state="detached")
    assert opener.evaluate("e => e === document.activeElement"), "focus returns to the button that opened the form"
    # tabs move with the arrow keys
    page.get_by_role("tab", name="Classes").focus()
    page.keyboard.press("ArrowRight")
    assert page.get_by_role("tab", name="Subjects", exact=True).get_attribute("aria-selected") == "true"
    page.keyboard.press("ArrowLeft")
    assert page.get_by_role("tab", name="Classes", exact=True).get_attribute("aria-selected") == "true"


def test_a_server_error_is_explained_and_try_again_recovers(principal_page, seeded):
    page = principal_page
    broken = {"on": True}

    def handler(route):
        if broken["on"]:
            route.fulfill(status=500, content_type="application/json", body='{"detail": "Internal Server Error"}')
        else:
            route.continue_()
    page.route(re.compile(r"/classes$"), handler)
    go(page, "/school/classes")
    alert = page.get_by_role("alert").filter(has_text="Internal Server Error")
    alert.wait_for()
    broken["on"] = False
    alert.get_by_role("button", name="Try again").click()
    page.locator(".tile", has_text=f"6-{TAG}").wait_for()
    page.problems.clear()


def test_losing_the_connection_while_saving_keeps_the_form_and_says_so(principal_page, seeded):
    page = principal_page
    go(page, "/school/classes")
    tab(page, "Subjects")
    page.get_by_role("button", name="Add subject").click()
    form = dialog(page)
    form.get_by_label("Subject name").fill(f"Offline {TAG}")
    page.route(re.compile(r"/subjects$"), lambda route: route.abort() if route.request.method == "POST" else route.continue_())
    form.get_by_role("button", name="Add subject").click()
    toast(page, "Can't reach the server")
    assert form.get_by_label("Subject name").input_value() == f"Offline {TAG}", "nothing typed is lost"
    assert form.get_by_role("button", name="Add subject").is_enabled(), "the button is ready for another try"
    page.unroute(re.compile(r"/subjects$"))
    form.get_by_role("button", name="Add subject").click()
    toast(page, f"Offline {TAG} added")
    page.problems.clear()


def test_double_clicking_save_creates_only_one(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/classes")
    tab(page, "Subjects")
    page.get_by_role("button", name="Add subject").click()
    form = dialog(page)
    form.get_by_label("Subject name").fill(f"Twice {TAG}")
    form.get_by_role("button", name="Add subject").dblclick()
    toast(page, f"Twice {TAG} added")
    form.wait_for(state="detached")
    names = [s["name"] for s in ok(call("GET", "/subjects", school["principal"]["token"]))]
    assert names.count(f"Twice {TAG}") == 1


def test_expired_subscription_makes_the_portal_read_only(browser, admin, school, seeded):
    sid = school["id"]
    old = ok(call("GET", f"/admin/schools/{sid}", admin["token"]))
    ok(call("PUT", f"/admin/schools/{sid}", admin["token"], {"is_free": False, "trial_until": "2020-01-01", "valid_until": "2020-01-31", "grace_days": 0}))
    ctx, page = _open(browser, school["principal"])
    try:
        go(page, "/school/people")
        heading(page, "People")
        page.get_by_role("note").filter(has_text="changes are switched off until it is renewed").wait_for()
        page.locator("td.primary-cell").first.wait_for()                           # everything can still be seen
        assert page.get_by_role("button", name="Add student").count() == 0 and page.get_by_role("button", name=re.compile("^Remove ")).count() == 0
        go(page, "/school/attendance")
        page.get_by_label("Class").select_option(label=f"6-{TAG}")
        assert page.get_by_role("button", name=re.compile(rf"^Aman Verma {TAG}: ")).is_disabled()
        status, data = call("POST", "/subjects", school["principal"]["token"], {"name": f"Blocked {TAG}"})
        assert status in (402, 403), f"the server refuses changes too ({status} {data})"
    finally:
        ctx.close()
        ok(call("PUT", f"/admin/schools/{sid}", admin["token"], {"is_free": True, "trial_until": old["trial_until"], "valid_until": old["valid_until"], "grace_days": old["grace_days"]}))
    assert ok(call("GET", "/school/me", school["principal"]["token"]))["can_write"] is True


def test_text_typed_by_people_is_never_run_as_code(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    evil = f'<img src=x onerror="window.__pwned=1">{TAG}'
    made = ok(call("POST", "/subjects", t, {"name": evil[:60]}))
    try:
        go(page, "/school/classes")
        tab(page, "Subjects")
        page.get_by_text(evil[:60]).wait_for()
        assert page.evaluate("window.__pwned") is None and page.locator("main img").count() == 0
    finally:
        call("DELETE", f"/subjects/{made['id']}", t)


def test_escape_closes_only_the_top_layer(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    ok(call("POST", "/fees/items", t, {"student_id": seeded["students"][2]["id"], "title": f"Badge {TAG}", "amount": 40}))
    go(page, "/school/fees")
    tab(page, "Students & dues")
    page.get_by_label("Search").fill(f"Chirag Rao {TAG}")
    page.get_by_role("link", name=f"Chirag Rao {TAG}").click()
    panel = page.get_by_role("dialog", name=f"Chirag Rao {TAG}")
    panel.get_by_role("button", name=f"Change amount of Badge {TAG}").click()
    box = page.get_by_role("dialog", name=f"Change Badge {TAG}")
    box.get_by_label("Reason").fill("typing here must not move the cursor away")
    assert box.get_by_label("Reason").evaluate("e => e === document.activeElement"), "focus stays in the box being typed in"
    page.keyboard.press("Escape")
    box.wait_for(state="detached")
    panel.get_by_text(f"Badge {TAG}").wait_for()                                   # the panel underneath is still open
    assert page.evaluate("document.body.style.overflow") == "hidden", "the page behind stays still while a panel is open"
    page.keyboard.press("Escape")
    panel.wait_for(state="detached")
    assert page.evaluate("document.body.style.overflow") == ""


def test_unsaved_attendance_is_not_lost_or_saved_under_another_day_by_accident(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/attendance")
    page.get_by_label("Class").select_option(label=f"6-{TAG}")
    student = page.get_by_role("button", name=re.compile(rf"^Chirag Rao {TAG}: "))
    student.click()
    page.get_by_text("You have changes that are not saved.").wait_for()
    page.get_by_role("button", name="Previous day").click()
    ask = dialog(page)
    ask.get_by_role("heading", name="Leave without saving?").wait_for()
    ask.get_by_role("button", name="Cancel").click()
    page.get_by_text("You have changes that are not saved.").wait_for()           # still on the same day with the change kept
    page.get_by_role("button", name="Previous day").click()
    dialog(page).get_by_role("button", name="Leave", exact=True).click()
    page.get_by_role("button", name="Today").wait_for()                            # now on the earlier day, loaded fresh


def test_new_vice_principal_starts_with_the_usual_limited_rights(principal_page, school):
    page = principal_page
    go(page, "/school/people")
    tab(page, "Vice principals")
    page.get_by_role("button", name="Add vice principal").click()
    form = dialog(page)
    pressed = lambda area, level: form.get_by_role("group", name=area, exact=True).get_by_role("button", name=level, exact=True).get_attribute("aria-pressed")  # noqa: E731
    assert pressed("Fees", "View") == "true" and pressed("Settings", "View") == "true" and pressed("People", "Edit") == "true"
    form.get_by_role("group", name="Fees", exact=True).get_by_role("button", name="Edit", exact=True).click()
    form.get_by_role("button", name="Reset to the usual rights").click()
    assert pressed("Fees", "View") == "true"
