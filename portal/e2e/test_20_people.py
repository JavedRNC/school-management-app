"""Principal: People — add, edit, search, reset password, remove and restore, add many."""
import pytest
import random

from conftest import STUDENT_PW, TAG, call, login, ok
from helpers import confirm, dialog, go, heading, tab, toast


def open_people(page, seeded):
    go(page, "/school/people")
    heading(page, "People")
    page.get_by_label("Class").select_option(label=seeded["klass"]["name"])
    page.locator("td.primary-cell", has_text=f"Aman Verma {TAG}").wait_for()


@pytest.mark.tc("TC-P-007", "Add student: every field is checked before saving")
@pytest.mark.sanity
@pytest.mark.regression
def test_add_student_checks_every_field_before_saving(principal_page, school, seeded):
    page = principal_page
    count = lambda: len(ok(call("GET", "/users", school["principal"]["token"], query={"role": "student", "class_id": seeded["klass"]["id"]})))  # noqa: E731
    before = count()
    open_people(page, seeded)
    page.get_by_role("button", name="Add student").click()
    form = dialog(page)
    # TC-P-007.1 — Short password, bad phone and bad email are typed
    form.get_by_label("Temporary password").fill("short")
    form.get_by_label("Phone").fill("12ab")
    form.get_by_label("Email").fill("not-an-email")
    form.get_by_role("button", name="Add student").click()
    # TC-P-007.2 — Each field shows its own error message
    for message in ("Enter the full name", "This is what they type to sign in", "At least 8 characters", "Pick a class", "Digits only, 7 to 15 long", "This doesn't look like an email address"):
        form.get_by_role("alert").filter(has_text=message).wait_for()
    # TC-P-007.3 — Nothing is saved while the form has errors
    assert count() == before, "nothing may be saved while the form has errors"


@pytest.mark.tc("TC-P-008", "Add, edit and find a student")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_add_edit_and_find_a_student(principal_page, school, seeded):
    page = principal_page
    open_people(page, seeded)
    page.get_by_role("button", name="Add student").click()
    form = dialog(page)
    # TC-P-008.1 — Add a student with class, roll no., phone, date of birth and blood group
    form.get_by_label("Full name").fill(f"Divya Nair {TAG}")
    form.get_by_label("Admission no. (login ID)").fill(f"S{TAG}9")
    form.get_by_label("Class").select_option(label=seeded["klass"]["name"])
    form.get_by_label("Roll no.").fill("9")
    form.get_by_label("Phone").fill("9811122233")
    form.get_by_label("Date of birth").fill("2014-03-02")
    form.get_by_label("Blood group").select_option("B+")
    form.get_by_role("button", name="Add student").click()
    toast(page, f"Divya Nair {TAG} added")
    row = page.locator("tr", has_text=f"Divya Nair {TAG}")
    row.get_by_text("Has not signed in yet").wait_for()
    # TC-P-008.2 — The same login ID again is refused and the form keeps what was typed
    page.get_by_role("button", name="Add student").click()
    form = dialog(page)
    form.get_by_label("Full name").fill("Copy Cat")
    form.get_by_label("Admission no. (login ID)").fill(f"S{TAG}9")
    form.get_by_label("Class").select_option(label=seeded["klass"]["name"])
    form.get_by_role("button", name="Add student").click()
    toast(page, "already used in this school")
    assert form.get_by_label("Full name").input_value() == "Copy Cat"
    page.keyboard.press("Escape")
    form.wait_for(state="detached")
    # TC-P-008.3 — Edit the roll no.; the saved record matches
    row.get_by_role("button", name=f"Edit Divya Nair {TAG}").click()
    form = dialog(page)
    assert form.get_by_label("Roll no.").input_value() == "9"
    form.get_by_label("Roll no.").fill("12")
    form.get_by_role("button", name="Save changes").click()
    toast(page, "saved")
    saved = [u for u in ok(call("GET", "/users", school["principal"]["token"], query={"role": "student"})) if u["login_id"] == f"S{TAG}9"][0]
    assert saved["roll_no"] == 12 and saved["blood_group"] == "B+" and saved["dob"] == "2014-03-02"
    # TC-P-008.4 — Search narrows the list; a search with no match says so
    page.get_by_label("Search").fill("divya")
    page.locator("td.primary-cell", has_text=f"Divya Nair {TAG}").wait_for()
    page.locator("td.primary-cell", has_text=f"Aman Verma {TAG}").wait_for(state="detached")
    page.get_by_label("Search").fill("zzzz-no-such-person")
    page.get_by_text('No students match "zzzz-no-such-person"').wait_for()


@pytest.mark.tc("TC-P-009", "Reset password gives a one-time password that works")
@pytest.mark.sanity
@pytest.mark.regression
def test_reset_password_gives_a_one_time_password_that_works(principal_page, seeded):
    page = principal_page
    open_people(page, seeded)
    page.get_by_role("button", name=f"Reset password of Bina Das {TAG}").click()
    box = dialog(page)
    # TC-P-009.1 — A too-short temporary password cannot be saved
    box.get_by_label("New temporary password").fill("abc")
    assert box.get_by_role("button", name="Reset password").is_disabled()
    # TC-P-009.2 — The new temporary password is shown once
    box.get_by_label("New temporary password").fill("Fresh#Pass77")
    box.get_by_role("button", name="Reset password").click()
    box.get_by_text("Password reset.").wait_for()
    assert "Fresh#Pass77" in box.locator(".cred").inner_text()
    box.get_by_role("button", name="Done").click()
    # TC-P-009.3 — The new password signs in and must be changed; the old one stops working
    status, data = login("E2EQA1", f"S{TAG}2", "Fresh#Pass77", web=False)
    assert status == 200 and data["user"]["must_change_password"] is True
    assert login("E2EQA1", f"S{TAG}2", STUDENT_PW, web=False)[0] == 401, "the old password must stop working"


