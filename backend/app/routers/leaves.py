"""Leave requests (F8 teacher leaves, F19 student leave by parent). Module: leaves."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import audit, require_module, school_user
from ..db import get_db
from ..deps import children, get_prefs, get_school, name_maps, resolve_student
from ..models import LeaveRequest, Role, SchoolClass, User, utcnow
from ..perms import RANK, level_of
from ..util import school_days, today

router = APIRouter(prefix="/leaves", tags=["leaves"], dependencies=[Depends(require_module("leaves"))])

STAFF_ROLES = (Role.teacher, Role.vice_principal, Role.coordinator)
STAFF_TYPES = ("casual", "sick", "earned", "other")
STUDENT_TYPES = ("sick", "family", "other")


class LeaveIn(BaseModel):
    leave_type: str
    start_date: date
    end_date: date | None = None
    half_day: bool = False
    reason: str = Field(default="", max_length=1000)
    student_id: int | None = None   # parents: which child


class DecideIn(BaseModel):
    approve: bool
    comment: str = Field(default="", max_length=500)


def academic_year(d: date) -> tuple[date, date]:
    """Indian academic year: 1 April – 31 March."""
    start = date(d.year if d.month >= 4 else d.year - 1, 4, 1)
    return start, date(start.year + 1, 3, 31)


def leave_days(db: Session, school, lr: LeaveRequest) -> float:
    n = len(school_days(db, school, lr.start_date, lr.end_date))
    return 0.5 if lr.half_day and n else float(n)


def _out(db: Session, lr: LeaveRequest, names: dict, classes: dict, school) -> dict:
    u = db.get(User, lr.user_id)
    return {
        "id": lr.id, "kind": lr.kind, "user_id": lr.user_id, "user_name": names.get(lr.user_id, ""),
        "class_name": classes.get(u.class_id) if u and u.class_id else None,
        "applied_by": lr.applied_by, "applied_by_name": names.get(lr.applied_by, ""),
        "leave_type": lr.leave_type, "start_date": lr.start_date, "end_date": lr.end_date, "half_day": lr.half_day,
        "days": leave_days(db, school, lr), "reason": lr.reason, "status": lr.status,
        "decided_by_name": names.get(lr.decided_by) if lr.decided_by else None, "decided_at": lr.decided_at,
        "comment": lr.comment, "created_at": lr.created_at,
    }


def _class_teacher_classes(db: Session, user: User) -> set[int]:
    return set(db.scalars(select(SchoolClass.id).where(SchoolClass.class_teacher_id == user.id, SchoolClass.is_active.is_(True))))


def can_decide(db: Session, user: User, lr: LeaveRequest) -> bool:
    if lr.user_id == user.id or lr.applied_by == user.id:
        return False
    if user.role == Role.principal:
        return True
    if user.role in (Role.vice_principal, Role.coordinator) and RANK[level_of(user, "leaves")] >= RANK["edit"]:
        if lr.kind == "student" and user.role == Role.coordinator and user.scope_class_ids:
            st = db.get(User, lr.user_id)
            return bool(st and st.class_id in user.scope_class_ids)
        return lr.kind == "student" or user.role == Role.vice_principal
    if lr.kind == "student" and user.role == Role.teacher:
        st = db.get(User, lr.user_id)
        return bool(st and st.class_id in _class_teacher_classes(db, user))
    return False


@router.post("")
def apply(body: LeaveIn, user: User = Depends(school_user), db: Session = Depends(get_db)):
    end = body.end_date or body.start_date
    if end < body.start_date:
        raise HTTPException(400, "End date is before the start date")
    if (end - body.start_date).days > 60:
        raise HTTPException(400, "A single request can be at most 60 days")
    if body.start_date < today() - timedelta(days=7):
        raise HTTPException(400, "Leave can be applied at most 7 days back")
    if body.half_day and end != body.start_date:
        raise HTTPException(400, "Half-day leave must be a single day")
    if user.role in STAFF_ROLES:
        if body.leave_type not in STAFF_TYPES:
            raise HTTPException(400, f"Leave type must be one of: {', '.join(STAFF_TYPES)}")
        kind, uid = "staff", user.id
    elif user.role == Role.parent:
        if body.leave_type not in STUDENT_TYPES:
            raise HTTPException(400, f"Leave type must be one of: {', '.join(STUDENT_TYPES)}")
        kind, uid = "student", resolve_student(db, user, body.student_id).id
    else:
        raise HTTPException(403, "Only staff and parents can apply for leave")
    overlap = db.scalar(select(LeaveRequest).where(
        LeaveRequest.user_id == uid, LeaveRequest.status.in_(("pending", "approved")),
        LeaveRequest.start_date <= end, LeaveRequest.end_date >= body.start_date))
    if overlap:
        raise HTTPException(409, "There's already a leave request for these dates")
    lr = LeaveRequest(school_id=user.school_id, kind=kind, user_id=uid, applied_by=user.id, leave_type=body.leave_type,
                      start_date=body.start_date, end_date=end, half_day=body.half_day, reason=body.reason.strip())
    db.add(lr)
    db.commit()
    names, classes, _ = name_maps(db, user.school_id)
    return _out(db, lr, names, classes, get_school(db, user))


@router.get("")
def list_leaves(scope: str = "mine", status: str | None = None, user: User = Depends(school_user), db: Session = Depends(get_db)):
    """scope=mine (my own / my children's) · scope=inbox (requests I can approve or view)."""
    q = select(LeaveRequest).where(LeaveRequest.school_id == user.school_id).order_by(LeaveRequest.created_at.desc()).limit(300)
    if scope == "mine":
        if user.role == Role.parent:
            kids = [k.id for k in children(db, user)]
            q = q.where(LeaveRequest.user_id.in_(kids or [0]))
        elif user.role == Role.student:
            q = q.where(LeaveRequest.user_id == user.id)
        else:
            q = q.where(LeaveRequest.user_id == user.id)
    else:
        if user.role == Role.principal or (user.role in (Role.vice_principal, Role.coordinator) and RANK[level_of(user, "leaves")] >= RANK["view"]):
            q = q.where(LeaveRequest.user_id != user.id)
            if user.role == Role.coordinator:
                q = q.where(LeaveRequest.kind == "student")
                if user.scope_class_ids:
                    ids = list(db.scalars(select(User.id).where(User.class_id.in_(user.scope_class_ids))))
                    q = q.where(LeaveRequest.user_id.in_(ids or [0]))
        elif user.role == Role.teacher:
            cls = _class_teacher_classes(db, user)
            ids = list(db.scalars(select(User.id).where(User.class_id.in_(cls or {0}), User.role == Role.student)))
            q = q.where(LeaveRequest.kind == "student", LeaveRequest.user_id.in_(ids or [0]))
        else:
            raise HTTPException(403, "Not allowed")
    if status:
        q = q.where(LeaveRequest.status == status)
    names, classes, _ = name_maps(db, user.school_id)
    school = get_school(db, user)
    out = []
    for lr in db.scalars(q):
        row = _out(db, lr, names, classes, school)
        row["can_decide"] = lr.status == "pending" and can_decide(db, user, lr)
        out.append(row)
    return out


@router.post("/{lid}/decide")
def decide(lid: int, body: DecideIn, user: User = Depends(school_user), db: Session = Depends(get_db)):
    lr = db.get(LeaveRequest, lid)
    if not lr or lr.school_id != user.school_id:
        raise HTTPException(404, "Leave request not found")
    if lr.status != "pending":
        raise HTTPException(409, f"Already {lr.status}")
    if not can_decide(db, user, lr):
        raise HTTPException(403, "You can't approve this request")
    lr.status = "approved" if body.approve else "rejected"
    lr.decided_by, lr.decided_at, lr.comment = user.id, utcnow(), body.comment.strip()
    audit(db, user, f"leave.{lr.status}", f"#{lr.id} {lr.kind} {lr.start_date}–{lr.end_date}")
    db.commit()
    names, classes, _ = name_maps(db, user.school_id)
    return _out(db, lr, names, classes, get_school(db, user))


@router.post("/{lid}/cancel")
def cancel(lid: int, user: User = Depends(school_user), db: Session = Depends(get_db)):
    lr = db.get(LeaveRequest, lid)
    if not lr or lr.school_id != user.school_id or lr.applied_by != user.id:
        raise HTTPException(404, "Leave request not found")
    if lr.status not in ("pending", "approved") or (lr.status == "approved" and lr.start_date <= today()):
        raise HTTPException(409, "This request can't be cancelled now")
    lr.status = "cancelled"
    db.commit()
    return {"ok": True}


@router.get("/balance")
def balance(user_id: int | None = None, user: User = Depends(school_user), db: Session = Depends(get_db)):
    """Staff leave balance for the current academic year (Apr–Mar)."""
    target = user
    if user_id and user_id != user.id:
        if not (user.role == Role.principal or RANK[level_of(user, "leaves")] >= RANK["view"]):
            raise HTTPException(403, "Not allowed")
        target = db.get(User, user_id)
        if not target or target.school_id != user.school_id:
            raise HTTPException(404, "User not found")
    quotas = get_prefs(db, user.school_id).leave_quotas or {}
    start, end = academic_year(today())
    school = get_school(db, user)
    used: dict[str, float] = {}
    for lr in db.scalars(select(LeaveRequest).where(LeaveRequest.user_id == target.id, LeaveRequest.status == "approved",
                                                    LeaveRequest.start_date >= start, LeaveRequest.start_date <= end)):
        used[lr.leave_type] = used.get(lr.leave_type, 0) + leave_days(db, school, lr)
    return {"year_start": start, "year_end": end,
            "types": [{"type": k, "quota": v, "used": used.get(k, 0), "left": max(0, v - used.get(k, 0))} for k, v in quotas.items()],
            "other_used": used.get("other", 0)}


@router.get("/today")
def on_leave_today(user: User = Depends(school_user), db: Session = Depends(get_db)):
    """Who is on approved leave today (staff for managers; students for class teachers/managers)."""
    t = today()
    q = select(LeaveRequest).where(LeaveRequest.school_id == user.school_id, LeaveRequest.status == "approved",
                                   LeaveRequest.start_date <= t, LeaveRequest.end_date >= t)
    if user.role == Role.teacher:
        cls = _class_teacher_classes(db, user)
        ids = list(db.scalars(select(User.id).where(User.class_id.in_(cls or {0}))))
        q = q.where(LeaveRequest.user_id.in_(ids or [0]))
    elif user.role not in (Role.principal, Role.vice_principal, Role.coordinator):
        raise HTTPException(403, "Not allowed")
    names, classes, _ = name_maps(db, user.school_id)
    out = {"staff": [], "students": []}
    for lr in db.scalars(q):
        u = db.get(User, lr.user_id)
        out["staff" if lr.kind == "staff" else "students"].append(
            {"user_id": lr.user_id, "name": names.get(lr.user_id, ""), "leave_type": lr.leave_type, "half_day": lr.half_day,
             "class_name": classes.get(u.class_id) if u and u.class_id else None, "until": lr.end_date})
    return out


def approved_leave_dates(db: Session, user_ids: list[int], start: date, end: date) -> dict[int, set[date]]:
    """{user_id: {dates on approved leave}} — used by attendance & staff attendance."""
    out: dict[int, set[date]] = {}
    if not user_ids:
        return out
    for lr in db.scalars(select(LeaveRequest).where(LeaveRequest.user_id.in_(user_ids), LeaveRequest.status == "approved",
                                                    LeaveRequest.start_date <= end, LeaveRequest.end_date >= start)):
        d = max(lr.start_date, start)
        while d <= min(lr.end_date, end):
            out.setdefault(lr.user_id, set()).add(d)
            d += timedelta(days=1)
    return out

