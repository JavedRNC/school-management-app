"""Serialisers shared by routers."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ParentLink, Role, User
from .schemas import UserOut


def user_out(db: Session, u: User) -> UserOut:
    out = UserOut.model_validate(u)
    if u.role == Role.parent:
        out.children_ids = list(db.scalars(select(ParentLink.student_id).where(ParentLink.parent_id == u.id)))
    elif u.role == Role.student:
        out.parent_ids = list(db.scalars(select(ParentLink.parent_id).where(ParentLink.student_id == u.id)))
    return out


def users_out(db: Session, users: list[User]) -> list[UserOut]:
    ids = [u.id for u in users]
    links = list(db.scalars(select(ParentLink).where(
        (ParentLink.parent_id.in_(ids)) | (ParentLink.student_id.in_(ids))))) if ids else []
    kids: dict[int, list[int]] = {}
    pars: dict[int, list[int]] = {}
    for link in links:
        kids.setdefault(link.parent_id, []).append(link.student_id)
        pars.setdefault(link.student_id, []).append(link.parent_id)
    out = []
    for u in users:
        o = UserOut.model_validate(u)
        o.children_ids = kids.get(u.id, []) if u.role == Role.parent else []
        o.parent_ids = pars.get(u.id, []) if u.role == Role.student else []
        out.append(o)
    return out


def mask_phone(p: str) -> str:
    digits = "".join(ch for ch in p if ch.isdigit())
    if len(digits) < 6:
        return "XXXX" if p else ""
    return digits[:2] + "X" * (len(digits) - 5) + digits[-3:]
