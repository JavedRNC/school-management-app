"""F40 · Teachers adding and editing students and parents — only as far as the principal allows.

Two kinds of access, each with a level:
  students: "none" | "edit" (change details) | "add" (add new students, and edit)
  parents:  "none" | "edit" (change details) | "add" (add a parent or link an existing one, and edit)
• Class teachers, for the class they lead: by default students "edit", parents "none". The principal can change both.
• Any teacher, for chosen classes (or all): whatever the principal grants them.
Access is worked out on every request from the current class teachers, so a replaced class teacher loses it at once.
Teachers never change login IDs, passwords, a student's class, never remove anyone, and never touch fees.

Storage (no table change since v11): StudentEditAccess.class_teachers / class_teachers_parents keep the "edit" switches;
the extra levels live in grants["_class_teachers"] = {"students": …, "parents": …}; teacher grants are grants["<id>"]."""
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import audit, changes, hash_password, require, snap
from ..db import get_db
from ..deps import class_students, get_school, login_free
from ..models import ParentLink, Role, SchoolClass, StudentEditAccess, User, utcnow
from ..subscription import student_count

router = APIRouter(tags=["student access"])
principal_only = require(Role.principal)
teacher_only = require(Role.teacher)

LEVELS = ("none", "edit", "add")
RANK = {lvl: i for i, lvl in enumerate(LEVELS)}
CT_KEY = "_class_teachers"
BLOOD = {"", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"}
RELATIONS = {"Father", "Mother", "Guardian"}
LOGIN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/\-]{0,59}$")      # same rule as Add many
MOBILE = re.compile(r"^[6-9]\d{9}$")
STUDENT_FIELDS = ("name", "phone", "email", "address", "dob", "blood_group", "roll_no")
PARENT_FIELDS = ("name", "phone", "email", "address")
LABELS = {"roll_no": "roll no.", "blood_group": "blood group", "dob": "date of birth"}
WORDS = {"students": {"none": "no student access", "edit": "edit students", "add": "add and edit students"},
         "parents": {"none": "no parent access", "edit": "edit parents", "add": "add and edit parents"}}


# ---------------------------------------------------------------- the rules
def _row(db: Session, school_id: int) -> StudentEditAccess:
    """The school's row, or an unsaved one holding the defaults."""
    return db.get(StudentEditAccess, school_id) or StudentEditAccess(school_id=school_id, class_teachers=True,
                                                                      class_teachers_parents=False, grants={})


def _lvl(v, default: str = "none") -> str:
    if v is True:
        return "edit"                       # the first version stored parents as true / false
    if v in (False, None):
        return default if v is None else "none"
    return v if v in LEVELS else default


def class_teacher_levels(row: StudentEditAccess) -> dict:
    extra = (row.grants or {}).get(CT_KEY) or {}
    students = "none" if not row.class_teachers else ("add" if _lvl(extra.get("students")) == "add" else "edit")
    parents = _lvl(extra.get("parents"), "edit" if row.class_teachers_parents else "none")
    if students == "none":
        parents = "none"
    return {"students": students, "parents": parents}


def _grant(g: dict | None) -> dict | None:
    """A teacher grant in today's shape: {"classes": "all" | [ids], "students": edit|add, "parents": none|edit|add}."""
    if not g:
        return None
    students = _lvl(g.get("students"), "edit")
    return {"classes": g.get("classes"), "students": "add" if students == "add" else "edit", "parents": _lvl(g.get("parents"))}


def _active_classes(db: Session, school_id: int) -> dict[int, SchoolClass]:
    return {c.id: c for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == school_id, SchoolClass.is_active.is_(True)))}


