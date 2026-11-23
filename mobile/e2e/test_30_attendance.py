"""Attendance in the default appearance: day stepper, live count, List / Grid, saving."""
import datetime as dt
import re

import pytest
from playwright.sync_api import expect

from conftest import CHALK, TODAY, bg_of, call, go, sign_in_demo, token_for


@pytest.fixture(scope="module")
def sheet():
    """The class teacher's class and the most recent day (up to 6 back) a teacher can mark — today on a school day."""
    tok = token_for("T001")
    _, me = call("GET", "/auth/me", tok)
    _, classes = call("GET", "/classes", tok)
    cls = next(c for c in classes if c["class_teacher_id"] == me["id"])
    for back in range(0, 7):
        day = TODAY - dt.timedelta(days=back)
        _, s = call("GET", "/attendance", tok, query={"class_id": cls["id"], "day": day.isoformat()})
        if s["is_school_day"] and s["can_edit"]:
            return {"tok": tok, "cls": cls, "day": day, "back": back, "sheet": s}
    pytest.skip("no markable school day in the last week")


def _open(phone, sheet):
    sign_in_demo(phone, "Teacher", "Attendance & marks")
    go(phone, "/teacher/attendance")
    expect(phone.get_by_text("Attendance", exact=True).first).to_be_visible()
    for _ in range(sheet["back"]):
        phone.get_by_role("button", name="Previous day").click()
    expect(phone.get_by_role("switch").first).to_be_visible()


def _saved_state(sheet):
    _, s = call("GET", "/attendance", sheet["tok"], query={"class_id": sheet["cls"]["id"], "day": sheet["day"].isoformat()})
    return {r["student_id"]: r["present"] for r in s["rows"]}


def _restore(sheet, state):
    records = [{"student_id": sid, "present": True if p is None else p} for sid, p in state.items()]
    status, data = call("POST", "/attendance", sheet["tok"], body={"class_id": sheet["cls"]["id"], "date": sheet["day"].isoformat(), "records": records})
    assert status < 300, data


def _count(phone, word):
    """The big number next to 'present' / 'absent' in the summary card."""
    label = phone.get_by_label(re.compile(r"^\d+ present, \d+ absent out of \d+")).get_attribute("aria-label")
    present, absent, _total = map(int, re.findall(r"\d+", label)[:3])
    return present if word == "present" else absent


def test_attendance_screen_layout(phone, sheet):
    _open(phone, sheet)
    rows = sheet["sheet"]["rows"]
    day_label = "Today" if sheet["back"] == 0 else "Yesterday" if sheet["back"] == 1 else None
    if day_label:
        expect(phone.get_by_label(re.compile(f"^{day_label}, "))).to_be_visible()
    if sheet["back"] == 0:
        expect(phone.get_by_role("button", name="Next day")).to_be_disabled()
    expect(phone.get_by_text(sheet["cls"]["name"], exact=True).first).to_be_visible()
    # summary card: ring + counts, in the theme's green and absent colours
    present = sum(1 for r in rows if r["present"] is not False)
    assert _count(phone, "present") == present
    assert _count(phone, "absent") == len(rows) - present
    # List is the default view; each student is a switch with name and roll number
    expect(phone.get_by_role("radio", name="List")).to_have_attribute("aria-checked", "true")
    expect(phone.get_by_role("switch")).to_have_count(len(rows))
    first = rows[0]
    row = phone.get_by_role("switch", name=re.compile(f"^{re.escape(first['name'])}, roll"))
    expect(row).to_be_visible()
    pill = row.get_by_text("Present", exact=True) if first["present"] is not False else row.get_by_text("Absent", exact=True)
    assert bg_of(pill) == (CHALK["green"] if first["present"] is not False else CHALK["absent"])
    # the save bar is pinned at the bottom
    save = phone.get_by_role("button", name=re.compile(r"(Save|Update) attendance$"))
    expect(save).to_be_visible()
    assert save.bounding_box()["y"] > 844 - 160


def test_tapping_students_updates_the_count_and_bulk_buttons(phone, sheet):
    _open(phone, sheet)
    rows = sheet["sheet"]["rows"]
    target = next(r for r in rows if r["present"] is not False)
    before = _count(phone, "present")
    sw = phone.get_by_role("switch", name=re.compile(f"^{re.escape(target['name'])}, roll"))
    expect(sw).to_have_attribute("aria-checked", "true")
    sw.click()
    expect(sw).to_have_attribute("aria-checked", "false")
    assert _count(phone, "present") == before - 1
    expect(phone.get_by_text("Edited" if any(r["present"] is not None for r in rows) else "Not saved", exact=True)).to_be_visible()
    sw.click()
    assert _count(phone, "present") == before
    phone.get_by_role("button", name="All absent").click()
    assert _count(phone, "present") == 0
    phone.get_by_role("button", name="All present").click()
    assert _count(phone, "present") == len(rows)


def test_grid_view_is_remembered_on_the_phone(phone, sheet):
    _open(phone, sheet)
    phone.get_by_role("radio", name="Grid").click()
    expect(phone.get_by_role("radio", name="Grid")).to_have_attribute("aria-checked", "true")
    expect(phone.get_by_text("Everyone starts present. Tap a student to mark absent.")).to_be_visible()
    rows = sheet["sheet"]["rows"]
    first_name = rows[0]["name"].split()[0]
    tile = phone.get_by_role("switch", name=re.compile(f"^{re.escape(rows[0]['name'])}, roll"))
    expect(tile.get_by_text(first_name, exact=True)).to_be_visible()
    # three tiles to a row
    boxes = [phone.get_by_role("switch").nth(i).bounding_box() for i in range(min(3, len(rows)))]
    if len(boxes) == 3:
        assert abs(boxes[0]["y"] - boxes[2]["y"]) < 2 and boxes[0]["x"] < boxes[1]["x"] < boxes[2]["x"]
    assert phone.evaluate("localStorage.getItem('attendance_view')") == "grid"
    phone.reload()
    for _ in range(sheet["back"]):
        phone.get_by_role("button", name="Previous day").click()
    expect(phone.get_by_role("radio", name="Grid")).to_have_attribute("aria-checked", "true")


def test_previous_day_and_back(phone, sheet):
    _open(phone, sheet)
    phone.get_by_role("button", name="Previous day").click()
    label = "Yesterday" if sheet["back"] == 0 else None
    if label:
        expect(phone.get_by_label(re.compile(f"^{label}, "))).to_be_visible()
    phone.get_by_role("button", name="Next day").click()
    if sheet["back"] == 0:
        expect(phone.get_by_label(re.compile("^Today, "))).to_be_visible()


def test_saving_attendance_reaches_the_server(phone, sheet):
    original = _saved_state(sheet)
    try:
        _open(phone, sheet)
        rows = sheet["sheet"]["rows"]
        target = next(r for r in rows if r["present"] is not False)
        phone.get_by_role("switch", name=re.compile(f"^{re.escape(target['name'])}, roll")).click()
        phone.get_by_role("button", name=re.compile(r"(Save|Update) attendance$")).click()
        expect(phone.get_by_text(re.compile(r"^Saved · \d+ present, \d+ absent"))).to_be_visible()
        assert _saved_state(sheet)[target["student_id"]] is False
        expect(phone.get_by_text("Saved", exact=True)).to_be_visible()
    finally:
        _restore(sheet, original)
