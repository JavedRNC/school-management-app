"""Attendance, marks, posts (notices + homework)."""
from datetime import date

from ..util import today

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import current_user, student_only, teacher_or_principal
from ..db import get_db
from ..deps import class_students, ensure_class_access, ensure_subject_access, name_maps, teacher_class_ids
from ..models import Attendance, Exam, Mark, Post, Role, User
from ..schemas import (
    AttendanceIn, AttendanceRow, MarkRow, MarksIn, PostIn, PostOut, StudentAttendance,
)

router = APIRouter(tags=["academics"])


# ---------- attendance
@router.get("/attendance", response_model=list[AttendanceRow])
def class_attendance(class_id: int, day: date, user: User = Depends(teacher_or_principal), db: Session = Depends(get_db)):
    ensure_class_access(db, user, class_id)
    marked = {a.student_id: a.present for a in db.scalars(
        select(Attendance).where(Attendance.class_id == class_id, Attendance.date == day))}
    return [AttendanceRow(student_id=s.id, name=s.name, roll_no=s.roll_no, present=marked.get(s.id))
            for s in class_students(db, class_id)]


@router.post("/attendance")
def mark_attendance(body: AttendanceIn, user: User = Depends(teacher_or_principal), db: Session = Depends(get_db)):
    ensure_class_access(db, user, body.class_id)
    if body.date > today():
        raise HTTPException(400, "Can't mark attendance for a future date")
    valid = {s.id for s in class_students(db, body.class_id)}
    existing = {a.student_id: a for a in db.scalars(
        select(Attendance).where(Attendance.class_id == body.class_id, Attendance.date == body.date))}
    for r in body.records:
        if r.student_id not in valid:
            raise HTTPException(400, f"Student {r.student_id} is not in this class")
        if r.student_id in existing:
            existing[r.student_id].present = r.present
            existing[r.student_id].marked_by = user.id
        else:
            db.add(Attendance(student_id=r.student_id, class_id=body.class_id, date=body.date,
                              present=r.present, marked_by=user.id))
    db.commit()
    return {"ok": True, "saved": len(body.records)}


@router.get("/me/attendance", response_model=StudentAttendance)
def my_attendance(user: User = Depends(student_only), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Attendance).where(Attendance.student_id == user.id).order_by(Attendance.date.desc())))
    present = sum(1 for r in rows if r.present)
    return StudentAttendance(
        total_days=len(rows), present_days=present,
        percent=round(100 * present / len(rows), 1) if rows else 0.0,
        recent=[{"date": r.date.isoformat(), "present": r.present} for r in rows[:30]],
    )


# ---------- marks
@router.get("/marks", response_model=list[MarkRow])
def class_marks(exam_id: int, class_id: int, subject_id: int,
                user: User = Depends(teacher_or_principal), db: Session = Depends(get_db)):
    ensure_class_access(db, user, class_id)
    scores = {m.student_id: m.score for m in db.scalars(
        select(Mark).where(Mark.exam_id == exam_id, Mark.subject_id == subject_id))}
    return [MarkRow(student_id=s.id, name=s.name, roll_no=s.roll_no, score=scores.get(s.id))
            for s in class_students(db, class_id)]


@router.post("/marks")
def save_marks(body: MarksIn, user: User = Depends(teacher_or_principal), db: Session = Depends(get_db)):
    ensure_class_access(db, user, body.class_id)
    ensure_subject_access(db, user, body.class_id, body.subject_id)
    exam = db.get(Exam, body.exam_id)
    if not exam:
        raise HTTPException(404, "Exam not found")
    valid = {s.id for s in class_students(db, body.class_id)}
    existing = {m.student_id: m for m in db.scalars(
        select(Mark).where(Mark.exam_id == body.exam_id, Mark.subject_id == body.subject_id,
                           Mark.student_id.in_(valid)))}
    for r in body.records:
        if r.student_id not in valid:
            raise HTTPException(400, f"Student {r.student_id} is not in this class")
        if r.score > exam.max_marks:
            raise HTTPException(400, f"Score {r.score} is above max marks {exam.max_marks}")
        if r.student_id in existing:
            existing[r.student_id].score = r.score
            existing[r.student_id].entered_by = user.id
        else:
            db.add(Mark(exam_id=body.exam_id, student_id=r.student_id, subject_id=body.subject_id,
                        score=r.score, entered_by=user.id))
    db.commit()
    return {"ok": True, "saved": len(body.records)}


