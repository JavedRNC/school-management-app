"""Principal: classes, subjects, subject teachers, timetable and period timings, attendance, exams and marks, notices, calendar."""
import datetime as dt
import re

from conftest import TAG, call, ok
from helpers import confirm, dialog, go, heading, tab, toast

TODAY = dt.date.today().isoformat()


def test_classes_add_edit_and_refuse_to_archive_a_class_with_students(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/classes")
    heading(page, "Classes & subjects")
    page.get_by_role("button", name="Add class").click()
    form = dialog(page)
    form.get_by_role("button", name="Add class").click()
    form.get_by_role("alert").filter(has_text="Give the class a name").wait_for()
    form.get_by_label("Class name").fill(f"7-{TAG}")
    form.get_by_label("Class teacher").select_option(label=f"Teacher Two {TAG}")
    form.get_by_role("button", name="Add class").click()
    toast(page, f"Class 7-{TAG} added")
    card = page.locator(".tile", has_text=f"7-{TAG}")
    card.get_by_text(f"Class teacher: Teacher Two {TAG}").wait_for()
    # rename
    card.get_by_role("button", name=f"Edit class 7-{TAG}").click()
    dialog(page).get_by_label("Class name").fill(f"7B-{TAG}")
    dialog(page).get_by_role("button", name="Save changes").click()
    toast(page, "Class saved")
    page.locator(".tile", has_text=f"7B-{TAG}").wait_for()
    # the class with students can't be archived: the reason is shown, nothing is lost
    page.get_by_role("button", name=f"Archive class 6-{TAG}").click()
    confirm(page, "Archive")
    toast(page, "Move them to another class")
    page.locator(".tile", has_text=f"6-{TAG}").wait_for()
    # the empty class can
    page.get_by_role("button", name=f"Archive class 7B-{TAG}").click()
    confirm(page, "Archive")
    toast(page, f"Class 7B-{TAG} archived")
    page.locator(".tile", has_text=f"7B-{TAG}").wait_for(state="detached")


def test_subjects_and_subject_teachers(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/classes")
    tab(page, "Subjects")
    page.get_by_role("button", name="Add subject").click()
    dialog(page).get_by_role("button", name="Add subject").click()
    dialog(page).get_by_role("alert").filter(has_text="Enter the subject name").wait_for()
    dialog(page).get_by_label("Subject name").fill(f"Hindi {TAG}")
    dialog(page).get_by_role("button", name="Add subject").click()
    toast(page, f"Hindi {TAG} added")
    page.get_by_role("button", name=f"Rename Hindi {TAG}").click()
    dialog(page).get_by_label("Subject name").fill(f"Sanskrit {TAG}")
    dialog(page).get_by_role("button", name="Save changes").click()
    toast(page, "Subject renamed")
    # assign a teacher; assigning the same subject again replaces the teacher instead of duplicating
    tab(page, "Subject teachers")
    page.get_by_role("button", name="Assign a teacher").click()
    form = dialog(page)
    assert form.get_by_role("button", name="Assign", exact=True).is_disabled()
    form.get_by_label("Class").select_option(label=f"6-{TAG}")
    form.get_by_label("Subject").select_option(label=f"Sanskrit {TAG}")
    form.get_by_label("Teacher").select_option(label=f"Teacher Two {TAG}")
    form.get_by_role("button", name="Assign", exact=True).click()
    toast(page, "Teacher assigned")
    form.get_by_label("Subject").select_option(label=f"Sanskrit {TAG}")
    form.get_by_label("Teacher").select_option(label=f"Teacher One {TAG}")
    form.get_by_role("button", name="Assign", exact=True).click()
    toast(page, "Teacher assigned")
    form.get_by_role("button", name="Done").click()
    mine = [a for a in ok(call("GET", "/assignments", school["principal"]["token"])) if a["subject_name"] == f"Sanskrit {TAG}"]
    assert len(mine) == 1 and mine[0]["teacher_name"] == f"Teacher One {TAG}"
    # archiving a subject that is in use says where it is used
    tab(page, "Subjects")
    page.get_by_role("button", name=f"Archive Sanskrit {TAG}").click()
    dialog(page).get_by_text("is used in 1 subject teachers").wait_for()
    confirm(page, "Archive")
    toast(page, f"Sanskrit {TAG} archived")


def test_period_timings_validate_and_a_single_day_can_differ(principal_page, school):
    page = principal_page
    t = school["principal"]["token"]
    slots = [{"kind": "period", "label": "", "start": f"{8 + i:02d}:00", "end": f"{8 + i:02d}:45"} for i in range(6)]
    ok(call("PUT", "/school/bell", t, {"day": -1, "slots": slots}))
    go(page, "/school/timetable")
    tab(page, "Period timings")
    page.get_by_label("Start of row 1").wait_for()
    assert page.get_by_role("button", name="Save timings").is_disabled()           # nothing changed yet
    page.get_by_label("End of row 1").fill("07:00")                               # ends before it starts
    page.get_by_role("alert").filter(has_text="Row 1: ends before it starts").wait_for()
    assert page.get_by_role("button", name="Save timings").is_disabled()
    page.get_by_label("End of row 1").fill("08:45")
    page.get_by_label("Start of row 2").fill("08:30")                             # overlaps the first period
    page.get_by_role("alert").filter(has_text="Row 2: starts before the previous one ends").wait_for()
    page.get_by_label("Start of row 2").fill("09:00")
    # a short Sunday: only two periods
    page.get_by_label("Timings for").select_option(label="Sunday only")
    for _ in range(4):
        page.get_by_role("button", name="Remove row 3").click()
    page.get_by_role("button", name="Save timings").click()
    toast(page, "Period timings saved")
    bell = ok(call("GET", "/school/bell", t))
    assert len(bell["overrides"]["6"]) == 2 and len(bell["default"]) == 6
    page.get_by_role("button", name="Use usual timings").click()
    confirm(page, "Use usual timings")
    toast(page, "Sunday now follows the usual timings")
    assert ok(call("GET", "/school/bell", t))["overrides"] == {}


def test_timetable_set_a_period_and_refuse_a_teacher_in_two_places(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    other = ok(call("POST", "/classes", t, {"name": f"8-{TAG}"}))
    ok(call("PUT", "/timetable", t, {"class_id": other["id"], "day": 0, "period": 1, "subject_id": seeded["subjects"][1]["id"], "teacher_id": seeded["teachers"][1]["id"]}))
    go(page, "/school/timetable")
    page.get_by_label("Class").select_option(label=f"6-{TAG}")
    cell = page.get_by_role("button", name=re.compile(r"^Monday period 1:"))
    cell.click()
    box = dialog(page)
    assert box.get_by_role("button", name="Save").is_disabled()
    box.get_by_label("Subject").select_option(label=f"Maths {TAG}")
    assert box.get_by_label("Teacher").input_value() == str(seeded["teachers"][0]["id"]), "the subject's teacher is filled in"
    box.get_by_label("Teacher").select_option(label=f"Teacher Two {TAG}")          # busy in 8-TAG at this time
    box.get_by_role("button", name="Save").click()
    toast(page, "Teacher already has a class in this period")
    box.get_by_label("Teacher").select_option(label=f"Teacher One {TAG}")
    box.get_by_role("button", name="Save").click()
    toast(page, "Period saved")
    page.get_by_role("button", name=f"Monday period 1: Maths {TAG}, Teacher One {TAG}").click()
    dialog(page).get_by_role("button", name="Clear period").click()
    toast(page, "Period cleared")
    page.get_by_role("button", name="Monday period 1: free").wait_for()
    ok(call("DELETE", f"/classes/{other['id']}", t))


def test_attendance_is_saved_and_read_back(principal_page, school, seeded):
    page = principal_page
    n = len(ok(call("GET", f"/classes/{seeded['klass']['id']}/students", school["principal"]["token"])))     # other tests add students to this class
    go(page, "/school/attendance")
    heading(page, "Attendance")
    page.get_by_label("Class").select_option(label=f"6-{TAG}")
    student = page.get_by_role("button", name=re.compile(rf"^Bina Das {TAG}: "))
    student.wait_for()
    assert page.get_by_role("button", name="Next day").is_disabled(), "a future day can't be opened"
    if student.get_attribute("aria-pressed") == "true":
        student.click()
    page.get_by_role("button", name=f"Bina Das {TAG}: absent").wait_for()
    page.get_by_text("You have changes that are not saved.").wait_for()
    page.get_by_role("button", name="Save attendance").click()
    toast(page, f"Attendance saved: {n - 1} of {n} present")
    page.reload()
    page.get_by_label("Class").select_option(label=f"6-{TAG}")
    page.get_by_role("button", name=f"Bina Das {TAG}: absent").wait_for()
    page.get_by_text(f"{n - 1} of {n} present").wait_for()
    sheet = ok(call("GET", "/attendance", school["principal"]["token"], query={"class_id": seeded["klass"]["id"], "day": TODAY}))
    marks = {r["name"]: r["present"] for r in sheet["rows"]}
    assert marks[f"Bina Das {TAG}"] is False and marks[f"Aman Verma {TAG}"] is True and list(marks.values()).count(False) == 1
    # all present in one go
    page.get_by_role("button", name="All present").click()
    page.get_by_role("button", name="Save attendance").click()
    toast(page, f"Attendance saved: {n} of {n} present")


def test_attendance_on_a_holiday_needs_a_deliberate_override(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    day = (dt.date.today() - dt.timedelta(days=3)).isoformat()
    hol = ok(call("POST", "/holidays", t, {"name": f"Founders day {TAG}", "start_date": day, "end_date": day, "kind": "holiday", "is_off": True}))
    try:
        go(page, "/school/attendance")
        page.get_by_label("Class").select_option(label=f"6-{TAG}")
        page.get_by_label("Day", exact=True).fill(day)
        page.get_by_text(f"Not a school day (Founders day {TAG})").wait_for()
        assert page.get_by_role("button", name=re.compile(rf"^Aman Verma {TAG}: ")).is_disabled()
        assert page.get_by_role("button", name="Save attendance").count() == 0
        page.get_by_role("button", name="Mark anyway").click()
        page.get_by_role("button", name=re.compile(rf"^Aman Verma {TAG}: ")).click()
        page.get_by_role("button", name="Save attendance").click()
        toast(page, "Attendance saved")
    finally:
        call("DELETE", f"/holidays/{hol['id']}", t)


def test_exam_and_marks_entry_rejects_marks_above_the_maximum(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/exams")
    heading(page, "Exams & marks")
    page.get_by_role("button", name="Add exam").click()
    form = dialog(page)
    form.get_by_label("Max marks per subject").fill("0")
    form.get_by_role("button", name="Add exam").click()
    form.get_by_role("alert").filter(has_text="Give the exam a name").wait_for()
    form.get_by_role("alert").filter(has_text="Between 1 and 1000").wait_for()
    form.get_by_label("Exam name").fill(f"Unit Test {TAG}")
    form.get_by_label("Max marks per subject").fill("50")
    form.get_by_role("button", name="Add exam").click()
    toast(page, f"Unit Test {TAG} added")
    page.locator("tr", has_text=f"Unit Test {TAG}").get_by_role("button", name="Enter marks").click()
    page.get_by_label("Class").select_option(label=f"6-{TAG}")
    page.get_by_label("Subject").select_option(label=f"Maths {TAG}")
    first = page.get_by_label(f"Marks for Aman Verma {TAG}")
    first.fill("51")                                                              # above the maximum
    page.get_by_text("1 not valid (0 to 50)").wait_for()
    assert page.get_by_role("button", name="Save marks").is_disabled()
    first.fill("abc")
    assert first.get_attribute("aria-invalid") == "true"
    first.fill("42.5")
    first.press("Enter")                                                          # Enter moves to the next student
    page.keyboard.type("30")
    assert page.get_by_label(f"Marks for Bina Das {TAG}").input_value() == "30"
    page.get_by_text(re.compile(r"2 of \d+ entered · class average 36\.3")).wait_for()
    page.get_by_role("button", name="Save marks").click()
    toast(page, "Marks saved for 2 students")
    exam = [e for e in ok(call("GET", "/exams", school["principal"]["token"])) if e["name"] == f"Unit Test {TAG}"][0]
    rows = ok(call("GET", "/marks", school["principal"]["token"], query={"exam_id": exam["id"], "class_id": seeded["klass"]["id"], "subject_id": seeded["subjects"][0]["id"]}))
    scores = {r["name"]: r["score"] for r in rows}
    assert scores[f"Aman Verma {TAG}"] == 42.5 and scores[f"Bina Das {TAG}"] == 30.0 and scores[f"Chirag Rao {TAG}"] is None
    # the exam can't be given a lower maximum than a mark already entered
    tab(page, "Exams")
    page.get_by_role("button", name=f"Edit Unit Test {TAG}").click()
    dialog(page).get_by_label("Max marks per subject").fill("40")
    dialog(page).get_by_role("button", name="Save changes").click()
    page.locator(".toast.bad").wait_for()
    assert [e for e in ok(call("GET", "/exams", school["principal"]["token"])) if e["id"] == exam["id"]][0]["max_marks"] == 50


def test_notice_and_homework_posting(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/notices")
    heading(page, "Notices & homework")
    page.get_by_role("button", name="New notice").click()
    form = dialog(page)
    form.get_by_role("button", name="Post notice").click()
    form.get_by_role("alert").filter(has_text="Add a title").wait_for()
    form.get_by_label("Title").fill(f"PTM on Saturday {TAG}")
    form.get_by_label("Details").fill("Parents of all classes are invited.\n<img src=x onerror=alert(1)>")
    form.get_by_role("button", name="Post notice").click()
    toast(page, "Notice posted")
    post = page.locator("article", has_text=f"PTM on Saturday {TAG}")
    post.get_by_text("Whole school").wait_for()
    post.get_by_text("<img src=x onerror=alert(1)>").wait_for()                  # shown as text, never run
    assert page.locator("article img").count() == 0
    # homework must have a class
    tab(page, "Homework")
    page.get_by_role("button", name="New homework").click()
    form = dialog(page)
    form.get_by_label("Title").fill(f"Fractions worksheet {TAG}")
    form.get_by_role("button", name="Post homework").click()
    form.get_by_role("alert").filter(has_text="Homework is for one class").wait_for()
    form.get_by_label("Class").select_option(label=f"6-{TAG}")
    form.get_by_label("Subject").select_option(label=f"Maths {TAG}")
    form.get_by_label("Due on").fill((dt.date.today() + dt.timedelta(days=2)).isoformat())
    form.get_by_role("button", name="Post homework").click()
    toast(page, "Homework posted")
    hw = page.locator("article", has_text=f"Fractions worksheet {TAG}")
    hw.get_by_text(f"Maths {TAG}").wait_for()
    hw.get_by_role("button", name=f"Remove Fractions worksheet {TAG}").click()
    confirm(page, "Remove")
    toast(page, "Removed")
    hw.wait_for(state="detached")


def test_calendar_holiday_add_edit_remove_and_national_holidays_only_once(principal_page, school):
    page = principal_page
    t = school["principal"]["token"]
    go(page, "/school/calendar")
    heading(page, "Calendar")
    page.get_by_role("button", name="Add holiday or event").click()
    form = dialog(page)
    form.get_by_label("First day").fill(TODAY)
    form.get_by_label("Last day").fill((dt.date.today() - dt.timedelta(days=1)).isoformat())
    form.get_by_role("button", name="Add to calendar").click()
    form.get_by_role("alert").filter(has_text="Give it a name").wait_for()
    form.get_by_role("alert").filter(has_text="The last day is before the first day").wait_for()
    first = dt.date.today().replace(day=20)
    form.get_by_label("Name").fill(f"Sports meet {TAG}")
    form.get_by_label("First day").fill(first.isoformat())
    form.get_by_label("Last day").fill((first + dt.timedelta(days=1)).isoformat())
    form.get_by_label("Type").select_option("event")
    assert form.get_by_role("switch", name="School is closed on these days").get_attribute("aria-checked") == "false", "an event keeps the school open"
    form.get_by_role("button", name="Add to calendar").click()
    toast(page, f"Sports meet {TAG} added")
    item = page.locator(".list .item", has_text=f"Sports meet {TAG}")
    item.get_by_text("School open").wait_for()
    page.get_by_role("button", name=re.compile(rf"^20 .*: .*Sports meet {TAG}")).wait_for()        # on the month grid, both days
    page.get_by_role("button", name=re.compile(rf"^21 .*: .*Sports meet {TAG}")).wait_for()
    item.get_by_role("button", name=f"Edit Sports meet {TAG}").click()
    closed = dialog(page).get_by_role("switch", name="School is closed on these days")
    assert closed.is_disabled(), "an event can never close the school"
    dialog(page).get_by_label("Type").select_option("vacation")
    closed.click()
    dialog(page).get_by_role("button", name="Save changes").click()
    toast(page, "Saved")
    item.get_by_text("School closed").wait_for()
    item.get_by_role("button", name=f"Remove Sports meet {TAG}").click()
    confirm(page, "Remove")
    toast(page, f"Sports meet {TAG} removed")
    # national holidays: adding twice never duplicates
    year = dt.date.today().year
    page.get_by_role("button", name="Add national holidays").click()
    confirm(page, "Add holidays")
    page.locator(".toast").filter(has_text=re.compile("national holidays added|already in your calendar")).wait_for()
    page.get_by_role("button", name="Add national holidays").click()
    confirm(page, "Add holidays")
    toast(page, "They were already in your calendar")
    names = [h["name"] for h in ok(call("GET", "/holidays", t, query={"start": f"{year}-01-01", "end": f"{year}-12-31"}))]
    assert names.count("Republic Day") == 1 and names.count("Independence Day") == 1
