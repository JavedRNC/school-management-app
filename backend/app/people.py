"""Shared engine for creating/updating many people at once (F29 "Add many" and F30 Excel import).

Plan first (validate every row, no writes), then apply. Nothing is written when any row has an error.
"""
import re
import secrets
from dataclasses import dataclass, field
from datetime import date, datetime

import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ParentLink, Role, School, SchoolClass, User, utcnow
from .perms import clean_permissions

# random temporary passwords: no look-alike characters (0/O, 1/l/I)
ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
MOBILE = re.compile(r"^[6-9]\d{9}$")
LOGIN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/\-]{0,59}$")   # new logins (Add many / template)
ANY_LOGIN = re.compile(r"^\S(.{0,58}\S)?$")                 # restores: whatever the app allowed
BLOOD = {"", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
ROLE_WORDS = {"teacher": Role.teacher, "vice principal": Role.vice_principal, "vice_principal": Role.vice_principal,
              "vp": Role.vice_principal, "coordinator": Role.coordinator, "student": Role.student, "parent": Role.parent,
              "principal": Role.principal}
STAFF_ROLES = (Role.teacher, Role.vice_principal, Role.coordinator)


def temp_password() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(8))


def hash_temp(pw: str) -> str:
    """Temporary passwords are random (≈46 bits) and must be changed at first sign-in, so a lighter bcrypt cost
    keeps importing hundreds of people fast on a small server. Passwords people choose use the normal cost."""
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(8)).decode()


def norm_mobile(v) -> str:
    s = re.sub(r"[\s\-()]", "", str(v or "")).strip()
    if s.endswith(".0"):
        s = s[:-2]
    if s.startswith("+91"):
        s = s[3:]
    elif len(s) == 12 and s.startswith("91"):
        s = s[2:]
    elif len(s) == 11 and s.startswith("0"):
        s = s[1:]
    return s


def as_text(v, limit: int = 200) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return s[:limit]


def as_login(v) -> str:
    return as_text(v, 1000)   # length is checked by LOGIN (max 60), never silently cut


def as_date(v) -> date | None:
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise ValueError("use a date like 2012-05-31 or 31/05/2012")


def as_int(v) -> int | None:
    if v in (None, ""):
        return None
    try:
        f = float(str(v).strip())
    except ValueError:
        raise ValueError("must be a whole number") from None
    if not f.is_integer():
        raise ValueError("must be a whole number")
    return int(f)


def as_bool(v, default: bool = True) -> bool:
    if v in (None, ""):
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("yes", "y", "true", "1", "active", "on"):
        return True
    if s in ("no", "n", "false", "0", "inactive", "off", "removed", "archived"):
        return False
    raise ValueError("write Yes or No")


@dataclass
class Issue:
    row: int
    field: str
    message: str
    sheet: str = ""

    def out(self) -> dict:
        return {"sheet": self.sheet, "row": self.row, "field": self.field, "message": self.message}


@dataclass
class PeoplePlan:
    """Rows validated against the school + each other. `ops` are applied in order."""
    school: School
    me: User
    issues: list[Issue] = field(default_factory=list)
    creates: list[dict] = field(default_factory=list)     # new users
    updates: list[tuple[User, dict]] = field(default_factory=list)
    links: list[tuple[str, str, str]] = field(default_factory=list)   # (parent login, student login, relation)
    seen: dict[tuple[str, str], int] = field(default_factory=dict)    # (role group, login lower) → row
    unchanged: int = 0

    def err(self, row: int, fld: str, msg: str, sheet: str = ""):
        self.issues.append(Issue(row, fld, msg, sheet))


class Ctx:
    """Lookups for one school, loaded once."""

    def __init__(self, db: Session, school: School):
        self.db = db
        self.school = school
        self.users = {u.login_id.lower(): u for u in db.scalars(select(User).where(User.school_id == school.id))}
        self.classes = {c.name.strip().lower(): c for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == school.id))}
        self.new_classes: set[str] = set()   # classes another sheet of the same import will create
        self.allow_inactive_class = False     # restores may put students back into archived classes

    def class_ok(self, name: str) -> bool:
        k = name.strip().lower()
        return k in self.new_classes or (k in self.classes and (self.classes[k].is_active or self.allow_inactive_class))