def teacher_access(db: Session, teacher: User) -> dict[int, dict]:
    """{class id: {"why": ..., "students": level, "parents": level}} for one teacher, right now. No entry = no access."""
    row = _row(db, teacher.school_id)
    classes = _active_classes(db, teacher.school_id)
    out: dict[int, dict] = {}

    def give(cid: int, why: str, lv: dict) -> None:
        cur = out.get(cid)
        if not cur:
            out[cid] = {"why": why, **lv}
            return
        for k in ("students", "parents"):
            if RANK[lv[k]] > RANK[cur[k]]:
                cur[k] = lv[k]
    ct = class_teacher_levels(row)
    if ct["students"] != "none":
        for c in classes.values():
            if c.class_teacher_id == teacher.id:
                give(c.id, "class teacher", ct)
    g = _grant((row.grants or {}).get(str(teacher.id)))
    if g:
        ids = classes.keys() if g["classes"] == "all" else [c for c in g["classes"] or [] if c in classes]
        for cid in ids:
            give(cid, "given by principal", {"students": g["students"], "parents": g["parents"]})
    return out


def _student_in_reach(db: Session, teacher: User, sid: int, acc: dict) -> User:
    s = db.get(User, sid)
    if not s or s.school_id != teacher.school_id or s.role != Role.student or not s.active:
        raise HTTPException(404, "Student not found")
    if s.class_id not in acc:
        raise HTTPException(403, "You can work only with the students of the classes the principal allowed")
    return s


# ---------------------------------------------------------------- principal: who may do what
class PolicyIn(BaseModel):
    students: str | None = Field(default=None, pattern="^(none|edit|add)$")
    parents: str | None = Field(default=None, pattern="^(none|edit|add)$")
    class_teachers: bool | None = None                # the first version's switches, still accepted
    class_teachers_parents: bool | None = None


class GrantIn(BaseModel):
    classes: str | list[int] = Field(description='"all" or a list of class ids')
    students: str = Field(default="edit", pattern="^(edit|add)$")
    parents: str | bool = "none"

    @field_validator("parents")
    @classmethod
    def _parents(cls, v):
        if isinstance(v, bool):
            return "edit" if v else "none"
        if v not in LEVELS:
            raise ValueError("parents must be none, edit or add")
        return v


def _grant_text(g: dict | None, classes: dict[int, SchoolClass]) -> str:
    g = _grant(g)
    if not g:
        return "no extra access"
    cls = "all classes" if g["classes"] == "all" else (", ".join(classes[c].name for c in g["classes"] or [] if c in classes) or "no classes")
    return f"{cls} · {WORDS['students'][g['students']]} · {WORDS['parents'][g['parents']]}"


def access_out(db: Session, school_id: int) -> dict:
    row = _row(db, school_id)
    classes = _active_classes(db, school_id)
    teachers = {t.id: t for t in db.scalars(select(User).where(User.school_id == school_id, User.role == Role.teacher,
                                                               User.active.is_(True)).order_by(User.name))}
    grants = []
    for tid, raw in (row.grants or {}).items():
        if not tid.isdigit() or int(tid) not in teachers:
            continue
        t, g = teachers[int(tid)], _grant(raw)
        grants.append({"teacher_id": t.id, "name": t.name, "login_id": t.login_id,
                       "classes": "all" if g["classes"] == "all" else [c for c in g["classes"] or [] if c in classes],
                       "students": g["students"], "parents": g["parents"]})
    return {"class_teachers": class_teacher_levels(row), "grants": sorted(grants, key=lambda x: x["name"].lower())}


def _saved(db: Session, school_id: int) -> StudentEditAccess:
    row = db.get(StudentEditAccess, school_id)
    if not row:
        row = StudentEditAccess(school_id=school_id, class_teachers=True, class_teachers_parents=False, grants={})
        db.add(row)
    return row


@router.get("/student-access")
def get_access(me: User = Depends(principal_only), db: Session = Depends(get_db)):
    return access_out(db, me.school_id)


