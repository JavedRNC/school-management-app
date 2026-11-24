"""F40 · Teachers editing student and parent details.

By default a class teacher may edit the students of their own class. The principal can switch that off, let class
teachers edit parents too, and give any teacher access to chosen classes (or all), with or without parent details.
Access is worked out on every request from the current class teachers, so a replaced class teacher loses it at once.
Teachers can change contact and profile details only — never login IDs, passwords, classes, removal or fees."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import audit, changes, require, snap
from ..db import get_db
from ..deps import class_students
from ..models import ParentLink, Role, SchoolClass, StudentEditAccess, User, utcnow

router = APIRouter(tags=["student access"])
principal_only = require(Role.principal)
teacher_only = require(Role.teacher)

BLOOD = {"", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"}
STUDENT_FIELDS = ("name", "phone", "email", "address", "dob", "blood_group", "roll_no")
PARENT_FIELDS = ("name", "phone", "email", "address")
LABELS = {"roll_no": "roll no.", "blood_group": "blood group", "dob": "date of birth"}


# ---------------------------------------------------------------- the rules
def policy(db: Session, school_id: int) -> StudentEditAccess:
    """The school's row, or an unsaved one holding the defaults."""
    return db.get(StudentEditAccess, school_id) or StudentEditAccess(school_id=school_id, class_teachers=True,
                                                                      class_teachers_parents=False, grants={})


def _active_classes(db: Session, school_id: int) -> dict[int, SchoolClass]:
    return {c.id: c for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == school_id, SchoolClass.is_active.is_(True)))}


def teacher_access(db: Session, teacher: User) -> dict:
    """{"classes": {class id: "class teacher" | "given by principal"}, "parents": bool} for one teacher, right now."""
    p = policy(db, teacher.school_id)
    classes = _active_classes(db, teacher.school_id)
    out: dict[int, str] = {}
    own = [c.id for c in classes.values() if c.class_teacher_id == teacher.id]
    if p.class_teachers:
        out.update({cid: "class teacher" for cid in own})
    g = (p.grants or {}).get(str(teacher.id))
    if g:
        extra = classes.keys() if g.get("classes") == "all" else [c for c in g.get("classes") or [] if c in classes]
        for cid in extra:
            out.setdefault(cid, "given by principal")
    parents = bool(out) and (bool(g and g.get("parents")) or (p.class_teachers_parents and p.class_teachers and bool(own)))
    return {"classes": out, "parents": parents}


def _student_in_reach(db: Session, teacher: User, sid: int, acc: dict) -> User:
    s = db.get(User, sid)
    if not s or s.school_id != teacher.school_id or s.role != Role.student or not s.active:
        raise HTTPException(404, "Student not found")
    if s.class_id not in acc["classes"]:
        raise HTTPException(403, "You can edit only the students of the classes the principal allowed")
    return s


# ---------------------------------------------------------------- principal: who may edit
class PolicyIn(BaseModel):
    class_teachers: bool
    class_teachers_parents: bool = False


class GrantIn(BaseModel):
    classes: str | list[int] = Field(description='"all" or a list of class ids')
    parents: bool = False


def _grant_text(g: dict | None, classes: dict[int, SchoolClass]) -> str:
    if not g:
        return "no extra access"
    cls = "all classes" if g.get("classes") == "all" else (", ".join(classes[c].name for c in g.get("classes") or [] if c in classes) or "no classes")
    return cls + (" + parent details" if g.get("parents") else "")


