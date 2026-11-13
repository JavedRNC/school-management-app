"""Platform admin: dashboard, schools, subscription, users, payments, plans, announcements, app updates, requests, activity."""
import datetime as dt
import time
import random
import re

from conftest import PARENT_PW, PRINCIPAL_PW, REMOTE, SCHOOL_CODE, TAG, TODAY, call, local_only, login, ok
from helpers import confirm, dialog, go, heading, sign_in, tab, toast


def open_school(page, school, section=None):
    go(page, f"/admin/schools/{school['id']}")
    heading(page, "E2E Test School")
    if section:
        tab(page, section)


def test_dashboard_numbers_come_from_the_server(admin_page, admin, school):
    page = admin_page
    go(page, "/admin")
    heading(page, "Platform dashboard")
    ov = ok(call("GET", "/admin/overview", admin["token"]))
    page.locator(".stat", has_text="Registered schools").get_by_text(str(ov["schools"]), exact=True).wait_for()
    page.locator(".stat", has_text="Students").first.wait_for()
    page.locator("svg.chart").first.wait_for()


def test_schools_list_search_filter_sort_and_export(admin_page, school):
    page = admin_page
    go(page, "/admin/schools")
    heading(page, "Schools")
    page.get_by_label("Search").fill(SCHOOL_CODE)
    page.get_by_role("link", name="E2E Test School").wait_for()
    page.get_by_text("1 school match").wait_for()
    assert "q=E2EQA1" in page.url, "the search is kept in the address so the list can be shared or reloaded"
    page.get_by_label("Status").select_option("suspended")
    page.get_by_text("No school matches").wait_for()
    page.get_by_label("Status").select_option("")
    page.get_by_label("Search").fill("zzzz-no-such-school")
    page.get_by_text("No school matches").wait_for()
    page.get_by_label("Search").fill("")
    header = page.get_by_role("columnheader", name="School")
    header.get_by_role("button").click()
    page.locator('th[aria-sort="descending"]').wait_for()
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export this list").click()
    assert dl.value.suggested_filename.endswith(".xlsx")


def test_add_school_form_checks_fields_and_refuses_a_used_code(admin_page, school):
    page = admin_page
    go(page, "/admin/schools")
    page.get_by_role("button", name="Add school").click()
    form = dialog(page)
    form.get_by_label("Temporary password").fill("short")
    form.get_by_label("School code").fill("a!")                                   # too short; the "!" is dropped as you type
    assert form.get_by_label("School code").input_value() == "A"
    form.get_by_role("button", name="Add school").click()
    for message in ("3 to 20 letters, digits or hyphens", "Enter the school name", "Enter the principal's name", "At least 8 characters"):
        form.get_by_role("alert").filter(has_text=message).wait_for()
    form.get_by_label("School code").fill(SCHOOL_CODE.lower())
    form.get_by_label("School name").fill("Copy Of The Test School")
    form.get_by_label("Principal's name").fill("Someone Else")
    form.get_by_label("Temporary password").fill("Start#12345")
    form.get_by_role("button", name="Add school").click()
    page.locator(".toast.bad").wait_for()                                          # the code is taken
    assert form.get_by_label("School name").input_value() == "Copy Of The Test School", "the form keeps what was typed"


@local_only
def test_add_school_and_first_sign_in_of_its_principal(admin_page, page):
    code = f"N{TAG}"
    go(admin_page, "/admin/schools")
    admin_page.get_by_role("button", name="Add school").click()
    form = dialog(admin_page)
    form.get_by_label("School code").fill(code)
    form.get_by_label("School name").fill(f"New School {TAG}")
    form.get_by_label("Principal's name").fill("Kavita Rao")
    form.get_by_role("button", name="Add school").click()
    made = dialog(admin_page)
    made.get_by_role("heading", name="School added").wait_for()
    password = re.search(r"Password: (\S+)", made.locator(".cred").inner_text()).group(1)
    made.get_by_role("button", name="Open the school").click()
    heading(admin_page, f"New School {TAG}")
    # the new principal signs in with the one-time password and must choose their own before anything else
    sign_in(page, code, "principal", password)
    page.wait_for_url(re.compile(r"#/account$"))
    assert page.get_by_role("navigation").count() == 0, "no menu until the password is changed"
    go(page, "/school/people")
    page.wait_for_url(re.compile(r"#/account$"))                                   # every other page sends them back
    page.get_by_label("Temporary password").fill(password)
    page.get_by_label("New password", exact=True).fill("Kavita#2026pw")
    page.get_by_label("New password again").fill("Kavita#2026pw")
    page.get_by_role("button", name="Save new password").click()
    page.wait_for_url(re.compile(r"#/school$"))
    heading(page, f"New School {TAG}")


