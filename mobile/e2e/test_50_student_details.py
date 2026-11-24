"""F40 in the default appearance: a class teacher edits a student of their class; the principal lets them edit parents too."""
import re

from playwright.sync_api import expect

from conftest import call, go, sign_in_demo, token_for


def test_class_teacher_edits_a_student_from_the_home_card(phone):
    tok = token_for("T001")
    _, mine = call("GET", "/my-students", tok)
    student = mine["students"][0]
    new_phone = "9123456780" if student["phone"] != "9123456780" else "9123456781"
    try:
        sign_in_demo(phone, "Teacher", "Attendance & marks")
        phone.get_by_role("button", name="Student details").click()
        phone.wait_for_url(re.compile(r"/more/my-students"))
        expect(phone.get_by_text(f"{mine['classes'][0]['name']} · class teacher")).to_be_visible()
        expect(phone.get_by_text("Parent details: principal only")).to_be_visible()
        phone.get_by_role("button", name=f"Edit {student['name']}").click()
        expect(phone.get_by_text("Edit student details")).to_be_visible()
        field = phone.get_by_label("Mobile number")
        field.fill(new_phone)
        phone.get_by_role("button", name="Save changes").click()
        expect(phone.get_by_text(f"{student['name']} saved")).to_be_visible()
        _, after = call("GET", "/my-students", tok)
        assert next(s for s in after["students"] if s["id"] == student["id"])["phone"] == new_phone
        _, log = call("GET", "/school/audit", token_for("principal"), query={"group": "people", "q": student["login_id"]})
        assert log and "by teacher" in log[0]["detail"] and new_phone in log[0]["detail"]
    finally:
        call("PUT", f"/my-students/{student['id']}", tok, {"phone": student["phone"]})
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]


def test_principal_lets_class_teachers_edit_parents(phone, new_phone):
    p = token_for("principal")
    try:
        sign_in_demo(phone, "Principal", "Insights & admin")
        go(phone, "/more/student-access")
        expect(phone.get_by_text("Student data access").first).to_be_visible()
        parents = phone.get_by_role("switch", name="Class teachers can edit parents")
        expect(parents).not_to_be_checked()
        parents.click()
        expect(phone.get_by_text("Class teachers can edit parent details")).to_be_visible()
        _, acc = call("GET", "/student-access", p)
        assert acc["class_teachers_parents"] is True
        # the class teacher now sees each student's parents
        teacher = new_phone()
        sign_in_demo(teacher, "Teacher", "Attendance & marks")
        go(teacher, "/more/my-students")
        expect(teacher.get_by_text("Parent details: can edit")).to_be_visible()
        _, mine = call("GET", "/my-students", token_for("T001"))
        s = next(x for x in mine["students"] if x["parents"])
        teacher.get_by_text(s["name"], exact=False).first.click()
        expect(teacher.get_by_role("button", name=re.compile(f"{s['parents'][0]['relation']}: "))).to_be_visible()
    finally:
        call("PUT", "/student-access/policy", p, {"class_teachers": True, "class_teachers_parents": False})
    assert not phone.errors, phone.errors  # type: ignore[attr-defined]
