"""School setup: classes, subjects, users, assignments, timetable, exams."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import current_user, hash_password, principal_only
from ..db import get_db
from ..deps import class_students, name_maps, teacher_class_ids
from ..models import Assignment, Attendance, Exam, Post, Role, SchoolClass, Subject, TimetableEntry, User
from ..schemas import (
    AssignmentIn, AssignmentOut, ClassIn, ClassOut, ExamIn, ExamOut, NameIn, SubjectOut,
    TimetableIn, TimetableOut, UserCreate, UserOut, UserUpdate,
)

router = APIRouter(tags=["school"])


def _commit(db: Session, msg: str = "Already exists"):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, msg)


# ---------- classes
@router.get("/classes", response_model=list[ClassOut])
def list_classes(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(SchoolClass).order_by(SchoolClass.name)
    if user.role == Role.teacher:
        q = q.where(SchoolClass.id.in_(teacher_class_ids(db, user.id)))
    elif user.role == Role.student:
        q = q.where(SchoolClass.id == user.class_id)
    counts = dict(
        db.execute(
            select(User.class_id, func.count()).where(User.role == Role.student, User.active.is_(True)).group_by(User.class_id)
        ).all()
    )
    return [ClassOut(id=c.id, name=c.name, class_teacher_id=c.class_teacher_id, student_count=counts.get(c.id, 0))
            for c in db.scalars(q)]


@router.post("/classes", response_model=ClassOut, dependencies=[Depends(principal_only)])
def create_class(body: ClassIn, db: Session = Depends(get_db)):
    c = SchoolClass(name=body.name.strip(), class_teacher_id=body.class_teacher_id)
    db.add(c)
    _commit(db, "Class name already exists")
    return ClassOut(id=c.id, name=c.name, class_teacher_id=c.class_teacher_id)


@router.put("/classes/{class_id}", response_model=ClassOut, dependencies=[Depends(principal_only)])
def update_class(class_id: int, body: ClassIn, db: Session = Depends(get_db)):
    c = db.get(SchoolClass, class_id) or _404("Class")
    c.name, c.class_teacher_id = body.name.strip(), body.class_teacher_id
    _commit(db, "Class name already exists")
    return ClassOut(id=c.id, name=c.name, class_teacher_id=c.class_teacher_id)


@router.delete("/classes/{class_id}", dependencies=[Depends(principal_only)])
def delete_class(class_id: int, db: Session = Depends(get_db)):
    """Delete an empty class with its timetable, subject teachers, attendance and class posts.
    Refuses while active students are still enrolled (move or remove them first)."""
    c = db.get(SchoolClass, class_id) or _404("Class")
    n = len(class_students(db, class_id))
    if n:
        raise HTTPException(409, f"Class {c.name} still has {n} student{'s' if n != 1 else ''}. "
                                 "Move them to another class or remove them first.")
    for model in (TimetableEntry, Assignment, Attendance, Post):
        db.execute(delete(model).where(model.class_id == class_id))
    db.execute(update(User).where(User.class_id == class_id).values(class_id=None))  # removed students
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/classes/{class_id}/students", response_model=list[UserOut])
def students_of_class(class_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == Role.student:
        raise HTTPException(403, "Not allowed")
    if user.role == Role.teacher and class_id not in teacher_class_ids(db, user.id):
        raise HTTPException(403, "You don't teach this class")
    return class_students(db, class_id)


# ---------- subjects
@router.get("/subjects", response_model=list[SubjectOut], dependencies=[Depends(current_user)])
def list_subjects(db: Session = Depends(get_db)):
    return list(db.scalars(select(Subject).order_by(Subject.name)))


@router.post("/subjects", response_model=SubjectOut, dependencies=[Depends(principal_only)])
def create_subject(body: NameIn, db: Session = Depends(get_db)):
    s = Subject(name=body.name.strip())
    db.add(s)
    _commit(db, "Subject already exists")
    return s


# ---------- users
@router.get("/users", response_model=list[UserOut], dependencies=[Depends(principal_only)])
def list_users(role: Role | None = None, class_id: int | None = None, db: Session = Depends(get_db)):
    q = select(User).where(User.active.is_(True)).order_by(User.role, User.class_id, User.roll_no, User.name)
    if role:
        q = q.where(User.role == role)
    if class_id:
        q = q.where(User.class_id == class_id)
    return list(db.scalars(q))


@router.post("/users", response_model=UserOut, dependencies=[Depends(principal_only)])
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    if body.role == Role.student and not body.class_id:
        raise HTTPException(400, "Students need a class")
    if body.class_id and not db.get(SchoolClass, body.class_id):
        raise HTTPException(400, "Class not found")
    u = User(
        name=body.name.strip(), email=body.email.lower(), password_hash=hash_password(body.password), role=body.role,
        class_id=body.class_id if body.role == Role.student else None,
        roll_no=body.roll_no if body.role == Role.student else None,
    )
    db.add(u)
    _commit(db, "Email already in use")
    return u


@router.put("/users/{user_id}", response_model=UserOut, dependencies=[Depends(principal_only)])
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db)):
    u = db.get(User, user_id) or _404("User")
    data = body.model_dump(exclude_unset=True)
    if "password" in data:
        pw = data.pop("password")
        if pw:
            u.password_hash = hash_password(pw)
    for k, v in data.items():
        setattr(u, k, v)
    _commit(db)
    return u


# ---------- assignments (teacher -> class + subject)
@router.get("/assignments", response_model=list[AssignmentOut])
def list_assignments(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Assignment)
    if user.role == Role.teacher:
        q = q.where(Assignment.teacher_id == user.id)
    elif user.role == Role.student:
        q = q.where(Assignment.class_id == user.class_id)
    users, classes, subjects = name_maps(db)
    return [AssignmentOut(id=a.id, teacher_id=a.teacher_id, class_id=a.class_id, subject_id=a.subject_id,
                          teacher_name=users.get(a.teacher_id, ""), class_name=classes.get(a.class_id, ""),
                          subject_name=subjects.get(a.subject_id, "")) for a in db.scalars(q)]


@router.post("/assignments", response_model=AssignmentOut, dependencies=[Depends(principal_only)])
def create_assignment(body: AssignmentIn, db: Session = Depends(get_db)):
    t = db.get(User, body.teacher_id)
    if not t or t.role != Role.teacher:
        raise HTTPException(400, "Not a teacher")
    a = db.scalar(select(Assignment).where(Assignment.class_id == body.class_id, Assignment.subject_id == body.subject_id))
    if a:  # reassign subject to new teacher
        a.teacher_id = body.teacher_id
    else:
        a = Assignment(**body.model_dump())
        db.add(a)
    _commit(db)
    return AssignmentOut.model_validate(a)


@router.delete("/assignments/{aid}", dependencies=[Depends(principal_only)])
def delete_assignment(aid: int, db: Session = Depends(get_db)):
    a = db.get(Assignment, aid) or _404("Assignment")
    db.delete(a)
    db.commit()
    return {"ok": True}


# ---------- timetable
@router.get("/timetable", response_model=list[TimetableOut])
def get_timetable(class_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(TimetableEntry).order_by(TimetableEntry.day, TimetableEntry.period)
    if user.role == Role.student:
        q = q.where(TimetableEntry.class_id == user.class_id)
    elif class_id:
        q = q.where(TimetableEntry.class_id == class_id)
    elif user.role == Role.teacher:
        q = q.where(TimetableEntry.teacher_id == user.id)
    users, classes, subjects = name_maps(db)
    return [TimetableOut(id=e.id, class_id=e.class_id, day=e.day, period=e.period, subject_id=e.subject_id,
                         teacher_id=e.teacher_id, class_name=classes.get(e.class_id, ""),
                         subject_name=subjects.get(e.subject_id, ""), teacher_name=users.get(e.teacher_id, ""))
            for e in db.scalars(q)]


@router.put("/timetable", response_model=TimetableOut, dependencies=[Depends(principal_only)])
def set_timetable_slot(body: TimetableIn, db: Session = Depends(get_db)):
    """Create or replace the slot for (class, day, period)."""
    clash = db.scalar(select(TimetableEntry).where(
        TimetableEntry.teacher_id == body.teacher_id, TimetableEntry.day == body.day,
        TimetableEntry.period == body.period, TimetableEntry.class_id != body.class_id))
    if clash:
        raise HTTPException(409, "Teacher already has a class in this period")
    e = db.scalar(select(TimetableEntry).where(TimetableEntry.class_id == body.class_id,
                                               TimetableEntry.day == body.day, TimetableEntry.period == body.period))
    if e:
        e.subject_id, e.teacher_id = body.subject_id, body.teacher_id
    else:
        e = TimetableEntry(**body.model_dump())
        db.add(e)
    _commit(db)
    return TimetableOut.model_validate(e)


@router.delete("/timetable/{eid}", dependencies=[Depends(principal_only)])
def delete_slot(eid: int, db: Session = Depends(get_db)):
    e = db.get(TimetableEntry, eid) or _404("Slot")
    db.delete(e)
    db.commit()
    return {"ok": True}


# ---------- exams
@router.get("/exams", response_model=list[ExamOut], dependencies=[Depends(current_user)])
def list_exams(db: Session = Depends(get_db)):
    return list(db.scalars(select(Exam).order_by(Exam.date.desc())))


@router.post("/exams", response_model=ExamOut, dependencies=[Depends(principal_only)])
def create_exam(body: ExamIn, db: Session = Depends(get_db)):
    e = Exam(**body.model_dump())
    db.add(e)
    db.commit()
    return e


def _404(what: str):
    raise HTTPException(404, f"{what} not found")
