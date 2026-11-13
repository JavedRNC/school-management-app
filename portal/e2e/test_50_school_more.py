"""Principal: dashboard, leaves, staff attendance, transport, polls, banners, settings, activity, import & export."""
import datetime as dt
import re

from conftest import SCHOOL_CODE, TAG, call, login, ok
from helpers import confirm, dialog, go, heading, tab, toast

TODAY = dt.date.today()


def staff_token(seeded, n=0):
    """A teacher signs in from the phone app for the first time (chooses a password, accepts the notice)."""
    code = f"T{TAG}{('One', 'Two')[n]}"
    first = login(SCHOOL_CODE, code, "Teach#12345", web=False)
    if first[0] == 200:
        token = ok(call("POST", "/auth/password", first[1]["token"], {"old_password": "Teach#12345", "new_password": "Teach#67890"}))["token"]
        call("POST", "/auth/consent", token)
        return token
    return ok(login(SCHOOL_CODE, code, "Teach#67890", web=False))["token"]


def test_dashboard_shows_the_schools_numbers_and_links_to_work(principal_page, school, seeded):
    page = principal_page
    go(page, "/school")
    heading(page, "E2E Test School")
    d = ok(call("GET", "/dashboard", school["principal"]["token"]))
    page.locator(".stat", has_text="Students").get_by_text(f"{d['overview']['classes']} classes").wait_for()
    page.locator(".stat", has_text="Students").locator(".value").get_by_text(str(d["overview"]["students"]), exact=True).wait_for()
    page.get_by_role("navigation", name="Quick actions").get_by_role("link", name="Mark attendance").click()
    heading(page, "Attendance")


def test_leave_request_is_approved_and_another_rejected_with_a_reason(principal_page, school, seeded):
    page = principal_page
    tt = staff_token(seeded)
    d1, d2 = (TODAY + dt.timedelta(days=20)).isoformat(), (TODAY + dt.timedelta(days=27)).isoformat()
    ok(call("POST", "/leaves", tt, {"leave_type": "casual", "start_date": d1, "reason": f"Family function {TAG}"}))
    ok(call("POST", "/leaves", tt, {"leave_type": "sick", "start_date": d2, "reason": f"Dental visit {TAG}"}))
    go(page, "/school/leaves")
    heading(page, "Leaves")
    first = page.locator(".tile", has_text=f"Family function {TAG}")
    first.get_by_role("button", name="Approve").click()
    dialog(page).get_by_role("button", name="Approve leave").click()
    toast(page, f"Leave approved for Teacher One {TAG}")
    first.wait_for(state="detached")
    second = page.locator(".tile", has_text=f"Dental visit {TAG}")
    second.get_by_role("button", name="Reject").click()
    box = dialog(page)
    assert box.get_by_role("button", name="Reject leave").is_disabled(), "rejecting needs a reason"
    box.get_by_label("Reason for rejecting").fill("Exam duty that week")
    box.get_by_role("button", name="Reject leave").click()
    toast(page, "Leave rejected")
    tab(page, "All requests")
    page.locator(".tile", has_text=f"Family function {TAG}").get_by_text("approved", exact=True).wait_for()
    done = page.locator(".tile", has_text=f"Dental visit {TAG}")
    done.get_by_text("rejected", exact=True).wait_for()
    done.get_by_text("Exam duty that week").wait_for()
    assert done.get_by_role("button", name="Approve").count() == 0, "a decided request can't be decided again"
    bal = ok(call("GET", "/leaves/balance", tt))
    assert [x["used"] for x in bal["types"] if x["type"] == "casual"] == [1]


