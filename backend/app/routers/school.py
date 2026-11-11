"""School setup: classes, subjects, people, assignments, timetable, exams. All tenant-scoped."""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..bell import period_count, schedules
from ..auth import audit, check_password_rules, hash_password, require_area, school_user
from ..db import get_db
from ..deps import active_ids, class_students, get_school, name_maps, owned, resolve_student, visible_class_ids
from ..models import (Assignment, Exam, Mark, ParentLink, Post, Role, SchoolClass, Subject, TimetableEntry, User,
                      utcnow)
from ..perms import clean_permissions
from ..schemas import (AssignmentIn, AssignmentOut, ClassIn, ClassOut, ExamIn, ExamOut, NameIn, SubjectOut,
                       TimetableIn, TimetableOut, Usage, UserCreate, UserOut, UserUpdate)
from ..subscription import school_modules, student_count
from ..views import user_out, users_out

router = APIRouter(tags=["school"])


def _commit(db: Session, msg: str = "Already exists"):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, msg)


def archive_row(obj, user: User):
    obj.is_active = False
    obj.archived_at = utcnow()
    obj.archived_by = user.id


def _count(db: Session, model, *where) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*where)) or 0


# ---------------------------------------------------------------- classes
@router.get("/classes", response_model=list[ClassOut])
def list_classes(user: User = Depends(school_user), db: Session = Depends(get_db)):
    q = select(SchoolClass).where(SchoolClass.school_id == user.school_id, SchoolClass.is_active.is_(True)).order_by(SchoolClass.name)
    vis = visible_class_ids(db, user)
    if vis is not None:
        q = q.where(SchoolClass.id.in_(vis or {0}))
    counts = dict(db.execute(select(User.class_id, func.count()).where(
        User.school_id == user.school_id, User.role == Role.student, User.active.is_(True)).group_by(User.class_id)).all())
    return [ClassOut(id=c.id, name=c.name, class_teacher_id=c.class_teacher_id, student_count=counts.get(c.id, 0))
            for c in db.scalars(q)]


def _check_teacher(db: Session, user: User, teacher_id: int | None) -> None:
    if teacher_id is None:
        return
    t = db.get(User, teacher_id)
    if not t or t.school_id != user.school_id or t.role != Role.teacher or not t.active:
        raise HTTPException(400, "Pick an active teacher of this school")