def test_school_details_are_saved(admin_page, admin, school):
    page = admin_page
    open_school(page, school)
    note = f"e2e-run {TAG} {int(time.time())} checked"                            # keeps the marker that says this run is using the school
    page.get_by_label("Private notes (only admins see these)").fill(note)
    page.get_by_label("City / town").fill("Ranchi")
    page.get_by_label("PIN code").fill("83400x1")                                  # letters are dropped
    assert page.get_by_label("PIN code").input_value() == "834001"
    page.get_by_role("button", name="Save details").click()
    toast(page, "School details saved")
    assert ok(call("GET", f"/admin/schools/{school['id']}", admin["token"]))["admin_notes"] == note
    assert ok(call("GET", f"/admin/schools/{school['id']}/details", admin["token"]))["pin"] == "834001"
    page.get_by_label("School name").fill("")
    page.get_by_role("alert").filter(has_text="Enter the school name").wait_for()
    puts = []
    page.on("request", lambda r: puts.append(r.url) if r.method == "PUT" else None)
    page.get_by_role("button", name="Save details").click()
    page.wait_for_timeout(700)
    assert not puts, "pressing Save with an empty name sends nothing"
    assert ok(call("GET", f"/admin/schools/{school['id']}", admin["token"]))["name"] == "E2E Test School", "an empty name is never saved"


def test_suspending_a_school_blocks_sign_in_until_lifted(admin_page, admin, school):
    page = admin_page
    open_school(page, school)
    try:
        page.get_by_role("button", name="Suspend school").click()
        confirm(page, "Suspend school")
        toast(page, "School suspended")
        page.get_by_role("heading", name="This school is suspended").wait_for()
        status, data = login(SCHOOL_CODE, "principal", PRINCIPAL_PW)
        assert status == 403 and "suspended" in data["detail"]
        assert call("GET", "/school/me", school["principal"]["token"])[0] in (401, 403), "people already signed in are stopped too"
        page.get_by_role("button", name="Lift suspension").click()
        confirm(page, "Lift suspension")
        toast(page, "Suspension lifted")
    finally:
        ok(call("PUT", f"/admin/schools/{school['id']}", admin["token"], {"suspended": False}))
    assert login(SCHOOL_CODE, "principal", PRINCIPAL_PW)[0] == 200


def test_turning_a_feature_off_removes_it_from_the_schools_portal(admin_page, admin, school, browser):
    page = admin_page
    open_school(page, school, "Plan & subscription")
    try:
        page.get_by_label("Discount (%)").fill("150")
        page.get_by_role("alert").filter(has_text="Discount must be 0 to 100").wait_for()
        assert page.get_by_role("button", name="Save subscription").is_disabled()
        page.get_by_label("Discount (%)").fill("0")
        page.get_by_role("switch", name="Choose features by hand for this school").click()
        fees = page.get_by_role("button", name="Fees, receipts & UPI payments")
        assert fees.get_attribute("aria-pressed") == "true"
        fees.click()
        core = page.get_by_role("button", name="Core", exact=True)
        core.click()                                                              # Core can't be switched off
        assert core.get_attribute("aria-pressed") == "true"
        page.get_by_role("button", name="Save subscription").click()
        toast(page, "Subscription saved")
        me = ok(call("GET", "/school/me", school["principal"]["token"]))
        assert "fees" not in me["modules"] and "core" in me["modules"]
        assert call("GET", "/fees/summary", school["principal"]["token"])[0] == 403
        # the principal's portal: no Fees in the menu, and the address typed by hand explains why
        from conftest import _open
        ctx, pp = _open(browser, school["principal"])
        try:
            go(pp, "/school")
            heading(pp, "E2E Test School")
            assert pp.get_by_role("navigation", name="Main").first.get_by_role("link", name="Fees").count() == 0
            go(pp, "/school/fees")
            pp.get_by_text("Fees is not part of your plan").wait_for()
        finally:
            ctx.close()
    finally:
        ok(call("PUT", f"/admin/schools/{school['id']}", admin["token"], {"use_plan_modules": True, "discount_pct": 0}))
    assert "fees" in ok(call("GET", "/school/me", school["principal"]["token"]))["modules"]