@router.get("/me/marks")
def my_marks(user: User = Depends(student_only), db: Session = Depends(get_db)):
    """Report card: per exam, per subject score + totals."""
    _, _, subjects = name_maps(db)
    exams = {e.id: e for e in db.scalars(select(Exam))}
    out: dict[int, dict] = {}
    for m in db.scalars(select(Mark).where(Mark.student_id == user.id)):
        e = exams[m.exam_id]
        card = out.setdefault(e.id, {"exam_id": e.id, "exam": e.name, "date": e.date.isoformat(),
                                     "max_marks": e.max_marks, "subjects": []})
        card["subjects"].append({"subject": subjects.get(m.subject_id, ""), "score": m.score})
    cards = sorted(out.values(), key=lambda c: c["date"], reverse=True)
    for c in cards:
        total = sum(s["score"] for s in c["subjects"])
        c["subjects"].sort(key=lambda s: s["subject"])
        c["total"] = total
        c["percent"] = round(100 * total / (c["max_marks"] * len(c["subjects"])), 1) if c["subjects"] else 0
    return cards


# ---------- posts
def _post_out(p: Post, maps) -> PostOut:
    users, classes, subjects = maps
    out = PostOut.model_validate(p)
    out.author_name = users.get(p.author_id, "")
    out.class_name = classes.get(p.class_id) if p.class_id else None
    out.subject_name = subjects.get(p.subject_id) if p.subject_id else None
    return out


@router.get("/posts", response_model=list[PostOut])
def list_posts(kind: str | None = None, class_id: int | None = None,
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Post).order_by(Post.created_at.desc()).limit(100)
    if kind:
        q = q.where(Post.kind == kind)
    if user.role == Role.student:
        q = q.where(or_(Post.class_id.is_(None), Post.class_id == user.class_id))
    elif user.role == Role.teacher:
        mine = teacher_class_ids(db, user.id)
        q = q.where(or_(Post.class_id.is_(None), Post.class_id.in_(mine)))
    if class_id:
        q = q.where(or_(Post.class_id.is_(None), Post.class_id == class_id))
    maps = name_maps(db)
    return [_post_out(p, maps) for p in db.scalars(q)]


@router.post("/posts", response_model=PostOut)
def create_post(body: PostIn, user: User = Depends(teacher_or_principal), db: Session = Depends(get_db)):
    if body.kind == "homework" and not body.class_id:
        raise HTTPException(400, "Homework needs a class")
    if body.class_id:
        ensure_class_access(db, user, body.class_id)
    elif user.role != Role.principal:
        raise HTTPException(403, "Only the principal can post to the whole school")
    p = Post(**body.model_dump(), author_id=user.id)
    db.add(p)
    db.commit()
    return _post_out(p, name_maps(db))


@router.put("/posts/{pid}", response_model=PostOut)
def update_post(pid: int, body: PostIn, user: User = Depends(teacher_or_principal), db: Session = Depends(get_db)):
    p = db.get(Post, pid)
    if not p:
        raise HTTPException(404, "Post not found")
    if user.role != Role.principal and p.author_id != user.id:
        raise HTTPException(403, "You can only edit your own posts")
    if body.kind == "homework" and not body.class_id:
        raise HTTPException(400, "Homework needs a class")
    if body.class_id:
        ensure_class_access(db, user, body.class_id)
    elif user.role != Role.principal:
        raise HTTPException(403, "Only the principal can post to the whole school")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return _post_out(p, name_maps(db))


@router.delete("/posts/{pid}")
def delete_post(pid: int, user: User = Depends(teacher_or_principal), db: Session = Depends(get_db)):
    p = db.get(Post, pid)
    if not p:
        raise HTTPException(404, "Post not found")
    if user.role != Role.principal and p.author_id != user.id:
        raise HTTPException(403, "You can only delete your own posts")
    db.delete(p)
    db.commit()
    return {"ok": True}