def access_out(db: Session, school_id: int) -> dict:
    p = policy(db, school_id)
    classes = _active_classes(db, school_id)
    teachers = {t.id: t for t in db.scalars(select(User).where(User.school_id == school_id, User.role == Role.teacher,
                                                               User.active.is_(True)).order_by(User.name))}
    grants = []
    for tid, g in (p.grants or {}).items():
        t = teachers.get(int(tid))
        if not t:
            continue
        grants.append({"teacher_id": t.id, "name": t.name, "login_id": t.login_id,
                       "classes": "all" if g.get("classes") == "all" else [c for c in g.get("classes") or [] if c in classes],
                       "parents": bool(g.get("parents"))})
    return {"class_teachers": p.class_teachers, "class_teachers_parents": p.class_teachers_parents,
            "grants": sorted(grants, key=lambda x: x["name"].lower())}


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
    before = {"class teachers edit students": row.class_teachers, "class teachers edit parents": row.class_teachers_parents}
    row.class_teachers, row.class_teachers_parents = body.class_teachers, body.class_teachers and body.class_teachers_parents
    row.updated_at = utcnow()
    after = {"class teachers edit students": row.class_teachers, "class teachers edit parents": row.class_teachers_parents}
    yn = {True: "yes", False: "no"}
    diff = changes({k: yn[bool(v)] for k, v in before.items()}, {k: yn[bool(v)] for k, v in after.items()})
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
        bad = [c for c in body.classes if c not in classes]
        if bad:
            raise HTTPException(400, "Some selected classes don't exist in this school")
        if not body.classes:
            raise HTTPException(400, "Pick at least one class, or remove the access")
    row = _saved(db, me.school_id)
    grants = dict(row.grants or {})
    old = grants.get(str(tid))
    new = {"classes": "all" if body.classes == "all" else sorted(set(body.classes)), "parents": body.parents}
    grants[str(tid)] = new
    row.grants, row.updated_at = grants, utcnow()        # a new dict, so the JSON column is saved
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


class ParentEdit(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)


def _person(u: User, fields) -> dict:
    return {"id": u.id, "login_id": u.login_id, **{f: getattr(u, f) for f in fields}}


def _parents_of(db: Session, sids: list[int]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    for link, p in db.execute(select(ParentLink, User).join(User, User.id == ParentLink.parent_id)
                              .where(ParentLink.student_id.in_(sids or [0]), User.active.is_(True))):
        out.setdefault(link.student_id, []).append({**_person(p, PARENT_FIELDS), "relation": link.relation})
    return out


@router.get("/my-students")
def my_students(me: User = Depends(teacher_only), db: Session = Depends(get_db)):
    acc = teacher_access(db, me)
    classes = _active_classes(db, me.school_id)
    studs = [s for cid in sorted(acc["classes"], key=lambda c: classes[c].name) for s in class_students(db, cid)]
    parents = _parents_of(db, [s.id for s in studs]) if acc["parents"] else {}
    return {"can_edit_parents": acc["parents"],
            "classes": [{"id": cid, "name": classes[cid].name, "why": acc["classes"][cid]} for cid in sorted(acc["classes"], key=lambda c: classes[c].name)],
            "students": [{**_person(s, STUDENT_FIELDS), "class_id": s.class_id, "class_name": classes[s.class_id].name,
                          "parents": parents.get(s.id, [])} for s in studs]}


def _apply(u: User, data: dict) -> None:
    for k, v in data.items():
        if isinstance(v, str):
            v = v.strip()
        setattr(u, k, v)


@router.put("/my-students/parents/{pid}")
def edit_parent(pid: int, body: ParentEdit, me: User = Depends(teacher_only), db: Session = Depends(get_db)):
    acc = teacher_access(db, me)
    if not acc["parents"]:
        raise HTTPException(403, "The principal hasn't allowed you to edit parent details")
    p = db.get(User, pid)
    if not p or p.school_id != me.school_id or p.role != Role.parent or not p.active:
        raise HTTPException(404, "Parent not found")
    kids = db.scalars(select(User).join(ParentLink, ParentLink.student_id == User.id).where(ParentLink.parent_id == pid, User.active.is_(True)))
    if not any(k.class_id in acc["classes"] for k in kids):
        raise HTTPException(403, "This parent's children are not in the classes you may edit")
    data = body.model_dump(exclude_unset=True)
    if data.get("name") is None:
        data.pop("name", None)
    elif not data["name"].strip():
        raise HTTPException(400, "Name can't be empty")
    for k in ("phone", "email", "address"):
        if k in data and data[k] is None:
            data[k] = ""
    before = snap(p, PARENT_FIELDS)
    _apply(p, data)
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
    _apply(s, data)
    diff = changes(before, s, LABELS)
    if diff:
        audit(db, me, "user.updated", f"student {s.name} ({s.login_id}) · by teacher: {diff}")
    db.commit()
    return {**_person(s, STUDENT_FIELDS), "class_id": s.class_id}
