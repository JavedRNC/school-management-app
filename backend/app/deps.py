from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Assignment, Role, SchoolClass, User


def teacher_class_ids(db: Session, teacher_id: int) -> set[int]:
    ids = set(db.scalars(select(Assignment.class_id).where(Assignment.teacher_id == teacher_id)))
    ids |= set(db.scalars(select(SchoolClass.id).where(SchoolClass.class_teacher_id == teacher_id)))
    return ids


def ensure_class_access(db: Session, user: User, class_id: int) -> SchoolClass:
    cls = db.get(SchoolClass, class_id)
    if not cls:
        raise HTTPException(404, "Class not found")
    if user.role == Role.principal:
        return cls
    if user.role == Role.teacher and class_id in teacher_class_ids(db, user.id):
        return cls
    raise HTTPException(403, "You don't teach this class")


def ensure_subject_access(db: Session, user: User, class_id: int, subject_id: int) -> None:
    if user.role == Role.principal:
        return
    a = db.scalar(
        select(Assignment).where(
            Assignment.class_id == class_id, Assignment.subject_id == subject_id, Assignment.teacher_id == user.id
        )
    )
    if not a:
        raise HTTPException(403, "You don't teach this subject in this class")


def class_students(db: Session, class_id: int) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(User.class_id == class_id, User.role == Role.student, User.active.is_(True))
            .order_by(User.roll_no, User.name)
        )
    )


def name_maps(db: Session):
    from .models import Subject

    users = {u.id: u.name for u in db.scalars(select(User))}
    classes = {c.id: c.name for c in db.scalars(select(SchoolClass))}
    subjects = {s.id: s.name for s in db.scalars(select(Subject))}
    return users, classes, subjects