@router.put("/student-access/policy")
def set_policy(body: PolicyIn, me: User = Depends(principal_only), db: Session = Depends(get_db)):
    row = _saved(db, me.school_id)
    before = class_teacher_levels(row)
    students = body.students or ({True: "edit", False: "none"}[body.class_teachers] if body.class_teachers is not None else before["students"])
    parents = body.parents or ({True: "edit", False: "none"}[body.class_teachers_parents] if body.class_teachers_parents is not None else before["parents"])
    if students == "none":
        parents = "none"                                   # parents are reached through the class's students
    row.class_teachers = students != "none"
    row.class_teachers_parents = parents != "none"
    grants = dict(row.grants or {})
    grants[CT_KEY] = {"students": students, "parents": parents}
    row.grants, row.updated_at = grants, utcnow()          # a new dict, so the JSON column is saved
    after = class_teacher_levels(row)
    diff = changes({f"class teachers: {k}": WORDS[k][v] for k, v in before.items()}, {f"class teachers: {k}": WORDS[k][v] for k, v in after.items()})
    if diff:
        audit(db, me, "student_access.policy", diff)
    db.commit()
    return access_out(db, me.school_id)


@router.put("/student-access/teachers/{tid}")
def set_grant(tid: int, body: GrantIn, me: User = Depends(principal_only), db: Session = Depends(get_db)):
    t = db.get(User, tid)
    if not t or t.school_id != me.school_id or t.role != Role.teacher or not t.active:
        raise HTTPException(404, "Teacher not found")
    classes = _active_classes(db, me.school_id)
    if body.classes != "all":
        if not isinstance(body.classes, list):
            raise HTTPException(400, 'Pick classes, or "all"')
        if [c for c in body.classes if c not in classes]:
            raise HTTPException(400, "Some selected classes don't exist in this school")
        if not body.classes:
            raise HTTPException(400, "Pick at least one class, or remove the access")
    row = _saved(db, me.school_id)
    grants = dict(row.grants or {})
    old = grants.get(str(tid))
    new = {"classes": "all" if body.classes == "all" else sorted(set(body.classes)), "students": body.students, "parents": body.parents}
    grants[str(tid)] = new
    row.grants, row.updated_at = grants, utcnow()
    audit(db, me, "student_access.granted", f"{t.name} ({t.login_id}): {_grant_text(old, classes)} → {_grant_text(new, classes)}")
    db.commit()
    return access_out(db, me.school_id)


@router.delete("/student-access/teachers/{tid}")
def remove_grant(tid: int, me: User = Depends(principal_only), db: Session = Depends(get_db)):
    row = db.get(StudentEditAccess, me.school_id)
    grants = dict(row.grants or {}) if row else {}
    if str(tid) not in grants:
        raise HTTPException(404, "This teacher has no extra access")
    old = grants.pop(str(tid))
    row.grants, row.updated_at = grants, utcnow()
    t = db.get(User, tid)
    audit(db, me, "student_access.removed", f"{t.name if t else tid} ({t.login_id if t else ''}): {_grant_text(old, _active_classes(db, me.school_id))} → no extra access")
    db.commit()
    return access_out(db, me.school_id)


