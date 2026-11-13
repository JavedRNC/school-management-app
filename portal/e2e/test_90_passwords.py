"""Passwords: an admin resets a principal, the principal must choose a new one, and old sessions stop working. Runs last because it ends the shared session."""
import re
import secrets

from conftest import PRINCIPAL_PW, SCHOOL_CODE, _open, call, fresh_principal, login, ok
from helpers import dialog, go, heading, sign_in, tab, toast

NEW_PW = "Chosen#" + secrets.token_urlsafe(8) + "9x"


def test_admin_resets_the_principal_who_must_then_choose_a_password(admin_page, page, school):
    old_token = school["principal"]["token"]
    go(admin_page, f"/admin/schools/{school['id']}")
    heading(admin_page, "E2E Test School")
    tab(admin_page, "Users")
    admin_page.get_by_role("button", name="Show users").click()
    admin_page.get_by_role("button", name="Edit Asha Tester").click()
    form = dialog(admin_page)
    form.get_by_label("New temporary password (leave empty to keep the current one)").fill("short")
    form.get_by_role("alert").filter(has_text="The password needs at least 8 characters").wait_for()
    assert form.get_by_role("button", name="Save changes").is_disabled()
    form.get_by_role("button", name="Make a new password").click()
    form.get_by_role("button", name="Save changes").click()
    shared = dialog(admin_page)
    temp = re.search(r"Password: (\S+)", shared.locator(".cred").inner_text()).group(1)
    shared.get_by_role("button", name="Done").click()
    assert call("GET", "/school/me", old_token)[0] == 401, "a reset signs the person out everywhere"

    sign_in(page, SCHOOL_CODE, "principal", temp)
    page.wait_for_url(re.compile(r"#/account$"))
    heading(page, "Set a new password")
    assert page.get_by_role("navigation").count() == 0
    save = page.get_by_role("button", name="Save new password")
    old, new, again = page.get_by_label("Temporary password"), page.get_by_label("New password", exact=True), page.get_by_label("New password again")
    old.fill(temp)
    new.fill("short1")
    again.fill("short1")
    save.click()
    page.get_by_role("alert").filter(has_text="Use at least 8 characters for the new password.").wait_for()
    new.fill(NEW_PW)
    again.fill(NEW_PW + "x")
    save.click()
    page.get_by_role("alert").filter(has_text="The two new passwords do not match.").wait_for()
    again.fill(NEW_PW)
    old.fill("not-the-temporary-one")
    save.click()
    page.get_by_role("alert").first.wait_for()                                     # the server refuses a wrong current password
    assert "#/account" in page.url
    old.fill(temp)
    save.click()
    page.wait_for_url(re.compile(r"#/school$"))
    toast(page, "Password changed")
    heading(page, "E2E Test School")
    assert login(SCHOOL_CODE, "principal", temp)[0] == 401, "the temporary password works only once"
    school["principal"] = {k: ok(login(SCHOOL_CODE, "principal", NEW_PW))[k] for k in ("token", "user")}
    page.problems.clear()                                                          # the refused attempt above is expected


def test_changing_your_own_password_keeps_this_tab_signed_in(browser, admin, school):
    # starts from a known password of its own, so it does not depend on the test above
    first = fresh_principal(admin, school["id"])
    ok(call("POST", "/auth/password", first["token"], {"old_password": PRINCIPAL_PW, "new_password": NEW_PW}))
    school["principal"] = {k: ok(login(SCHOOL_CODE, "principal", NEW_PW))[k] for k in ("token", "user")}
    ctx, page = _open(browser, school["principal"])
    try:
        _change_own_password(page, school)
    finally:
        ctx.close()


def _change_own_password(page, school):
    go(page, "/account")
    heading(page, "Account")
    page.get_by_label("Current password").fill("wrong-current-password")
    page.get_by_label("New password", exact=True).fill(NEW_PW + "2")
    page.get_by_label("New password again").fill(NEW_PW + "2")
    page.get_by_role("button", name="Save new password").click()
    page.get_by_role("alert").first.wait_for()
    assert login(SCHOOL_CODE, "principal", NEW_PW)[0] == 200, "nothing changed after a wrong current password"
    page.get_by_label("Current password").fill(NEW_PW)
    page.get_by_role("button", name="Save new password").click()
    page.wait_for_url(re.compile(r"#/school$"))
    go(page, "/school/people")                                                     # still signed in, with the new session
    heading(page, "People")
    page.locator("td.primary-cell").first.wait_for()
    assert call("GET", "/school/me", school["principal"]["token"])[0] == 401, "the session from before the change is ended"
    assert login(SCHOOL_CODE, "principal", NEW_PW)[0] == 401
    page.problems.clear()