def plan_rows(ctx: Ctx, plan: PeoplePlan, role: Role, rows: list[dict], sheet: str = "", start_row: int = 1,
              allow_update: bool = False, strict: bool = True) -> None:
    """Validate rows of one role. Students may carry parent_name/parent_mobile (+ relation).
    strict=False (restoring a backup) only checks what the app itself enforces, so any backup restores."""
    me = plan.me
    for i, r in enumerate(rows):
        n = start_row + i
        rr = dict(r)
        row_role = role
        if role in STAFF_ROLES and rr.get("role"):
            row_role = ROLE_WORDS.get(as_text(rr["role"]).lower())
            if row_role not in STAFF_ROLES:
                plan.err(n, "role", "must be Teacher, Vice Principal or Coordinator", sheet)
                continue
        name = as_text(rr.get("name"), 120)
        login = as_login(rr.get("login_id"))
        if len(as_text(rr.get("name"), 1000)) > 120:
            plan.err(n, "name", "is longer than 120 characters", sheet)
        if row_role == Role.parent:
            login = norm_mobile(login or rr.get("phone"))
        if not name:
            plan.err(n, "name", "is required", sheet)
        label = {Role.student: "Admission no.", Role.parent: "Mobile", Role.teacher: "Employee code"}.get(row_role, "Login ID")
        if not login:
            plan.err(n, "login_id", f"{label} is required", sheet)
            continue
        if strict and row_role == Role.parent and not MOBILE.match(login):
            plan.err(n, "login_id", "must be a 10-digit Indian mobile number", sheet)
            continue
        if not (LOGIN if strict else ANY_LOGIN).match(login):
            plan.err(n, "login_id", f"{label} can use letters, numbers and . _ / - only", sheet)
            continue
        key = login.lower()
        grp = "user"
        if (grp, key) in plan.seen:
            plan.err(n, "login_id", f"“{login}” is repeated (also on row {plan.seen[(grp, key)]})", sheet)
            continue
        plan.seen[(grp, key)] = n
        data: dict = {"name": name, "login_id": login, "role": row_role}
        try:
            data["phone"] = norm_mobile(rr.get("phone")) if rr.get("phone") not in (None, "") else ""
            if row_role == Role.parent and not data["phone"]:
                data["phone"] = login[:20]
            if strict and data["phone"] and not re.fullmatch(r"\d{10}", data["phone"]):
                raise ValueError("phone must be a 10-digit mobile number")
            data["phone"] = data["phone"][:20]
        except ValueError as e:
            plan.err(n, "phone", str(e), sheet)
        data["email"] = as_text(rr.get("email"), 200)
        if strict and data["email"] and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", data["email"]):
            plan.err(n, "email", "doesn't look like an email address", sheet)
        data["address"] = as_text(rr.get("address"), 500)
        try:
            data["dob"] = as_date(rr.get("dob"))
            if strict and data["dob"] and not date(1930, 1, 1) <= data["dob"] <= date.today():
                raise ValueError("date of birth looks wrong")
        except ValueError as e:
            plan.err(n, "dob", str(e), sheet)
        bg = as_text(rr.get("blood_group"), 5).upper().replace(" ", "")
        if strict and bg not in BLOOD:
            plan.err(n, "blood_group", "use A+, A-, B+, B-, AB+, AB-, O+ or O-", sheet)
        data["blood_group"] = bg
        try:
            data["active"] = as_bool(rr.get("active"), True)
        except ValueError as e:
            plan.err(n, "active", str(e), sheet)
        if row_role == Role.student:
            cname = as_text(rr.get("class"), 40)
            if not cname:
                plan.err(n, "class", "is required for students", sheet)
            elif not ctx.class_ok(cname):
                plan.err(n, "class", f"“{cname}” doesn't exist — add it on the Classes sheet or in the app first", sheet)
            data["class"] = cname
            try:
                data["roll_no"] = as_int(rr.get("roll_no"))
                if data["roll_no"] is not None and not (0 < data["roll_no"] < 10000 if strict else 0 <= data["roll_no"] < 2**31):
                    raise ValueError("roll no. looks wrong")
            except ValueError as e:
                plan.err(n, "roll_no", str(e), sheet)
            pm = rr.get("parent_mobile")
            if pm not in (None, ""):
                pmob = norm_mobile(pm)
                if not (MOBILE if strict else ANY_LOGIN).match(pmob):
                    plan.err(n, "parent_mobile", "must be a 10-digit Indian mobile number", sheet)
                else:
                    ex = ctx.users.get(pmob.lower())
                    if ex and ex.role != Role.parent:
                        plan.err(n, "parent_mobile", f"{pmob} is already the login of a {ex.role.value.replace('_', ' ')}", sheet)
                    else:
                        _plan_parent(ctx, plan, pmob, as_text(rr.get("parent_name"), 120) or f"Parent of {name}", n, sheet)
                        plan.links.append((pmob, login, as_text(rr.get("relation"), 20) or "Parent"))
        if row_role in (Role.vice_principal, Role.coordinator) and me.role not in (Role.principal, Role.admin):
            plan.err(n, "role", "only the principal can add Vice Principals and Coordinators", sheet)
        existing = ctx.users.get(key)
        if existing:
            if not allow_update:
                plan.err(n, "login_id", f"“{login}” is already used by {existing.name}", sheet)
                continue
            if existing.role != row_role:
                plan.err(n, "login_id", f"“{login}” belongs to a {existing.role.value.replace('_', ' ')} ({existing.name})", sheet)
                continue
            if existing.role == Role.principal or existing.id == me.id:
                if existing.id != me.id:
                    plan.err(n, "login_id", "the principal account can only be changed by the platform admin", sheet)
                    continue
                data["active"] = True   # never deactivate yourself
            plan.updates.append((existing, data))
        else:
            plan.creates.append(data)