@router.post("/classes", response_model=ClassOut)
def create_class(body: ClassIn, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    _check_teacher(db, user, body.class_teacher_id)
    c = SchoolClass(school_id=user.school_id, name=body.name.strip(), class_teacher_id=body.class_teacher_id)
    db.add(c)
    _commit(db, "A class with this name already exists (check the Archive too)")
    return ClassOut(id=c.id, name=c.name, class_teacher_id=c.class_teacher_id)


@router.put("/classes/{class_id}", response_model=ClassOut)
def update_class(class_id: int, body: ClassIn, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    c = owned(db, SchoolClass, class_id, user, "Class")
    _check_teacher(db, user, body.class_teacher_id)
    c.name, c.class_teacher_id = body.name.strip(), body.class_teacher_id
    _commit(db, "A class with this name already exists")
    return ClassOut(id=c.id, name=c.name, class_teacher_id=c.class_teacher_id, student_count=len(class_students(db, c.id)))


@router.delete("/classes/{class_id}")
def archive_class(class_id: int, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    """Archive (soft delete). Blocked while students are enrolled."""
    c = owned(db, SchoolClass, class_id, user, "Class")
    n = len(class_students(db, class_id))
    if n:
        raise HTTPException(409, f"Class {c.name} still has {n} student{'s' if n != 1 else ''}. "
                                 "Move them to another class or remove them first.")
    archive_row(c, user)
    audit(db, user, "class.archived", c.name)
    db.commit()
    return {"ok": True}


@router.get("/classes/{class_id}/students", response_model=list[UserOut])
def students_of_class(class_id: int, user: User = Depends(school_user), db: Session = Depends(get_db)):
    owned(db, SchoolClass, class_id, user, "Class")
    if user.role in (Role.student, Role.parent):
        raise HTTPException(403, "Not allowed")
    vis = visible_class_ids(db, user)
    if vis is not None and class_id not in vis:
        raise HTTPException(403, "You don't teach this class")
    return users_out(db, class_students(db, class_id))


# ---------------------------------------------------------------- subjects
@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(user: User = Depends(school_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(Subject).where(Subject.school_id == user.school_id, Subject.is_active.is_(True)).order_by(Subject.name)))


@router.post("/subjects", response_model=SubjectOut)
def create_subject(body: NameIn, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    s = Subject(school_id=user.school_id, name=body.name.strip())
    db.add(s)
    _commit(db, "Subject already exists (check the Archive too)")
    return s


@router.put("/subjects/{subject_id}", response_model=SubjectOut)
def rename_subject(subject_id: int, body: NameIn, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    s = owned(db, Subject, subject_id, user, "Subject")
    s.name = body.name.strip()
    _commit(db, "Subject already exists")
    return s


@router.get("/subjects/{subject_id}/usage", response_model=Usage)
def subject_usage(subject_id: int, user: User = Depends(require_area("classes", "view")), db: Session = Depends(get_db)):
    owned(db, Subject, subject_id, user, "Subject")
    return Usage(assignments=_count(db, Assignment, Assignment.subject_id == subject_id),
                 timetable=_count(db, TimetableEntry, TimetableEntry.subject_id == subject_id),
                 marks=_count(db, Mark, Mark.subject_id == subject_id),
                 posts=_count(db, Post, Post.subject_id == subject_id, Post.is_active.is_(True)))


@router.delete("/subjects/{subject_id}")
def archive_subject(subject_id: int, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    """Archive: hidden with its teacher assignments, periods and marks; restore brings everything back."""
    s = owned(db, Subject, subject_id, user, "Subject")
    archive_row(s, user)
    audit(db, user, "subject.archived", s.name)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- people
@router.get("/users", response_model=list[UserOut])
def list_users(role: Role | None = None, class_id: int | None = None, active: bool = True,
               user: User = Depends(require_area("people", "view")), db: Session = Depends(get_db)):
    q = select(User).where(User.school_id == user.school_id, User.active.is_(active)).order_by(User.role, User.class_id, User.roll_no, User.name)
    if role:
        q = q.where(User.role == role)
    if class_id:
        q = q.where(User.class_id == class_id)
    return users_out(db, list(db.scalars(q)))


def _validate_role(db: Session, me: User, role: Role) -> None:
    if role in (Role.admin, Role.principal):
        raise HTTPException(403, "Only the platform admin can create or change principals")
    if role in (Role.vice_principal, Role.coordinator):
        if me.role != Role.principal:
            raise HTTPException(403, "Only the principal can manage Vice Principals and Coordinators")
        if "extra_roles" not in school_modules(db, get_school(db, me)):
            raise HTTPException(403, "MODULE_NOT_ENABLED:extra_roles")


def _set_children(db: Session, me: User, parent: User, ids: list[int], relation: str = "Parent") -> None:
    valid = set(db.scalars(select(User.id).where(User.id.in_(ids or [0]), User.school_id == me.school_id,
                                                 User.role == Role.student)))
    if set(ids) - valid:
        raise HTTPException(400, "Some selected children are not students of this school")
    db.execute(delete(ParentLink).where(ParentLink.parent_id == parent.id))
    for sid in ids:
        db.add(ParentLink(school_id=me.school_id, parent_id=parent.id, student_id=sid, relation=relation))


def _check_class(db: Session, me: User, class_id: int | None) -> None:
    if not class_id:
        raise HTTPException(400, "Students need a class")
    owned(db, SchoolClass, class_id, me, "Class")


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, me: User = Depends(require_area("people", "edit")), db: Session = Depends(get_db)):
    _validate_role(db, me, body.role)
    check_password_rules(body.password, body.login_id)
    if body.role == Role.student:
        _check_class(db, me, body.class_id)
        school = get_school(db, me)
        if school.max_students and student_count(db, me.school_id) >= school.max_students:
            raise HTTPException(409, f"Your plan allows up to {school.max_students} students. Contact support to increase it.")
    u = User(school_id=me.school_id, login_id=body.login_id.strip(), name=body.name.strip(), role=body.role,
             password_hash=hash_password(body.password), must_change_password=True,
             phone=body.phone.strip(), email=body.email.strip(), address=body.address.strip(), dob=body.dob,
             blood_group=body.blood_group.strip(),
             class_id=body.class_id if body.role == Role.student else None,
             roll_no=body.roll_no if body.role == Role.student else None,
             permissions=clean_permissions(body.permissions, body.role) if body.role in (Role.vice_principal, Role.coordinator) else None,
             scope_class_ids=body.scope_class_ids if body.role == Role.coordinator else None)
    db.add(u)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Login ID “{body.login_id}” is already used in this school")
    if body.role == Role.parent and body.children_ids:
        _set_children(db, me, u, body.children_ids, body.relation)
    audit(db, me, "user.created", f"{u.role.value} {u.name} ({u.login_id})")
    _commit(db, "Login ID already used in this school")
    return user_out(db, u)


class BulkIn(BaseModel):
    role: Role
    rows: list[dict] = Field(min_length=1, max_length=300)
    dry_run: bool = True


@router.post("/users/bulk")
def bulk_create(body: BulkIn, response: Response, me: User = Depends(require_area("people", "edit")), db: Session = Depends(get_db)):
    """F29 · Add many people of one type. dry_run → only check. Nothing is saved if any row has a problem."""
    from ..people import Ctx, PeoplePlan, apply_plan, check_student_limit, plan_rows, summary

    if body.role not in (Role.student, Role.teacher, Role.parent, Role.vice_principal, Role.coordinator):
        raise HTTPException(400, "Pick students, teachers, parents, vice principals or coordinators")
    _validate_role(db, me, body.role)
    response.headers["Cache-Control"] = "no-store"
    school = get_school(db, me)
    ctx = Ctx(db, school)
    plan = PeoplePlan(school=school, me=me)
    # the role comes from the request only (a per-row "role" would bypass the module/role checks above)
    rows = [{k: v for k, v in r.items() if k != "role"} for r in body.rows if any(str(v or "").strip() for v in r.values())]
    if not rows:
        raise HTTPException(400, "All rows are empty")
    plan_rows(ctx, plan, body.role, rows)
    check_student_limit(ctx, plan)
    out = {"ok": not plan.issues, "errors": [i.out() for i in plan.issues], **summary(plan),
           "count": len(plan.creates)}
    if plan.issues or body.dry_run:
        db.rollback()
        return out
    creds = apply_plan(ctx, plan)
    audit(db, me, "users.bulk_created", f"{len(plan.creates)} accounts ({body.role.value}s + linked parents)")
    _commit(db, "Some login IDs are already used in this school")
    out["credentials"] = creds
    return out


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, me: User = Depends(require_area("people", "edit")), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or u.school_id != me.school_id:
        raise HTTPException(404, "User not found")
    if u.role == Role.principal and u.id != me.id:
        raise HTTPException(403, "The principal account can only be changed by the platform admin")
    if u.role in (Role.vice_principal, Role.coordinator):
        _validate_role(db, me, u.role)
    data = body.model_dump(exclude_unset=True)
    if data.get("active") is False and u.id == me.id:
        raise HTTPException(400, "You can't remove your own account")
    pw = data.pop("password", None)
    if pw:
        check_password_rules(pw, data.get("login_id") or u.login_id)
        u.password_hash = hash_password(pw)
        u.must_change_password = u.id != me.id   # temporary password unless setting own
        u.failed_logins, u.locked_until = 0, None
    kids = data.pop("children_ids", None)
    for k in ("name", "login_id", "phone", "email", "address", "blood_group"):
        if k in data and data[k] is not None:
            data[k] = data[k].strip()
    if u.role == Role.student:
        if "class_id" in data:
            _check_class(db, me, data["class_id"])
    else:
        data.pop("class_id", None)
        data.pop("roll_no", None)
    if u.role in (Role.vice_principal, Role.coordinator):
        if "permissions" in data:
            data["permissions"] = clean_permissions(data["permissions"], u.role)
    else:
        data.pop("permissions", None)
        data.pop("scope_class_ids", None)
    if "active" in data:
        u.archived_at = None if data["active"] else utcnow()
    for k, v in data.items():
        setattr(u, k, v)
    if kids is not None and u.role == Role.parent:
        _set_children(db, me, u, kids)
    changed = sorted(set(data) | ({"password"} if pw else set()) | ({"children"} if kids is not None else set()))
    audit(db, me, "user.updated", f"{u.name} ({u.login_id}): {', '.join(changed)}")
    _commit(db, "Login ID already used in this school")
    return user_out(db, u)


@router.delete("/users/{user_id}", response_model=UserOut)
def remove_user(user_id: int, me: User = Depends(require_area("people", "edit")), db: Session = Depends(get_db)):
    """Soft delete: can't sign in; history kept; restore any time."""
    u = db.get(User, user_id)
    if not u or u.school_id != me.school_id:
        raise HTTPException(404, "User not found")
    if u.id == me.id:
        raise HTTPException(400, "You can't remove your own account")
    if u.role == Role.principal:
        raise HTTPException(403, "The principal account can only be changed by the platform admin")
    if u.role in (Role.vice_principal, Role.coordinator):
        _validate_role(db, me, u.role)
    u.active = False
    u.archived_at = utcnow()
    audit(db, me, "user.removed", f"{u.name} ({u.login_id})")
    db.commit()
    return user_out(db, u)


# ---------------------------------------------------------------- assignments
def _assignments_q(db: Session, user: User):
    cls = active_ids(db, SchoolClass, user.school_id)
    subs = active_ids(db, Subject, user.school_id)
    return select(Assignment).where(Assignment.school_id == user.school_id, Assignment.class_id.in_(cls or {0}),
                                    Assignment.subject_id.in_(subs or {0}))


@router.get("/assignments", response_model=list[AssignmentOut])
def list_assignments(user: User = Depends(school_user), db: Session = Depends(get_db)):
    q = _assignments_q(db, user)
    if user.role == Role.teacher:
        q = q.where(Assignment.teacher_id == user.id)
    elif user.role in (Role.student, Role.parent):
        q = q.where(Assignment.class_id.in_(visible_class_ids(db, user) or {0}))
    elif user.role == Role.coordinator and user.scope_class_ids:
        q = q.where(Assignment.class_id.in_(user.scope_class_ids))
    users, classes, subjects = name_maps(db, user.school_id)
    return [AssignmentOut(id=a.id, teacher_id=a.teacher_id, class_id=a.class_id, subject_id=a.subject_id,
                          teacher_name=users.get(a.teacher_id, ""), class_name=classes.get(a.class_id, ""),
                          subject_name=subjects.get(a.subject_id, "")) for a in db.scalars(q)]


@router.post("/assignments", response_model=AssignmentOut)
def create_assignment(body: AssignmentIn, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    owned(db, SchoolClass, body.class_id, user, "Class")
    owned(db, Subject, body.subject_id, user, "Subject")
    t = db.get(User, body.teacher_id)
    if not t or t.school_id != user.school_id or t.role != Role.teacher or not t.active:
        raise HTTPException(400, "Not an active teacher")
    a = db.scalar(select(Assignment).where(Assignment.class_id == body.class_id, Assignment.subject_id == body.subject_id))
    if a:
        a.teacher_id = body.teacher_id
    else:
        a = Assignment(school_id=user.school_id, **body.model_dump())
        db.add(a)
    _commit(db)
    return AssignmentOut.model_validate(a)


@router.delete("/assignments/{aid}")
def delete_assignment(aid: int, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    a = owned(db, Assignment, aid, user, "Assignment")
    db.delete(a)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- timetable
@router.get("/timetable", response_model=list[TimetableOut])
def get_timetable(class_id: int | None = None, student_id: int | None = None, user: User = Depends(school_user),
                  db: Session = Depends(get_db)):
    cls_ok = active_ids(db, SchoolClass, user.school_id)
    sub_ok = active_ids(db, Subject, user.school_id)
    q = select(TimetableEntry).where(TimetableEntry.school_id == user.school_id, TimetableEntry.class_id.in_(cls_ok or {0}),
                                     TimetableEntry.subject_id.in_(sub_ok or {0})).order_by(TimetableEntry.day, TimetableEntry.period)
    if user.role in (Role.student, Role.parent):
        q = q.where(TimetableEntry.class_id == resolve_student(db, user, student_id).class_id)
    elif class_id:
        q = q.where(TimetableEntry.class_id == class_id)
    elif user.role == Role.teacher:
        q = q.where(TimetableEntry.teacher_id == user.id)
    users, classes, subjects = name_maps(db, user.school_id)
    return [TimetableOut(id=e.id, class_id=e.class_id, day=e.day, period=e.period, subject_id=e.subject_id,
                         teacher_id=e.teacher_id, class_name=classes.get(e.class_id, ""),
                         subject_name=subjects.get(e.subject_id, ""), teacher_name=users.get(e.teacher_id, ""))
            for e in db.scalars(q)]


@router.put("/timetable", response_model=TimetableOut)
def set_timetable_slot(body: TimetableIn, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    owned(db, SchoolClass, body.class_id, user, "Class")
    owned(db, Subject, body.subject_id, user, "Subject")
    _check_teacher(db, user, body.teacher_id)
    if not 0 <= body.day <= 6 or body.period < 1:
        raise HTTPException(400, "Pick a valid day and period")
    n = period_count(schedules(db, user.school_id), body.day)
    if n is not None and body.period > n:
        raise HTTPException(400, f"This day has only {n} periods — change Period timings to add more")
    clash = db.scalar(select(TimetableEntry).where(
        TimetableEntry.school_id == user.school_id, TimetableEntry.teacher_id == body.teacher_id,
        TimetableEntry.day == body.day, TimetableEntry.period == body.period, TimetableEntry.class_id != body.class_id))
    if clash:
        raise HTTPException(409, "Teacher already has a class in this period")
    e = db.scalar(select(TimetableEntry).where(TimetableEntry.class_id == body.class_id,
                                               TimetableEntry.day == body.day, TimetableEntry.period == body.period))
    if e:
        e.subject_id, e.teacher_id = body.subject_id, body.teacher_id
    else:
        e = TimetableEntry(school_id=user.school_id, **body.model_dump())
        db.add(e)
    _commit(db)
    return TimetableOut.model_validate(e)


@router.delete("/timetable/{eid}")
def delete_slot(eid: int, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    e = owned(db, TimetableEntry, eid, user, "Slot")
    db.delete(e)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- exams
@router.get("/exams", response_model=list[ExamOut])
def list_exams(user: User = Depends(school_user), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Mark.exam_id, func.count()).where(Mark.school_id == user.school_id).group_by(Mark.exam_id)).all())
    return [ExamOut(id=e.id, name=e.name, date=e.date, max_marks=e.max_marks, mark_count=counts.get(e.id, 0))
            for e in db.scalars(select(Exam).where(Exam.school_id == user.school_id, Exam.is_active.is_(True)).order_by(Exam.date.desc()))]


@router.post("/exams", response_model=ExamOut)
def create_exam(body: ExamIn, user: User = Depends(require_area("exams", "edit")), db: Session = Depends(get_db)):
    e = Exam(school_id=user.school_id, name=body.name.strip(), date=body.date, max_marks=body.max_marks)
    db.add(e)
    db.commit()
    return e


@router.put("/exams/{exam_id}", response_model=ExamOut)
def update_exam(exam_id: int, body: ExamIn, user: User = Depends(require_area("exams", "edit")), db: Session = Depends(get_db)):
    e = owned(db, Exam, exam_id, user, "Exam")
    top = db.scalar(select(func.max(Mark.score)).where(Mark.exam_id == exam_id))
    if top is not None and body.max_marks < top:
        raise HTTPException(409, f"Max marks can't be below the highest score already entered ({top:g})")
    e.name, e.date, e.max_marks = body.name.strip(), body.date, body.max_marks
    db.commit()
    return e


@router.delete("/exams/{exam_id}")
def archive_exam(exam_id: int, user: User = Depends(require_area("exams", "edit")), db: Session = Depends(get_db)):
    """Archive: the exam and its marks are hidden from report cards; restore brings them back."""
    e = owned(db, Exam, exam_id, user, "Exam")
    archive_row(e, user)
    audit(db, user, "exam.archived", e.name)
    db.commit()
    return {"ok": True}
