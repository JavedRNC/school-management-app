"""End-to-end: public registration → admin review → school created → principal signs in; import/export; roles; phone layout."""
import json
import re
import urllib.error
import urllib.request

from conftest import API, WEB

ADMIN_PW = "Admin#2026x"
STATE: dict = {}


def go(page, path):
    page.goto(f"{WEB}/#{path}")


def sign_in(page, code, login_id, password):
    go(page, "/login")
    page.get_by_label("School code").fill(code)
    page.get_by_label("Login ID").fill(login_id)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign in").click()


def admin_in(page):
    sign_in(page, "ADMIN", "admin", ADMIN_PW)
    page.wait_for_url(re.compile(r"#/admin$"))


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def test_01_public_registration_form(page):
    go(page, "/register")
    page.get_by_role("button", name="Send request").click()                       # empty form: errors, nothing sent
    page.get_by_role("alert").first.wait_for()
    page.get_by_text("Enter the 6-digit PIN code.").wait_for()
    page.get_by_text("Please tick both boxes to send the request.").wait_for()
    page.get_by_label("School name").fill("Lotus Valley School")
    page.get_by_label("Registration / affiliation / UDISE number").fill("BR-2026-7781")
    page.get_by_label("Address").fill("45 College Road")
    page.get_by_label("City / town").fill("Patna")
    page.get_by_label("District").fill("Patna")
    page.get_by_label("State").select_option("Bihar")
    page.get_by_label("PIN code").fill("800001")
    page.get_by_label("Your name").fill("Neha Sinha")
    page.get_by_label("Mobile number").fill("9812345670")
    page.get_by_label("Email", exact=True).fill("office@lotusvalley.example")
    page.get_by_label("About how many students").fill("600")
    for box in page.get_by_role("checkbox").all():
        box.check()
    page.get_by_role("button", name="Send request").click()
    ref = page.get_by_test_id("reference").inner_text()
    assert re.fullmatch(r"PRN-\d{4}-[A-Z2-9]{8}", ref)
    STATE["ref"] = ref
    # status lookup needs reference + the mobile used
    go(page, "/register/status")
    page.get_by_label("Reference number").fill(ref)
    page.get_by_label("Mobile number").fill("9000000000")
    page.get_by_role("button", name="Check status").click()
    page.get_by_text("No request matches").wait_for()
    page.get_by_label("Mobile number").fill("9812345670")
    page.get_by_role("button", name="Check status").click()
    page.get_by_role("heading", name="Lotus Valley School").wait_for()
    page.get_by_text("Pending", exact=True).wait_for()
    page.problems.clear()                                                          # the 404 above is expected


def test_02_wrong_password_and_forced_password_change(page):
    sign_in(page, "ADMIN", "admin", "not-the-password")
    page.get_by_role("alert").get_by_text("Wrong school code, login ID or password").wait_for()
    sign_in(page, "ADMIN", "admin", "admin123")
    page.wait_for_url(re.compile(r"#/account$"))                                   # temporary password → must change first
    page.get_by_role("heading", name="Set a new password").wait_for()
    assert page.get_by_role("navigation").count() == 0                             # no menu until it is changed
    page.get_by_label("Temporary password").fill("admin123")
    page.get_by_label("New password", exact=True).fill(ADMIN_PW)
    page.get_by_label("New password again").fill(ADMIN_PW)
    page.get_by_role("button", name="Save new password").click()
    page.wait_for_url(re.compile(r"#/admin$"))
    page.get_by_role("heading", name="Platform dashboard").wait_for()
    page.problems.clear()


def test_03_admin_dashboard_shows_real_numbers(page):
    admin_in(page)
    token = page.evaluate("JSON.parse(sessionStorage.getItem('prangan.session')).token")
    _, ov = call("GET", "/admin/overview", token)
    card = page.locator(".stat", has_text="Registered schools")
    card.get_by_text(str(ov["schools"]), exact=True).wait_for()
    page.locator(".stat", has_text="Students").get_by_text(str(ov["students"]), exact=True).wait_for()
    page.locator(".stat", has_text="Pending requests").get_by_text("1", exact=True).wait_for()
    page.get_by_role("link", name="Lotus Valley School").wait_for()       # latest requests
    page.locator("svg.chart").first.wait_for()
    assert page.locator(".nav .count").first.inner_text() == "1"                   # pending badge in the menu


