"""F30/F31 · School data workbook: Excel template, full backup export, and import/restore.

One format for everything: the template is an empty backup, a backup is a filled template plus history sheets.
Sheets use human keys (admission no., employee code, class name…) so principals can read and edit them.
Rows that need linking without a natural key (fees, polls…) carry a `Ref` column that is only meaningful
inside the file.

Security notes
- Cell text that starts with = + - @ is written with a leading apostrophe so Excel never runs it as a formula,
  and every cell is written as text/number (never a formula).
- Password hashes travel only in the hidden `_auth` sheet, signed with HMAC-SHA256 (server secret + school code).
  Hashes are used on import only when the signature verifies for the same school; otherwise people get new
  temporary passwords. Principal/admin accounts are never created or overwritten from a file.
"""
import hashlib
import hmac
import io
from datetime import date, datetime

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from . import auth

FORMAT_VERSION = 1
DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
YES, NO = "Yes", "No"

# ---------------------------------------------------------------- sheet specs: (key, header)
SPEC: dict[str, list[tuple[str, str]]] = {
    "School": [("setting", "Setting"), ("value", "Value")],
    "Principal": [("login_id", "Login ID"), ("name", "Name"), ("phone", "Phone"), ("email", "Email"), ("address", "Address"),
                  ("dob", "Date of birth"), ("blood_group", "Blood group")],
    "Classes": [("name", "Class"), ("class_teacher", "Class teacher (employee code)"), ("monthly_fee", "Monthly fee ₹ (blank = school fee)"),
                ("active", "Active")],
    "Subjects": [("name", "Subject"), ("active", "Active")],
    "Staff": [("login_id", "Employee code"), ("name", "Name"), ("role", "Role"), ("phone", "Phone"), ("email", "Email"),
              ("address", "Address"), ("dob", "Date of birth"), ("blood_group", "Blood group"),
              ("scope_classes", "Coordinator's classes"), ("active", "Active")],
    "Parents": [("login_id", "Mobile"), ("name", "Name"), ("email", "Email"), ("address", "Address"),
                ("children", "Children (admission nos.)"), ("relation", "Relation"), ("active", "Active")],
    "Students": [("login_id", "Admission no."), ("name", "Name"), ("class", "Class"), ("roll_no", "Roll no."),
                 ("dob", "Date of birth"), ("blood_group", "Blood group"), ("phone", "Phone"), ("address", "Address"),
                 ("parent_name", "Parent name"), ("parent_mobile", "Parent mobile"), ("relation", "Relation"), ("active", "Active")],
    "Teaching": [("class", "Class"), ("subject", "Subject"), ("teacher", "Teacher (employee code)")],
    "Period timings": [("day", "Day"), ("kind", "Type"), ("label", "Label"), ("start", "Start (HH:MM)"), ("end", "End (HH:MM)")],
    "Timetable": [("class", "Class"), ("day", "Day"), ("period", "Period"), ("subject", "Subject"), ("teacher", "Teacher (employee code)")],
    "Holidays": [("name", "Name"), ("kind", "Type"), ("start", "From"), ("end", "To"), ("is_off", "School closed"),
                 ("note", "Note"), ("active", "Active")],
    "Fee setup": [("setting", "Setting"), ("value", "Value")],
    "Vehicles": [("number", "Vehicle number"), ("kind", "Type"), ("capacity", "Seats"), ("driver_name", "Driver"),
                 ("driver_phone", "Driver phone"), ("driver_licence", "Driving licence no."), ("licence_until", "Licence valid until"),
                 ("insurance_until", "Insurance valid until"), ("fitness_until", "Fitness valid until"),
                 ("attendant_name", "Attendant"), ("attendant_phone", "Attendant phone"), ("active", "Active")],
    "Routes": [("name", "Route"), ("vehicle", "Vehicle number"), ("monthly_fee", "Monthly bus fee ₹"), ("active", "Active")],
    "Stops": [("route", "Route"), ("seq", "Order"), ("name", "Stop"), ("pickup", "Pickup time"), ("drop", "Drop time")],
    "Bus riders": [("student", "Admission no."), ("route", "Route"), ("stop", "Stop")],
    # ---- history (backup / restore)
    "Attendance": [("date", "Date"), ("student", "Admission no."), ("class", "Class"), ("present", "Present"), ("marked_by", "Marked by")],
    "Exams": [("name", "Exam"), ("date", "Date"), ("max_marks", "Max marks"), ("active", "Active")],
    "Marks": [("exam", "Exam"), ("exam_date", "Exam date"), ("student", "Admission no."), ("subject", "Subject"),
              ("score", "Score"), ("entered_by", "Entered by")],
    "Notices": [("kind", "Type"), ("title", "Title"), ("body", "Text"), ("class", "Class"), ("subject", "Subject"),
                ("due_date", "Due date"), ("author", "Posted by"), ("created_at", "Posted at"), ("active", "Active")],
    "Leaves": [("kind", "For"), ("person", "Person"), ("applied_by", "Applied by"), ("leave_type", "Leave type"),
               ("start", "From"), ("end", "To"), ("half_day", "Half day"), ("reason", "Reason"), ("status", "Status"),
               ("decided_by", "Decided by"), ("decided_at", "Decided at"), ("comment", "Comment"), ("created_at", "Applied at")],
    "Staff attendance": [("date", "Date"), ("person", "Employee code"), ("check_in", "Check-in"), ("check_out", "Check-out"),
                         ("in_distance", "In distance m"), ("out_distance", "Out distance m"), ("accuracy", "Accuracy m"),
                         ("late", "Late"), ("marked_by", "Marked by"), ("note", "Note")],
    "Banners": [("title", "Title"), ("text", "Text"), ("image_url", "Image URL"), ("color", "Colour"), ("roles", "Shown to"),
                ("classes", "Classes"), ("start", "From"), ("end", "To"), ("popup", "Popup"), ("sort", "Order"),
                ("active", "Active"), ("created_at", "Created at")],
    "Polls": [("ref", "Ref"), ("kind", "Type"), ("title", "Title"), ("description", "Description"), ("options", "Options (| between)"),
              ("multi", "Many answers"), ("audience", "Audience"), ("classes", "Classes"), ("deadline", "Deadline"),
              ("amount", "Amount ₹"), ("closed", "Closed"), ("created_by", "Created by"), ("created_at", "Created at"), ("active", "Active")],
    "Poll answers": [("poll", "Poll ref"), ("person", "Login ID"), ("student", "For child (admission no.)"),
                     ("choices", "Chosen option numbers"), ("comment", "Comment"), ("at", "Answered at")],
    "Extra fees": [("ref", "Ref"), ("title", "Title"), ("amount", "Amount ₹"), ("due_date", "Due date"), ("note", "Note"),
                   ("target", "For"), ("classes", "Classes"), ("students", "Students"), ("excluded", "Left out"),
                   ("created_by", "Created by"), ("created_at", "Created at"), ("active", "Active")],
    "Fee charges": [("ref", "Ref"), ("student", "Admission no."), ("kind", "Kind"), ("period", "Period"), ("title", "Title"),
                    ("amount", "Amount ₹"), ("due_date", "Due date"), ("batch", "Extra fee ref"), ("active", "Active"),
                    ("created_at", "Created at")],
    "Payments": [("ref", "Ref"), ("receipt_no", "Receipt no."), ("student", "Admission no."), ("amount", "Amount ₹"),
                 ("mode", "Mode"), ("reference", "UTR / cheque no."), ("paid_on", "Paid on"), ("status", "Status"),
                 ("note", "Note"), ("cancel_reason", "Cancel / reject reason"), ("received_by", "Received by"),
                 ("submitted_by", "Submitted by"), ("requested", "Requested charge refs"), ("created_at", "Created at"),
                 ("confirmed_at", "Confirmed at")],
    "Payment split": [("payment", "Payment ref"), ("charge", "Charge ref"), ("amount", "Amount ₹")],
    "Receipt numbers": [("year", "Academic year"), ("last_no", "Last receipt no.")],
}
SETUP_SHEETS = ["School", "Principal", "Classes", "Subjects", "Staff", "Parents", "Students", "Teaching", "Period timings",
                "Timetable", "Holidays", "Fee setup", "Vehicles", "Routes", "Stops", "Bus riders"]