def test_recording_a_payment_extends_the_paid_until_date(admin_page, admin, school):
    page = admin_page
    sid = school["id"]
    before = ok(call("GET", f"/admin/schools/{sid}", admin["token"]))["valid_until"]
    open_school(page, school, "Payments")
    page.get_by_role("button", name="Record a payment").click()
    form = dialog(page)
    form.get_by_label("Amount (₹)").fill("")
    assert form.get_by_role("button", name="Record payment").is_disabled()
    form.get_by_label("Amount (₹)").fill("4500")
    form.get_by_label("Period from (optional)").fill("2030-04-01")
    form.get_by_label("Period to (optional)").fill("2030-03-01")
    form.get_by_role("alert").filter(has_text="The period ends before it starts").wait_for()
    form.get_by_label("Period from (optional)").fill("")
    form.get_by_label("Period to (optional)").fill("")
    form.get_by_label("Reference").fill(f"UTR{TAG}")
    if REMOTE:
        # on the shared environment: a ₹1 entry that does not move the paid-until date, so runs don't add up
        form.get_by_label("Amount (₹)").fill("1")
        form.get_by_role("switch", name="Extend the paid-until date").click()
    form.get_by_role("button", name="Record payment").click()
    toast(page, "Payment recorded")
    page.locator("tr", has_text=f"UTR{TAG}").get_by_text("₹1" if REMOTE else "₹4,500", exact=True).wait_for()
    after = ok(call("GET", f"/admin/schools/{sid}", admin["token"]))["valid_until"]
    if REMOTE:
        assert after == before
    else:
        assert after and (before is None or after > before)


def test_users_are_protected_without_support_access_and_manageable_with_it(admin_page, admin, school):
    page = admin_page
    t = school["principal"]["token"]
    mobile = "95" + "".join(random.choices("0123456789", k=8))
    ok(call("POST", "/users", t, {"name": f"Parent Masked {TAG}", "login_id": mobile, "password": PARENT_PW, "role": "parent", "phone": mobile}))
    open_school(page, school, "Users")
    page.get_by_role("button", name="Show users").click()
    page.locator("td.primary-cell", has_text="Asha Tester").wait_for()
    # the principal can always be helped; what is hidden is locked and is never sent back to the server
    page.get_by_role("button", name="Edit Asha Tester").click()
    form = dialog(page)
    assert form.get_by_label("Phone").is_disabled()
    form.get_by_label("Full name").fill("Asha Tester")
    with page.expect_request(lambda r: r.method == "PUT" and "/users/" in r.url) as sent:
        form.get_by_role("button", name="Save changes").click()
    assert set(sent.value.post_data_json) <= {"name", "login_id"}, sent.value.post_data_json
    toast(page, "Asha Tester saved")
    page.get_by_label("Role").select_option("parent")
    row = page.locator("tr", has_text=f"Parent Masked {TAG}")
    row.wait_for()
    assert mobile not in row.inner_text(), "a parent's mobile number is hidden from the admin"
    assert row.get_by_role("button").count() == 0 and page.get_by_role("button", name="Add parent").count() == 0
    status, _ = call("POST", f"/admin/schools/{school['id']}/users", admin["token"], {"name": "Sneaky", "login_id": f"X{TAG}", "password": "Sneaky#123", "role": "teacher"})
    assert status == 403, "the server refuses too, not just the screen"
    tab(page, "Import & export")
    page.get_by_text("The school has not allowed support access").wait_for()
    # the principal allows support for 24 hours
    ok(call("POST", "/school/support-access", t, query={"hours": 24}))
    try:
        page.reload()
        heading(page, "E2E Test School")
        tab(page, "Users")
        page.get_by_text("Support access is on: you can add and change any account").wait_for()
        page.get_by_role("button", name="Show users").click()
        page.get_by_label("Role").select_option("teacher")
        page.get_by_role("button", name="Add teacher").click()
        form = dialog(page)
        form.get_by_label("Full name").fill(f"Helper Teacher {TAG}")
        form.get_by_label("Login ID").fill(f"T{TAG}H")
        form.get_by_role("button", name="Add account").click()
        shared = dialog(page)
        shared.get_by_role("heading", name="Share these sign-in details").wait_for()
        password = re.search(r"Password: (\S+)", shared.locator(".cred").inner_text()).group(1)
        shared.get_by_role("button", name="Done").click()
        assert login(SCHOOL_CODE, f"T{TAG}H", password, web=False)[0] == 200
        row = page.locator("tr", has_text=f"Helper Teacher {TAG}")
        row.get_by_role("button", name=f"Switch off Helper Teacher {TAG}").click()
        toast(page, "switched off")
        row.wait_for(state="detached")
        assert login(SCHOOL_CODE, f"T{TAG}H", password, web=False)[0] == 401
        page.get_by_label("Show").select_option(label="Switched off")              # still there, and can be switched on again
        row.get_by_text("Switched off").wait_for()
        row.get_by_role("button", name=f"Switch on Helper Teacher {TAG}").click()
        toast(page, "switched on")
        assert login(SCHOOL_CODE, f"T{TAG}H", password, web=False)[0] == 200
        tab(page, "Import & export")
        page.get_by_role("button", name="Get the template").wait_for()
    finally:
        ok(call("DELETE", "/school/support-access", t))