def test_04_admin_reviews_request_and_creates_school(page):
    admin_in(page)
    go(page, "/admin/requests")
    page.get_by_label("Search").fill("lotus")
    page.get_by_role("link", name="Lotus Valley School").click()
    page.get_by_role("heading", name="Lotus Valley School").wait_for()
    page.get_by_text("BR-2026-7781").wait_for()
    page.get_by_role("button", name="Reject").click()                              # reject needs a reason
    dialog = page.get_by_role("dialog")
    assert dialog.get_by_role("button", name="Reject").is_disabled()
    page.keyboard.press("Escape")
    page.get_by_label("Add an internal note").fill("Spoke to Neha, wants a demo")
    page.get_by_role("button", name="Add note").click()
    page.get_by_text("Spoke to Neha, wants a demo").wait_for()
    page.get_by_role("button", name="Approve").click()
    page.get_by_role("dialog").get_by_role("button", name="Approve").click()
    page.get_by_role("button", name="Create the school…").click()
    page.get_by_label("School code").fill("LOTUS1")
    page.get_by_role("dialog").get_by_role("button", name="Create school").click()
    page.get_by_text("School created.").wait_for()
    cred = page.locator(".cred").inner_text()
    STATE["pw"] = re.search(r"Temporary password: (\S+)", cred).group(1)
    assert "LOTUS1" in cred and len(STATE["pw"]) >= 8
    page.get_by_text("Approved → Onboarded").wait_for()
    # appears in the schools list, searchable by registration number
    go(page, "/admin/schools")
    page.get_by_label("Search").fill("BR-2026-7781")
    page.get_by_role("link", name="Lotus Valley School").wait_for()
    page.get_by_text("1 school match").wait_for()
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export this list").click()
    assert dl.value.suggested_filename.startswith("Prangan-Schools-") and dl.value.suggested_filename.endswith(".xlsx")
    # activity log has the trail
    go(page, "/admin/audit")
    page.get_by_text("Onboarding onboarded").first.wait_for()


def test_05_new_principal_signs_in_with_one_time_password(page):
    sign_in(page, "LOTUS1", "principal", STATE["pw"])
    page.wait_for_url(re.compile(r"#/account$"))
    page.get_by_label("Temporary password").fill(STATE["pw"])
    page.get_by_label("New password", exact=True).fill("Lotus#2026pw")
    page.get_by_label("New password again").fill("Lotus#2026pw")
    page.get_by_role("button", name="Save new password").click()
    page.wait_for_url(re.compile(r"#/school$"))
    page.get_by_role("heading", name="Lotus Valley School").wait_for()
    # applicant sees the final status
    go(page, "/register/status")
    page.get_by_label("Reference number").fill(STATE["ref"])
    page.get_by_label("Mobile number").fill("9812345670")
    page.get_by_role("button", name="Check status").click()
    page.get_by_text("Onboarded", exact=True).wait_for()


def test_06_principal_dashboard_people_and_import_export(page, tmp_path):
    sign_in(page, "DEMO01", "principal", "demo123")
    page.wait_for_url(re.compile(r"#/school$"))
    page.get_by_role("heading", name="Green Valley Public School").wait_for()
    token = page.evaluate("JSON.parse(sessionStorage.getItem('prangan.session')).token")
    _, dash = call("GET", "/dashboard", token)
    page.locator(".stat", has_text="Students").get_by_text(str(dash["overview"]["students"]), exact=True).wait_for()
    page.locator("svg.chart").first.wait_for()
    go(page, "/school/people")
    page.get_by_label("Search").fill("Kabir")
    page.locator("table.t tbody tr").first.wait_for()
    go(page, "/school/data")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Get the template").click()
    path = tmp_path / dl.value.suggested_filename
    dl.value.save_as(path)
    assert path.read_bytes()[:2] == b"PK"
    # wrong file type is refused in the browser; the real template passes the check and imports
    bad = tmp_path / "notes.txt"
    bad.write_text("hello")
    page.set_input_files("#import-file", str(bad))
    page.get_by_text("Choose an Excel .xlsx file").wait_for()
    page.set_input_files("#import-file", str(path))
    page.get_by_role("button", name="Check the file").click()
    page.get_by_text("The file is fine.").wait_for(timeout=60000)
    page.get_by_role("button", name="Import now…").click()
    page.get_by_role("dialog").get_by_role("button", name="Import", exact=True).click()
    page.get_by_text("Import finished:").wait_for(timeout=60000)
    page.get_by_text("Template downloaded").first.wait_for()              # history
    page.get_by_text("Import merge").first.wait_for()