# ---------------------------------------------------------------- teacher: my students
class StudentEdit(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    dob: date | None = None
    blood_group: str | None = None
    roll_no: int | None = Field(default=None, ge=1, le=9999)


class StudentNew(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    login_id: str = Field(min_length=1, max_length=60)
    class_id: int
    roll_no: int | None = Field(default=None, ge=1, le=9999)
    phone: str = Field(default="", max_length=20)
    email: str = Field(default="", max_length=200)
    address: str = Field(default="", max_length=500)
    dob: date | None = None
    blood_group: str = ""


class ParentEdit(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)


class ParentNew(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mobile: str = Field(min_length=10, max_length=10)
    relation: str = "Father"
    email: str = Field(default="", max_length=200)


def _person(u: User, fields) -> dict:
    return {"id": u.id, "login_id": u.login_id, **{f: getattr(u, f) for f in fields}}


def _parents_of(db: Session, sids: list[int]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    for link, p in db.execute(select(ParentLink, User).join(User, User.id == ParentLink.parent_id)
                              .where(ParentLink.student_id.in_(sids or [0]), User.active.is_(True))):
        out.setdefault(link.student_id, []).append({**_person(p, PARENT_FIELDS), "relation": link.relation})
    return out


def _temp_password(login_id: str) -> str:
    from ..people import temp_password
    while True:
        pw = temp_password()
        if pw.lower() != login_id.lower() and any(ch.isdigit() for ch in pw) and any(ch.isalpha() for ch in pw):
            return pw


def _creds(db: Session, me: User, u: User, pw: str) -> dict:
    return {"name": u.name, "role": u.role.value, "login_id": u.login_id, "password": pw, "school_code": get_school(db, me).code}


@router.get("/my-students")
def my_students(me: User = Depends(teacher_only), db: Session = Depends(get_db)):
    acc = teacher_access(db, me)
    classes = _active_classes(db, me.school_id)
    order = sorted(acc, key=lambda c: classes[c].name)
    studs = [s for cid in order for s in class_students(db, cid)]
    with_parents = [s.id for s in studs if acc[s.class_id]["parents"] != "none"]
    parents = _parents_of(db, with_parents)
    return {"can_add_students": any(a["students"] == "add" for a in acc.values()),
            "can_edit_parents": any(a["parents"] != "none" for a in acc.values()),
            "can_add_parents": any(a["parents"] == "add" for a in acc.values()),
            "classes": [{"id": cid, "name": classes[cid].name, "why": acc[cid]["why"], "students": acc[cid]["students"],
                         "parents": acc[cid]["parents"]} for cid in order],
            "students": [{**_person(s, STUDENT_FIELDS), "class_id": s.class_id, "class_name": classes[s.class_id].name,
                          "parents": parents.get(s.id, [])} for s in studs]}


def _clean(data: dict) -> dict:
    for k, v in list(data.items()):
        if isinstance(v, str):
            data[k] = v.strip()
    return data


@router.post("/my-students")
def add_student(body: StudentNew, me: User = Depends(teacher_only), db: Session = Depends(get_db)):
    acc = teacher_access(db, me)
    level = acc.get(body.class_id, {}).get("students", "none")
    if level != "add":
        raise HTTPException(403, "The principal hasn't allowed you to add students to this class")
    data = _clean(body.model_dump())
    if not data["name"]:
        raise HTTPException(400, "Name can't be empty")
    if not LOGIN.match(data["login_id"]):
        raise HTTPException(400, "Admission no. can use letters, numbers and . _ / - only")
    if data["blood_group"] not in BLOOD:
        raise HTTPException(400, "Pick a valid blood group")
    login_free(db, me.school_id, data["login_id"])
    school = get_school(db, me)
    if school.max_students and student_count(db, me.school_id) >= school.max_students:
        raise HTTPException(409, f"Your school's plan allows up to {school.max_students} students. Ask the principal.")
    pw = _temp_password(data["login_id"])
    u = User(school_id=me.school_id, role=Role.student, password_hash=hash_password(pw), must_change_password=True, **data)
    db.add(u)
    db.flush()
    audit(db, me, "user.created", f"student {u.name} ({u.login_id}) in {_active_classes(db, me.school_id)[u.class_id].name} · by teacher")
    db.commit()
    return {"student": {**_person(u, STUDENT_FIELDS), "class_id": u.class_id}, "credentials": _creds(db, me, u, pw)}


@router.post("/my-students/{sid}/parents")
def add_parent(sid: int, body: ParentNew, me: User = Depends(teacher_only), db: Session = Depends(get_db)):
    """Add a parent for a student, or link the parent account this mobile number already has in the school."""
    acc = teacher_access(db, me)
    s = _student_in_reach(db, me, sid, acc)
    if acc[s.class_id]["parents"] != "add":
        raise HTTPException(403, "The principal hasn't allowed you to add parents for this class")
    name, mobile, email = body.name.strip(), body.mobile.strip(), body.email.strip()
    if not name:
        raise HTTPException(400, "Name can't be empty")
    if not MOBILE.match(mobile):
        raise HTTPException(400, "Enter the parent's 10-digit mobile number")
    if body.relation not in RELATIONS:
        raise HTTPException(400, "Relation must be Father, Mother or Guardian")
    existing = db.scalar(select(User).where(User.school_id == me.school_id, User.login_id == mobile))
    pw = None
    if existing:
        if existing.role != Role.parent or not existing.active:
            raise HTTPException(409, "This mobile number already belongs to another account in the school. Ask the principal.")
        if db.scalar(select(ParentLink.id).where(ParentLink.parent_id == existing.id, ParentLink.student_id == s.id)):
            raise HTTPException(409, f"{existing.name} is already linked to {s.name}")
        parent = existing
    else:
        login_free(db, me.school_id, mobile)
        pw = _temp_password(mobile)
        parent = User(school_id=me.school_id, role=Role.parent, login_id=mobile, name=name, phone=mobile, email=email,
                      password_hash=hash_password(pw), must_change_password=True)
        db.add(parent)
        db.flush()
    db.add(ParentLink(school_id=me.school_id, parent_id=parent.id, student_id=s.id, relation=body.relation))
    if pw:
        audit(db, me, "user.created", f"parent {parent.name} ({parent.login_id}) for {s.name} ({s.login_id}) · by teacher")
    else:
        audit(db, me, "user.updated", f"parent {parent.name} ({parent.login_id}) linked to {s.name} ({s.login_id}) as {body.relation} · by teacher")
    db.commit()
    return {"parent": {**_person(parent, PARENT_FIELDS), "relation": body.relation}, "linked_existing": pw is None,
            "credentials": _creds(db, me, parent, pw) if pw else None}


@router.put("/my-students/parents/{pid}")
def edit_parent(pid: int, body: ParentEdit, me: User = Depends(teacher_only), db: Session = Depends(get_db)):
    acc = teacher_access(db, me)
    p = db.get(User, pid)
    if not p or p.school_id != me.school_id or p.role != Role.parent or not p.active:
        raise HTTPException(404, "Parent not found")
    kids = list(db.scalars(select(User).join(ParentLink, ParentLink.student_id == User.id).where(ParentLink.parent_id == pid, User.active.is_(True))))
    if not any(k.class_id in acc and acc[k.class_id]["parents"] != "none" for k in kids):
        raise HTTPException(403, "The principal hasn't allowed you to edit this parent's details")
    data = body.model_dump(exclude_unset=True)
    if data.get("name") is None:
        data.pop("name", None)
    elif not data["name"].strip():
        raise HTTPException(400, "Name can't be empty")
    for k in ("phone", "email", "address"):
        if k in data and data[k] is None:
            data[k] = ""
    before = snap(p, PARENT_FIELDS)
    for k, v in _clean(data).items():
        setattr(p, k, v)
    diff = changes(before, p, LABELS)
    if diff:
        audit(db, me, "user.updated", f"parent {p.name} ({p.login_id}) · by teacher: {diff}")
    db.commit()
    return _person(p, PARENT_FIELDS)


@router.put("/my-students/{sid}")
def edit_student(sid: int, body: StudentEdit, me: User = Depends(teacher_only), db: Session = Depends(get_db)):
    acc = teacher_access(db, me)
    s = _student_in_reach(db, me, sid, acc)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(400, "Name can't be empty")
    if data.get("name") is None:
        data.pop("name", None)
    if "blood_group" in data and (data["blood_group"] or "") not in BLOOD:
        raise HTTPException(400, "Pick a valid blood group")
    for k in ("phone", "email", "address", "blood_group"):
        if k in data and data[k] is None:
            data[k] = ""
    before = snap(s, STUDENT_FIELDS)
    for k, v in _clean(data).items():
        setattr(s, k, v)
    diff = changes(before, s, LABELS)
    if diff:
        audit(db, me, "user.updated", f"student {s.name} ({s.login_id}) · by teacher: {diff}")
    db.commit()
    return {**_person(s, STUDENT_FIELDS), "class_id": s.class_id}
