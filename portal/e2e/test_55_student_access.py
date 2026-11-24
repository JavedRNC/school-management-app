"""Principal: which teachers may edit student and parent details (F40), and finding those changes in Activity."""
from conftest import TAG, call, ok
from helpers import confirm, dialog, go, heading, toast


def test_principal_gives_and_takes_back_a_teachers_access(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    one, two = seeded["teachers"]
    klass = seeded["klass"]
    go(page, "/school/student-access")
    heading(page, "Student data access")
    page.locator(".item", has_text=klass["name"]).get_by_text(one["name"]).wait_for()          # its class teacher, who may edit by default
    parents = page.get_by_role("switch", name="… and their parents")
    assert parents.get_attribute("aria-checked") == "false"
    parents.click()
    toast(page, "Class teachers can edit parent details")
    assert ok(call("GET", "/student-access", t))["class_teachers_parents"] is True
    parents.click()
    toast(page, "Parent details: principal only")

    page.get_by_role("button", name="Give a teacher access").click()
    box = dialog(page)
    box.get_by_label("Teacher").select_option(label=f"{two['name']} ({two['login_id']})")
    assert box.get_by_role("button", name="Save access").is_disabled(), "a class must be chosen first"
    box.get_by_role("button", name=klass["name"], exact=True).click()
    box.get_by_role("switch", name="Parent details too").click()
    box.get_by_role("button", name="Save access").click()
    toast(page, f"Access saved for {two['name']}")
    row = page.locator(".item", has_text=two["name"])
    row.get_by_text("parent details too").wait_for()
    grant = next(g for g in ok(call("GET", "/student-access", t))["grants"] if g["teacher_id"] == two["id"])
    assert grant["classes"] == [klass["id"]] and grant["parents"] is True

    go(page, "/school/activity")
    heading(page, "Activity")
    page.get_by_label("Show").select_option(label="People & sign-ins")
    page.get_by_label("Search").fill(two["login_id"])
    page.locator("tbody tr", has_text="Student access granted").first.wait_for()
    assert "no extra access →" in page.locator("tbody tr", has_text="Student access granted").first.inner_text()

    go(page, "/school/student-access")
    heading(page, "Student data access")
    page.get_by_role("button", name=f"Remove access for {two['name']}").click()
    confirm(page, "Remove access")
    toast(page, f"Access removed for {two['name']}")
    row.wait_for(state="detached")
    assert ok(call("GET", "/student-access", t))["grants"] == []


def test_activity_filters_by_kind_and_date(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    s = seeded["students"][0]
    ok(call("PUT", f"/users/{s['id']}", t, {"address": f"7, Filter Road {TAG}"}))
    go(page, "/school/activity")
    heading(page, "Activity")
    page.get_by_label("Search").fill(f"Filter Road {TAG}")
    hit = page.locator("tbody tr", has_text=f"Filter Road {TAG}").first
    hit.wait_for()
    assert "→" in hit.inner_text(), "the old and the new value are shown"
    with page.expect_response(lambda r: "/school/audit" in r.url and "group=marks" in r.url):
        page.get_by_label("Show").select_option(label="Marks & exams")
    page.get_by_text("Nothing matches these filters").wait_for()
    page.get_by_role("button", name="Clear filters").click()
    page.locator("tbody tr").first.wait_for()
    page.get_by_label("To").fill("2001-01-01")
    page.get_by_text("Nothing matches these filters").wait_for()
