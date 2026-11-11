"""F30/F31 · Read a school workbook (template or backup) and import it — Merge or Replace — all-or-nothing.

run_import() writes into the open transaction as it goes; the caller commits only when there are no errors and
the user confirmed (preview = the same run, rolled back). See databook.py for the format.
"""
import hmac
import io
import math
import re
from datetime import date, datetime

from fastapi import HTTPException
from openpyxl import load_workbook
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.orm import Session

from . import models as M
from .bell import clean_slots, period_count, schedules
from .databook import DAY_NAMES, FEE_KEYS, HISTORY_SHEETS, SCHOOL_KEYS, SETUP_SHEETS, SPEC, unsafe, vault_open
from .deps import get_prefs
from .people import (Ctx, Issue, PeoplePlan, apply_plan, as_bool, as_date, as_int, as_text, check_student_limit,
                     norm_mobile, plan_rows)
from .models import Role, utcnow

MAX_ROWS = 400_000
MAX_PEOPLE = 20_000
ROLE_VALUES = {"teacher", "vice_principal", "coordinator", "student", "parent"}
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DAYS = {d.lower(): i for i, d in enumerate(DAY_NAMES)}
DAYS.update({"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6})
HOLIDAY_KINDS = {"national", "festival", "vacation", "exam", "event", "holiday", "other"}
AUDIENCE = ("principal", "vice_principal", "coordinator", "teacher", "student", "parent")


def _norm(h) -> str:
    return re.sub(r"[^a-z0-9₹]", "", str(h or "").lower())


# ================================================================ reading
MAX_UNZIPPED = 160 * 1024 * 1024   # .xlsx is a zip: refuse "zip bombs" before parsing (work is bounded by the row budget)
MAX_MEMBER = 130 * 1024 * 1024
MAX_COLS = 40                      # our widest sheet has 15 columns
MAX_EMPTY_RUN = 1000               # stop reading a sheet after this many blank rows in a row
MAX_CELL = 32767                   # Excel's own limit
MAX_TEXT = 60 * 1024 * 1024        # total characters read from one file (bounds memory)


def _check_zip(data: bytes) -> None:
    import zipfile

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos = z.infolist()
    except zipfile.BadZipFile:
        raise HTTPException(400, "That file isn't an Excel (.xlsx) workbook") from None
    if len(infos) > 300 or sum(i.file_size for i in infos) > MAX_UNZIPPED or any(i.file_size > MAX_MEMBER for i in infos):
        raise HTTPException(413, "This workbook is too large to import. Split it into smaller files.")


def _rows(ws, budget: list[int]):
    """Yield (excel_row_no, values) with the header width, never trusting the sheet's declared size."""
    ws.reset_dimensions()
    it = ws.iter_rows(values_only=True, max_col=MAX_COLS)
    head = next(it, None) or ()
    head = list(head)
    while head and head[-1] in (None, ""):
        head.pop()
    width = max(1, len(head))
    yield 1, tuple(head)
    empty = 0
    for n, r in enumerate(it, start=2):
        budget[0] -= 1
        if budget[0] < 0:
            raise HTTPException(413, f"The file has more than {MAX_ROWS:,} rows — split it into smaller files")
        vals = tuple((v[:MAX_CELL] if isinstance(v, str) else v) for v in (list(r)[:width] + [None] * max(0, width - len(r))))
        budget[1] -= sum(len(v) for v in vals if isinstance(v, str))
        if budget[1] < 0:
            raise HTTPException(413, "This workbook has too much text to import in one go. Split it into smaller files.")
        if all(v in (None, "") for v in vals):
            empty += 1
            if empty >= MAX_EMPTY_RUN:
                return
        else:
            empty = 0
        yield n, vals


class Book:
    def __init__(self, data: bytes):
        from .databook import Signer

        _check_zip(data)
        try:
            wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        except Exception:  # noqa: BLE001 — any parse failure is a bad upload
            raise HTTPException(400, "That file isn't an Excel (.xlsx) workbook. Download the template from the app and fill it in.") from None
        self.sheets: dict[str, list[tuple[int, dict]]] = {}
        self.missing_cols: list[str] = []
        self.meta: dict[str, str] = {}
        self.vault: list[str] = []
        self.signer = Signer()
        budget = [MAX_ROWS + 50_000, MAX_TEXT]   # physical rows (blank ones included), characters
        names = {_norm(n): n for n in SPEC}
        try:
            for ws in wb.worksheets:
                title = ws.title.strip()
                if title == "_meta":
                    for n, r in _rows(ws, budget):
                        if n > 50:
                            break
                        if n > 1 and r and r[0] and len(r) > 1:
                            self.meta[str(r[0])[:40]] = str(r[1] if r[1] is not None else "")[:200]
                    continue
                rows = _rows(ws, budget)
                _, head = next(rows)
                width = len(head)
                self.signer.sheet(ws.title, width)
                self.signer.row(head, width)
                if title == "_vault":
                    for n, r in rows:
                        self.signer.row(r, width)
                        if r and isinstance(r[0], str):
                            self.vault.append(r[0])
                    continue
                key = names.get(_norm(title))
                if not key:
                    for _, r in rows:      # still part of the signed content
                        self.signer.row(r, width)
                    continue
                spec = SPEC[key]
                by_head = {}
                for k, h in spec:
                    by_head[_norm(h)] = k
                    by_head[_norm(k)] = k
                cols = [by_head.get(_norm(h)) for h in head]
                out = []
                for n, r in rows:
                    self.signer.row(r, width)
                    if all(v in (None, "") or (isinstance(v, str) and not v.strip()) for v in r):
                        continue
                    d = {}
                    for c, v in zip(cols, r):
                        if c:
                            d[c] = unsafe(v.strip() if isinstance(v, str) else v)
                    out.append((n, d))
                if out:
                    needed = {"Classes": "name", "Subjects": "name", "Staff": "login_id", "Students": "login_id", "Parents": "login_id",
                              "School": "value", "Fee setup": "value"}.get(key)
                    if needed and needed not in [c for c in cols if c]:
                        self.missing_cols.append(f"{key}: column “{dict(spec)[needed]}” not found")
                    self.sheets[key] = out
        finally:
            wb.close()

    def verified_for(self, school_code: str) -> bool:
        """True only for an unchanged backup made by this server for this school."""
        sig = self.meta.get("data_sig", "")
        if self.meta.get("kind") != "backup" or not re.fullmatch(r"[0-9a-f]{64}", sig):
            return False
        if self.meta.get("school_code", "").upper() != school_code.upper():
            return False
        expected = self.signer.finish(school_code, self.meta.get("exported_at", ""))
        return hmac.compare_digest(sig.encode(), expected.encode())

    def rows(self, name: str) -> list[tuple[int, dict]]:
        return self.sheets.get(name, [])


# ================================================================ helpers
def as_dt(v) -> datetime | None:
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.replace(tzinfo=None)
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    s = str(v).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:19], fmt)
        except ValueError:
            pass
    raise ValueError("use a date-time like 2026-11-09 10:30")


def as_time(v) -> str:
    if v in (None, ""):
        return ""
    if hasattr(v, "hour") and hasattr(v, "minute"):
        return f"{v.hour:02d}:{v.minute:02d}"
    s = str(v).strip()
    if isinstance(v, float) and 0 <= v < 1:      # Excel time fraction
        m = round(v * 24 * 60)
        return f"{m // 60:02d}:{m % 60:02d}"
    if len(s) >= 4 and s[1] == ":":
        s = "0" + s
    s = s[:5]
    if not HHMM.match(s):
        raise ValueError("use a 24-hour time like 08:15")
    return s


def as_float(v, lo: float | None = None, hi: float | None = None, digits: int = 2) -> float | None:
    if v in (None, ""):
        return None
    try:
        f = float(str(v).replace(",", "").replace("₹", "").strip())
    except ValueError:
        raise ValueError("must be a number") from None
    if not math.isfinite(f):
        raise ValueError("must be a number")
    if (lo is not None and f < lo) or (hi is not None and f > hi):
        raise ValueError(f"must be between {lo:g} and {hi:g}")
    return round(f, digits)


def split_list(v) -> list[str]:
    if v in (None, ""):
        return []
    return [x.strip() for x in re.split(r"[,|\n]", str(v)) if x.strip()]


def parse_day(v) -> int:
    s = str(v or "").strip().lower()
    if s in ("", "all", "all days", "default", "every day", "everyday"):
        return -1
    if s[:3] in DAYS:
        return DAYS[s[:3]]
    raise ValueError("use All days, or Mon, Tue … Sun")