def _plan_parent(ctx: Ctx, plan: PeoplePlan, mobile: str, name: str, row: int, sheet: str) -> None:
    key = ("parent-auto", mobile)
    if key in plan.seen or ("user", mobile) in plan.seen or mobile in ctx.users:
        return
    plan.seen[key] = row
    plan.creates.append({"name": name, "login_id": mobile, "role": Role.parent, "phone": mobile, "email": "", "address": "",
                         "dob": None, "blood_group": "", "active": True, "_auto": True})


def check_student_limit(ctx: Ctx, plan: PeoplePlan) -> None:
    lim = ctx.school.max_students
    if not lim:
        return
    active_now = sum(1 for u in ctx.users.values() if u.role == Role.student and u.active)
    delta = sum(1 for c in plan.creates if c["role"] == Role.student and c.get("active", True))
    delta += sum(1 for u, d in plan.updates if u.role == Role.student and d.get("active", True) and not u.active)
    delta -= sum(1 for u, d in plan.updates if u.role == Role.student and not d.get("active", True) and u.active)
    if active_now + delta > lim:
        plan.err(0, "students", f"your plan allows up to {lim} active students; this would make {active_now + delta}")


PREVIEW_HASH = "!preview-not-a-password"   # never matches; only ever written inside a rolled-back preview


def apply_plan(ctx: Ctx, plan: PeoplePlan, vault: dict[str, dict] | None = None, fast: bool = False,
               locked_down_staff: bool = False) -> list[dict]:
    """Write the plan. Returns credentials of new accounts: [{name, role, login_id, password}].
    vault (login lower → {"h","m","p","c"}) comes from a verified backup: those people keep their password,
    VP/coordinator permissions and parental consent date.
    fast=True (preview, or a run that will be rolled back) skips password hashing entirely.
    locked_down_staff: new VPs/coordinators start with no permissions (file not verified)."""
    from datetime import datetime as _dt

    from .perms import AREAS

    db = ctx.db
    creds = []
    vault = vault or {}
    classes = {c.name.strip().lower(): c for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == ctx.school.id))}
    for d in plan.creates:
        cls = classes.get(d.get("class", "").strip().lower()) if d["role"] == Role.student else None
        known = vault.get(d["login_id"].lower())
        if known and known.get("r") != d["role"].value:
            known = None
        pw = None
        if known:
            pw_hash, must = known["h"], bool(known.get("m", True))
        elif fast:
            pw, pw_hash, must = "(shown after saving)", PREVIEW_HASH, True
        else:
            pw = temp_password()
            pw_hash, must = hash_temp(pw), True
        perms = None
        if d["role"] in (Role.vice_principal, Role.coordinator):
            if known and isinstance(known.get("p"), dict):
                perms = clean_permissions(known["p"], d["role"])
            elif locked_down_staff:
                perms = {a: "none" for a in AREAS}
            else:
                perms = clean_permissions(None, d["role"])
        consent = None
        if known and known.get("c"):
            try:
                consent = _dt.fromisoformat(known["c"])
            except (TypeError, ValueError):
                consent = None
        u = User(school_id=ctx.school.id, login_id=d["login_id"], name=d["name"], role=d["role"], password_hash=pw_hash,
                 must_change_password=must, phone=d.get("phone", ""), email=d.get("email", ""), address=d.get("address", ""),
                 dob=d.get("dob"), blood_group=d.get("blood_group", ""), class_id=cls.id if cls else None,
                 roll_no=d.get("roll_no") if d["role"] == Role.student else None, active=d.get("active", True),
                 archived_at=None if d.get("active", True) else utcnow(), permissions=perms, consent_at=consent)
        db.add(u)
        ctx.users[u.login_id.lower()] = u
        if pw:
            creds.append({"name": u.name, "role": u.role.value, "login_id": u.login_id, "password": pw,
                          "class": cls.name if cls else ""})
    for u, d in plan.updates:
        for k in ("name", "phone", "email", "address", "dob", "blood_group"):
            if k in d:
                setattr(u, k, d[k])
        if u.role == Role.student:
            cls = classes.get(d.get("class", "").strip().lower())
            if cls:
                u.class_id = cls.id
            u.roll_no = d.get("roll_no")
        if "active" in d and d["active"] != u.active:
            u.active = d["active"]
            u.archived_at = None if u.active else utcnow()
    db.flush()
    have = {(p, s) for p, s in db.execute(select(ParentLink.parent_id, ParentLink.student_id)
                                         .where(ParentLink.school_id == ctx.school.id)).all()}
    for pl, sl, rel in plan.links:
        p, s = ctx.users.get(pl.lower()), ctx.users.get(sl.lower())
        if p and s and (p.id, s.id) not in have:
            db.add(ParentLink(school_id=ctx.school.id, parent_id=p.id, student_id=s.id, relation=rel or "Parent"))
            have.add((p.id, s.id))
    db.flush()
    return creds


def summary(plan: PeoplePlan) -> dict:
    by_role: dict[str, dict[str, int]] = {}
    for d in plan.creates:
        by_role.setdefault(d["role"].value, {"add": 0, "update": 0})["add"] += 1
    for u, _ in plan.updates:
        by_role.setdefault(u.role.value, {"add": 0, "update": 0})["update"] += 1
    return {"by_role": by_role, "links": len(plan.links)}