def test_leave_allowance_validates_and_saves(principal_page, school):
    page = principal_page
    go(page, "/school/leaves")
    tab(page, "Staff leave allowance")
    casual = page.get_by_label("Casual leave")
    casual.fill("400")
    page.get_by_role("alert").filter(has_text="At most 365").wait_for()
    assert page.get_by_role("button", name="Save allowance").is_disabled()
    casual.fill("14")
    page.get_by_role("button", name="Save allowance").click()
    toast(page, "Leave allowance saved")
    assert ok(call("GET", "/school/leave-quotas", school["principal"]["token"]))["casual"] == 14


def test_staff_attendance_location_and_marking_by_hand(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/staff")
    heading(page, "Staff attendance")
    tab(page, "School location")
    page.get_by_label("Latitude").fill("123")                                      # not a real latitude
    page.get_by_label("Longitude").fill("85.3096")
    page.get_by_role("alert").filter(has_text="Enter a valid latitude").wait_for()
    assert page.get_by_role("button", name="Save location").is_disabled()
    page.get_by_label("Latitude").fill("23.3441")
    page.get_by_label("Allowed distance (metres)").fill("10")
    page.get_by_role("alert").filter(has_text="Distance must be 50 to 1000 metres").wait_for()
    page.get_by_label("Allowed distance (metres)").fill("200")
    page.get_by_label("Late after").fill("08:30")
    page.get_by_role("button", name="Save location").click()
    toast(page, "School location saved")
    geo = ok(call("GET", "/staff-attendance/settings", school["principal"]["token"]))
    assert geo["radius_m"] == 200 and geo["late_after"] == "08:30" and geo["configured"] is True
    # mark a teacher present by hand, then absent again
    tab(page, "Day")
    row = page.locator(".list .item", has_text=f"Teacher Two {TAG}")
    row.get_by_role("button", name=f"Mark Teacher Two {TAG} present").click()
    toast(page, f"Teacher Two {TAG} marked present")
    row.get_by_text("marked by hand").wait_for()
    row.get_by_role("button", name=f"Mark Teacher Two {TAG} absent").click()
    toast(page, f"Teacher Two {TAG} marked absent")
    tab(page, "Monthly report")
    page.locator("tr", has_text=f"Teacher Two {TAG}").wait_for()


def test_transport_vehicle_route_students_and_guard_rails(principal_page, school, seeded):
    page = principal_page
    number = f"JH01 {TAG}"
    go(page, "/school/transport")
    heading(page, "Transport")
    tab(page, "Vehicles & drivers")
    page.get_by_role("button", name="Add vehicle").click()
    form = dialog(page)
    form.get_by_label("Seats").fill("0")
    form.get_by_role("button", name="Add vehicle").click()
    form.get_by_role("alert").filter(has_text="Enter the registration number").wait_for()
    form.get_by_role("alert").filter(has_text="1 to 120 seats").wait_for()
    form.get_by_label("Registration number").fill(number)
    form.get_by_label("Seats").fill("2")
    form.get_by_label("Driver name").fill("Ramesh Yadav")
    form.get_by_label("Insurance valid until").fill((TODAY + dt.timedelta(days=10)).isoformat())     # expires soon
    form.get_by_role("button", name="Add vehicle").click()
    toast(page, f"{number} added")
    page.locator(".card", has_text=number).get_by_text("Renew soon").wait_for()
    page.get_by_text(f"Papers expiring within 30 days: {number} (Insurance)").wait_for()
    # a route with two stops
    tab(page, "Routes & stops")
    page.get_by_role("button", name="Add route").click()
    form = dialog(page)
    form.get_by_role("button", name="Add route").click()
    form.get_by_role("alert").filter(has_text="Give the route a name").wait_for()
    form.get_by_label("Route name").fill(f"Route {TAG}")
    form.get_by_label("Vehicle").select_option(label=f"{number} · 2 seats")
    form.get_by_label("Stop 1", exact=True).fill("Main Gate")
    form.get_by_label("Pick-up").fill("07:10")
    form.get_by_role("button", name="Add stop").click()
    form.get_by_label("Stop 2", exact=True).fill("Market Chowk")
    form.get_by_role("button", name="Add route").click()
    toast(page, f"Route {TAG} added")
    page.locator(".card", has_text=f"Route {TAG}").get_by_text("Market Chowk").wait_for()
    # put two students on it
    tab(page, "Students")
    page.get_by_role("button", name="Put students on a route").click()
    form = dialog(page)
    form.get_by_label("Route").select_option(label=f"Route {TAG}")
    form.get_by_label("Stop").select_option(label="Main Gate")
    form.get_by_label("Pick students from class").select_option(label=f"6-{TAG}")
    form.get_by_role("button", name=f"Aman Verma {TAG}").click()
    form.get_by_role("button", name=f"Bina Das {TAG}").click()
    form.get_by_role("button", name="Save 2 students").click()
    toast(page, f"2 students put on Route {TAG}")
    page.get_by_label("Route").select_option(label=f"Route {TAG}")
    page.locator("tr", has_text=f"Bina Das {TAG}").get_by_text("Main Gate").wait_for()
    # a route that students use can't be removed
    tab(page, "Routes & stops")
    page.get_by_role("button", name=f"Remove Route {TAG}").click()
    dialog(page).get_by_text("2 students use this route").wait_for()
    confirm(page, "Remove")
    toast(page, "student(s) use this route")
    page.locator(".card", has_text=f"Route {TAG}").wait_for()
    tab(page, "Students")
    page.get_by_label("Route").select_option(label=f"Route {TAG}")
    for name in (f"Aman Verma {TAG}", f"Bina Das {TAG}"):
        page.get_by_role("button", name=f"Take {name} off transport").click()
        toast(page, f"{name} taken off transport")
    page.get_by_text("No students on transport here").wait_for()


def test_poll_and_consent_form_from_creation_to_results(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    go(page, "/school/polls")
    heading(page, "Polls & consent forms")
    page.get_by_role("button", name="New poll or form").click()
    form = dialog(page)
    form.get_by_label("Type").select_option("poll")
    form.get_by_role("button", name="Parents").click()                             # nobody chosen to answer
    form.get_by_role("button", name="Send").click()
    for message in ("Write the question", "A poll needs at least 2 choices", "Choose who should answer"):
        form.get_by_role("alert").filter(has_text=message).wait_for()
    form.get_by_label("Question").fill(f"Best day for the fair {TAG}")
    form.get_by_label("Choice 1", exact=True).fill("Saturday")
    form.get_by_label("Choice 2", exact=True).fill("Sunday")
    form.get_by_role("button", name="Teachers").click()
    form.get_by_role("button", name="Send").click()
    toast(page, "Poll sent")
    card = page.locator(".card", has_text=f"Best day for the fair {TAG}")
    card.get_by_text("Open", exact=True).wait_for()
    # a teacher answers from the app
    poll = [p for p in ok(call("GET", "/polls", t)) if p["title"] == f"Best day for the fair {TAG}"][0]
    ok(call("POST", f"/polls/{poll['id']}/respond", staff_token(seeded), {"choices": [1], "comment": "Sunday suits most"}))
    card.get_by_role("button", name=f"See answers to Best day for the fair {TAG}").click()
    panel = dialog(page)
    panel.locator(".item", has_text=f"Teacher One {TAG}").get_by_text("Sunday", exact=True).wait_for()
    panel.get_by_text('"Sunday suits most"').wait_for()
    panel.get_by_role("tab", name=re.compile("^Not yet")).click()
    panel.get_by_text(f"Teacher Two {TAG}").wait_for()
    panel.get_by_role("button", name="Close now").click()
    confirm(page, "Close")
    toast(page, "Closed")
    assert call("POST", f"/polls/{poll['id']}/respond", staff_token(seeded, 1), {"choices": [0]})[0] == 409, "a closed poll takes no more answers"
    dialog(page).get_by_role("button", name="Remove").click()
    confirm(page, "Remove")
    toast(page, "Removed")
    card.wait_for(state="detached")


def test_banner_lifecycle_with_preview_and_date_check(principal_page, school):
    page = principal_page
    go(page, "/school/banners")
    heading(page, "Banners")
    page.get_by_role("button", name="New banner").click()
    form = dialog(page)
    form.get_by_label("Picture link (optional)").fill("http://insecure.example/pic.png")
    form.get_by_label("Show from (optional)").fill("2030-05-10")
    form.get_by_label("Show until (optional)").fill("2030-05-01")
    form.get_by_role("button", name="Show banner").click()
    for message in ("Add a title", "The picture link must start with https://", "The last day is before the first day"):
        form.get_by_role("alert").filter(has_text=message).wait_for()
    form.get_by_label("Picture link (optional)").fill("")
    form.get_by_label("Show from (optional)").fill("")
    form.get_by_label("Show until (optional)").fill((TODAY + dt.timedelta(days=5)).isoformat())
    form.get_by_label("Title").fill(f"Annual day {TAG}")
    form.get_by_label("Preview").get_by_text(f"Annual day {TAG}").wait_for()        # the preview follows what is typed
    form.get_by_label("Colour").select_option("green")
    form.get_by_role("button", name="Parents").click()
    form.get_by_role("switch", name="Also show as a pop-up").click()
    form.get_by_role("button", name="Show banner").click()
    toast(page, "Banner is live")
    card = page.locator(".tile", has_text=f"Annual day {TAG}")
    card.get_by_text("Showing now").wait_for()
    card.get_by_text("Pop-up").wait_for()
    saved = [b for b in ok(call("GET", "/banners", school["principal"]["token"])) if b["title"] == f"Annual day {TAG}"][0]
    assert saved["color"] == "green" and saved["roles"] == ["parent"] and saved["popup"] is True
    card.get_by_role("button", name=f"Remove Annual day {TAG}").click()
    confirm(page, "Remove")
    toast(page, "Banner removed")
    card.wait_for(state="detached")


def test_settings_profile_working_days_listing_and_plan(principal_page, school):
    page = principal_page
    t = school["principal"]["token"]
    go(page, "/school/settings")
    heading(page, "Settings")
    name = page.get_by_label("School name")
    name.fill("")
    page.get_by_role("button", name="Sunday").click()                              # Sunday off
    page.get_by_role("button", name="Save profile").click()
    page.get_by_role("alert").filter(has_text="Enter the school's name").wait_for()
    name.fill("E2E Test School")
    page.get_by_label("Phone").fill("0651-2200123")
    page.get_by_role("button", name="Save profile").click()
    toast(page, "School profile saved")
    me = ok(call("GET", "/school/me", t))
    assert me["phone"] == "0651-2200123" and me["working_days"] == [0, 1, 2, 3, 4, 5]
    page.get_by_role("button", name="Sunday").click()                              # back to all seven, as the other tests expect
    page.get_by_role("button", name="Save profile").click()
    toast(page, "School profile saved")
    assert ok(call("GET", "/school/me", t))["working_days"] == [0, 1, 2, 3, 4, 5, 6]
    tab(page, "Website listing")
    page.get_by_label("City or town shown").fill("Ranchi")
    switch = page.get_by_role("switch", name="List my school")
    if switch.get_attribute("aria-checked") == "true":
        switch.click()
    page.get_by_role("button", name="Save listing").click()
    toast(page, "Your school is not listed")
    assert ok(call("GET", "/school/showcase", t))["show"] is False
    tab(page, "Plan")
    page.get_by_role("heading", name=f"{school['plan']['name']} plan").wait_for()
    page.get_by_text("Free", exact=True).first.wait_for()


def test_support_access_is_given_and_taken_back_and_shows_in_activity(principal_page, school):
    page = principal_page
    t = school["principal"]["token"]
    go(page, "/school/settings")
    tab(page, "Privacy & support")
    page.get_by_role("status").filter(has_text="Support access is off.").wait_for()
    page.get_by_role("button", name="Allow for 24 hours").click()
    dialog(page).get_by_role("button", name="Cancel").click()                      # changed my mind: nothing happens
    assert ok(call("GET", "/school/me", t))["support_access_until"] is None
    page.get_by_role("button", name="Allow for 24 hours").click()
    confirm(page, "Allow for 24 hours")
    toast(page, "Support access is on for 24 hours")
    page.get_by_role("status").filter(has_text="Support access is on until").wait_for()
    assert ok(call("GET", "/school/me", t))["support_access_until"] is not None
    page.get_by_role("button", name="Turn off now").click()
    toast(page, "Support access is off")
    assert ok(call("GET", "/school/me", t))["support_access_until"] is None
    share = page.get_by_role("switch", name="Let Prangan support see phone numbers")
    before = share.get_attribute("aria-checked")
    share.click()
    page.locator(".toast", has_text="Prangan support").first.wait_for()
    assert share.get_attribute("aria-checked") != before
    if before == "false":
        share.click()                                                             # leave contact details hidden
        toast(page, "Contact details are hidden from Prangan support")
    go(page, "/school/activity")
    heading(page, "Activity")
    page.locator("tr", has_text=re.compile("support", re.I)).first.wait_for()
    page.get_by_role("button", name="Prangan support only").click()
    page.locator("table, .empty").first.wait_for()


def test_import_and_export_template_and_backup_download(principal_page, school):
    page = principal_page
    go(page, "/school/data")
    heading(page, "Import & export")
    with page.expect_download() as dl:
        page.get_by_role("button", name=re.compile("template", re.I)).first.click()
    assert dl.value.suggested_filename.endswith(".xlsx")
    with page.expect_download() as dl:
        page.get_by_role("button", name=re.compile("backup", re.I)).first.click()
    assert dl.value.suggested_filename.endswith(".xlsx")
    with open(dl.value.path(), "rb") as f:
        assert f.read(2) == b"PK", "the backup is a real Excel file"
    page.get_by_role("button", name=re.compile("backup", re.I)).first.click()       # straight away again: politely refused, not queued
    toast(page, "A backup was just made")
    page.problems.clear()


def test_import_checks_the_file_first_and_refuses_what_is_not_excel(principal_page, school, tmp_path):
    page = principal_page
    go(page, "/school/data")
    heading(page, "Import & export")
    check = page.get_by_role("button", name="Check the file")
    assert check.is_disabled(), "nothing to check until a file is chosen"
    notes = tmp_path / "notes.txt"
    notes.write_text("not a spreadsheet")
    page.locator("#import-file").set_input_files(str(notes))
    page.get_by_role("alert").filter(has_text="Choose an Excel .xlsx file").wait_for()
    assert check.is_disabled()
    fake = tmp_path / "fake.xlsx"                                                  # the right name, the wrong contents
    fake.write_bytes(b"this is not really an Excel file")
    page.locator("#import-file").set_input_files(str(fake))
    check.click()
    page.locator(".toast.bad").wait_for()                                          # refused by the server, with the reason
    page.get_by_role("button", name="Get the template").and_(page.locator(":enabled")).wait_for()
    # the school's own template (already filled with its data) checks clean and changes nothing
    with page.expect_download() as dl:
        page.get_by_role("button", name="Get the template").click()
    backup = tmp_path / "backup.xlsx"
    dl.value.save_as(str(backup))
    people = len(ok(call("GET", "/users", school["principal"]["token"], query={"role": "student"})))
    page.locator("#import-file").set_input_files(str(backup))
    check.click()
    page.get_by_role("status").filter(has_text="Nothing is saved yet.").wait_for()
    assert len(ok(call("GET", "/users", school["principal"]["token"], query={"role": "student"}))) == people
    page.problems.clear()
