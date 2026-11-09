"""Attendance, marks, posts, student/parent views."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import audit, require, school_user, staff
from ..db import get_db
from ..deps import (active_ids, children, class_students, ensure_class_access, ensure_subject_access, get_school,
                    name_maps, owned, resolve_student, visible_class_ids)
from ..models import Attendance, Exam, Mark, Post, Role, Subject, User, utcnow
from ..perms import RANK, level_of
from ..schemas import (AttendanceIn, AttendanceRow, AttendanceSheet, MarkRow, MarksIn, PostIn, PostOut,
                       StudentAttendance, UserOut)
from ..util import day_status, today
from ..views import users_out

router = APIRouter(tags=["academics"])

MANAGERS = (Role.principal, Role.vice_principal, Role.coordinator)


# ---------------------------------------------------------------- attendance
def _edit_lock(user: User, day: date) -> str:
    """Teachers can mark/edit only today's attendance; managers can edit any past day (F5)."""
    if day > today():
        return "Can't mark attendance for a future date"
    if user.role == Role.teacher and day != today():
        return "Attendance is locked after the day ends. Ask the principal to correct it."
    return ""


@router.get("/attendance", response_model=AttendanceSheet)
def class_attendance(class_id: int, day: date, user: User = Depends(staff), db: Session = Depends(get_db)):
    ensure_class_access(db, user, class_id, "attendance", "view")
    school = get_school(db, user)
    ok, reason = day_status(db, school, day)
    rows = list(db.scalars(select(Attendance).where(Attendance.class_id == class_id, Attendance.date == day)))
    marked = {a.student_id: a.present for a in rows}
    lock = _edit_lock(user, day)
    can_edit = not lock
    if user.role in MANAGERS and RANK[level_of(user, "attendance")] < RANK["edit"]:
        can_edit, lock = False, "View only"
    marker = None
    if rows:
        users, _, _ = name_maps(db, user.school_id)
        last = max(rows, key=lambda a: a.marked_at or utcnow())
        marker = users.get(last.marked_by)
    return AttendanceSheet(date=day, is_school_day=ok, reason=reason, can_edit=can_edit, lock_reason=lock, marked_by=marker,
                           rows=[AttendanceRow(student_id=s.id, name=s.name, roll_no=s.roll_no, present=marked.get(s.id))
                                 for s in class_students(db, class_id)])


@router.post("/attendance")
def mark_attendance(body: AttendanceIn, user: User = Depends(staff), db: Session = Depends(get_db)):
    ensure_class_access(db, user, body.class_id, "attendance", "edit")
    lock = _edit_lock(user, body.date)
    if lock:
        raise HTTPException(400, lock)
    ok, reason = day_status(db, get_school(db, user), body.date)
    if not ok and not (body.override and user.role in MANAGERS):
        raise HTTPException(400, f"Not a school day ({reason}). Attendance isn't needed.")
    valid = {s.id for s in class_students(db, body.class_id)}
    existing = {a.student_id: a for a in db.scalars(
        select(Attendance).where(Attendance.class_id == body.class_id, Attendance.date == body.date))}
    for r in body.records:
        if r.student_id not in valid:
            raise HTTPException(400, f"Student {r.student_id} is not in this class")
        if r.student_id in existing:
            a = existing[r.student_id]
            a.present, a.marked_by, a.marked_at = r.present, user.id, utcnow()
        else:
            db.add(Attendance(school_id=user.school_id, student_id=r.student_id, class_id=body.class_id, date=body.date,
                              present=r.present, marked_by=user.id))
    if body.date != today() or not ok:
        audit(db, user, "attendance.edited", f"class {body.class_id} on {body.date}")
    db.commit()
    return {"ok": True, "saved": len(body.records)}


def _student_attendance(db: Session, student: User) -> StudentAttendance:
    rows = list(db.scalars(select(Attendance).where(Attendance.student_id == student.id).order_by(Attendance.date.desc())))
    present = sum(1 for r in rows if r.present)
    return StudentAttendance(total_days=len(rows), present_days=present,
                             percent=round(100 * present / len(rows), 1) if rows else 0.0,
                             recent=[{"date": r.date.isoformat(), "present": r.present} for r in rows[:30]])


@router.get("/me/attendance", response_model=StudentAttendance)
def my_attendance(student_id: int | None = None, user: User = Depends(require(Role.student, Role.parent)), db: Session = Depends(get_db)):
    return _student_attendance(db, resolve_student(db, user, student_id))


@router.get("/me/children", response_model=list[UserOut])
def my_children(user: User = Depends(require(Role.parent)), db: Session = Depends(get_db)):
    return users_out(db, children(db, user))


# ---------------------------------------------------------------- marks
@router.get("/marks", response_model=list[MarkRow])
def class_marks(exam_id: int, class_id: int, subject_id: int, user: User = Depends(staff), db: Session = Depends(get_db)):
    ensure_class_access(db, user, class_id, "exams", "view")
    owned(db, Exam, exam_id, user, "Exam")
    scores = {m.student_id: m.score for m in db.scalars(select(Mark).where(Mark.exam_id == exam_id, Mark.subject_id == subject_id))}
    return [MarkRow(student_id=s.id, name=s.name, roll_no=s.roll_no, score=scores.get(s.id)) for s in class_students(db, class_id)]