def test_07_roles_are_enforced_by_the_server_not_just_the_menu(page):
    sign_in(page, "DEMO01", "principal", "demo123")
    page.wait_for_url(re.compile(r"#/school$"))
    go(page, "/admin/schools")                                                     # typing an admin address sends them home
    page.wait_for_url(re.compile(r"#/school$"))
    assert page.get_by_role("link", name="Requests").count() == 0
    token = page.evaluate("JSON.parse(sessionStorage.getItem('prangan.session')).token")
    for path in ("/admin/overview", "/admin/schools-page", "/admin/onboarding", "/admin/schools-export", "/admin/audit", "/admin/schools/2/details"):
        assert call("GET", path, token)[0] == 403, path
    assert call("POST", "/admin/onboarding/1/onboard", token, {"code": "EVIL01"})[0] == 403
    # another school's data can't be reached by changing ids: the principal API has no school id to change,
    # and the admin routes that take one refuse this token
    assert call("GET", "/admin/schools/2/users", token)[0] == 403
    assert call("GET", "/admin/schools/2/data/backup", token)[0] == 403
    # a tampered session role in the browser doesn't unlock anything
    page.evaluate("""() => { const s = JSON.parse(sessionStorage.getItem('prangan.session')); s.user.role = 'admin'; sessionStorage.setItem('prangan.session', JSON.stringify(s)); }""")
    page.reload()
    go(page, "/admin/schools")
    page.get_by_role("alert").get_by_text("Not allowed for your role").first.wait_for()
    page.problems.clear()
    # teachers can't use the portal at all
    _, people = call("GET", "/users?role=teacher", token)
    page.evaluate("sessionStorage.clear()")
    page.reload()
    sign_in(page, "DEMO01", people[0]["login_id"], "demo123")
    page.get_by_role("alert").get_by_text("The web portal is for Admin and Principal").wait_for()
    page.problems.clear()


def test_08_logout_and_expired_session(page):
    sign_in(page, "DEMO01", "principal", "demo123")
    page.wait_for_url(re.compile(r"#/school$"))
    page.locator(".side-foot").get_by_role("button", name="Log out").click()
    page.wait_for_url(re.compile(r"#/login$"))
    assert page.evaluate("sessionStorage.getItem('prangan.session')") is None
    go(page, "/school")                                                            # no session → back to sign-in
    page.wait_for_url(re.compile(r"#/login$"))
    # a session the server no longer accepts returns the user to sign-in with a notice
    sign_in(page, "DEMO01", "principal", "demo123")
    page.wait_for_url(re.compile(r"#/school$"))
    page.evaluate("""() => { const s = JSON.parse(sessionStorage.getItem('prangan.session')); s.token = s.token.slice(0, -4) + 'AAAA'; sessionStorage.setItem('prangan.session', JSON.stringify(s)); }""")
    page.reload()
    page.get_by_text("Your session ended. Please sign in again.").wait_for()
    page.problems.clear()


def test_09_phone_layout(phone):
    sign_in(phone, "DEMO01", "principal", "demo123")
    phone.wait_for_url(re.compile(r"#/school$"))
    phone.get_by_role("heading", name="Green Valley Public School").wait_for()
    assert phone.locator(".bottomnav").is_visible() and not phone.locator(".side").is_visible()
    for path in ("/school", "/school/people", "/school/data", "/account"):
        go(phone, path)
        phone.wait_for_timeout(600)
        over = phone.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert over <= 1, f"{path} scrolls sideways by {over}px"
    phone.locator(".bottomnav").get_by_role("link", name="People").click()
    phone.wait_for_url(re.compile(r"#/school/people$"))
    for path in ("/register", "/login", "/register/status"):
        phone.evaluate("sessionStorage.clear()")
        go(phone, path)
        phone.wait_for_timeout(400)
        over = phone.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert over <= 1, f"{path} scrolls sideways by {over}px"


def test_10_every_field_has_a_label_and_xss_is_inert(page):
    for path in ("/login", "/register", "/register/status"):
        go(page, path)
        page.wait_for_timeout(300)
        unnamed = page.evaluate("""() => [...document.querySelectorAll('input:not([type=hidden]):not([tabindex="-1"]),select,textarea')]
            .filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label')).length""")
        assert unnamed == 0, f"{path}: {unnamed} fields without a label"
    # a script typed into the public form is stored as text and shown as text to the admin
    payload = '<img src=x onerror="window.__xss=1">'
    code, res = call("POST", "/public/onboarding", None, {
        "school_name": f"Test {payload}", "address": f"1 Road {payload}", "state": "Bihar", "district": "Gaya", "city": "Gaya", "pin": "823001",
        "contact_name": "Tester", "mobile": "9700000001", "email": "t@t.example", "message": payload, "consent_privacy": True, "consent_contact": True})
    assert code == 201, res
    admin_in(page)
    go(page, "/admin/requests")
    page.get_by_label("Search").fill("Test <img")
    page.locator("table.t tbody tr").first.click()
    page.get_by_text(payload).first.wait_for()
    assert page.evaluate("window.__xss") is None
    assert page.locator("img[src='x']").count() == 0
