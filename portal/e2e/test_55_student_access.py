"""Principal: which teachers may edit student and parent details (F40), and finding those changes in Activity."""
import pytest
from conftest import TAG, call, ok
from helpers import confirm, dialog, go, heading, toast


@pytest.mark.tc("TC-P-043", "Student data access: class teachers' levels and extra access (F40)")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_principal_gives_and_takes_back_a_teachers_access(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    one, two = seeded["teachers"]
    klass = seeded["klass"]
    go(page, "/school/student-access")
    heading(page, "Student data access")
    # TC-P-043.1 — Each class shows its class teacher (who may edit by default)
    page.locator(".item", has_text=klass["name"]).get_by_text(one["name"]).wait_for()          # its class teacher, who may edit by default
    # TC-P-043.2 — Class teachers' levels: students can be set to add, parents to edit; both are saved
    page.get_by_label("Students", exact=True).select_option(label="Add and edit")
    toast(page, "Class teachers: access saved")
    page.get_by_label("Parents", exact=True).select_option(label="Edit details")
    toast(page, "Class teachers: access saved")
    assert ok(call("GET", "/student-access", t))["class_teachers"] == {"students": "add", "parents": "edit"}
    page.get_by_label("Students", exact=True).select_option(label="No access")                      # no parents without students
    toast(page, "Class teachers: access saved")
    assert page.get_by_label("Parents", exact=True).count() == 0
    assert ok(call("GET", "/student-access", t))["class_teachers"] == {"students": "none", "parents": "none"}
    page.get_by_label("Students", exact=True).select_option(label="Edit details")
    toast(page, "Class teachers: access saved")

    # TC-P-043.3 — Give a teacher access: a class must be chosen; add students and add parents is saved
    page.get_by_role("button", name="Give a teacher access").click()
    box = dialog(page)
    box.get_by_label("Teacher").select_option(label=f"{two['name']} ({two['login_id']})")
    assert box.get_by_role("button", name="Save access").is_disabled(), "a class must be chosen first"
    box.get_by_role("button", name=klass["name"], exact=True).click()
    box.get_by_label("Students in these classes").select_option(label="Add and edit")
    box.get_by_label("Their parents").select_option(label="Add and edit")
    box.get_by_role("button", name="Save access").click()
    toast(page, f"Access saved for {two['name']}")
    row = page.locator(".item", has_text=two["name"])
    row.get_by_text("students: add and edit · parents: add and edit").wait_for()
    grant = next(g for g in ok(call("GET", "/student-access", t))["grants"] if g["teacher_id"] == two["id"])
    assert grant["classes"] == [klass["id"]] and grant["students"] == "add" and grant["parents"] == "add"

    # TC-P-043.4 — Activity shows 'student access granted' with old → new
    go(page, "/school/activity")
    heading(page, "Activity")
    page.get_by_label("Show").select_option(label="People & sign-ins")
    page.get_by_label("Search").fill(two["login_id"])
    page.locator("tbody tr", has_text="Student access granted").first.wait_for()
    assert "no extra access →" in page.locator("tbody tr", has_text="Student access granted").first.inner_text()

    go(page, "/school/student-access")
    heading(page, "Student data access")
    # TC-P-043.5 — Removing the access asks first and clears it
    page.get_by_role("button", name=f"Remove access for {two['name']}").click()
    confirm(page, "Remove access")
    toast(page, f"Access removed for {two['name']}")
    row.wait_for(state="detached")
    assert ok(call("GET", "/student-access", t))["grants"] == []


@pytest.mark.tc("TC-P-044", "Activity: search, kind and date filters (F41)")
@pytest.mark.sanity
@pytest.mark.regression
def test_activity_filters_by_kind_and_date(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    s = seeded["students"][0]
    # TC-P-044.1 — A student's address is changed
    ok(call("PUT", f"/users/{s['id']}", t, {"address": f"7, Filter Road {TAG}"}))
    go(page, "/school/activity")
    heading(page, "Activity")
    # TC-P-044.2 — Search finds the change with the old and the new value
    page.get_by_label("Search").fill(f"Filter Road {TAG}")
    hit = page.locator("tbody tr", has_text=f"Filter Road {TAG}").first
    hit.wait_for()
    assert "→" in hit.inner_text(), "the old and the new value are shown"
    # TC-P-044.3 — Kind 'Marks & exams' hides it
    with page.expect_response(lambda r: "/school/audit" in r.url and "group=marks" in r.url):
        page.get_by_label("Show").select_option(label="Marks & exams")
    page.get_by_text("Nothing matches these filters").wait_for()
    # TC-P-044.4 — Clear filters shows everything again
    page.get_by_role("button", name="Clear filters").click()
    page.locator("tbody tr").first.wait_for()
    # TC-P-044.5 — A date range in the past shows nothing
    page.get_by_label("To").fill("2001-01-01")
    page.get_by_text("Nothing matches these filters").wait_for()