def test_plan_can_be_created_once_and_edited(admin_page, admin):
    page = admin_page
    go(page, "/admin/plans")
    heading(page, "Plans & pricing")
    page.locator("section.card").first.wait_for()
    if not any(p["name"] == "E2E Plan" for p in ok(call("GET", "/admin/plans", admin["token"]))):
        page.get_by_role("button", name="New plan").click()
        form = dialog(page)
        form.get_by_label("Plan name").fill("E2E Plan")
        form.get_by_label("Price per student a month (₹)").fill("0")
        form.get_by_role("alert").filter(has_text="Enter the price per student, or mark the plan as free").wait_for()
        assert form.get_by_role("button", name="Add plan").is_disabled()
        form.get_by_label("Price per student a month (₹)").fill("12")
        form.get_by_role("button", name="Add plan").click()
        toast(page, "E2E Plan plan added")
    price = random.randint(10, 99)
    page.get_by_role("button", name="Edit the E2E Plan plan").click()
    form = dialog(page)
    form.get_by_label("Price per student a month (₹)").fill(str(price))
    transport = form.get_by_role("button", name="Transport", exact=True)
    want = "false" if transport.get_attribute("aria-pressed") == "true" else "true"
    transport.click()
    form.get_by_role("button", name="Save changes").click()
    toast(page, "Plan saved")
    plan = [p for p in ok(call("GET", "/admin/plans", admin["token"])) if p["name"] == "E2E Plan"][0]
    assert plan["price_per_student"] == price and ("transport" in plan["modules"]) == (want == "true") and "core" in plan["modules"]
    page.locator("section.card", has_text="E2E Plan").get_by_text(f"₹{price}").wait_for()


def test_announcement_for_every_school(admin_page, admin):
    page = admin_page
    go(page, "/admin/banners")
    heading(page, "Announcements")
    page.get_by_role("button", name="New banner").click()
    form = dialog(page)
    form.get_by_label("Title").fill(f"Maintenance tonight {TAG}")
    form.get_by_label("Message (optional)").fill("The app will be slow from 11 pm to midnight.")
    form.get_by_label("Colour").select_option("red")
    form.get_by_label("Show until (optional)").fill(TODAY.isoformat())             # gone by tomorrow even if this run is cut short
    form.get_by_role("button", name="Show banner").click()
    toast(page, "Banner is live")
    try:
        card = page.locator(".tile", has_text=f"Maintenance tonight {TAG}")
        card.get_by_text("Showing now").wait_for()
        card.get_by_role("button", name=f"Edit Maintenance tonight {TAG}").click()
        dialog(page).get_by_label("Message (optional)").fill("Postponed to tomorrow.")
        dialog(page).get_by_role("button", name="Save changes").click()
        toast(page, "Banner saved")
        card.get_by_text("Postponed to tomorrow.").wait_for()
        card.get_by_role("button", name=f"Remove Maintenance tonight {TAG}").click()
        confirm(page, "Remove")
        toast(page, "Banner removed")
        card.wait_for(state="detached")
    finally:
        for b in ok(call("GET", "/admin/banners", admin["token"])):
            if TAG in b["title"]:
                call("DELETE", f"/admin/banners/{b['id']}", admin["token"])