@pytest.mark.tc("TC-P-010", "Remove a person, then restore from the archive")
@pytest.mark.sanity
@pytest.mark.regression
def test_remove_then_restore_from_the_archive(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    ok(call("POST", "/users", t, {"name": f"Esha Temp {TAG}", "login_id": f"S{TAG}7", "password": STUDENT_PW, "role": "student", "class_id": seeded["klass"]["id"]}))
    open_people(page, seeded)
    page.get_by_role("button", name=f"Remove Esha Temp {TAG}").click()
    # TC-P-010.1 — Cancelling the removal keeps the person
    dialog(page).get_by_role("button", name="Cancel").click()                      # cancelling keeps the person
    page.locator("td.primary-cell", has_text=f"Esha Temp {TAG}").wait_for()
    page.get_by_role("button", name=f"Remove Esha Temp {TAG}").click()
    # TC-P-010.2 — Removing hides the person and they can no longer sign in
    confirm(page, "Remove")
    toast(page, f"Esha Temp {TAG} removed")
    page.locator("td.primary-cell", has_text=f"Esha Temp {TAG}").wait_for(state="detached")
    assert login("E2EQA1", f"S{TAG}7", STUDENT_PW, web=False)[0] == 401, "a removed person cannot sign in"
    go(page, "/school/settings")
    # TC-P-010.3 — Restore from Settings → Archive lets them sign in again
    tab(page, "Archive")
    page.get_by_role("button", name=f"Restore Esha Temp {TAG} · student").click()
    toast(page, "restored")
    assert login("E2EQA1", f"S{TAG}7", STUDENT_PW, web=False)[0] == 200


@pytest.mark.tc("TC-P-011", "Add a parent linked to a child")
@pytest.mark.sanity
@pytest.mark.regression
def test_parent_is_linked_to_children(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/people")
    tab(page, "Parents")
    page.get_by_role("button", name="Add parent").click()
    form = dialog(page)
    mobile = "97" + "".join(random.choices("0123456789", k=8))
    form.get_by_label("Full name").fill(f"Mr Verma {TAG}")
    form.get_by_label("Mobile number (login ID)").fill(mobile)
    # TC-P-011.1 — Pick the child by admission no. and set the relation
    form.get_by_label("Children").fill(f"S{TAG}1")
    form.get_by_role("button", name=f"Aman Verma {TAG} · S{TAG}1").click()
    form.get_by_label("Relation to the child").select_option("Guardian")
    form.get_by_role("button", name="Add parent").click()
    toast(page, "added")
    # TC-P-011.2 — The parent row shows the child and the server stores the link
    page.get_by_label("Search").fill(mobile)
    page.locator("tr", has_text=f"Mr Verma {TAG}").get_by_text(f"Aman Verma {TAG}").wait_for()
    parent = [u for u in ok(call("GET", "/users", school["principal"]["token"], query={"role": "parent"})) if u["login_id"] == mobile][0]
    assert parent["children_ids"] == [seeded["students"][0]["id"]]


@pytest.mark.tc("TC-P-012", "Add many: one wrong row stops all; then logins are created")
@pytest.mark.regression
def test_add_many_rejects_everything_if_one_row_is_wrong_then_creates_logins(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/people")
    tab(page, "Teachers")
    page.get_by_role("button", name="Add many").click()
    sheet = dialog(page)
    # TC-P-012.1 — Check rows is off until something is typed
    assert sheet.get_by_role("button", name="Check rows").is_disabled()            # nothing typed yet
    # TC-P-012.2 — Pasting three rows from a spreadsheet fills the grid
    rows = f"Farah Khan {TAG}\tT{TAG}7\t9800011111\nGopal Iyer {TAG}\t\t9800022222\nHina Shah {TAG}\tT{TAG}9\t"
    sheet.get_by_label("Name, row 1").focus()
    page.evaluate("""(text) => { const dt = new DataTransfer(); dt.setData('text/plain', text);
        document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""", rows)
    assert sheet.get_by_label("Name, row 3").input_value() == f"Hina Shah {TAG}"
    sheet.get_by_role("button", name="Check rows").click()
    # TC-P-012.3 — A missing employee code is shown on its row and nothing is saved
    toast(page, "1 problem to fix — nothing was saved")
    sheet.get_by_text("Employee code is required").wait_for()
    assert sheet.get_by_label("Employee code, row 2").get_attribute("aria-invalid") == "true"
    names = [u["name"] for u in ok(call("GET", "/users", school["principal"]["token"], query={"role": "teacher"}))]
    assert f"Farah Khan {TAG}" not in names, "no row is saved when any row is wrong"
    # TC-P-012.4 — After fixing, 3 logins are created
    sheet.get_by_label("Employee code, row 2").fill(f"T{TAG}8")
    sheet.get_by_role("button", name="Check rows").click()
    sheet.get_by_role("button", name="Create 3 logins").click()
    made = dialog(page)
    made.get_by_role("heading", name="3 logins created").wait_for()
    made.get_by_role("cell", name=f"T{TAG}8").wait_for()
    # TC-P-012.5 — The login list downloads as CSV with the right columns
    with page.expect_download() as dl:
        made.get_by_role("button", name="Download list (CSV)").click()
    text = open(dl.value.path(), encoding="utf-8-sig").read()
    assert text.splitlines()[0] == "Name,Role,Class,Login ID,Temporary password" and f"T{TAG}9" in text
    made.get_by_role("button", name="Done").click()
    page.locator("td.primary-cell", has_text=f"Gopal Iyer {TAG}").wait_for()
