"""Signing in and out, who may use the portal, and what happens when a session is no longer valid."""
import json
import re

from conftest import PRINCIPAL_PW, SCHOOL_CODE, STUDENT_PW, TAG, WEB, _open, call, ok
from helpers import go, heading, sign_in, token_of


def test_sign_in_form_asks_for_everything_and_gives_one_message_for_any_wrong_detail(page, school):
    go(page, "/login")
    page.get_by_role("button", name="Sign in").click()
    page.get_by_role("alert").filter(has_text="Enter the school code, login ID and password.").wait_for()
    # wrong password, unknown person and unknown school all read the same: nothing reveals which part was wrong
    for code, who, pw in ((SCHOOL_CODE, "principal", "definitely-wrong"), (SCHOOL_CODE, f"nobody-{TAG}", "whatever123"), (f"NOSCHOOL{TAG}", "principal", "whatever123")):
        sign_in(page, code, who, pw)
        page.get_by_role("alert").filter(has_text="Wrong school code, login ID or password").wait_for()
        assert page.get_by_label("Password").input_value() == "", "the password box is cleared after a failed try"
        assert "#/login" in page.url


def test_principal_signs_in_sees_their_school_and_logs_out(page, school):
    sign_in(page, SCHOOL_CODE.lower(), "principal", PRINCIPAL_PW)                   # the code may be typed in small letters
    page.wait_for_url(re.compile(r"#/school$"))
    heading(page, "E2E Test School")
    assert json.loads(page.evaluate("sessionStorage.getItem('prangan.session')"))["user"]["role"] == "principal"
    assert page.evaluate("localStorage.length") == 0, "nothing about the session is kept after the tab is closed"
    token = token_of(page)
    page.get_by_role("complementary").get_by_role("button", name="Log out").click()
    page.wait_for_url(re.compile(r"#/login$"))
    assert page.evaluate("sessionStorage.getItem('prangan.session')") is None
    go(page, "/school/people")                                                     # the back door is closed too
    page.wait_for_url(re.compile(r"#/login$"))
    assert call("GET", "/school/me", token)[0] == 200, "logging out forgets the session in this browser (the server session ends by itself after 12 hours)"


def test_teachers_parents_and_students_are_sent_to_the_app(page, school, seeded):
    sign_in(page, SCHOOL_CODE, f"S{TAG}3", STUDENT_PW)
    page.get_by_role("alert").filter(has_text="The web portal is for Admin and Principal accounts. Please use the Prangan app.").wait_for()
    assert "#/login" in page.url and page.evaluate("sessionStorage.getItem('prangan.session')") is None


def test_each_role_only_reaches_its_own_pages(admin_page, principal_page, admin, school):
    go(principal_page, "/admin/schools")                                           # a principal typing an admin address
    principal_page.wait_for_url(re.compile(r"#/school$"))
    go(admin_page, "/school/fees")                                                 # and the other way round
    admin_page.wait_for_url(re.compile(r"#/admin$"))
    go(admin_page, "/no/such/page")
    admin_page.wait_for_url(re.compile(r"#/admin$"))
    # the server is the real guard: a principal's session is refused by every admin address, and one school can't read another's
    pt = school["principal"]["token"]
    for path in ("/admin/overview", "/admin/schools", f"/admin/schools/{school['id']}/users", "/admin/plans", "/admin/audit", "/admin/app-version"):
        assert call("GET", path, pt)[0] == 403, path
    assert call("PUT", "/admin/app-version", pt, {"min_build": 999})[0] == 403
    assert call("GET", "/school/me", admin["token"])[0] in (400, 403, 404), "the admin has no school of their own"
    # one school can't see another's people: the admin's own account is "a person of no school" and stays invisible (read-only probe)
    assert admin["user"]["id"] not in [u["id"] for role in ("teacher", "student", "parent") for u in ok(call("GET", "/users", pt, query={"role": role}))]
    assert call("GET", f"/fees/students/{admin['user']['id']}", pt)[0] == 404


def test_a_session_that_is_no_longer_valid_returns_to_sign_in_with_a_message(browser, school):
    session = {"token": school["principal"]["token"][:-6] + "xxxxxx", "user": school["principal"]["user"]}      # a damaged or expired session
    ctx, page = _open(browser)
    try:
        page.goto(WEB + "/#/login")
        page.evaluate("s => sessionStorage.setItem('prangan.session', s)", json.dumps(session))
        go(page, "/school/people")
        page.reload()                                                              # the tab starts up with the bad session
        page.wait_for_url(re.compile(r"#/login$"))
        page.get_by_role("status").filter(has_text="Your session ended. Please sign in again.").wait_for()
        assert page.evaluate("sessionStorage.getItem('prangan.session')") is None
    finally:
        ctx.close()


def test_public_pages_need_no_sign_in_and_link_to_each_other(page):
    go(page, "/login")
    page.get_by_role("link", name="Register your school").first.click()
    page.wait_for_url(re.compile(r"#/register$"))
    page.get_by_label("School name").wait_for()
    go(page, "/register/status")
    assert page.get_by_role("button", name="Check status").is_disabled(), "both boxes are required"
