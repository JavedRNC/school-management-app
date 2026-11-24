"""F40 in the default appearance: a class teacher edits a student of their class; the principal lets them edit parents too."""
import pytest
import datetime as dt
import re

from playwright.sync_api import expect

from conftest import TODAY, call, go, sign_in_demo, token_for


@pytest.mark.tc("TC-A-015", "Class teacher edits a student from the home card (F40)")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_class_teacher_edits_a_student_from_the_home_card(phone):
    tok = token_for("T001")
    _, mine = call("GET", "/my-students", tok)
    student = mine["students"][0]
    new_phone = "9123456780" if student["phone"] != "9123456780" else "9123456781"
    try:
        sign_in_demo(phone, "Teacher", "Attendance & marks")
        # TC-A-015.1 — Student details opens My students with the class and 'class teacher'
        phone.get_by_role("button", name="Student details").click()
        phone.wait_for_url(re.compile(r"/more/my-students"))
        expect(phone.get_by_text(f"{mine['classes'][0]['name']} · class teacher · students: edit · parents: no access")).to_be_visible()
        expect(phone.get_by_role("button", name="Add student")).to_have_count(0)          # adding is off by default
        # TC-A-015.2 — Edit a student's mobile and save
        phone.get_by_role("button", name=f"Edit {student['name']}").click()
        expect(phone.get_by_text("Edit student details")).to_be_visible()
        field = phone.get_by_label("Mobile number")
        field.fill(new_phone)
        phone.get_by_role("button", name="Save changes").click()
        expect(phone.get_by_text(f"{student['name']} saved")).to_be_visible()
        # TC-A-015.3 — The server has it and the activity log shows 'by teacher' with the new value
        _, after = call("GET", "/my-students", tok)
        assert next(s for s in after["students"] if s["id"] == student["id"])["phone"] == new_phone
        _, log = call("GET", "/school/audit", token_for("principal"), query={"group": "people", "q": student["login_id"]})
        assert log and "by teacher" in log[0]["detail"] and new_phone in log[0]["detail"]
    finally:
        call("PUT", f"/my-students/{student['id']}", tok, {"phone": student["phone"]})
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-016", "Principal sets class teachers' levels in the app (F40)")
@pytest.mark.sanity
@pytest.mark.regression
def test_principal_sets_class_teacher_levels(phone):
    p = token_for("principal")
    try:
        sign_in_demo(phone, "Principal", "Insights & admin")
        # TC-A-016.1 — Student data access opens with students 'Edit details' and parents 'No access'
        go(phone, "/more/student-access")
        expect(phone.get_by_text("Student data access").first).to_be_visible()
        students = phone.get_by_role("radiogroup", name="Students")
        expect(students.get_by_role("radio", name="Edit details")).to_have_attribute("aria-checked", "true")
        # TC-A-016.2 — Choosing 'Add and edit' for students and parents is saved
        students.get_by_role("radio", name="Add and edit").click()
        expect(phone.get_by_text("Class teachers: access saved").first).to_be_visible()
        phone.get_by_role("radiogroup", name="Parents").get_by_role("radio", name="Add and edit").click()
        expect(phone.get_by_role("radiogroup", name="Parents").get_by_role("radio", name="Add and edit")).to_have_attribute("aria-checked", "true")
        _, acc = call("GET", "/student-access", p)
        assert acc["class_teachers"] == {"students": "add", "parents": "add"}
    finally:
        call("PUT", "/student-access/policy", p, {"students": "edit", "parents": "none"})
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-031", "Class teacher adds a student and gets the temporary password (F40)")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_class_teacher_adds_a_student(phone):
    p, tok = token_for("principal"), token_for("T001")
    login_id = f"APPT{TODAY.strftime('%d')}{dt.datetime.now().strftime('%H%M%S')}"
    call("PUT", "/student-access/policy", p, {"students": "add", "parents": "none"})
    try:
        sign_in_demo(phone, "Teacher", "Attendance & marks")
        go(phone, "/more/my-students")
        # TC-A-031.1 — Add student asks for a name and admission no.
        phone.get_by_role("button", name="Add student").click()
        sheet_title = phone.get_by_text("Add student").last
        expect(sheet_title).to_be_visible()
        phone.get_by_role("button", name="Add student").last.click()
        expect(phone.get_by_text("Name is required")).to_be_visible()
        # TC-A-031.2 — The student is added to the teacher's class and the sign-in details are shown once
        phone.get_by_label("Full name").fill("Teacher Added Kid")
        phone.get_by_label("Admission no.").fill(login_id)
        phone.get_by_label("Roll no.").fill("41")
        phone.get_by_role("button", name="Add student").last.click()
        expect(phone.get_by_text("Student added")).to_be_visible()
        expect(phone.get_by_text(login_id).first).to_be_visible()
        _, mine = call("GET", "/my-students", tok)
        kid = next(s for s in mine["students"] if s["login_id"] == login_id)
        assert kid["roll_no"] == 41 and kid["class_id"] == mine["classes"][0]["id"]
    finally:
        call("PUT", "/student-access/policy", p, {"students": "edit", "parents": "none"})
        _, users = call("GET", "/users", p, query={"role": "student"})
        for u in users:
            if u["login_id"] == login_id:
                call("DELETE", f"/users/{u['id']}", p)
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


@pytest.mark.tc("TC-A-032", "Class teacher adds a parent for a student (F40)")
@pytest.mark.sanity
@pytest.mark.regression
def test_class_teacher_adds_a_parent(phone):
    p, tok = token_for("principal"), token_for("T001")
    mobile = "97" + dt.datetime.now().strftime("%H%M%S") + "12"
    call("PUT", "/student-access/policy", p, {"students": "edit", "parents": "add"})
    try:
        _, mine = call("GET", "/my-students", tok)
        kid = mine["students"][0]
        sign_in_demo(phone, "Teacher", "Attendance & marks")
        go(phone, "/more/my-students")
        # TC-A-032.1 — Opening a student shows their parents and 'Add parent'
        phone.get_by_text(kid["name"], exact=False).first.click()
        phone.get_by_role("button", name=f"Add parent for {kid['name']}").click()
        expect(phone.get_by_text(f"Add parent for {kid['name'].split()[0]}")).to_be_visible()
        # TC-A-032.2 — A wrong mobile is refused; a right one creates the parent and shows the sign-in details
        phone.get_by_label("Parent's full name").fill("App Parent")
        phone.get_by_label("Parent's mobile number").fill("12345")
        phone.get_by_role("button", name="Add parent").last.click()
        expect(phone.get_by_text("Enter a 10-digit mobile number")).to_be_visible()
        phone.get_by_label("Parent's mobile number").fill(mobile)
        phone.get_by_role("button", name="Add parent").last.click()
        expect(phone.get_by_text("Parent added", exact=True)).to_be_visible()
        _, parents = call("GET", "/users", p, query={"role": "parent"})
        made = next(u for u in parents if u["login_id"] == mobile)
        assert kid["id"] in made["children_ids"]
    finally:
        call("PUT", "/student-access/policy", p, {"students": "edit", "parents": "none"})
        _, parents = call("GET", "/users", p, query={"role": "parent"})
        for u in parents:
            if u["login_id"] == mobile:
                call("DELETE", f"/users/{u['id']}", p)
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]