def test_app_update_settings_validate_and_save(admin_page, admin):
    page = admin_page
    old = ok(call("GET", "/admin/app-version", admin["token"]))
    go(page, "/admin/updates")
    heading(page, "App updates")
    try:
        link = page.get_by_label("Download link (empty = the usual link)")
        link.fill("http://example.com/app.apk")
        page.get_by_role("alert").filter(has_text="The download link must start with https://").wait_for()
        assert page.get_by_role("button", name="Save update settings").is_disabled()
        link.fill(old["url"])
        page.get_by_label("Oldest build still allowed").fill("999999")
        page.get_by_role("alert").filter(has_text="can't be above the newest build").wait_for()
        assert page.get_by_role("button", name="Save update settings").is_disabled()
        page.get_by_label("Oldest build still allowed").fill(str(old["min_build"]))
        message = f"Checked by run {TAG}"
        page.get_by_label("Message shown with the update (optional)").fill(message)
        page.get_by_role("button", name="Save update settings").click()
        toast(page, "Update settings saved")
        assert ok(call("GET", "/admin/app-version", admin["token"]))["message"] == message
        assert ok(call("GET", "/app/version"))["message"] == message, "the app reads the same message"
    finally:
        ok(call("PUT", "/admin/app-version", admin["token"], {k: old[k] for k in ("auto_latest", "latest_build", "min_build", "message", "url")}))


def test_registration_request_is_reviewed_and_rejected_with_a_reason(page, admin_page, admin):
    mobile = "98" + "".join(random.choices("0123456789", k=8))
    name = f"Lotus Valley School {TAG}"
    go(page, "/register")
    page.get_by_role("button", name="Send request").click()                       # empty form: errors, nothing sent
    page.get_by_text("Enter the 6-digit PIN code.").wait_for()
    page.get_by_text("Please tick both boxes to send the request.").wait_for()
    page.get_by_label("School name").fill(name)
    page.get_by_label("Registration / affiliation / UDISE number").fill(f"BR-{TAG}")
    page.get_by_label("Address").fill("45 College Road")
    page.get_by_label("City / town").fill("Patna")
    page.get_by_label("District").fill("Patna")
    page.get_by_label("State").select_option("Bihar")
    page.get_by_label("PIN code").fill("800001")
    page.get_by_label("Your name").fill("Neha Sinha")
    page.get_by_label("Mobile number").fill(mobile)
    page.get_by_label("Email", exact=True).fill(f"office-{TAG.lower()}@lotusvalley.example")
    for box in page.get_by_role("checkbox").all():
        box.check()
    page.get_by_role("button", name="Send request").click()
    ref = page.get_by_test_id("reference").inner_text()
    assert re.fullmatch(r"PRN-\d{4}-[A-Z2-9]{8}", ref)
    # the status page needs the reference AND the mobile number used
    go(page, "/register/status")
    page.get_by_label("Reference number").fill(ref)
    page.get_by_label("Mobile number").fill("9000000000")
    page.get_by_role("button", name="Check status").click()
    page.get_by_text("No request matches").wait_for()
    # admin: note, then reject (a reason is required)
    go(admin_page, "/admin/requests")
    admin_page.get_by_label("Search").fill(f"BR-{TAG}")
    admin_page.get_by_role("link", name=name).click()
    admin_page.get_by_role("heading", name=name).wait_for()
    admin_page.get_by_label("Add an internal note").fill("Called twice, no answer")
    admin_page.get_by_role("button", name="Add note").click()
    admin_page.get_by_text("Called twice, no answer").wait_for()
    admin_page.get_by_role("button", name="Reject").click()
    box = dialog(admin_page)
    assert box.get_by_role("button", name="Reject").is_disabled()
    box.get_by_role("textbox").fill("Could not verify the school")
    box.get_by_role("button", name="Reject").click()
    admin_page.get_by_text("Rejected").first.wait_for()
    page.get_by_label("Mobile number").fill(mobile)
    page.get_by_role("button", name="Check status").click()
    page.get_by_text("Rejected", exact=True).wait_for()
    go(admin_page, "/admin/audit")
    heading(admin_page, "Activity log")
    admin_page.locator("tr", has_text=ref).first.wait_for()                       # this very request is in the trail
    page.problems.clear()                                                          # the 404 for the wrong mobile number is expected


def test_keyboard_go_to_box_jumps_between_pages(admin_page):
    page = admin_page
    go(page, "/admin")
    heading(page, "Platform dashboard")
    page.keyboard.press("Control+k")
    box = page.get_by_role("dialog", name="Go to a page")
    box.get_by_role("combobox").fill("pric")
    box.get_by_role("option", name=re.compile("Plans & pricing")).wait_for()
    page.keyboard.press("Enter")
    heading(page, "Plans & pricing")
    page.keyboard.press("Control+k")
    page.get_by_role("dialog", name="Go to a page").get_by_role("combobox").fill("qqqq")
    page.get_by_text('No page matches "qqqq"').wait_for()
    page.keyboard.press("Escape")
    page.get_by_role("dialog", name="Go to a page").wait_for(state="detached")
