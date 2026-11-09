"""School profile & settings, privacy, audit log, archive, calendar (F4, F12, F18, F25, F26)."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..auth import audit, require, require_area, school_user
from ..db import get_db
from ..deps import get_school, owned
from ..models import AuditLog, Banner, Exam, Holiday, Poll, Post, Role, Route, SchoolClass, Subject, User, Vehicle, utcnow
from ..perms import AREAS, MODULES, level_of
from ..schemas import AuditOut, HolidayIn, HolidayOut, SchoolSettingsIn
from ..subscription import subscription_summary
from ..util import day_status, today

router = APIRouter(tags=["settings"])


def school_info(db: Session, user: User) -> dict:
    s = get_school(db, user)
    is_open, reason = day_status(db, s, today())
    sub = subscription_summary(db, s)
    info = {
        "id": s.id, "code": s.code, "name": s.name, "address": s.address, "phone": s.phone, "board": s.board,
        "working_days": s.working_days or [], "today_is_school_day": is_open, "closed_reason": reason,
        "share_contact_with_admin": s.share_contact_with_admin,
        "support_access_until": s.support_access_until,
        "modules": sub["modules"], "status": sub["status"], "can_write": sub["can_write"],
        "permissions": {a: level_of(user, a) for a in AREAS},
        "module_names": MODULES,
    }
    if user.role == Role.principal or level_of(user, "settings") != "none":
        info["subscription"] = sub
    return info


@router.get("/school/me")
def my_school(user: User = Depends(school_user), db: Session = Depends(get_db)):
    return school_info(db, user)


@router.put("/school/settings")
def update_settings(body: SchoolSettingsIn, user: User = Depends(require_area("settings", "edit")), db: Session = Depends(get_db)):
    s = get_school(db, user)
    data = body.model_dump(exclude_unset=True)
    if "working_days" in data:
        days = sorted({d for d in data["working_days"] if 0 <= d <= 6})
        if not days:
            raise HTTPException(400, "Choose at least one working day")
        data["working_days"] = days
    for k, v in data.items():
        setattr(s, k, v.strip() if isinstance(v, str) else v)
    audit(db, user, "settings.updated", ", ".join(sorted(data)))
    db.commit()
    return school_info(db, user)


# ---------------------------------------------------------------- privacy (F25)
@router.post("/school/support-access")
def grant_support_access(hours: int = 24, user: User = Depends(require(Role.principal)), db: Session = Depends(get_db)):
    """Temporarily let the platform admin see full personal details (for a support request)."""
    s = get_school(db, user)
    hours = max(1, min(hours, 72))
    s.support_access_until = utcnow() + timedelta(hours=hours)
    audit(db, user, "privacy.support_access.granted", f"{hours} hours")
    db.commit()
    return school_info(db, user)


@router.delete("/school/support-access")
def revoke_support_access(user: User = Depends(require(Role.principal)), db: Session = Depends(get_db)):
    s = get_school(db, user)
    s.support_access_until = None
    audit(db, user, "privacy.support_access.revoked")
    db.commit()
    return school_info(db, user)


@router.get("/school/audit", response_model=list[AuditOut])
def school_audit(admin_only_: bool = False, user: User = Depends(require_area("settings", "view")), db: Session = Depends(get_db)):
    q = select(AuditLog).where(AuditLog.school_id == user.school_id).order_by(AuditLog.at.desc()).limit(200)
    if admin_only_:
        q = q.where(AuditLog.actor_role == "admin")
    return list(db.scalars(q))


# ---------------------------------------------------------------- archive (F12)
ARCHIVE_KINDS = {"class": SchoolClass, "subject": Subject, "exam": Exam, "post": Post, "holiday": Holiday,
                 "banner": Banner, "poll": Poll, "vehicle": Vehicle, "route": Route}


@router.get("/archive")
def list_archive(user: User = Depends(require_area("settings", "view")), db: Session = Depends(get_db)):
    out = []
    for kind, model in ARCHIVE_KINDS.items():
        for o in db.scalars(select(model).where(model.school_id == user.school_id, model.is_active.is_(False))):
            label = getattr(o, "name", None) or getattr(o, "title", None) or getattr(o, "number", "")
            out.append({"kind": kind, "id": o.id, "label": label, "archived_at": o.archived_at})
    for u in db.scalars(select(User).where(User.school_id == user.school_id, User.active.is_(False))):
        out.append({"kind": "user", "id": u.id, "label": f"{u.name} · {u.role.value.replace('_', ' ')}", "archived_at": u.archived_at})
    out.sort(key=lambda r: r["archived_at"] or utcnow(), reverse=True)
    return out


@router.post("/archive/{kind}/{obj_id}/restore")
def restore(kind: str, obj_id: int, user: User = Depends(require_area("settings", "edit")), db: Session = Depends(get_db)):
    if kind == "user":
        u = db.get(User, obj_id)
        if not u or u.school_id != user.school_id:
            raise HTTPException(404, "Not found")
        if u.role == Role.student and u.class_id:
            c = db.get(SchoolClass, u.class_id)
            if not c or not c.is_active:
                raise HTTPException(409, "Their class is archived — restore the class first")
        u.active, u.archived_at = True, None
        label = u.name
    else:
        model = ARCHIVE_KINDS.get(kind)
        if not model:
            raise HTTPException(404, "Unknown item type")
        o = owned(db, model, obj_id, user, kind.title(), include_archived=True)
        o.is_active, o.archived_at, o.archived_by = True, None, None
        label = getattr(o, "name", None) or getattr(o, "title", None) or getattr(o, "number", "")
    try:
        audit(db, user, f"{kind}.restored", label)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An active item with the same name exists — rename it first")
    return {"ok": True}


# ---------------------------------------------------------------- calendar (F18)
@router.get("/holidays", response_model=list[HolidayOut])
def list_holidays(start: date | None = None, end: date | None = None, user: User = Depends(school_user), db: Session = Depends(get_db)):
    q = select(Holiday).where(Holiday.school_id == user.school_id, Holiday.is_active.is_(True)).order_by(Holiday.start_date)
    if start:
        q = q.where(Holiday.end_date >= start)
    if end:
        q = q.where(Holiday.start_date <= end)
    return list(db.scalars(q))


def _holiday_data(body: HolidayIn) -> dict:
    end = body.end_date or body.start_date
    if end < body.start_date:
        raise HTTPException(400, "End date is before the start date")
    if (end - body.start_date).days > 120:
        raise HTTPException(400, "A single entry can't be longer than 120 days")
    is_off = False if body.kind == "event" else body.is_off
    return {"name": body.name.strip(), "start_date": body.start_date, "end_date": end, "kind": body.kind,
            "is_off": is_off, "note": body.note.strip()}


@router.post("/holidays", response_model=HolidayOut)
def add_holiday(body: HolidayIn, user: User = Depends(require_area("calendar", "edit")), db: Session = Depends(get_db)):
    h = Holiday(school_id=user.school_id, **_holiday_data(body))
    db.add(h)
    audit(db, user, "calendar.added", f"{h.name} {h.start_date}–{h.end_date}")
    db.commit()
    return h


@router.put("/holidays/{hid}", response_model=HolidayOut)
def edit_holiday(hid: int, body: HolidayIn, user: User = Depends(require_area("calendar", "edit")), db: Session = Depends(get_db)):
    h = owned(db, Holiday, hid, user, "Calendar entry")
    for k, v in _holiday_data(body).items():
        setattr(h, k, v)
    db.commit()
    return h


@router.delete("/holidays/{hid}")
def archive_holiday(hid: int, user: User = Depends(require_area("calendar", "edit")), db: Session = Depends(get_db)):
    h = owned(db, Holiday, hid, user, "Calendar entry")
    h.is_active, h.archived_at, h.archived_by = False, utcnow(), user.id
    db.commit()
    return {"ok": True}


@router.post("/holidays/national", response_model=list[HolidayOut])
def add_national_holidays(year: int, user: User = Depends(require_area("calendar", "edit")), db: Session = Depends(get_db)):
    """Quick start: fixed-date national holidays of India (festivals vary — add them yourself)."""
    fixed = [("Republic Day", 1, 26), ("Independence Day", 8, 15), ("Gandhi Jayanti", 10, 2)]
    existing = {(h.name, h.start_date) for h in db.scalars(select(Holiday).where(Holiday.school_id == user.school_id, Holiday.is_active.is_(True)))}
    added = []
    for name, m, d in fixed:
        day = date(year, m, d)
        if (name, day) not in existing:
            h = Holiday(school_id=user.school_id, name=name, start_date=day, end_date=day, kind="national", is_off=True)
            db.add(h)
            added.append(h)
    db.commit()
    return added



# ---------------------------------------------------------------- leave quotas (F8)
@router.get("/school/leave-quotas")
def leave_quotas(user: User = Depends(school_user), db: Session = Depends(get_db)):
    from ..deps import get_prefs
    q = get_prefs(db, user.school_id).leave_quotas
    db.commit()
    return q


@router.put("/school/leave-quotas")
def set_leave_quotas(body: dict, user: User = Depends(require_area("settings", "edit")), db: Session = Depends(get_db)):
    from ..deps import get_prefs
    clean = {}
    for k in ("casual", "sick", "earned"):
        v = body.get(k)
        if v is not None:
            if not isinstance(v, (int, float)) or v < 0 or v > 365:
                raise HTTPException(400, f"Invalid number for {k}")
            clean[k] = v
    p = get_prefs(db, user.school_id)
    p.leave_quotas = {**(p.leave_quotas or {}), **clean}
    audit(db, user, "settings.leave_quotas", str(p.leave_quotas))
    db.commit()
    return p.leave_quotas
