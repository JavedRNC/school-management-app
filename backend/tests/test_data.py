"""Phase 4: period timings (F28), add many people (F29), Excel import (F30), backup & restore (F31)."""
import io
import os
import tempfile

if not os.getenv("TEST_DATABASE_URL") and "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.NamedTemporaryFile(suffix='.db', delete=False).name}"
elif os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def c():
    from sqlalchemy import MetaData

    from app.db import engine

    md = MetaData()
    md.reflect(bind=engine)
    md.drop_all(bind=engine)
    with TestClient(app) as client:
        yield client


def login(c, lid, code="DEMO01", pw="demo123"):
    r = c.post("/auth/login", json={"school_code": code, "login_id": lid, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def book(content: bytes):
    return load_workbook(io.BytesIO(content))


def to_bytes(wb) -> bytes:
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def upload(c, h, content, mode="merge", confirm=False, code="", url="/data/import"):
    return c.post(url, headers=h, files={"file": ("school.xlsx", content)},
                  data={"mode": mode, "confirm": str(confirm).lower(), "confirm_code": code})


# ================================================================ F28
def test_bell_schedule(c):
    h = login(c, "principal")
    b = c.get("/school/bell", headers=h).json()
    assert b["configured"] and len([s for s in b["default"] if s["kind"] == "period"]) == 6
    assert b["default"][3]["period"] == 3 and b["default"][2]["period"] is None     # break isn't numbered
    bad = [{"kind": "period", "start": "09:00", "end": "08:00"}]
    assert "ends before" in c.put("/school/bell", json={"day": -1, "slots": bad}, headers=h).json()["detail"]
    overlap = [{"kind": "period", "start": "08:00", "end": "09:00"}, {"kind": "period", "start": "08:30", "end": "09:30"}]
    assert c.put("/school/bell", json={"day": -1, "slots": overlap}, headers=h).status_code == 400
    # Saturday with 3 periods conflicts with the seeded timetable (5 periods) → 409 naming the periods
    sat = [{"kind": "period", "start": f"{8 + i:02d}:00", "end": f"{8 + i:02d}:40"} for i in range(3)]
    r = c.put("/school/bell", json={"day": 5, "slots": sat}, headers=h)
    assert r.status_code == 409 and "Sat period 4" in r.json()["detail"]
    # 5 periods on Saturday is fine; timetable can't use period 6 there
    sat5 = [{"kind": "period", "start": f"{8 + i:02d}:00", "end": f"{8 + i:02d}:40"} for i in range(5)]
    assert c.put("/school/bell", json={"day": 5, "slots": sat5}, headers=h).json()["overrides"]["5"][4]["end"] == "12:40"
    classes = c.get("/classes", headers=h).json()
    asg = c.get("/assignments", headers=h).json()[0]
    r = c.put("/timetable", json={"class_id": classes[0]["id"], "day": 5, "period": 6, "subject_id": asg["subject_id"],
                                  "teacher_id": asg["teacher_id"]}, headers=h)
    assert r.status_code == 400 and "only 5 periods" in r.json()["detail"]
    assert c.delete("/school/bell/5", headers=h).json()["overrides"] == {}
    # teachers can read, not change
    ht = login(c, "T001")
    assert c.get("/school/bell", headers=ht).status_code == 200
    assert c.put("/school/bell", json={"day": -1, "slots": sat5}, headers=ht).status_code == 403


def test_timetable_rejects_teacher_of_other_school(c):
    h = login(c, "principal")
    h2 = login(c, "principal", "DEMO02")
    other_teacher = next(u for u in c.get("/users?role=teacher", headers=h2).json())
    cl = c.get("/classes", headers=h).json()[0]
    sub = c.get("/subjects", headers=h).json()[0]
    r = c.put("/timetable", json={"class_id": cl["id"], "day": 0, "period": 1, "subject_id": sub["id"], "teacher_id": other_teacher["id"]}, headers=h)
    assert r.status_code == 400


# ================================================================ F29
def test_bulk_add_students_with_parents(c):
    h = login(c, "principal")
    rows = [{"name": "Riya Sen", "login_id": "2026201", "class": "8-A", "roll_no": 40, "parent_name": "Amit Sen", "parent_mobile": "+91 98111-22233"},
            {"name": "Kabir Sen", "login_id": "2026202", "class": "8-B", "roll_no": 41, "parent_mobile": "9811122233", "dob": "05/06/2013"},
            {"name": "", "login_id": "2026001", "class": "12-Z", "dob": "31/02/2010", "blood_group": "Z+"},
            {"name": "Dup", "login_id": "2026201", "class": "8-A"}]
    r = c.post("/users/bulk", json={"role": "student", "rows": rows}, headers=h).json()
    assert not r["ok"]
    fields = {(e["row"], e["field"]) for e in r["errors"]}
    assert {(3, "name"), (3, "class"), (3, "dob"), (3, "blood_group"), (3, "login_id"), (4, "login_id")} <= fields
    assert c.post("/users/bulk", json={"role": "student", "rows": rows, "dry_run": False}, headers=h).json()["ok"] is False
    assert not [u for u in c.get("/users?role=student", headers=h).json() if u["login_id"] == "2026201"]   # nothing saved
    r = c.post("/users/bulk", json={"role": "student", "rows": rows[:2], "dry_run": False}, headers=h).json()
    assert r["ok"] and r["by_role"] == {"parent": {"add": 1, "update": 0}, "student": {"add": 2, "update": 0}}
    creds = {x["login_id"]: x["password"] for x in r["credentials"]}
    assert set(creds) == {"9811122233", "2026201", "2026202"}
    rp = c.post("/auth/login", json={"school_code": "DEMO01", "login_id": "9811122233", "password": creds["9811122233"]}).json()
    assert rp["user"]["must_change_password"]
    me = c.get("/me/children", headers={"Authorization": f"Bearer {rp['token']}"})
    assert me.status_code in (200, 403)   # consent may be required first; link checked below
    parent = next(u for u in c.get("/users?role=parent", headers=h).json() if u["login_id"] == "9811122233")
    assert len(parent["children_ids"]) == 2


def test_bulk_add_teachers_permissions(c):
    h = login(c, "principal")
    rows = [{"name": "New Teacher", "login_id": "T101", "phone": "9876543210", "email": "t101@school.in"}]
    assert c.post("/users/bulk", json={"role": "teacher", "rows": rows, "dry_run": False}, headers=h).json()["ok"]
    hv = login(c, "vp")   # VP has people:edit but can't add VPs/coordinators
    assert c.post("/users/bulk", json={"role": "teacher", "rows": [{"name": "X", "login_id": "T102"}]}, headers=hv).json()["ok"]
    assert c.post("/users/bulk", json={"role": "coordinator", "rows": [{"name": "X", "login_id": "C9"}]}, headers=hv).status_code == 403
    assert c.post("/users/bulk", json={"role": "principal", "rows": [{"name": "X", "login_id": "P9"}]}, headers=h).status_code == 400
    assert c.post("/users/bulk", json={"role": "teacher", "rows": rows}, headers=login(c, "T001")).status_code == 403
    assert c.post("/users/bulk", json={"role": "teacher", "rows": [{"name": "Y", "login_id": "x" * 70}]}, headers=h).json()["ok"] is False


# ================================================================ F30 template import (fresh setup on DEMO02)
def fill_template(c, h) -> bytes:
    wb = book(c.get("/data/template", headers=h).content)
    assert "_auth" not in wb.sheetnames and "Attendance" not in wb.sheetnames
    wb["Classes"].append(["6-A", "E201", 1200, "Yes"])
    wb["Classes"].append(["7-A", "", None, "Yes"])
    wb["Subjects"].append(["Hindi", "Yes"])
    wb["Staff"].append(["E201", "Sunita Verma", "Teacher", "9876500101", "", "", "1985-04-12", "B+", "", "Yes"])
    wb["Staff"].append(["E202", "Rakesh Jha", "Teacher", "", "", "", "", "", "", "Yes"])
    wb["Students"].append(["S101", "Aman Gupta", "6-A", 1, "2014-02-01", "O+", "", "", "Ravi Gupta", "9876500201", "Father", "Yes"])
    wb["Students"].append(["S102", "=HYPERLINK(\"http://evil\",\"x\")", "6-A", 2, "", "", "", "", "Ravi Gupta", "9876500201", "Father", "Yes"])
    wb["Students"].cell(wb["Students"].max_row, 2).data_type = "s"     # typed as text, as a spreadsheet app would store it
    wb["Students"].append(["S103", "Neha Roy", "7-A", 1, "", "", "", "", "", "", "", "Yes"])
    wb["Teaching"].append(["6-A", "Hindi", "E201"])
    for i, (st, en) in enumerate([("08:00", "08:45"), ("08:45", "09:30"), ("09:30", "09:45"), ("09:45", "10:30")]):
        wb["Period timings"].append(["All days", "Break" if i == 2 else "Period", "Recess" if i == 2 else "", st, en])
    wb["Timetable"].append(["6-A", "Sun", 1, "Hindi", "E201"])
    wb["Timetable"].append(["6-A", "Mon", 3, "Hindi", "E202"])
    wb["Holidays"].append(["Diwali", "festival", "2026-11-08", "2026-11-10", "Yes", "", "Yes"])
    return to_bytes(wb)


def test_template_import_preview_then_commit(c):
    h = login(c, "principal", "DEMO02")
    content = fill_template(c, h)
    r = upload(c, h, content).json()
    assert r["ok"], r["errors"]
    counts = {s["sheet"]: s for s in r["sheets"]}
    assert counts["Classes"]["add"] == 2 and counts["Students"]["add"] == 3 and counts["Parents"]["add"] == 1
    assert counts["Staff"]["add"] == 2 and counts["Timetable"]["add"] == 2 and counts["Period timings"]["add"] == 1
    assert r["saved"] is False and "credentials" not in r
    assert not [x for x in c.get("/classes", headers=h).json() if x["name"] == "6-A"]     # preview saved nothing
    r = upload(c, h, content, confirm=True).json()
    assert r["saved"] and len(r["credentials"]) == 6       # 2 staff + 3 students + 1 parent
    pw = {x["login_id"]: x["password"] for x in r["credentials"]}
    assert c.post("/auth/login", json={"school_code": "DEMO02", "login_id": "E201", "password": pw["E201"]}).status_code == 200
    cls = {x["name"]: x for x in c.get("/classes", headers=h).json()}
    assert cls["6-A"]["class_teacher_id"]
    names = {u["login_id"]: u["name"] for u in c.get("/users?role=student", headers=h).json()}
    assert names["S102"].startswith("=HYPERLINK")             # stored as plain text
    # exported back with a leading apostrophe → never a live formula
    wb = book(c.get("/data/template", headers=h).content)
    vals = [r[1] for r in wb["Students"].iter_rows(min_row=2, values_only=True)]
    assert any(isinstance(v, str) and v.startswith("'=HYPERLINK") for v in vals)
    assert all(cell.data_type != "f" for row in wb["Students"].iter_rows() for cell in row)
    # importing the same file again = merge: no new rows
    r = upload(c, h, content, confirm=True).json()
    assert r["saved"] and sum(s["add"] for s in r["sheets"]) == 0 and not r["credentials"]


def test_import_errors_save_nothing(c):
    h = login(c, "principal", "DEMO02")
    wb = book(c.get("/data/template", headers=h).content)
    wb["Students"].append(["S201", "Ok Kid", "6-A", 3, "", "", "", "", "", "", "", "Yes"])
    wb["Students"].append(["S202", "Bad Kid", "9-Z", "x", "31-31-2010", "", "", "", "", "12345", "", "Yes"])
    wb["Staff"].append(["V1", "Vice", "Vice Principal", "", "", "", "", "", "", "Yes"])     # Basic plan: no extra roles
    wb["Timetable"].append(["6-A", "Sun", 9, "Hindi", "E201"])                            # only 3 periods
    wb["Timetable"].append(["7-A", "Sun", 1, "Hindi", "E201"])                            # E201 already in 6-A Sun P1
    r = upload(c, h, to_bytes(wb), confirm=True).json()
    assert not r["ok"] and not r["saved"]
    msgs = " ".join(f"{e['sheet']}:{e['field']}:{e['message']}" for e in r["errors"])
    for frag in ("9-Z", "roll", "Parent mobile", "Extra roles", "only 3 periods", "two classes"):
        assert frag.lower() in msgs.lower(), frag
    assert "S201" not in {u["login_id"] for u in c.get("/users?role=student", headers=h).json()}


def test_bad_files_and_permissions(c):
    h = login(c, "principal", "DEMO02")
    assert upload(c, h, b"hello").status_code == 400
    assert upload(c, h, b"PK\x03\x04garbage").status_code == 400
    assert upload(c, h, to_bytes(book(c.get("/data/template", headers=h).content)), mode="wipe").status_code == 400
    for who, code in (("T001", "DEMO01"), ("vp", "DEMO01"), ("2026001", "DEMO01")):
        hh = login(c, who, code)
        assert c.get("/data/backup", headers=hh).status_code == 403
        assert c.get("/data/template", headers=hh).status_code == 403
    # admin needs the school's support access
    ha = admin(c)
    sid = next(s["id"] for s in c.get("/admin/schools", headers=ha).json() if s["code"] == "DEMO02")
    assert c.get(f"/admin/schools/{sid}/data/backup", headers=ha).status_code == 403
    assert c.post("/school/support-access", json={"hours": 24}, headers=h).status_code == 200
    assert c.get(f"/admin/schools/{sid}/data/backup", headers=ha).status_code == 200
    c.delete("/school/support-access", headers=h)
    assert c.get(f"/admin/schools/{sid}/data/backup", headers=ha).status_code == 403


def admin(c):
    from app.db import SessionLocal
    from app.models import Role, User
    from app.auth import hash_password
    from sqlalchemy import select

    with SessionLocal() as db:
        a = db.scalar(select(User).where(User.role == Role.admin))
        a.password_hash, a.must_change_password = hash_password("Admin#2026"), False
        db.commit()
    return login(c, "admin", "ADMIN", "Admin#2026")


# ================================================================ F31 backup & restore
def test_backup_restore_round_trip_keeps_passwords(c):
    h = login(c, "principal")
    b1 = c.get("/data/backup", headers=h)
    assert b1.headers["content-type"].startswith("application/vnd.openxmlformats") and "Backup-DEMO01" in b1.headers["content-disposition"]
    wb = book(b1.content)
    assert wb["_auth"].sheet_state == "hidden" and wb["Attendance"].max_row > 100 and wb["Payments"].max_row > 10
    # replace needs the school code typed
    r = upload(c, h, b1.content, mode="replace", confirm=True, code="WRONG")
    assert r.status_code == 400
    r = upload(c, h, b1.content, mode="replace", confirm=True, code="demo01").json()
    assert r["saved"] and r["passwords_kept"] and r["new_logins"] == 0, r["errors"][:3]
    assert c.post("/auth/login", json={"school_code": "DEMO01", "login_id": "T001", "password": "demo123"}).status_code == 200
    h = login(c, "principal")         # principal kept
    b2 = c.get("/data/backup", headers=h).content

    def rows(content):
        w = load_workbook(io.BytesIO(content), read_only=True)
        return {ws.title: list(ws.iter_rows(values_only=True)) for ws in w.worksheets if ws.title not in ("_meta", "Read me")}
    r1, r2 = rows(b1.content), rows(b2)
    same = {"Students", "Staff", "Parents", "Classes", "Timetable", "Attendance", "Marks", "Fee charges", "Payment split",
            "Holidays", "Bus riders", "Poll answers", "Leaves", "Receipt numbers"}
    refs = {"Fee charges": (0, 3, 7), "Payment split": (0, 1), "Poll answers": (0,)}   # file-local ids differ after restore

    def strip(sheet, rows_):
        drop = refs.get(sheet, ())
        return [tuple(v for i, v in enumerate(r) if i not in drop) for r in rows_]
    for s in same:
        assert strip(s, r1[s]) == strip(s, r2[s]), s
    # fees still add up after restore
    summ = c.get("/fees/summary", headers=h).json()
    assert summ["outstanding"] > 0 and summ["pending_claims"] >= 1


def test_tampered_backup_does_not_keep_passwords(c):
    h = login(c, "principal")
    wb = book(c.get("/data/backup", headers=h).content)
    ws = wb["_auth"]
    for row in ws.iter_rows(min_row=2):
        if row[0].value == "T001":
            from app.auth import hash_password
            row[1].value = hash_password("hacked123")
            row[2].value = "No"
    ws2 = wb["Staff"]
    ws2.append(["T999", "Planted", "Teacher", "", "", "", "", "", "", "Yes"])
    r = upload(c, h, to_bytes(wb), confirm=True).json()
    assert r["saved"] and not r["passwords_kept"] and any("can't be verified" in w for w in r["warnings"])
    assert {x["login_id"] for x in r["credentials"]} == {"T999"}       # new account gets a temporary password
    assert c.post("/auth/login", json={"school_code": "DEMO01", "login_id": "T001", "password": "hacked123"}).status_code == 401


def test_other_schools_backup_cannot_bring_passwords(c):
    h1 = login(c, "principal")
    h2 = login(c, "principal", "DEMO02")
    content = c.get("/data/backup", headers=h1).content
    r = upload(c, h2, content).json()      # preview only
    assert not r["passwords_kept"] and any("DEMO01" in w for w in r["warnings"])


def test_principal_row_cannot_create_or_hijack(c):
    h = login(c, "principal", "DEMO02")
    wb = book(c.get("/data/template", headers=h).content)
    wb["Principal"].append(["evilprincipal", "Evil", "", "", "", "", ""])
    wb["Staff"].append(["principal", "Not me", "Teacher", "", "", "", "", "", "", "Yes"])
    r = upload(c, h, to_bytes(wb)).json()
    assert not r["ok"] and any("principal" in e["message"].lower() for e in r["errors"])
    assert any("evilprincipal" in w for w in r["warnings"])
