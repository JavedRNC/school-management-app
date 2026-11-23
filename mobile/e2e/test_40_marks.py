"""Marks entry in the default appearance: summary strip, grade chips and the pinned save bar."""
import re

from playwright.sync_api import expect

from conftest import CHALK, bg_of, call, css, go, sign_in_demo, token_for


def test_marks_entry_summary_and_save(phone):
    tok = token_for("T001")
    _, assignments = call("GET", "/assignments", tok)
    _, exams = call("GET", "/exams", tok)
    a, exam = assignments[0], exams[0]
    q = {"exam_id": exam["id"], "class_id": a["class_id"], "subject_id": a["subject_id"]}
    _, before = call("GET", "/marks", tok, query=q)
    try:
        sign_in_demo(phone, "Teacher", "Attendance & marks")
        go(phone, "/teacher/marks")
        expect(phone.get_by_text(f"{exam['name']} · {a['subject_name']} · Class {a['class_name']}")).to_be_visible()
        for label in ["Entered", "Average", "Highest", "Passing"]:
            expect(phone.get_by_text(label, exact=True)).to_be_visible()
        entered = sum(1 for r in before if r["score"] is not None)
        count = phone.get_by_text(f"{entered}/{len(before)}", exact=True)
        expect(count).to_be_visible()
        assert "Bricolage" in css(count, "font-family") and css(count, "color") == CHALK["green"]
        expect(phone.get_by_text(f"Out of {exam['max_marks']:g}")).to_be_visible()
        # nothing changed yet: no save bar
        expect(phone.get_by_role("button", name="Save marks")).to_have_count(0)

        boxes = phone.get_by_role("textbox")
        expect(boxes).to_have_count(len(before))
        new_score = 33 if before[0]["score"] != 33 else 34
        boxes.nth(0).fill(str(new_score))
        save = phone.get_by_role("button", name="Save marks")
        expect(save).to_be_visible()
        assert bg_of(save.get_by_text("Save marks")) == CHALK["green"]
        assert save.bounding_box()["y"] > 844 - 160            # pinned above the tab bar
        save.click()
        expect(phone.get_by_role("button", name="Save marks")).to_have_count(0)
        _, after = call("GET", "/marks", tok, query=q)
        assert after[0]["score"] == new_score
    finally:
        records = [{"student_id": r["student_id"], "score": r["score"]} for r in before if r["score"] is not None]
        status, data = call("POST", "/marks", tok, body={**{k: q[k] for k in ("exam_id", "class_id", "subject_id")}, "records": records})
        assert status < 300, data


def test_marks_above_the_maximum_are_refused(phone):
    tok = token_for("T001")
    _, assignments = call("GET", "/assignments", tok)
    _, exams = call("GET", "/exams", tok)
    a, exam = assignments[0], exams[0]
    q = {"exam_id": exam["id"], "class_id": a["class_id"], "subject_id": a["subject_id"]}
    _, before = call("GET", "/marks", tok, query=q)
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    go(phone, "/teacher/marks")
    too_high = int(exam["max_marks"]) + 1
    phone.get_by_role("textbox").first.fill(str(too_high))
    phone.get_by_role("button", name="Save marks").click()
    expect(phone.get_by_text(f"{before[0]['name']}: enter 0–{exam['max_marks']:g}")).to_be_visible()
    _, after = call("GET", "/marks", tok, query=q)
    assert after[0]["score"] == before[0]["score"]