# ================================================================ importer
class Importer:
    def __init__(self, db: Session, school: M.School, me: M.User, mode: str, book: Book, confirm: bool = False):
        self.db, self.school, self.me, self.mode, self.book, self.confirm = db, school, me, mode, book, confirm
        self.sid = school.id
        self.verified = book.verified_for(school.code)
        self.vault_ok = False
        self.issues: list[Issue] = []
        self.warnings: list[str] = []
        self.counts: dict[str, dict[str, int]] = {}
        self.credentials: list[dict] = []
        self.passwords_kept = False

    # ---- bookkeeping
    def err(self, sheet: str, row: int, fld: str, msg: str):
        label = dict(SPEC.get(sheet, [])).get(fld, fld)
        self.issues.append(Issue(row, label, msg, sheet))

    def cnt(self, sheet: str, what: str, n: int = 1):
        c = self.counts.setdefault(sheet, {"add": 0, "update": 0, "skip": 0})
        c[what] += n

    def guard(self, sheet: str, row: int, fld: str, fn, *a, **k):
        try:
            return fn(*a, **k), True
        except ValueError as e:
            self.err(sheet, row, fld, str(e))
            return None, False

    # ---- lookups
    def refresh(self):
        db, sid = self.db, self.sid
        self.users = {u.login_id.lower(): u for u in db.scalars(select(M.User).where(M.User.school_id == sid))}
        self.classes = {c.name.lower(): c for c in db.scalars(select(M.SchoolClass).where(M.SchoolClass.school_id == sid))}
        self.subjects = {s.name.lower(): s for s in db.scalars(select(M.Subject).where(M.Subject.school_id == sid))}

    def user(self, login, roles=None) -> M.User | None:
        if login in (None, ""):
            return None
        s = as_text(login, 60)
        u = self.users.get(s.lower()) or self.users.get(norm_mobile(s).lower())
        if u and roles and u.role not in roles:
            return None
        return u

    def uid(self, login, fallback: bool = False) -> int | None:
        u = self.user(login)
        return u.id if u else (self.me.id if fallback else None)

    # ================================================================ run
    def run(self) -> dict:
        b = self.book
        for m in b.missing_cols:
            self.issues.append(Issue(1, "", m, m.split(":")[0]))
        if b.meta.get("school_code") and b.meta["school_code"].upper() != self.school.code.upper():
            self.warnings.append(f"This file was exported from school {b.meta['school_code']}, not {self.school.code}.")
        vault = self._vault()
        if self.mode == "replace":
            self.wipe()
        self.refresh()
        pr = next((u for u in self.users.values() if u.role == Role.principal and u.active), None)
        self.actor_id = self.me.id if self.me.school_id == self.sid else (pr.id if pr else self.me.id)
        if self.me.school_id != self.sid and not self.verified:
            self.warnings.append("Imported by the platform admin: changes made from this file are recorded under the principal's name in the app "
                                 "(the audit log names the admin).")
        self.school_sheet()
        self.principal_sheet()
        self.classes_sheet()
        self.subjects_sheet()
        self.people(vault)
        self.refresh()
        self.after_people()
        self.teaching_sheet()
        self.bell_sheet()
        self.timetable_sheet()
        self.holidays_sheet()
        self.fees_setup()
        self.transport()
        self.history()
        self.db.flush()
        return self.report()

    def report(self) -> dict:
        sheets = [s for s in SETUP_SHEETS + HISTORY_SHEETS if s in self.counts]
        return {"ok": not self.issues, "mode": self.mode, "kind": self.book.meta.get("kind") or "template",
                "errors": [i.out() for i in self.issues[:300]], "error_count": len(self.issues),
                "warnings": self.warnings[:50], "passwords_kept": self.passwords_kept, "verified": self.verified,
                "sheets": [{"sheet": s, **self.counts[s]} for s in sheets],
                "new_logins": len(self.credentials)}

    def _vault(self) -> dict[str, dict]:
        b = self.book
        if b.meta.get("kind") == "backup" and not self.verified:
            self.warnings.append("This backup can't be verified (it was changed, or made for another school or server). "
                                 "It's imported as plain data: new accounts get temporary passwords, new Vice Principals/"
                                 "Coordinators start with no permissions, and history is recorded under your name.")
        if not self.verified or not b.vault:
            return {}
        rows = vault_open(self.school.code, b.vault)
        if rows is None:
            self.warnings.append("The password section of this backup couldn't be opened — new accounts get temporary passwords.")
            return {}
        out = {}
        for e in rows:
            if isinstance(e, dict) and isinstance(e.get("l"), str) and isinstance(e.get("h"), str) \
                    and e["h"].startswith(("$2a$", "$2b$", "$2y$")) and len(e["h"]) == 60 and e.get("r") in ROLE_VALUES:
                out[e["l"].lower()] = e
        self.passwords_kept = bool(out)
        self.vault_ok = True
        try:
            age = (datetime.now() - datetime.fromisoformat(b.meta.get("exported_at", ""))).days
            if age > 30:
                self.warnings.append(f"This backup is {age} days old: anyone who changed their password since then gets the old one back.")
        except ValueError:
            pass
        return out

    def attrib(self, login) -> int:
        """Who did it. Only a verified backup may name other people; otherwise it's the importer
        (or the school's principal when the platform admin imports)."""
        if self.verified:
            u = self.user(login)
            if u:
                return u.id
        return self.actor_id

    # ================================================================ replace: wipe this school's data
    def wipe(self):
        db, sid = self.db, self.sid
        keep = [u.id for u in db.scalars(select(M.User).where(M.User.school_id == sid, M.User.role == Role.principal))]
        pay_ids = select(M.FeePayment.id).where(M.FeePayment.school_id == sid)
        poll_ids = select(M.Poll.id).where(M.Poll.school_id == sid)
        db.execute(delete(M.FeeAllocation).where(M.FeeAllocation.payment_id.in_(pay_ids)))
        for model in (M.FeePayment, M.FeeItem, M.FeeBatch, M.ReceiptCounter, M.StudentTransport, M.Stop):
            db.execute(delete(model).where(model.school_id == sid))
        db.execute(delete(M.Route).where(M.Route.school_id == sid))
        db.execute(delete(M.Vehicle).where(M.Vehicle.school_id == sid))
        db.execute(delete(M.PollResponse).where(M.PollResponse.poll_id.in_(poll_ids)))
        for model in (M.Poll, M.Banner, M.StaffAttendance, M.LeaveRequest, M.Mark, M.Exam, M.Attendance, M.Post,
                      M.TimetableEntry, M.Assignment, M.Holiday, M.BellSchedule, M.ParentLink):
            db.execute(delete(model).where(model.school_id == sid))
        cfg = db.get(M.FeeConfig, sid)
        if cfg:
            db.delete(cfg)
        db.execute(update(M.SchoolClass).where(M.SchoolClass.school_id == sid).values(class_teacher_id=None))
        db.execute(update(M.User).where(M.User.id.in_(keep or [-1])).values(class_id=None))
        db.execute(delete(M.User).where(M.User.school_id == sid, M.User.id.not_in(keep or [-1])))
        db.execute(delete(M.SchoolClass).where(M.SchoolClass.school_id == sid))
        db.execute(delete(M.Subject).where(M.Subject.school_id == sid))
        db.flush()
        db.expire_all()

    # ================================================================ setup sheets
    def kv(self, sheet: str, keys) -> dict:
        by = {}
        for k, label in keys:
            by[_norm(k)] = k
            by[_norm(label)] = k
        out = {}
        for n, r in self.book.rows(sheet):
            k = by.get(_norm(r.get("setting")))
            if not k:
                if r.get("setting"):
                    self.warnings.append(f"{sheet} row {n}: unknown setting “{r.get('setting')}” ignored")
                continue
            out[k] = (n, r.get("value"))
        return out

    def school_sheet(self):
        d = self.kv("School", SCHOOL_KEYS)
        if not d:
            return
        s, prefs, S = self.school, get_prefs(self.db, self.sid), "School"
        for k in ("name", "address", "phone", "board"):
            if k in d:
                n, v = d[k]
                v = as_text(v, 500 if k == "address" else 160)
                if k == "name" and not v:
                    self.err(S, n, "value", "School name can't be empty")
                    continue
                setattr(s, k, v[:30] if k == "phone" else v[:40] if k == "board" else v)
        if "working_days" in d:
            n, v = d["working_days"]
            try:
                days = sorted({parse_day(x) for x in split_list(v)} - {-1})
                if not days:
                    raise ValueError("list at least one day, e.g. Mon, Tue, Wed, Thu, Fri, Sat")
                s.working_days = days
            except ValueError as e:
                self.err(S, n, "value", f"Working days: {e}")
        q = dict(prefs.leave_quotas or {})
        for k, qk in (("leave_casual", "casual"), ("leave_sick", "sick"), ("leave_earned", "earned")):
            if k in d and d[k][1] not in (None, ""):
                v, ok = self.guard(S, d[k][0], "value", as_int, d[k][1])
                if ok and v is not None:
                    if 0 <= v <= 60:
                        q[qk] = v
                    else:
                        self.err(S, d[k][0], "value", "leave days must be 0–60")
        prefs.leave_quotas = q
        if "late_after" in d and d["late_after"][1] not in (None, ""):
            v, ok = self.guard(S, d["late_after"][0], "value", as_time, d["late_after"][1])
            if ok:
                prefs.late_after = v
        for k, lo, hi in (("geo_lat", -90, 90), ("geo_lng", -180, 180)):
            if k in d:
                v, ok = self.guard(S, d[k][0], "value", as_float, d[k][1], lo, hi, 7)
                if ok:
                    setattr(prefs, k, v)
        if "geo_radius_m" in d and d["geo_radius_m"][1] not in (None, ""):
            v, ok = self.guard(S, d["geo_radius_m"][0], "value", as_int, d["geo_radius_m"][1])
            if ok and v is not None:
                if 30 <= v <= 5000:
                    prefs.geo_radius_m = v
                else:
                    self.err(S, d["geo_radius_m"][0], "value", "radius must be 30–5000 metres")
        self.cnt(S, "update")

    def principal_sheet(self):
        for n, r in self.book.rows("Principal"):
            u = self.user(r.get("login_id"), (Role.principal,))
            if u and self.me.role != Role.admin and u.id != self.me.id:
                self.warnings.append(f"Principal row {n}: you can only update your own profile; row skipped")
                self.cnt("Principal", "skip")
                continue
            if not u:
                self.warnings.append(f"Principal row {n}: no principal with login “{r.get('login_id')}” — principal accounts are created by the platform admin; row skipped")
                self.cnt("Principal", "skip")
                continue
            name = as_text(r.get("name"), 120)
            if name:
                u.name = name
            for k, lim in (("phone", 20), ("email", 200), ("address", 500), ("blood_group", 5)):
                if k in r:
                    setattr(u, k, as_text(r.get(k), lim))
            if "dob" in r:
                v, ok = self.guard("Principal", n, "dob", as_date, r.get("dob"))
                if ok:
                    u.dob = v
            self.cnt("Principal", "update")

    def classes_sheet(self):
        self.class_teacher: list[tuple[int, M.SchoolClass, str]] = []
        self.class_fees: dict[str, float | None] = {}
        seen = {}
        for n, r in self.book.rows("Classes"):
            name = as_text(r.get("name"), 40)
            if not name:
                self.err("Classes", n, "name", "is required")
                continue
            k = name.lower()
            if k in seen:
                self.err("Classes", n, "name", f"“{name}” is repeated (also row {seen[k]})")
                continue
            seen[k] = n
            active, ok = self.guard("Classes", n, "active", as_bool, r.get("active"), True)
            fee, ok2 = self.guard("Classes", n, "monthly_fee", as_float, r.get("monthly_fee"), 0, 1_000_000)
            c = self.classes.get(k)
            if c:
                c.name = name
                self.cnt("Classes", "update")
            else:
                c = M.SchoolClass(school_id=self.sid, name=name)
                self.db.add(c)
                self.classes[k] = c
                self.cnt("Classes", "add")
            if ok:
                c.is_active = bool(active)
                c.archived_at = None if c.is_active else (c.archived_at or utcnow())
            if r.get("class_teacher") not in (None, ""):
                self.class_teacher.append((n, c, r.get("class_teacher")))
            elif "class_teacher" in r:
                c.class_teacher_id = None
            if ok2:
                self.class_fees[k] = fee
        self.db.flush()

    def subjects_sheet(self):
        seen = {}
        for n, r in self.book.rows("Subjects"):
            name = as_text(r.get("name"), 60)
            if not name:
                self.err("Subjects", n, "name", "is required")
                continue
            if name.lower() in seen:
                self.err("Subjects", n, "name", f"“{name}” is repeated (also row {seen[name.lower()]})")
                continue
            seen[name.lower()] = n
            active, ok = self.guard("Subjects", n, "active", as_bool, r.get("active"), True)
            s = self.subjects.get(name.lower())
            if s:
                s.name = name
                self.cnt("Subjects", "update")
            else:
                s = M.Subject(school_id=self.sid, name=name)
                self.db.add(s)
                self.subjects[name.lower()] = s
                self.cnt("Subjects", "add")
            if ok:
                s.is_active = bool(active)
                s.archived_at = None if s.is_active else (s.archived_at or utcnow())
        self.db.flush()

    # ---- people
    def people(self, vault):
        ctx = Ctx(self.db, self.school)
        ctx.allow_inactive_class = True
        plan = PeoplePlan(school=self.school, me=self.me)
        b = self.book
        for sheet, role in (("Staff", Role.teacher), ("Parents", Role.parent), ("Students", Role.student)):
            rows = b.rows(sheet)
            if not rows:
                continue
            before = len(plan.issues)
            for n, r in rows:
                plan_rows(ctx, plan, role, [r], sheet=sheet, start_row=n, allow_update=True, strict=not self.verified)
            for i in plan.issues[before:]:
                i.field = dict(SPEC[sheet]).get(i.field, i.field)
        check_student_limit(ctx, plan)
        from .subscription import school_modules

        if "extra_roles" not in school_modules(self.db, self.school):
            roles = [d["role"] for d in plan.creates] + [u.role for u, _ in plan.updates]
            if any(r in (Role.vice_principal, Role.coordinator) for r in roles):
                plan.err(0, "Role", "Vice Principal / Coordinator accounts need the Extra roles module in your plan", "Staff")
        self.issues.extend(plan.issues)
        for d in plan.creates:
            self.cnt({Role.student: "Students", Role.parent: "Parents"}.get(d["role"], "Staff"), "add")
        for u, _ in plan.updates:
            self.cnt({Role.student: "Students", Role.parent: "Parents"}.get(u.role, "Staff"), "update")
        # Valid rows are written even when other rows have problems, so later sheets can resolve their references
        # and only real problems are reported. Nothing is kept: any error rolls the whole import back.
        if len(plan.creates) + len(plan.updates) > MAX_PEOPLE:
            self.issues.append(Issue(0, "", f"A file can add or change at most {MAX_PEOPLE:,} people", "Students"))
        self.credentials = apply_plan(ctx, plan, vault, fast=not self.confirm or bool(self.issues),
                                      locked_down_staff=not (self.verified and self.vault_ok))

    def after_people(self):
        db = self.db
        # coordinators' classes
        for n, r in self.book.rows("Staff"):
            u = self.user(r.get("login_id"), (Role.coordinator,))
            if u and "scope_classes" in r:
                ids = []
                for nm in split_list(r.get("scope_classes")):
                    c = self.classes.get(nm.lower())
                    if c:
                        ids.append(c.id)
                    else:
                        self.err("Staff", n, "scope_classes", f"class “{nm}” not found")
                u.scope_class_ids = ids or None
        # parents → children
        have = {(p, s) for p, s in db.execute(select(M.ParentLink.parent_id, M.ParentLink.student_id)
                                             .where(M.ParentLink.school_id == self.sid)).all()}
        for n, r in self.book.rows("Parents"):
            p = self.user(norm_mobile(r.get("login_id")), (Role.parent,))
            if not p:
                continue
            for adm in split_list(r.get("children")):
                s = self.user(adm, (Role.student,))
                if not s:
                    self.err("Parents", n, "children", f"no student with admission no. “{adm}”")
                    continue
                if (p.id, s.id) not in have:
                    db.add(M.ParentLink(school_id=self.sid, parent_id=p.id, student_id=s.id,
                                        relation=as_text(r.get("relation"), 20) or "Parent"))
                    have.add((p.id, s.id))
        # class teachers
        for n, c, login in getattr(self, "class_teacher", []):
            t = self.user(login, (Role.teacher,))
            if not t:
                self.err("Classes", n, "class_teacher", f"no teacher with employee code “{login}”")
            else:
                c.class_teacher_id = t.id
        db.flush()

    def teaching_sheet(self):
        have = {(a.class_id, a.subject_id): a for a in self.db.scalars(select(M.Assignment).where(M.Assignment.school_id == self.sid))}
        for n, r in self.book.rows("Teaching"):
            c, s, t = self._cst("Teaching", n, r)
            if not (c and s and t):
                continue
            a = have.get((c.id, s.id))
            if a:
                if a.teacher_id != t.id:
                    a.teacher_id = t.id
                    self.cnt("Teaching", "update")
                else:
                    self.cnt("Teaching", "skip")
            else:
                a = M.Assignment(school_id=self.sid, class_id=c.id, subject_id=s.id, teacher_id=t.id)
                self.db.add(a)
                have[(c.id, s.id)] = a
                self.cnt("Teaching", "add")
        self.db.flush()

    def _cst(self, sheet, n, r):
        c = self.classes.get(as_text(r.get("class"), 40).lower())
        s = self.subjects.get(as_text(r.get("subject"), 60).lower())
        t = self.user(r.get("teacher"), (Role.teacher,))
        if not c:
            self.err(sheet, n, "class", f"class “{r.get('class')}” not found")
        if not s:
            self.err(sheet, n, "subject", f"subject “{r.get('subject')}” not found")
        if not t:
            self.err(sheet, n, "teacher", f"no teacher with employee code “{r.get('teacher')}”")
        return c, s, t

    def bell_sheet(self):
        groups: dict[int, list[dict]] = {}
        first_row: dict[int, int] = {}
        for n, r in self.book.rows("Period timings"):
            d, ok = self.guard("Period timings", n, "day", parse_day, r.get("day"))
            if not ok:
                continue
            kind = str(r.get("kind") or "Period").strip().lower()
            st, ok1 = self.guard("Period timings", n, "start", as_time, r.get("start"))
            en, ok2 = self.guard("Period timings", n, "end", as_time, r.get("end"))
            if not (ok1 and ok2):
                continue
            groups.setdefault(d, []).append({"kind": "break" if kind.startswith("b") else "period", "label": as_text(r.get("label"), 30),
                                             "start": st, "end": en})
            first_row.setdefault(d, n)
        if not groups:
            return
        if -1 not in groups and not self.db.get(M.BellSchedule, (self.sid, -1)):
            self.err("Period timings", min(first_row.values()), "day", "add the timings for “All days” first")
        for d, slots in groups.items():
            slots.sort(key=lambda s: s["start"])
            try:
                clean = clean_slots(slots)
            except HTTPException as e:
                self.err("Period timings", first_row[d], "day", f"{'All days' if d < 0 else DAY_NAMES[d]}: {e.detail}")
                continue
            row = self.db.get(M.BellSchedule, (self.sid, d))
            if row:
                row.slots = clean
                self.cnt("Period timings", "update")
            else:
                self.db.add(M.BellSchedule(school_id=self.sid, day=d, slots=clean))
                self.cnt("Period timings", "add")
        self.db.flush()

    def timetable_sheet(self):
        rows = self.book.rows("Timetable")
        sched = schedules(self.db, self.sid)
        have = {(e.class_id, e.day, e.period): e for e in self.db.scalars(select(M.TimetableEntry).where(M.TimetableEntry.school_id == self.sid))}
        for n, r in rows:
            d, ok = self.guard("Timetable", n, "day", parse_day, r.get("day"))
            p, ok2 = self.guard("Timetable", n, "period", as_int, r.get("period"))
            if ok and d == -1:
                self.err("Timetable", n, "day", "use Mon, Tue … Sun")
                ok = False
            if ok2 and (p is None or not 1 <= p <= 12):
                self.err("Timetable", n, "period", "must be 1–12")
                ok2 = False
            c, s, t = self._cst("Timetable", n, r)
            if not (ok and ok2 and c and s and t):
                continue
            lim = period_count(sched, d)
            if lim is not None and p > lim:
                self.err("Timetable", n, "period", f"{DAY_NAMES[d]} has only {lim} periods in Period timings")
                continue
            e = have.get((c.id, d, p))
            if e:
                if (e.subject_id, e.teacher_id) != (s.id, t.id):
                    e.subject_id, e.teacher_id = s.id, t.id
                    self.cnt("Timetable", "update")
                else:
                    self.cnt("Timetable", "skip")
            else:
                e = M.TimetableEntry(school_id=self.sid, class_id=c.id, day=d, period=p, subject_id=s.id, teacher_id=t.id)
                self.db.add(e)
                have[(c.id, d, p)] = e
                self.cnt("Timetable", "add")
        self.db.flush()
        # a teacher can't be in two classes at once; and nothing beyond the day's last period
        busy = {}
        names = {c.id: c.name for c in self.classes.values()}
        tnames = {u.id: u.login_id for u in self.users.values()}
        for e in have.values():
            k = (e.teacher_id, e.day, e.period)
            if k in busy and busy[k] != e.class_id:
                self.issues.append(Issue(0, "Teacher", f"{tnames.get(e.teacher_id, '?')} has two classes on {DAY_NAMES[e.day]} period {e.period} "
                                                       f"({names.get(busy[k])} and {names.get(e.class_id)})", "Timetable"))
            busy[k] = e.class_id
            lim = period_count(sched, e.day)
            if rows == [] and self.book.rows("Period timings") and lim is not None and e.period > lim:
                self.issues.append(Issue(0, "Day", f"existing timetable has {DAY_NAMES[e.day]} period {e.period} · {names.get(e.class_id)}, "
                                                   f"but the new timings have only {lim} periods", "Period timings"))

    def holidays_sheet(self):
        have = {(h.name.lower(), h.start_date): h for h in self.db.scalars(select(M.Holiday).where(M.Holiday.school_id == self.sid))}
        for n, r in self.book.rows("Holidays"):
            name = as_text(r.get("name"), 120)
            if not name:
                self.err("Holidays", n, "name", "is required")
                continue
            kind = as_text(r.get("kind"), 20).lower() or "other"
            if kind not in HOLIDAY_KINDS:
                self.err("Holidays", n, "kind", "use festival, national, vacation, exam, event or other")
                continue
            st, ok1 = self.guard("Holidays", n, "start", as_date, r.get("start"))
            en, ok2 = self.guard("Holidays", n, "end", as_date, r.get("end") or r.get("start"))
            off, ok3 = self.guard("Holidays", n, "is_off", as_bool, r.get("is_off"), kind != "event")
            act, ok4 = self.guard("Holidays", n, "active", as_bool, r.get("active"), True)
            if not (ok1 and ok2 and ok3 and ok4):
                continue
            if not st:
                self.err("Holidays", n, "start", "is required")
                continue
            if en < st:
                self.err("Holidays", n, "end", "can't be before From")
                continue
            h = have.get((name.lower(), st))
            if not h:
                h = M.Holiday(school_id=self.sid, name=name, start_date=st, end_date=en)
                self.db.add(h)
                have[(name.lower(), st)] = h
                self.cnt("Holidays", "add")
            else:
                self.cnt("Holidays", "update")
            h.end_date, h.kind, h.is_off, h.note = en, kind, bool(off) and kind != "event", as_text(r.get("note"), 500)
            h.is_active = bool(act)
            h.archived_at = None if h.is_active else (h.archived_at or utcnow())
        self.db.flush()

    def fees_setup(self):
        from .routers.fees import get_config

        d = self.kv("Fee setup", FEE_KEYS)
        if not d and not self.class_fees and not self.book.rows("Routes"):
            return
        cfg = get_config(self.db, self.sid)
        S = "Fee setup"
        if "monthly_amount" in d:
            v, ok = self.guard(S, d["monthly_amount"][0], "value", as_float, d["monthly_amount"][1], 0, 1_000_000)
            if ok:
                cfg.monthly_amount = v or 0
        if "due_day" in d and d["due_day"][1] not in (None, ""):
            v, ok = self.guard(S, d["due_day"][0], "value", as_int, d["due_day"][1])
            if ok and v is not None and 1 <= v <= 28:
                cfg.due_day = v
            elif ok:
                self.err(S, d["due_day"][0], "value", "due day must be 1–28")
        if "start_month" in d:
            v = as_text(d["start_month"][1], 7)
            if isinstance(d["start_month"][1], (datetime, date)):
                v = d["start_month"][1].strftime("%Y-%m")
            if v and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", v):
                self.err(S, d["start_month"][0], "value", "use YYYY-MM, e.g. 2026-04")
            else:
                cfg.start_month = v or None
        if "auto_generate" in d:
            v, ok = self.guard(S, d["auto_generate"][0], "value", as_bool, d["auto_generate"][1], True)
            if ok:
                cfg.auto_generate = bool(v)
        if "upi_id" in d:
            v = as_text(d["upi_id"][1], 80)
            if v and not re.fullmatch(r"[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,64}", v):
                self.err(S, d["upi_id"][0], "value", "UPI ID should look like schoolname@bank")
            else:
                cfg.upi_id = v
        if "upi_name" in d:
            cfg.upi_name = as_text(d["upi_name"][1], 120)
        if "receipt_prefix" in d:
            cfg.receipt_prefix = re.sub(r"[^A-Za-z0-9\-]", "", as_text(d["receipt_prefix"][1], 20))[:20]
        if "receipt_note" in d:
            cfg.receipt_note = as_text(d["receipt_note"][1], 500)
        if self.class_fees:
            ca = dict(cfg.class_amounts or {})
            for k, fee in self.class_fees.items():
                c = self.classes.get(k)
                if not c or c.id is None:
                    continue
                if fee is None:
                    ca.pop(str(c.id), None)
                else:
                    ca[str(c.id)] = fee
            cfg.class_amounts = ca
        if d:
            self.cnt(S, "update")
        self.cfg = cfg

    # ---- transport
    def transport(self):
        db, sid = self.db, self.sid
        vehicles = {v.number.lower(): v for v in db.scalars(select(M.Vehicle).where(M.Vehicle.school_id == sid))}
        for n, r in self.book.rows("Vehicles"):
            num = as_text(r.get("number"), 30).upper()
            if not num:
                self.err("Vehicles", n, "number", "is required")
                continue
            v = vehicles.get(num.lower())
            if not v:
                v = M.Vehicle(school_id=sid, number=num)
                db.add(v)
                vehicles[num.lower()] = v
                self.cnt("Vehicles", "add")
            else:
                self.cnt("Vehicles", "update")
            cap, ok = self.guard("Vehicles", n, "capacity", as_int, r.get("capacity"))
            if ok and cap is not None:
                if 1 <= cap <= 120:
                    v.capacity = cap
                else:
                    self.err("Vehicles", n, "capacity", "seats must be 1–120")
            v.kind = as_text(r.get("kind"), 20).lower() or v.kind or "bus"
            for k, lim in (("driver_name", 120), ("driver_licence", 40), ("attendant_name", 120)):
                if k in r:
                    setattr(v, k, as_text(r.get(k), lim))
            for k in ("driver_phone", "attendant_phone"):
                if k in r:
                    setattr(v, k, norm_mobile(r.get(k))[:20])
            for k in ("licence_until", "insurance_until", "fitness_until"):
                if k in r:
                    val, ok = self.guard("Vehicles", n, k, as_date, r.get(k))
                    if ok:
                        setattr(v, k, val)
            act, ok = self.guard("Vehicles", n, "active", as_bool, r.get("active"), True)
            if ok:
                v.is_active = bool(act)
                v.archived_at = None if v.is_active else (v.archived_at or utcnow())
        db.flush()
        routes = {r.name.lower(): r for r in db.scalars(select(M.Route).where(M.Route.school_id == sid))}
        route_fees = {}
        for n, r in self.book.rows("Routes"):
            name = as_text(r.get("name"), 80)
            if not name:
                self.err("Routes", n, "name", "is required")
                continue
            rt = routes.get(name.lower())
            if not rt:
                rt = M.Route(school_id=sid, name=name)
                db.add(rt)
                routes[name.lower()] = rt
                self.cnt("Routes", "add")
            else:
                self.cnt("Routes", "update")
            vn = as_text(r.get("vehicle"), 30)
            if vn:
                v = vehicles.get(vn.lower())
                if not v:
                    self.err("Routes", n, "vehicle", f"vehicle “{vn}” not found on the Vehicles sheet")
                else:
                    rt.vehicle_id = v.id
            elif "vehicle" in r:
                rt.vehicle_id = None
            fee, ok = self.guard("Routes", n, "monthly_fee", as_float, r.get("monthly_fee"), 0, 100_000)
            if ok:
                route_fees[name.lower()] = fee
            act, ok = self.guard("Routes", n, "active", as_bool, r.get("active"), True)
            if ok:
                rt.is_active = bool(act)
                rt.archived_at = None if rt.is_active else (rt.archived_at or utcnow())
        db.flush()
        if route_fees:
            from .routers.fees import get_config

            cfg = get_config(db, sid)
            ra = dict(cfg.route_amounts or {})
            for k, fee in route_fees.items():
                rid = str(routes[k].id)
                if fee:
                    ra[rid] = fee
                else:
                    ra.pop(rid, None)
            cfg.route_amounts = ra
        stops = {(s.route_id, s.name.lower()): s for s in db.scalars(select(M.Stop).where(M.Stop.school_id == sid))}
        for n, r in self.book.rows("Stops"):
            rt = routes.get(as_text(r.get("route"), 80).lower())
            name = as_text(r.get("name"), 120)
            if not rt:
                self.err("Stops", n, "route", f"route “{r.get('route')}” not found")
                continue
            if not name:
                self.err("Stops", n, "name", "is required")
                continue
            seq, ok = self.guard("Stops", n, "seq", as_int, r.get("seq"))
            pu, ok2 = self.guard("Stops", n, "pickup", as_time, r.get("pickup"))
            dr, ok3 = self.guard("Stops", n, "drop", as_time, r.get("drop"))
            if not (ok and ok2 and ok3):
                continue
            s = stops.get((rt.id, name.lower()))
            if not s:
                s = M.Stop(school_id=sid, route_id=rt.id, name=name)
                db.add(s)
                stops[(rt.id, name.lower())] = s
                self.cnt("Stops", "add")
            else:
                self.cnt("Stops", "update")
            s.seq, s.pickup_time, s.drop_time, s.is_active = seq or 0, pu, dr, True
        db.flush()
        riders = {t.student_id: t for t in db.scalars(select(M.StudentTransport).where(M.StudentTransport.school_id == sid))}
        for n, r in self.book.rows("Bus riders"):
            st = self.user(r.get("student"), (Role.student,))
            rt = routes.get(as_text(r.get("route"), 80).lower())
            if not st:
                self.err("Bus riders", n, "student", f"no student with admission no. “{r.get('student')}”")
                continue
            if not rt:
                self.err("Bus riders", n, "route", f"route “{r.get('route')}” not found")
                continue
            stop = None
            if r.get("stop") not in (None, ""):
                stop = stops.get((rt.id, as_text(r.get("stop"), 120).lower()))
                if not stop:
                    self.err("Bus riders", n, "stop", f"stop “{r.get('stop')}” isn't on route {rt.name}")
                    continue
            t = riders.get(st.id)
            if t:
                t.route_id, t.stop_id = rt.id, stop.id if stop else None
                self.cnt("Bus riders", "update")
            else:
                t = M.StudentTransport(student_id=st.id, school_id=sid, route_id=rt.id, stop_id=stop.id if stop else None)
                db.add(t)
                riders[st.id] = t
                self.cnt("Bus riders", "add")
        db.flush()

    # ================================================================ history
    def history(self):
        present = [s for s in HISTORY_SHEETS if self.book.rows(s)]
        if not present:
            return
        if not self.verified:
            # Records like receipts, approvals, consent answers and marks are only restored from an unchanged backup —
            # otherwise a file could put actions in other people's names.
            if self.mode == "replace":
                self.issues.append(Issue(0, "", "This file isn't an unchanged backup, so its history (attendance, marks, fees, "
                                                "leaves…) can't be restored — and Replace would delete the current history. "
                                                "Use Merge, or restore the backup exactly as downloaded.", present[0]))
            else:
                self.warnings.append("History sheets (" + ", ".join(present[:4]) + ("…" if len(present) > 4 else "")
                                     + ") were skipped: they are only restored from an unchanged backup.")
            return
        self.attendance()
        self.exams_marks()
        self.notices()
        self.leaves()
        self.staff_attendance()
        self.banners_polls()
        self.fee_records()

    def attendance(self):
        rows = self.book.rows("Attendance")
        if not rows:
            return
        db, sid, S = self.db, self.sid, "Attendance"
        have = {(a, d): (i, p) for i, a, d, p in db.execute(select(M.Attendance.id, M.Attendance.student_id, M.Attendance.date, M.Attendance.present)
                                                          .where(M.Attendance.school_id == sid)).all()}
        new, upd = [], []
        seen = set()
        for n, r in rows:
            st = self.user(r.get("student"), (Role.student,))
            if not st:
                self.err(S, n, "student", f"no student with admission no. “{r.get('student')}”")
                continue
            d, ok = self.guard(S, n, "date", as_date, r.get("date"))
            pr, ok2 = self.guard(S, n, "present", as_bool, r.get("present"), True)
            if not (ok and ok2) or not d:
                if ok and not d:
                    self.err(S, n, "date", "is required")
                continue
            if (st.id, d) in seen:
                self.err(S, n, "date", "same student and date appears twice")
                continue
            seen.add((st.id, d))
            c = self.classes.get(as_text(r.get("class"), 40).lower()) if r.get("class") else None
            cid = c.id if c else st.class_id
            if not cid:
                self.err(S, n, "class", "class not found and the student has no class")
                continue
            ex = have.get((st.id, d))
            if ex:
                if ex[1] != pr:
                    upd.append({"id": ex[0], "present": pr})
                    self.cnt(S, "update")
                else:
                    self.cnt(S, "skip")
            else:
                new.append({"school_id": sid, "student_id": st.id, "class_id": cid, "date": d, "present": pr,
                            "marked_by": self.attrib(r.get("marked_by")), "marked_at": datetime(d.year, d.month, d.day, 9, 0)})
                self.cnt(S, "add")
        if new:
            for i in range(0, len(new), 5000):
                db.execute(insert(M.Attendance), new[i:i + 5000])
        if upd:
            db.execute(update(M.Attendance), upd)

    def exams_marks(self):
        db, sid = self.db, self.sid
        exams = {(e.name.lower(), e.date): e for e in db.scalars(select(M.Exam).where(M.Exam.school_id == sid))}
        for n, r in self.book.rows("Exams"):
            name = as_text(r.get("name"), 80)
            d, ok = self.guard("Exams", n, "date", as_date, r.get("date"))
            mx, ok2 = self.guard("Exams", n, "max_marks", as_float, r.get("max_marks"), 1, 10_000)
            act, ok3 = self.guard("Exams", n, "active", as_bool, r.get("active"), True)
            if not name or not d:
                self.err("Exams", n, "name" if not name else "date", "is required")
                continue
            if not (ok and ok2 and ok3):
                continue
            e = exams.get((name.lower(), d))
            if not e:
                e = M.Exam(school_id=sid, name=name, date=d, max_marks=mx or 100)
                db.add(e)
                exams[(name.lower(), d)] = e
                self.cnt("Exams", "add")
            else:
                e.max_marks = mx or e.max_marks
                self.cnt("Exams", "update")
            e.is_active = bool(act)
            e.archived_at = None if e.is_active else (e.archived_at or utcnow())
        db.flush()
        rows = self.book.rows("Marks")
        if not rows:
            return
        have = {(m.exam_id, m.student_id, m.subject_id): m for m in db.scalars(select(M.Mark).where(M.Mark.school_id == sid))}
        for n, r in rows:
            d, ok = self.guard("Marks", n, "exam_date", as_date, r.get("exam_date"))
            e = exams.get((as_text(r.get("exam"), 80).lower(), d)) if ok else None
            st = self.user(r.get("student"), (Role.student,))
            sb = self.subjects.get(as_text(r.get("subject"), 60).lower())
            sc, ok2 = self.guard("Marks", n, "score", as_float, r.get("score"), 0, 10_000)
            if not e:
                self.err("Marks", n, "exam", f"exam “{r.get('exam')}” on {r.get('exam_date')} not found on the Exams sheet")
                continue
            if not st or not sb or not ok2 or sc is None:
                if not st:
                    self.err("Marks", n, "student", f"no student with admission no. “{r.get('student')}”")
                if not sb:
                    self.err("Marks", n, "subject", f"subject “{r.get('subject')}” not found")
                if ok2 and sc is None:
                    self.err("Marks", n, "score", "is required")
                continue
            if sc > e.max_marks:
                self.err("Marks", n, "score", f"is more than the exam's max marks ({e.max_marks:g})")
                continue
            m = have.get((e.id, st.id, sb.id))
            if m:
                if m.score != sc:
                    m.score = sc
                    self.cnt("Marks", "update")
                else:
                    self.cnt("Marks", "skip")
            else:
                m = M.Mark(school_id=sid, exam_id=e.id, student_id=st.id, subject_id=sb.id, score=sc,
                           entered_by=self.attrib(r.get("entered_by")))
                db.add(m)
                have[(e.id, st.id, sb.id)] = m
                self.cnt("Marks", "add")
        db.flush()

    def _dt(self, sheet, n, fld, v, default_now=True):
        d, ok = self.guard(sheet, n, fld, as_dt, v)
        if not ok:
            return None, False
        return d or (utcnow() if default_now else None), True

    def notices(self):
        db, sid, S = self.db, self.sid, "Notices"
        have = {(p.kind, p.title, p.created_at.replace(microsecond=0)) for p in db.scalars(select(M.Post).where(M.Post.school_id == sid))}
        for n, r in self.book.rows(S):
            kind = as_text(r.get("kind"), 20).lower() or "notice"
            title = as_text(r.get("title"), 200)
            if kind not in ("notice", "homework"):
                self.err(S, n, "kind", "use notice or homework")
                continue
            if not title:
                self.err(S, n, "title", "is required")
                continue
            at, ok = self._dt(S, n, "created_at", r.get("created_at"))
            due, ok2 = self.guard(S, n, "due_date", as_date, r.get("due_date"))
            act, ok3 = self.guard(S, n, "active", as_bool, r.get("active"), True)
            if not (ok and ok2 and ok3):
                continue
            if (kind, title, at.replace(microsecond=0)) in have:
                self.cnt(S, "skip")
                continue
            c = self.classes.get(as_text(r.get("class"), 40).lower()) if r.get("class") else None
            sb = self.subjects.get(as_text(r.get("subject"), 60).lower()) if r.get("subject") else None
            db.add(M.Post(school_id=sid, kind=kind, title=title, body=as_text(r.get("body"), 20000), class_id=c.id if c else None,
                          subject_id=sb.id if sb else None, due_date=due, author_id=self.attrib(r.get("author")), created_at=at,
                          is_active=bool(act), archived_at=None if act else at))
            have.add((kind, title, at.replace(microsecond=0)))
            self.cnt(S, "add")

    def leaves(self):
        db, sid, S = self.db, self.sid, "Leaves"
        have = {(lv.user_id, lv.start_date, lv.end_date, lv.leave_type) for lv in db.scalars(select(M.LeaveRequest).where(M.LeaveRequest.school_id == sid))}
        for n, r in self.book.rows(S):
            kind = as_text(r.get("kind"), 10).lower() or "staff"
            u = self.user(r.get("person"))
            st, ok1 = self.guard(S, n, "start", as_date, r.get("start"))
            en, ok2 = self.guard(S, n, "end", as_date, r.get("end") or r.get("start"))
            half, ok3 = self.guard(S, n, "half_day", as_bool, r.get("half_day"), False)
            at, ok4 = self._dt(S, n, "created_at", r.get("created_at"))
            dec_at, ok5 = self._dt(S, n, "decided_at", r.get("decided_at"), False)
            status = as_text(r.get("status"), 12).lower() or "pending"
            ltype = as_text(r.get("leave_type"), 20).lower() or "other"
            if kind not in ("staff", "student"):
                self.err(S, n, "kind", "use staff or student")
                continue
            if not u:
                self.err(S, n, "person", f"no one with login “{r.get('person')}”")
                continue
            if status not in ("pending", "approved", "rejected", "cancelled"):
                self.err(S, n, "status", "use pending, approved, rejected or cancelled")
                continue
            if not (ok1 and ok2 and ok3 and ok4 and ok5) or not st or en < st:
                if ok1 and ok2 and st and en and en < st:
                    self.err(S, n, "end", "can't be before From")
                continue
            if (u.id, st, en, ltype) in have:
                self.cnt(S, "skip")
                continue
            db.add(M.LeaveRequest(school_id=sid, kind=kind, user_id=u.id, applied_by=self.attrib(r.get("applied_by")), leave_type=ltype,
                                  start_date=st, end_date=en, half_day=bool(half), reason=as_text(r.get("reason"), 2000), status=status,
                                  decided_by=self.attrib(r.get("decided_by")) if r.get("decided_by") else None, decided_at=dec_at, comment=as_text(r.get("comment"), 2000),
                                  created_at=at))
            have.add((u.id, st, en, ltype))
            self.cnt(S, "add")

    def staff_attendance(self):
        db, sid, S = self.db, self.sid, "Staff attendance"
        have = {(a.user_id, a.date): a for a in db.scalars(select(M.StaffAttendance).where(M.StaffAttendance.school_id == sid))}
        for n, r in self.book.rows(S):
            u = self.user(r.get("person"), (Role.teacher, Role.vice_principal, Role.coordinator, Role.principal))
            d, ok = self.guard(S, n, "date", as_date, r.get("date"))
            ci, ok1 = self._dt(S, n, "check_in", r.get("check_in"), False)
            co, ok2 = self._dt(S, n, "check_out", r.get("check_out"), False)
            late, ok3 = self.guard(S, n, "late", as_bool, r.get("late"), False)
            nums = {}
            okn = True
            for k in ("in_distance", "out_distance", "accuracy"):
                nums[k], o = self.guard(S, n, k, as_float, r.get(k), 0, 100_000)
                okn = okn and o
            if not u:
                self.err(S, n, "person", f"no staff member with code “{r.get('person')}”")
                continue
            if not (ok and ok1 and ok2 and ok3 and okn) or not d:
                continue
            a = have.get((u.id, d))
            vals = dict(check_in_at=ci, check_out_at=co, in_distance_m=nums["in_distance"], out_distance_m=nums["out_distance"],
                        in_accuracy_m=nums["accuracy"], late=bool(late), marked_by=self.attrib(r.get("marked_by")) if r.get("marked_by") else None, note=as_text(r.get("note"), 200))
            if a:
                for k, v in vals.items():
                    setattr(a, k, v)
                self.cnt(S, "update")
            else:
                a = M.StaffAttendance(school_id=sid, user_id=u.id, date=d, **vals)
                db.add(a)
                have[(u.id, d)] = a
                self.cnt(S, "add")

    def _class_ids(self, sheet, n, fld, v) -> list[int]:
        ids = []
        for nm in split_list(v):
            c = self.classes.get(nm.lower())
            if c:
                ids.append(c.id)
            else:
                self.err(sheet, n, fld, f"class “{nm}” not found")
        return ids

    def banners_polls(self):
        db, sid = self.db, self.sid
        have = {(b.title, b.created_at.replace(microsecond=0)) for b in db.scalars(select(M.Banner).where(M.Banner.school_id == sid))}
        for n, r in self.book.rows("Banners"):
            title = as_text(r.get("title"), 120)
            if not title:
                self.err("Banners", n, "title", "is required")
                continue
            url = as_text(r.get("image_url"), 500)
            if url and not url.startswith("https://"):
                self.err("Banners", n, "image_url", "image link must start with https://")
                continue
            roles = split_list(r.get("roles"))
            if set(roles) - set(AUDIENCE):
                self.err("Banners", n, "roles", f"use {', '.join(AUDIENCE)}")
                continue
            at, ok = self._dt("Banners", n, "created_at", r.get("created_at"))
            st, ok1 = self.guard("Banners", n, "start", as_date, r.get("start"))
            en, ok2 = self.guard("Banners", n, "end", as_date, r.get("end"))
            pop, ok3 = self.guard("Banners", n, "popup", as_bool, r.get("popup"), False)
            act, ok4 = self.guard("Banners", n, "active", as_bool, r.get("active"), True)
            srt, ok5 = self.guard("Banners", n, "sort", as_int, r.get("sort"))
            if not all((ok, ok1, ok2, ok3, ok4, ok5)):
                continue
            if (title, at.replace(microsecond=0)) in have:
                self.cnt("Banners", "skip")
                continue
            color = as_text(r.get("color"), 20).lower() or "primary"
            db.add(M.Banner(school_id=sid, title=title, text=as_text(r.get("text"), 2000), image_url=url,
                            color=color if color in ("primary", "amber", "green", "red", "purple") else "primary", roles=roles,
                            class_ids=self._class_ids("Banners", n, "classes", r.get("classes")), start_date=st, end_date=en, popup=bool(pop),
                            sort=srt or 0, created_by=self.actor_id, created_at=at, is_active=bool(act), archived_at=None if act else at))
            have.add((title, at.replace(microsecond=0)))
            self.cnt("Banners", "add")
        polls = {(p.title, p.created_at.replace(microsecond=0)): p for p in db.scalars(select(M.Poll).where(M.Poll.school_id == sid))}
        self.poll_ref: dict[str, M.Poll] = {}
        for n, r in self.book.rows("Polls"):
            title = as_text(r.get("title"), 200)
            kind = as_text(r.get("kind"), 10).lower() or "poll"
            opts = [o.strip()[:120] for o in str(r.get("options") or "").split("|") if o.strip()]
            aud = split_list(r.get("audience")) or ["parent"]
            if not title:
                self.err("Polls", n, "title", "is required")
                continue
            if kind not in ("poll", "consent") or len(opts) < 2 or set(aud) - {"parent", "teacher", "student"}:
                self.err("Polls", n, "options" if len(opts) < 2 else "kind",
                         "needs at least 2 options separated by |" if len(opts) < 2 else "type must be poll or consent; audience parent/teacher/student")
                continue
            at, ok = self._dt("Polls", n, "created_at", r.get("created_at"))
            dl, ok1 = self.guard("Polls", n, "deadline", as_date, r.get("deadline"))
            amt, ok2 = self.guard("Polls", n, "amount", as_float, r.get("amount"), 0, 1_000_000)
            multi, ok3 = self.guard("Polls", n, "multi", as_bool, r.get("multi"), False)
            closed, ok4 = self.guard("Polls", n, "closed", as_bool, r.get("closed"), False)
            act, ok5 = self.guard("Polls", n, "active", as_bool, r.get("active"), True)
            if not all((ok, ok1, ok2, ok3, ok4, ok5)):
                continue
            p = polls.get((title, at.replace(microsecond=0)))
            if p:
                self.cnt("Polls", "skip")
            else:
                p = M.Poll(school_id=sid, kind=kind, title=title, description=as_text(r.get("description"), 4000), options=opts,
                           multi=bool(multi), audience=aud, class_ids=self._class_ids("Polls", n, "classes", r.get("classes")),
                           deadline=dl, amount=amt, closed=bool(closed), created_by=self.attrib(r.get("created_by")), created_at=at,
                           is_active=bool(act), archived_at=None if act else at)
                db.add(p)
                polls[(title, at.replace(microsecond=0))] = p
                self.cnt("Polls", "add")
            if r.get("ref") not in (None, ""):
                self.poll_ref[as_text(r.get("ref"), 30)] = p
        db.flush()
        rows = self.book.rows("Poll answers")
        if not rows:
            return
        have_r = {(x.poll_id, x.user_id, x.student_id): x for x in db.scalars(
            select(M.PollResponse).where(M.PollResponse.poll_id.in_([p.id for p in self.poll_ref.values()] or [-1])))}
        for n, r in rows:
            p = self.poll_ref.get(as_text(r.get("poll"), 30))
            u = self.user(r.get("person"))
            if not p:
                self.err("Poll answers", n, "poll", f"poll ref “{r.get('poll')}” not on the Polls sheet")
                continue
            if not u:
                self.err("Poll answers", n, "person", f"no one with login “{r.get('person')}”")
                continue
            s = self.user(r.get("student"), (Role.student,)) if r.get("student") not in (None, "") else None
            try:
                ch = sorted({int(float(x)) - 1 for x in split_list(r.get("choices"))})
            except ValueError:
                ch = [-1]
            if not ch or any(c < 0 or c >= len(p.options) for c in ch):
                self.err("Poll answers", n, "choices", f"option numbers must be 1–{len(p.options)}")
                continue
            at, ok = self._dt("Poll answers", n, "at", r.get("at"))
            if not ok:
                continue
            k = (p.id, u.id, s.id if s else 0)
            if k in have_r:
                self.cnt("Poll answers", "skip")
                continue
            x = M.PollResponse(poll_id=p.id, user_id=u.id, student_id=s.id if s else 0, choices=ch, comment=as_text(r.get("comment"), 1000), at=at)
            db.add(x)
            have_r[k] = x
            self.cnt("Poll answers", "add")

    def fee_records(self):
        db, sid = self.db, self.sid
        b = self.book
        if not any(b.rows(s) for s in ("Extra fees", "Fee charges", "Payments", "Payment split", "Receipt numbers")):
            return
        batches = {(x.title, x.created_at.replace(microsecond=0)): x for x in db.scalars(select(M.FeeBatch).where(M.FeeBatch.school_id == sid))}
        bref: dict[str, M.FeeBatch] = {}
        lid = lambda logins: [u.id for u in (self.user(x) for x in split_list(logins)) if u]  # noqa: E731
        for n, r in b.rows("Extra fees"):
            title = as_text(r.get("title"), 120)
            amt, ok = self.guard("Extra fees", n, "amount", as_float, r.get("amount"), 0.01, 1_000_000)
            due, ok1 = self.guard("Extra fees", n, "due_date", as_date, r.get("due_date"))
            at, ok2 = self._dt("Extra fees", n, "created_at", r.get("created_at"))
            act, ok3 = self.guard("Extra fees", n, "active", as_bool, r.get("active"), True)
            target = as_text(r.get("target"), 10).lower() or "school"
            if not title or target not in ("school", "classes", "students"):
                self.err("Extra fees", n, "title" if not title else "target", "is required" if not title else "use school, classes or students")
                continue
            if not all((ok, ok1, ok2, ok3)) or amt is None:
                continue
            x = batches.get((title, at.replace(microsecond=0)))
            if x:
                self.cnt("Extra fees", "skip")
            else:
                x = M.FeeBatch(school_id=sid, title=title, amount=amt, due_date=due, note=as_text(r.get("note"), 500), target=target,
                               class_ids=self._class_ids("Extra fees", n, "classes", r.get("classes")), student_ids=lid(r.get("students")),
                               exclude_ids=lid(r.get("excluded")), created_by=self.attrib(r.get("created_by")), created_at=at,
                               is_active=bool(act), archived_at=None if act else at)
                db.add(x)
                batches[(title, at.replace(microsecond=0))] = x
                self.cnt("Extra fees", "add")
            if r.get("ref") not in (None, ""):
                bref[as_text(r.get("ref"), 30)] = x
        db.flush()
        items = {(i.student_id, i.kind, i.period): i for i in db.scalars(select(M.FeeItem).where(M.FeeItem.school_id == sid))}
        iref: dict[str, M.FeeItem] = {}
        months = set()
        for n, r in b.rows("Fee charges"):
            st = self.user(r.get("student"), (Role.student,))
            kind = as_text(r.get("kind"), 12).lower()
            period = as_text(r.get("period"), 20)
            amt, ok = self.guard("Fee charges", n, "amount", as_float, r.get("amount"), 0, 1_000_000)
            due, ok1 = self.guard("Fee charges", n, "due_date", as_date, r.get("due_date"))
            act, ok2 = self.guard("Fee charges", n, "active", as_bool, r.get("active"), True)
            at, ok3 = self._dt("Fee charges", n, "created_at", r.get("created_at"))
            if not st:
                self.err("Fee charges", n, "student", f"no student with admission no. “{r.get('student')}”")
                continue
            if kind not in ("monthly", "transport", "extra", "fine"):
                self.err("Fee charges", n, "kind", "use monthly, transport, extra or fine")
                continue
            if not all((ok, ok1, ok2, ok3)) or amt is None:
                continue
            batch = None
            if kind == "extra":
                batch = bref.get(as_text(r.get("batch"), 30))
                if not batch:
                    self.err("Fee charges", n, "batch", "extra fee ref not found on the Extra fees sheet")
                    continue
                period = f"b{batch.id}"
            elif kind in ("monthly", "transport"):
                if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period):
                    self.err("Fee charges", n, "period", "use YYYY-MM for monthly and transport charges")
                    continue
                if kind == "monthly":
                    months.add(period)
            elif not period:
                period = f"x{int(at.timestamp() * 1000)}{n}"
            k = (st.id, kind, period)
            i = items.get(k)
            if i:
                self.cnt("Fee charges", "skip")
            else:
                i = M.FeeItem(school_id=sid, student_id=st.id, kind=kind, period=period, title=as_text(r.get("title"), 160) or kind.title(),
                              amount=amt, due_date=due, batch_id=batch.id if batch else None, is_active=bool(act), created_by=self.actor_id,
                              created_at=at)
                db.add(i)
                items[k] = i
                self.cnt("Fee charges", "add")
            if r.get("ref") not in (None, ""):
                iref[as_text(r.get("ref"), 30)] = i
        db.flush()
        if months:
            from .routers.fees import get_config

            cfg = get_config(db, sid)
            cfg.generated_months = sorted(set(cfg.generated_months or []) | months)
        existing_receipts = {x.receipt_no: x for x in db.scalars(select(M.FeePayment).where(M.FeePayment.school_id == sid,
                                                                                             M.FeePayment.receipt_no.is_not(None)))}
        existing_claims = {(x.student_id, x.reference, x.created_at.replace(microsecond=0)) for x in db.scalars(
            select(M.FeePayment).where(M.FeePayment.school_id == sid, M.FeePayment.receipt_no.is_(None)))}
        pref: dict[str, tuple[M.FeePayment, bool]] = {}
        for n, r in b.rows("Payments"):
            st = self.user(r.get("student"), (Role.student,))
            rn = as_text(r.get("receipt_no"), 40) or None
            amt, ok = self.guard("Payments", n, "amount", as_float, r.get("amount"), 0.01, 10_000_000)
            paid_on, ok1 = self.guard("Payments", n, "paid_on", as_date, r.get("paid_on"))
            at, ok2 = self._dt("Payments", n, "created_at", r.get("created_at"))
            cat, ok3 = self._dt("Payments", n, "confirmed_at", r.get("confirmed_at"), False)
            mode = as_text(r.get("mode"), 12).lower()
            status = as_text(r.get("status"), 12).lower() or "confirmed"
            if not st:
                self.err("Payments", n, "student", f"no student with admission no. “{r.get('student')}”")
                continue
            if mode not in ("cash", "upi", "cheque", "bank", "online") or status not in ("confirmed", "pending", "rejected", "cancelled"):
                self.err("Payments", n, "mode" if mode not in ("cash", "upi", "cheque", "bank", "online") else "status",
                         "mode: cash/upi/cheque/bank/online · status: confirmed/pending/rejected/cancelled")
                continue
            if status in ("confirmed", "cancelled") and not rn:
                self.err("Payments", n, "receipt_no", "issued payments need their receipt no.")
                continue
            if not all((ok, ok1, ok2, ok3)) or not paid_on or amt is None:
                if ok1 and not paid_on:
                    self.err("Payments", n, "paid_on", "is required")
                continue
            ref = as_text(r.get("reference"), 80)
            if rn and rn in existing_receipts:
                self.cnt("Payments", "skip")
                pref[as_text(r.get("ref"), 30)] = (existing_receipts[rn], False)
                continue
            if not rn and (st.id, ref, at.replace(microsecond=0)) in existing_claims:
                self.cnt("Payments", "skip")
                continue
            req = [iref[x].id for x in split_list(r.get("requested")) if x in iref]
            p = M.FeePayment(school_id=sid, student_id=st.id, receipt_no=rn, amount=amt, mode=mode, reference=ref, paid_on=paid_on,
                             status=status, note=as_text(r.get("note"), 300), cancel_reason=as_text(r.get("cancel_reason"), 300),
                             received_by=self.attrib(r.get("received_by")) if r.get("received_by") else None,
                             submitted_by=self.attrib(r.get("submitted_by")) if r.get("submitted_by") else None,
                             requested_item_ids=req, created_at=at, confirmed_at=cat)
            db.add(p)
            if rn:
                existing_receipts[rn] = p
            self.cnt("Payments", "add")
            if r.get("ref") not in (None, ""):
                pref[as_text(r.get("ref"), 30)] = (p, True)
        db.flush()
        for n, r in b.rows("Payment split"):
            pp = pref.get(as_text(r.get("payment"), 30))
            it = iref.get(as_text(r.get("charge"), 30))
            amt, ok = self.guard("Payment split", n, "amount", as_float, r.get("amount"), 0.01, 10_000_000)
            if not pp or not it:
                self.err("Payment split", n, "payment" if not pp else "charge", "ref not found on the Payments / Fee charges sheet")
                continue
            if not ok or amt is None:
                continue
            p, fresh = pp
            if not fresh:
                self.cnt("Payment split", "skip")
                continue
            if p.student_id != it.student_id:
                self.err("Payment split", n, "charge", "payment and charge belong to different students")
                continue
            db.add(M.FeeAllocation(payment_id=p.id, item_id=it.id, amount=amt))
            self.cnt("Payment split", "add")
        for n, r in b.rows("Receipt numbers"):
            yr = as_text(r.get("year"), 7)
            last, ok = self.guard("Receipt numbers", n, "last_no", as_int, r.get("last_no"))
            if not re.fullmatch(r"\d{4}-\d{2}", yr) or not ok or last is None or last < 0:
                if not re.fullmatch(r"\d{4}-\d{2}", yr):
                    self.err("Receipt numbers", n, "year", "use 2026-27")
                continue
            c = db.get(M.ReceiptCounter, (sid, yr))
            if c:
                if last > c.last_no:
                    c.last_no = last
                    self.cnt("Receipt numbers", "update")
                else:
                    self.cnt("Receipt numbers", "skip")
            else:
                db.add(M.ReceiptCounter(school_id=sid, year=yr, last_no=last))
                self.cnt("Receipt numbers", "add")
        db.flush()
        # money sanity: a charge can't be paid more than its amount
        over = db.execute(select(M.FeeItem.id, M.FeeItem.amount, func.sum(M.FeeAllocation.amount))
                          .join(M.FeeAllocation, M.FeeAllocation.item_id == M.FeeItem.id)
                          .join(M.FeePayment, M.FeePayment.id == M.FeeAllocation.payment_id)
                          .where(M.FeeItem.school_id == sid, M.FeePayment.status == "confirmed")
                          .group_by(M.FeeItem.id, M.FeeItem.amount)
                          .having(func.sum(M.FeeAllocation.amount) > M.FeeItem.amount + 0.01)).all()
        for iid, amt, paid in over[:20]:
            self.issues.append(Issue(0, "Amount ₹", f"a charge of ₹{amt:g} would be paid ₹{paid:g} — check Payment split", "Payment split"))


def run_import(db: Session, school: M.School, me: M.User, data: bytes, mode: str, confirm: bool = False) -> tuple[dict, list[dict]]:
    if mode not in ("merge", "replace"):
        raise HTTPException(400, "Choose Merge or Replace")
    book = Book(data)
    if not book.sheets:
        raise HTTPException(400, "No School Hub sheets found in this file. Download the template from the app and fill it in.")
    imp = Importer(db, school, me, mode, book, confirm)
    report = imp.run()
    return report, imp.credentials