@router.post("/marks")
def save_marks(body: MarksIn, user: User = Depends(staff), db: Session = Depends(get_db)):
    ensure_class_access(db, user, body.class_id, "exams", "edit")
    ensure_subject_access(db, user, body.class_id, body.subject_id)
    exam = owned(db, Exam, body.exam_id, user, "Exam")
    owned(db, Subject, body.subject_id, user, "Subject")
    valid = {s.id for s in class_students(db, body.class_id)}
    existing = {m.student_id: m for m in db.scalars(select(Mark).where(
        Mark.exam_id == body.exam_id, Mark.subject_id == body.subject_id, Mark.student_id.in_(valid or {0})))}
    for r in body.records:
        if r.student_id not in valid:
            raise HTTPException(400, f"Student {r.student_id} is not in this class")
        if r.score > exam.max_marks:
            raise HTTPException(400, f"Score {r.score:g} is above max marks {exam.max_marks:g}")
        if r.student_id in existing:
            existing[r.student_id].score = r.score
            existing[r.student_id].entered_by = user.id
        else:
            db.add(Mark(school_id=user.school_id, exam_id=body.exam_id, student_id=r.student_id, subject_id=body.subject_id,
                        score=r.score, entered_by=user.id))
    db.commit()
    return {"ok": True, "saved": len(body.records)}


@router.get("/me/marks")
def my_marks(student_id: int | None = None, user: User = Depends(require(Role.student, Role.parent)), db: Session = Depends(get_db)):
    """Report card: per exam, per subject score + totals (archived exams/subjects hidden)."""
    student = resolve_student(db, user, student_id)
    _, _, subjects = name_maps(db, user.school_id)
    exams = {e.id: e for e in db.scalars(select(Exam).where(Exam.school_id == user.school_id, Exam.is_active.is_(True)))}
    live_subjects = active_ids(db, Subject, user.school_id)
    out: dict[int, dict] = {}
    for m in db.scalars(select(Mark).where(Mark.student_id == student.id)):
        e = exams.get(m.exam_id)
        if not e or m.subject_id not in live_subjects:
            continue
        card = out.setdefault(e.id, {"exam_id": e.id, "exam": e.name, "date": e.date.isoformat(), "max_marks": e.max_marks, "subjects": []})
        card["subjects"].append({"subject": subjects.get(m.subject_id, ""), "score": m.score})
    cards = sorted(out.values(), key=lambda c: c["date"], reverse=True)
    for c in cards:
        total = sum(s["score"] for s in c["subjects"])
        c["subjects"].sort(key=lambda s: s["subject"])
        c["total"] = total
        c["percent"] = round(100 * total / (c["max_marks"] * len(c["subjects"])), 1) if c["subjects"] else 0
    return cards


# ---------------------------------------------------------------- posts
def _post_out(p: Post, maps) -> PostOut:
    users, classes, subjects = maps
    out = PostOut.model_validate(p)
    out.author_name = users.get(p.author_id, "")
    out.class_name = classes.get(p.class_id) if p.class_id else None
    out.subject_name = subjects.get(p.subject_id) if p.subject_id else None
    return out


@router.get("/posts", response_model=list[PostOut])
def list_posts(kind: str | None = None, class_id: int | None = None, student_id: int | None = None,
               user: User = Depends(school_user), db: Session = Depends(get_db)):
    q = select(Post).where(Post.school_id == user.school_id, Post.is_active.is_(True)).order_by(Post.created_at.desc()).limit(100)
    if kind:
        q = q.where(Post.kind == kind)
    if user.role in (Role.student, Role.parent):
        cid = resolve_student(db, user, student_id).class_id if (user.role == Role.student or student_id) else None
        if cid:
            q = q.where(or_(Post.class_id.is_(None), Post.class_id == cid))
        else:
            q = q.where(or_(Post.class_id.is_(None), Post.class_id.in_(visible_class_ids(db, user) or {0})))
    else:
        vis = visible_class_ids(db, user)
        if vis is not None:
            q = q.where(or_(Post.class_id.is_(None), Post.class_id.in_(vis or {0})))
    if class_id:
        q = q.where(or_(Post.class_id.is_(None), Post.class_id == class_id))
    maps = name_maps(db, user.school_id)
    return [_post_out(p, maps) for p in db.scalars(q)]


def _can_post(db: Session, user: User, body: PostIn) -> None:
    if body.kind == "homework" and not body.class_id:
        raise HTTPException(400, "Homework needs a class")
    if body.class_id:
        ensure_class_access(db, user, body.class_id, "notices", "edit")
    elif user.role == Role.teacher or RANK[level_of(user, "notices")] < RANK["edit"]:
        raise HTTPException(403, "Only the principal (or staff with notice rights) can post to the whole school")
    if body.subject_id:
        owned(db, Subject, body.subject_id, user, "Subject")


def _may_modify(user: User, p: Post) -> None:
    if p.author_id == user.id:
        return
    if user.role in MANAGERS and RANK[level_of(user, "notices")] >= RANK["edit"]:
        return
    raise HTTPException(403, "You can only change your own posts")


@router.post("/posts", response_model=PostOut)
def create_post(body: PostIn, user: User = Depends(staff), db: Session = Depends(get_db)):
    _can_post(db, user, body)
    p = Post(school_id=user.school_id, **body.model_dump(), author_id=user.id)
    db.add(p)
    db.commit()
    return _post_out(p, name_maps(db, user.school_id))


@router.put("/posts/{pid}", response_model=PostOut)
def update_post(pid: int, body: PostIn, user: User = Depends(staff), db: Session = Depends(get_db)):
    p = owned(db, Post, pid, user, "Post")
    _may_modify(user, p)
    _can_post(db, user, body)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return _post_out(p, name_maps(db, user.school_id))


@router.delete("/posts/{pid}")
def archive_post(pid: int, user: User = Depends(staff), db: Session = Depends(get_db)):
    p = owned(db, Post, pid, user, "Post")
    _may_modify(user, p)
    p.is_active, p.archived_at, p.archived_by = False, utcnow(), user.id
    db.commit()
    return {"ok": True}