HISTORY_SHEETS = ["Attendance", "Exams", "Marks", "Notices", "Leaves", "Staff attendance", "Banners", "Polls", "Poll answers",
                  "Extra fees", "Fee charges", "Payments", "Payment split", "Receipt numbers"]

SCHOOL_KEYS = [("name", "School name"), ("address", "Address"), ("phone", "Phone"), ("board", "Board"),
               ("working_days", "Working days (e.g. Mon, Tue, Wed, Thu, Fri, Sat)"), ("leave_casual", "Casual leave per year"),
               ("leave_sick", "Sick leave per year"), ("leave_earned", "Earned leave per year"),
               ("late_after", "Staff late after (HH:MM)"), ("geo_lat", "School latitude"), ("geo_lng", "School longitude"),
               ("geo_radius_m", "Check-in radius (metres)")]
FEE_KEYS = [("monthly_amount", "Monthly fee ₹ (all classes)"), ("due_day", "Due day of month (1-28)"),
            ("start_month", "Bill from month (YYYY-MM)"), ("auto_generate", "Bill every month automatically (Yes/No)"),
            ("upi_id", "UPI ID"), ("upi_name", "UPI payee name"), ("receipt_prefix", "Receipt prefix"), ("receipt_note", "Receipt footer note")]

HELP = {
    "School": "One row per setting. Change only the Value column.",
    "Principal": "Your own profile details (the principal account itself is managed by the platform admin).",
    "Classes": "One row per class/section, e.g. 8-A. Class teacher = employee code from the Staff sheet.",
    "Subjects": "One row per subject taught in the school.",
    "Staff": "Teachers, Vice Principals and Coordinators. Employee code is their login ID. Role: Teacher / Vice Principal / Coordinator.",
    "Parents": "Optional — parents are also created from the Parent mobile column of Students. Mobile is their login ID.",
    "Students": "Admission no. is the student's login ID. Parent mobile creates/links the parent's login automatically.",
    "Teaching": "Who teaches which subject in which class.",
    "Period timings": "Day = All days, or Mon…Sun for a day with different timings (e.g. Sat). Type = Period or Break.",
    "Timetable": "Class + Day + Period number → Subject and Teacher.",
    "Holidays": "Type: festival, national, vacation, exam, event, other. School closed = No for events.",
    "Fee setup": "One row per setting. Class-wise fees are on the Classes sheet, bus fees on Routes.",
    "Vehicles": "School buses/vans.", "Routes": "Bus routes and the monthly bus fee.", "Stops": "Stops of each route in order.",
    "Bus riders": "Which student takes which route and stop.",
}


