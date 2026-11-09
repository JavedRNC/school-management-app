"""Tenant-scoped helpers. Every lookup is limited to the caller's school."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Assignment, ParentLink, Role, School, SchoolClass, Subject, User
from .perms import RANK, level_of


def get_school(db: Session, user: User) -> School:
    if not user.school_id:
        raise HTTPException(400, "Not a school account")
    return db.get(School, user.school_id)


def owned(db: Session, model, obj_id: int, user: User, what: str, include_archived: bool = False):
    """Fetch a school-owned row or 404 (also 404 for other schools' rows)."""
    obj = db.get(model, obj_id)
    if not obj or getattr(obj, "school_id", None) != user.school_id:
        raise HTTPException(404, f"{what} not found")
    if not include_archived and getattr(obj, "is_active", True) is False:
        raise HTTPException(404, f"{what} not found")
    return obj


def teacher_class_ids(db: Session, teacher_id: int) -> set[int]:
    ids = set(db.scalars(select(Assignment.class_id).where(Assignment.teacher_id == teacher_id)))
    ids |= set(db.scalars(select(SchoolClass.id).where(SchoolClass.class_teacher_id == teacher_id,
                                                      SchoolClass.is_active.is_(True))))
    return ids


def manager_class_ids(db: Session, user: User) -> set[int] | None:
    """None = all classes. Coordinators may be limited to some classes."""
    if user.role == Role.coordinator and user.scope_class_ids:
        return set(user.scope_class_ids)
    return None


def visible_class_ids(db: Session, user: User) -> set[int] | None:
    if user.role in (Role.principal, Role.vice_principal):
        return None
    if user.role == Role.coordinator:
        return manager_class_ids(db, user)
    if user.role == Role.teacher:
        return teacher_class_ids(db, user.id)
    if user.role == Role.student:
        return {user.class_id} if user.class_id else set()
    if user.role == Role.parent:
        return {s.class_id for s in children(db, user) if s.class_id}
    return set()


def ensure_class_access(db: Session, user: User, class_id: int, area: str = "attendance", level: str = "edit") -> SchoolClass:
    """Staff access to a class: managers by permission (+coordinator scope), teachers by teaching it."""
    cls = owned(db, SchoolClass, class_id, user, "Class")
    if user.role in (Role.principal, Role.vice_principal, Role.coordinator):
        if RANK[level_of(user, area)] < RANK[level]:
            raise HTTPException(403, "You don't have permission for this")
        scope = manager_class_ids(db, user)
        if scope is not None and class_id not in scope:
            raise HTTPException(403, "This class is outside your assigned classes")
        return cls
    if user.role == Role.teacher and class_id in teacher_class_ids(db, user.id):
        return cls
    raise HTTPException(403, "You don't teach this class")


def ensure_subject_access(db: Session, user: User, class_id: int, subject_id: int) -> None:
    if user.role in (Role.principal, Role.vice_principal, Role.coordinator):
        return
    a = db.scalar(select(Assignment).where(Assignment.class_id == class_id, Assignment.subject_id == subject_id,
                                           Assignment.teacher_id == user.id))
    if not a:
        raise HTTPException(403, "You don't teach this subject in this class")


def class_students(db: Session, class_id: int) -> list[User]:
    return list(db.scalars(select(User).where(User.class_id == class_id, User.role == Role.student,
                                              User.active.is_(True)).order_by(User.roll_no, User.name)))


def children(db: Session, parent: User) -> list[User]:
    return list(db.scalars(
        select(User).join(ParentLink, ParentLink.student_id == User.id)
        .where(ParentLink.parent_id == parent.id, User.active.is_(True)).order_by(User.name)))


def resolve_student(db: Session, user: User, student_id: int | None) -> User:
    """Student → self. Parent → the given (or first) linked child."""
    if user.role == Role.student:
        return user
    if user.role == Role.parent:
        kids = children(db, user)
        if not kids:
            raise HTTPException(404, "No children linked to this account yet")
        if student_id is None:
            return kids[0]
        for k in kids:
            if k.id == student_id:
                return k
        raise HTTPException(403, "This student isn't linked to your account")
    raise HTTPException(403, "Only students and parents can view this")


def name_maps(db: Session, school_id: int):
    users = {u.id: u.name for u in db.scalars(select(User).where(User.school_id == school_id))}
    classes = {c.id: c.name for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == school_id))}
    subjects = {s.id: s.name for s in db.scalars(select(Subject).where(Subject.school_id == school_id))}
    return users, classes, subjects


def active_ids(db: Session, model, school_id: int) -> set[int]:
    return set(db.scalars(select(model.id).where(model.school_id == school_id, model.is_active.is_(True))))