# ---------------------------------------------------------------- cell helpers
def safe(v):
    """Value for a cell: no formulas, ever."""
    if v is None:
        return None
    if isinstance(v, bool):
        return YES if v else NO
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, datetime):
        return v.replace(microsecond=0, tzinfo=None).isoformat(sep=" ")
    if isinstance(v, date):
        return v.isoformat()
    s = str(v)
    if s[:1] in ("=", "+", "-", "@", "\t", "\r"):
        s = "'" + s
    return s


def unsafe(v):
    """Undo safe() on import."""
    if isinstance(v, str) and len(v) > 1 and v[0] == "'" and v[1] in "=+-@\t\r":
        return v[1:]
    return v


def auth_signature(school_code: str, rows: list[tuple[str, str, bool]]) -> str:
    msg = school_code.upper() + "\n" + "\n".join(f"{l}\t{h}\t{int(m)}" for l, h, m in rows)
    return hmac.new(auth.SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()


HEAD_FONT = Font(bold=True, color="FFFFFF")
HEAD_FILL = PatternFill("solid", fgColor="1E3A8A")


class Writer:
    """Writes sheets with a styled header. write_only for big backups; normal (with dropdowns) for the template."""

    def __init__(self, write_only: bool):
        self.wo = write_only
        self.wb = Workbook(write_only=write_only)
        if not write_only:
            self.wb.remove(self.wb.active)

    def sheet(self, name: str, headers: list[str], rows, widths: dict[int, int] | None = None, hidden: bool = False):
        ws = self.wb.create_sheet(name)
        for i, h in enumerate(headers):
            ws.column_dimensions[_col(i)].width = (widths or {}).get(i, max(12, min(40, len(h) + 4)))
        ws.freeze_panes = "A2"
        if hidden:
            ws.sheet_state = "hidden"
        if self.wo:
            head = []
            for h in headers:
                c = WriteOnlyCell(ws, value=h)
                c.font, c.fill = HEAD_FONT, HEAD_FILL
                head.append(c)
            ws.append(head)
            for r in rows:
                ws.append([_text_cell(ws, safe(v)) for v in r])
        else:
            ws.append(headers)
            for c in ws[1]:
                c.font, c.fill = HEAD_FONT, HEAD_FILL
            for r in rows:
                ws.append([safe(v) for v in r])
                for c in ws[ws.max_row]:
                    if isinstance(c.value, str):
                        c.data_type = "s"
        return ws

    def dropdown(self, ws, col: int, options: list[str], rows: int = 2000):
        if self.wo:
            return
        dv = DataValidation(type="list", formula1='"' + ",".join(options) + '"', allow_blank=True)
        dv.add(f"{_col(col)}2:{_col(col)}{rows}")
        ws.add_data_validation(dv)

    def bytes(self) -> bytes:
        buf = io.BytesIO()
        self.wb.save(buf)
        return buf.getvalue()


def _text_cell(ws, v):
    c = WriteOnlyCell(ws, value=v)
    if isinstance(v, str):
        c.data_type = "s"
    return c


def _col(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def readme_rows(kind: str, school_name: str) -> list[list]:
    rows = [[f"School Hub · {'Backup' if kind == 'backup' else 'Import template'} · {school_name}"], [""],
            ["How to use"],
            ["1. Fill one sheet per topic. Leave a sheet empty to skip it — nothing is deleted by an import."],
            ["2. In the app: Me → Import & backup → Import file. You'll see a check of every row before anything is saved."],
            ["3. Choose Merge (add new, update changed) or Replace (school data becomes exactly this file)."],
            ["4. Dates: 2026-06-30 or 30/06/2026. Times: 24-hour 08:00. Yes/No columns: Yes or No."],
            ["5. New people get temporary passwords, shown once after the import (download and share them)."], [""],
            ["Sheet", "What goes in it"]]
    rows += [[k, v] for k, v in HELP.items()]
    if kind == "backup":
        rows += [[""], ["This file is a full backup and contains personal data. Store it safely (DPDP Act 2023)."],
                 ["Do not edit the hidden sheets — passwords are kept only when the file is unchanged there."]]
    return rows


# ================================================================ export
def export_workbook(db, school, kind: str = "backup") -> bytes:
    """kind = 'template' (empty sheets + dropdowns + this school's classes/subjects/staff) or 'backup' (everything)."""
    from sqlalchemy import select

    from . import models as M
    from .bell import schedules
    from .deps import get_prefs

    sid = school.id
    full = kind == "backup"
    w = Writer(write_only=full)
    users = {u.id: u for u in db.scalars(select(M.User).where(M.User.school_id == sid))}
    login = {i: u.login_id for i, u in users.items()}
    classes = {c.id: c for c in db.scalars(select(M.SchoolClass).where(M.SchoolClass.school_id == sid).order_by(M.SchoolClass.name))}
    cname = {i: c.name for i, c in classes.items()}
    subjects = {s.id: s for s in db.scalars(select(M.Subject).where(M.Subject.school_id == sid).order_by(M.Subject.name))}
    sname = {i: s.name for i, s in subjects.items()}
    H = lambda n: [h for _, h in SPEC[n]]  # noqa: E731

    w.sheet("Read me", ["School Hub"], readme_rows(kind, school.name), widths={0: 34, 1: 110})
    prefs = get_prefs(db, sid)
    q = prefs.leave_quotas or {}
    sv = {"name": school.name, "address": school.address, "phone": school.phone, "board": school.board,
          "working_days": ", ".join(DAY_NAMES[d] for d in sorted(school.working_days or [])),
          "leave_casual": q.get("casual"), "leave_sick": q.get("sick"), "leave_earned": q.get("earned"),
          "late_after": prefs.late_after, "geo_lat": prefs.geo_lat, "geo_lng": prefs.geo_lng, "geo_radius_m": prefs.geo_radius_m}
    w.sheet("School", H("School"), [[label, sv.get(k)] for k, label in SCHOOL_KEYS], widths={0: 44, 1: 50})

    staff = [u for u in users.values() if u.role in (M.Role.teacher, M.Role.vice_principal, M.Role.coordinator)]
    principals = [u for u in users.values() if u.role == M.Role.principal]
    students = sorted((u for u in users.values() if u.role == M.Role.student), key=lambda u: (cname.get(u.class_id, ""), u.roll_no or 0, u.name))
    parents = sorted((u for u in users.values() if u.role == M.Role.parent), key=lambda u: u.name)
    links = list(db.scalars(select(M.ParentLink).where(M.ParentLink.school_id == sid)))
    kids_of: dict[int, list] = {}
    parent_of: dict[int, tuple] = {}
    for lk in links:
        kids_of.setdefault(lk.parent_id, []).append(lk)
        parent_of.setdefault(lk.student_id, (lk.parent_id, lk.relation))
    role_label = {M.Role.teacher: "Teacher", M.Role.vice_principal: "Vice Principal", M.Role.coordinator: "Coordinator"}

    w.sheet("Principal", H("Principal"), [[u.login_id, u.name, u.phone, u.email, u.address, u.dob, u.blood_group] for u in principals])
    cfg = db.get(M.FeeConfig, sid)
    camt = (cfg.class_amounts or {}) if cfg else {}
    ws = w.sheet("Classes", H("Classes"), [[c.name, login.get(c.class_teacher_id), camt.get(str(c.id)), c.is_active] for c in classes.values()])
    w.dropdown(ws, 3, [YES, NO])
    ws = w.sheet("Subjects", H("Subjects"), [[s.name, s.is_active] for s in subjects.values()])
    w.dropdown(ws, 1, [YES, NO])
    ws = w.sheet("Staff", H("Staff"), [[u.login_id, u.name, role_label[u.role], u.phone, u.email, u.address, u.dob, u.blood_group,
                                        ", ".join(cname[c] for c in (u.scope_class_ids or []) if c in cname) if u.role == M.Role.coordinator else "",
                                        u.active] for u in sorted(staff, key=lambda u: (u.role.value, u.name))])
    w.dropdown(ws, 2, ["Teacher", "Vice Principal", "Coordinator"])
    w.dropdown(ws, 9, [YES, NO])
    ws = w.sheet("Parents", H("Parents"), [[p.login_id, p.name, p.email, p.address,
                                            ", ".join(login[lk.student_id] for lk in kids_of.get(p.id, []) if lk.student_id in login),
                                            (kids_of.get(p.id) or [None])[0].relation if kids_of.get(p.id) else "Parent", p.active] for p in parents])
    w.dropdown(ws, 6, [YES, NO])
    srows = []
    for u in students:
        pid, rel = parent_of.get(u.id, (None, ""))
        p = users.get(pid)
        srows.append([u.login_id, u.name, cname.get(u.class_id), u.roll_no, u.dob, u.blood_group, u.phone, u.address,
                      p.name if p else "", p.login_id if p else "", rel if p else "", u.active])
    ws = w.sheet("Students", H("Students"), srows)
    w.dropdown(ws, 11, [YES, NO])
    w.sheet("Teaching", H("Teaching"), [[cname.get(a.class_id), sname.get(a.subject_id), login.get(a.teacher_id)]
                                        for a in db.scalars(select(M.Assignment).where(M.Assignment.school_id == sid))])
    brow = []
    for d, slots in sorted(schedules(db, sid).items()):
        for s in slots:
            brow.append(["All days" if d < 0 else DAY_NAMES[d], "Period" if s["kind"] == "period" else "Break", s["label"], s["start"], s["end"]])
    ws = w.sheet("Period timings", H("Period timings"), brow)
    w.dropdown(ws, 0, ["All days", *DAY_NAMES])
    w.dropdown(ws, 1, ["Period", "Break"])
    ws = w.sheet("Timetable", H("Timetable"), [[cname.get(e.class_id), DAY_NAMES[e.day], e.period, sname.get(e.subject_id), login.get(e.teacher_id)]
                                               for e in db.scalars(select(M.TimetableEntry).where(M.TimetableEntry.school_id == sid)
                                                                   .order_by(M.TimetableEntry.class_id, M.TimetableEntry.day, M.TimetableEntry.period))])
    w.dropdown(ws, 1, list(DAY_NAMES))
    ws = w.sheet("Holidays", H("Holidays"), [[h.name, h.kind, h.start_date, h.end_date, h.is_off, h.note, h.is_active]
                                             for h in db.scalars(select(M.Holiday).where(M.Holiday.school_id == sid).order_by(M.Holiday.start_date))])
    w.dropdown(ws, 1, ["festival", "national", "vacation", "exam", "event", "other"])
    w.dropdown(ws, 4, [YES, NO])
    fv = {k: getattr(cfg, k) for k, _ in FEE_KEYS} if cfg else {}
    w.sheet("Fee setup", H("Fee setup"), [[label, fv.get(k)] for k, label in FEE_KEYS], widths={0: 44, 1: 50})
    vehicles = {v.id: v for v in db.scalars(select(M.Vehicle).where(M.Vehicle.school_id == sid))}
    w.sheet("Vehicles", H("Vehicles"), [[v.number, v.kind, v.capacity, v.driver_name, v.driver_phone, v.driver_licence, v.licence_until,
                                         v.insurance_until, v.fitness_until, v.attendant_name, v.attendant_phone, v.is_active] for v in vehicles.values()])
    routes = {r.id: r for r in db.scalars(select(M.Route).where(M.Route.school_id == sid))}
    ramt = (cfg.route_amounts or {}) if cfg else {}
    w.sheet("Routes", H("Routes"), [[r.name, vehicles[r.vehicle_id].number if r.vehicle_id in vehicles else "", ramt.get(str(r.id)), r.is_active]
                                    for r in routes.values()])
    stops = {s.id: s for s in db.scalars(select(M.Stop).where(M.Stop.school_id == sid).order_by(M.Stop.route_id, M.Stop.seq))}
    w.sheet("Stops", H("Stops"), [[routes[s.route_id].name, s.seq, s.name, s.pickup_time, s.drop_time]
                                  for s in stops.values() if s.is_active and s.route_id in routes])
    w.sheet("Bus riders", H("Bus riders"), [[login.get(t.student_id), routes[t.route_id].name if t.route_id in routes else "",
                                             stops[t.stop_id].name if t.stop_id in stops else ""]
                                            for t in db.scalars(select(M.StudentTransport).where(M.StudentTransport.school_id == sid))])

    auth_rows = []
    if full:
        _history(w, db, sid, M, users, login, cname, sname)
        auth_rows = sorted((u.login_id, u.password_hash, bool(u.must_change_password)) for u in users.values()
                           if u.role in (M.Role.teacher, M.Role.vice_principal, M.Role.coordinator, M.Role.student, M.Role.parent))
        w.sheet("_auth", ["login_id", "password_hash", "must_change"], [[l, h, m] for l, h, m in auth_rows], hidden=True)
    meta = [["kind", kind], ["school_code", school.code], ["format", FORMAT_VERSION],
            ["exported_at", datetime.now().replace(microsecond=0).isoformat(sep=" ")]]
    if full:
        meta.append(["auth_sig", auth_signature(school.code, auth_rows)])
    w.sheet("_meta", ["key", "value"], meta, hidden=True)
    return w.bytes()


def _history(w: Writer, db, sid, M, users, login, cname, sname):
    from sqlalchemy import select

    H = lambda n: [h for _, h in SPEC[n]]  # noqa: E731

    def q(model, *order):
        return db.execute(select(model).where(model.school_id == sid).order_by(*order).execution_options(yield_per=2000)).scalars()

    w.sheet("Attendance", H("Attendance"), ([a.date, login.get(a.student_id), cname.get(a.class_id), a.present, login.get(a.marked_by)]
                                            for a in q(M.Attendance, M.Attendance.date, M.Attendance.class_id, M.Attendance.student_id)))
    exams = {e.id: e for e in db.scalars(select(M.Exam).where(M.Exam.school_id == sid).order_by(M.Exam.date))}
    w.sheet("Exams", H("Exams"), [[e.name, e.date, e.max_marks, e.is_active] for e in exams.values()])
    w.sheet("Marks", H("Marks"), ([exams[m.exam_id].name, exams[m.exam_id].date, login.get(m.student_id), sname.get(m.subject_id), m.score,
                                   login.get(m.entered_by)] for m in q(M.Mark, M.Mark.exam_id, M.Mark.student_id) if m.exam_id in exams))
    w.sheet("Notices", H("Notices"), ([p.kind, p.title, p.body, cname.get(p.class_id), sname.get(p.subject_id), p.due_date,
                                       login.get(p.author_id), p.created_at, p.is_active] for p in q(M.Post, M.Post.created_at)))
    w.sheet("Leaves", H("Leaves"), ([lv.kind, login.get(lv.user_id), login.get(lv.applied_by), lv.leave_type, lv.start_date, lv.end_date,
                                     lv.half_day, lv.reason, lv.status, login.get(lv.decided_by), lv.decided_at, lv.comment, lv.created_at]
                                    for lv in q(M.LeaveRequest, M.LeaveRequest.created_at)))
    w.sheet("Staff attendance", H("Staff attendance"), ([a.date, login.get(a.user_id), a.check_in_at, a.check_out_at, a.in_distance_m,
                                                         a.out_distance_m, a.in_accuracy_m, a.late, login.get(a.marked_by), a.note]
                                                        for a in q(M.StaffAttendance, M.StaffAttendance.date)))
    cn = lambda ids: ", ".join(cname[i] for i in (ids or []) if i in cname)  # noqa: E731
    w.sheet("Banners", H("Banners"), ([b.title, b.text, b.image_url, b.color, ", ".join(b.roles or []), cn(b.class_ids), b.start_date,
                                       b.end_date, b.popup, b.sort, b.is_active, b.created_at] for b in q(M.Banner, M.Banner.created_at)))
    polls = list(q(M.Poll, M.Poll.created_at))
    w.sheet("Polls", H("Polls"), [[p.id, p.kind, p.title, p.description, " | ".join(p.options or []), p.multi, ", ".join(p.audience or []),
                                   cn(p.class_ids), p.deadline, p.amount, p.closed, login.get(p.created_by), p.created_at, p.is_active] for p in polls])
    pids = [p.id for p in polls]
    w.sheet("Poll answers", H("Poll answers"), ([r.poll_id, login.get(r.user_id), login.get(r.student_id) if r.student_id else "",
                                                 ", ".join(str(c + 1) for c in (r.choices or [])), r.comment, r.at]
                                                for r in db.execute(select(M.PollResponse).where(M.PollResponse.poll_id.in_(pids or [-1]))).scalars()))
    ln = lambda ids: ", ".join(login[i] for i in (ids or []) if i in login)  # noqa: E731
    w.sheet("Extra fees", H("Extra fees"), ([b.id, b.title, b.amount, b.due_date, b.note, b.target, cn(b.class_ids), ln(b.student_ids),
                                             ln(b.exclude_ids), login.get(b.created_by), b.created_at, b.is_active]
                                            for b in q(M.FeeBatch, M.FeeBatch.id)))
    w.sheet("Fee charges", H("Fee charges"), ([i.id, login.get(i.student_id), i.kind, i.period, i.title, i.amount, i.due_date, i.batch_id,
                                               i.is_active, i.created_at] for i in q(M.FeeItem, M.FeeItem.id)))
    pays = list(q(M.FeePayment, M.FeePayment.id))
    w.sheet("Payments", H("Payments"), ([p.id, p.receipt_no, login.get(p.student_id), p.amount, p.mode, p.reference, p.paid_on, p.status,
                                         p.note, p.cancel_reason, login.get(p.received_by), login.get(p.submitted_by),
                                         ", ".join(str(x) for x in (p.requested_item_ids or [])), p.created_at, p.confirmed_at] for p in pays))
    payids = [p.id for p in pays]
    w.sheet("Payment split", H("Payment split"), ([a.payment_id, a.item_id, a.amount] for a in db.execute(
        select(M.FeeAllocation).where(M.FeeAllocation.payment_id.in_(payids or [-1])).order_by(M.FeeAllocation.id)).scalars()))
    w.sheet("Receipt numbers", H("Receipt numbers"), ([c.year, c.last_no] for c in db.scalars(
        select(M.ReceiptCounter).where(M.ReceiptCounter.school_id == sid))))
