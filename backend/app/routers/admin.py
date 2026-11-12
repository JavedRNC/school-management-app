"""Super Admin: schools, plans, subscriptions, payments, people (privacy-masked), audit (F2, F25, F26)."""
import re
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import ratelimit
from ..auth import admin_only, audit, check_password_rules, hash_password
from ..db import get_db
from ..models import (AuditLog, ParentLink, Plan, PushToken, Role, School, SchoolClass, SubscriptionPayment, User, utcnow)
from ..perms import MODULES, clean_permissions
from ..schemas import (AuditOut, PaymentIn, PaymentOut, PlanIn, PlanOut, SchoolAdminUpdate, SchoolCreate, UserCreate,
                       UserOut, UserUpdate)
from ..subscription import monthly_estimate, school_status, subscription_summary
from ..util import today
from ..views import mask_phone, users_out

router = APIRouter(prefix="/admin", tags=["admin"])


def _school(db: Session, sid: int) -> School:
    s = db.get(School, sid)
    if not s:
        raise HTTPException(404, "School not found")
    return s


def _count_role(db: Session, sid: int, role: Role) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.school_id == sid, User.role == role, User.active.is_(True))) or 0


def support_access(s: School) -> bool:
    """The school's time-boxed permission for the admin to act inside it (principal grants it for 24 hours)."""
    return bool(s.support_access_until and s.support_access_until > utcnow())


def full_access(s: School) -> bool:
    return bool(s.share_contact_with_admin or (s.support_access_until and s.support_access_until > utcnow()))


def _school_row(db: Session, s: School) -> dict:
    plan = db.get(Plan, s.plan_id) if s.plan_id else None
    est = monthly_estimate(db, s)
    return {"id": s.id, "code": s.code, "name": s.name, "status": school_status(s), "plan": plan.name if plan else None,
            "students": est["students"], "teachers": _count_role(db, s.id, Role.teacher),
            "parents": _count_role(db, s.id, Role.parent), "monthly_amount": est["amount"], "is_free": s.is_free,
            "valid_until": s.valid_until, "trial_until": s.trial_until, "suspended": s.suspended}


# ---------------------------------------------------------------- overview
@router.get("/overview")
def overview(me: User = Depends(admin_only), db: Session = Depends(get_db)):
    schools = list(db.scalars(select(School)))
    rows = [_school_row(db, s) for s in schools]
    t = today()
    month_start = t.replace(day=1)
    revenue = db.scalar(select(func.coalesce(func.sum(SubscriptionPayment.amount), 0)).where(SubscriptionPayment.paid_on >= month_start)) or 0
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    expiring = [r for r in rows if r["valid_until"] and t <= r["valid_until"] <= t + timedelta(days=15) and not r["is_free"]]
    return {
        "schools": len(rows), "students": sum(r["students"] for r in rows), "teachers": sum(r["teachers"] for r in rows),
        "parents": sum(r["parents"] for r in rows), "by_status": by_status, "free_schools": sum(1 for r in rows if r["is_free"]),
        "revenue_this_month": revenue, "expected_monthly": round(sum(r["monthly_amount"] for r in rows), 2),
        "expiring_soon": expiring, "recent": sorted(rows, key=lambda r: -r["id"])[:5],
    }


@router.get("/modules")
def modules(me: User = Depends(admin_only)):
    return MODULES


# ---------------------------------------------------------------- schools
@router.get("/schools")
def list_schools(me: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [_school_row(db, s) for s in db.scalars(select(School).order_by(School.name))]


def new_school(db: Session, me: User, *, code: str, name: str, address: str = "", phone: str = "", board: str = "",
               plan_id: int | None = None, principal_name: str, principal_login_id: str = "principal",
               principal_password: str, principal_phone: str = "") -> School:
    """The one place a school + its principal login are created (admin form and onboarding approval both use it).
    Adds to the session and writes the audit entry; the caller commits."""
    code = code.strip().upper()
    if code == "ADMIN":
        raise HTTPException(400, "This code is reserved")
    if db.scalar(select(School).where(func.upper(School.code) == code)):
        raise HTTPException(409, "School code already in use")
    if plan_id and not db.get(Plan, plan_id):
        raise HTTPException(400, "Plan not found")
    check_password_rules(principal_password, principal_login_id)
    s = School(code=code, name=name.strip(), address=address.strip(), phone=phone.strip(),
               board=board.strip(), plan_id=plan_id, trial_until=today() + timedelta(days=30))
    db.add(s)
    db.flush()
    db.add(User(school_id=s.id, login_id=principal_login_id.strip(), name=principal_name.strip(), role=Role.principal,
                phone=principal_phone.strip(), password_hash=hash_password(principal_password), must_change_password=True))
    audit(db, me, "school.created", f"{s.code} {s.name}", school_id=s.id)
    return s


@router.post("/schools")
def create_school(body: SchoolCreate, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = new_school(db, me, code=body.code, name=body.name, address=body.address, phone=body.phone, board=body.board,
                   plan_id=body.plan_id, principal_name=body.principal_name, principal_login_id=body.principal_login_id,
                   principal_password=body.principal_password, principal_phone=body.principal_phone)
    db.commit()
    return school_detail(s.id, me, db)


@router.get("/schools/{sid}")
def school_detail(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _school(db, sid)
    return {**_school_row(db, s), "address": s.address, "phone": s.phone, "board": s.board, "admin_notes": s.admin_notes,
            "working_days": s.working_days, "subscription": subscription_summary(db, s),
            "custom_price": s.price_per_student is not None, "price_override": s.price_per_student,
            "min_override": s.min_monthly, "discount_pct": s.discount_pct,
            "free_until": s.free_until, "grace_days": s.grace_days, "max_students": s.max_students,
            "billing_cycle": s.billing_cycle, "custom_modules": s.custom_modules,
            "privacy": {"full_access": full_access(s), "share_contact_with_admin": s.share_contact_with_admin,
                        "support_access_until": s.support_access_until},
            "classes": db.scalar(select(func.count()).select_from(SchoolClass).where(SchoolClass.school_id == sid, SchoolClass.is_active.is_(True))) or 0}


@router.put("/schools/{sid}")
def update_school(sid: int, body: SchoolAdminUpdate, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _school(db, sid)
    data = body.model_dump(exclude_unset=True)
    if data.pop("use_plan_modules", None):
        s.custom_modules = None
    if data.pop("clear_custom_price", None):
        s.price_per_student = None
        s.min_monthly = None
    if "custom_modules" in data and data["custom_modules"] is not None:
        bad = set(data["custom_modules"]) - set(MODULES)
        if bad:
            raise HTTPException(400, f"Unknown modules: {', '.join(sorted(bad))}")
        data["custom_modules"] = sorted(set(data["custom_modules"]) | {"core"})
    if data.get("plan_id") and not db.get(Plan, data["plan_id"]):
        raise HTTPException(400, "Plan not found")
    for k, v in data.items():
        setattr(s, k, v.strip() if isinstance(v, str) else v)
    audit(db, me, "school.updated", ", ".join(sorted(data)), school_id=s.id)
    db.commit()
    return school_detail(sid, me, db)


@router.get("/schools/{sid}/classes")
def school_classes(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    _school(db, sid)
    counts = dict(db.execute(select(User.class_id, func.count()).where(
        User.school_id == sid, User.role == Role.student, User.active.is_(True)).group_by(User.class_id)).all())
    return [{"id": c.id, "name": c.name, "class_teacher_id": c.class_teacher_id, "student_count": counts.get(c.id, 0)}
            for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == sid, SchoolClass.is_active.is_(True)).order_by(SchoolClass.name))]


# ---------------------------------------------------------------- people (privacy-masked)
def _mask(out: UserOut, full: bool) -> UserOut:
    if full:
        return out
    out.phone = mask_phone(out.phone)
    if out.login_id and sum(ch.isdigit() for ch in out.login_id) >= 8:      # a parent's login ID is usually their mobile number
        out.login_id = mask_phone(out.login_id)
    out.email = (out.email[:2] + "•••@" + out.email.split("@")[-1]) if "@" in out.email else ""
    out.address = "Hidden — school hasn't shared contact details" if out.address else ""
    out.dob = None
    return out


@router.get("/schools/{sid}/users", response_model=list[UserOut])
def school_users(sid: int, role: Role | None = None, active: bool = True, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _school(db, sid)
    q = select(User).where(User.school_id == sid, User.active.is_(active)).order_by(User.role, User.class_id, User.roll_no, User.name)
    if role:
        q = q.where(User.role == role)
    users = list(db.scalars(q))
    full = full_access(s)
    audit(db, me, "admin.viewed_people", f"{role.value if role else 'all'} ({len(users)}) · {'full' if full else 'masked'}", school_id=sid)
    db.commit()
    return [_mask(o, full) for o in users_out(db, users)]


@router.post("/schools/{sid}/users", response_model=UserOut)
def admin_create_user(sid: int, body: UserCreate, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _school(db, sid)
    if body.role == Role.admin:
        raise HTTPException(400, "Can't create admins here")
    has_principal = db.scalar(select(func.count()).select_from(User).where(User.school_id == sid, User.role == Role.principal))   # archived ones count too
    if not support_access(s) and not (body.role == Role.principal and not has_principal):
        # Any login the admin creates could be used to read the school's data, so it needs the school's time-boxed support
        # access. The one exception is giving a school without a principal its first principal.
        # (Recovery for a locked-out principal is a password reset of that account: audited and visible to the school.)
        raise HTTPException(403, "Ask the school to allow support access (Privacy settings in the app) before adding people for it.")
    check_password_rules(body.password, body.login_id)
    if body.role == Role.student:
        c = db.get(SchoolClass, body.class_id or 0)
        if not c or c.school_id != sid:
            raise HTTPException(400, "Students need a class of this school")
    u = User(school_id=sid, login_id=body.login_id.strip(), name=body.name.strip(), role=body.role, password_hash=hash_password(body.password),
             must_change_password=True, phone=body.phone.strip(), email=body.email.strip(), address=body.address.strip(), dob=body.dob,
             blood_group=body.blood_group.strip(), class_id=body.class_id if body.role == Role.student else None,
             roll_no=body.roll_no if body.role == Role.student else None,
             permissions=clean_permissions(body.permissions, body.role) if body.role in (Role.vice_principal, Role.coordinator) else None,
             scope_class_ids=body.scope_class_ids if body.role == Role.coordinator else None)
    db.add(u)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Login ID already used in this school")
    if body.role == Role.parent and body.children_ids:
        _link_children(db, sid, u, body.children_ids)
    audit(db, me, "admin.user.created", f"{u.role.value} {u.name} ({u.login_id})", school_id=sid)
    db.commit()
    return _mask(users_out(db, [u])[0], full_access(s))


def _link_children(db: Session, sid: int, parent: User, ids: list[int]) -> None:
    valid = set(db.scalars(select(User.id).where(User.id.in_(ids or [0]), User.school_id == sid, User.role == Role.student)))
    if set(ids) - valid:
        raise HTTPException(400, "Some children are not students of this school")
    db.execute(delete(ParentLink).where(ParentLink.parent_id == parent.id))
    for k in ids:
        db.add(ParentLink(school_id=sid, parent_id=parent.id, student_id=k))


@router.put("/schools/{sid}/users/{uid}", response_model=UserOut)
def admin_update_user(sid: int, uid: int, body: UserUpdate, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _school(db, sid)
    u = db.get(User, uid)
    if not u or u.school_id != sid:
        raise HTTPException(404, "User not found")
    if u.role != Role.principal and not support_access(s):
        # changing or resetting any other login would be a side door into the school's data
        raise HTTPException(403, "Ask the school to allow support access (Privacy settings in the app) before changing its people.")
    data = body.model_dump(exclude_unset=True)
    full = full_access(s)
    if not full:  # without permission, admin can't overwrite masked contact fields
        for k in ("phone", "email", "address", "dob"):
            data.pop(k, None)
    pw = data.pop("password", None)
    if pw:
        check_password_rules(pw, data.get("login_id") or u.login_id)
        u.password_hash = hash_password(pw)
        ratelimit.forget_user(u.id)
        db.execute(delete(PushToken).where(PushToken.user_id == u.id))   # their phones sign in again
        u.must_change_password = True
        u.failed_logins, u.locked_until = 0, None
    kids = data.pop("children_ids", None)
    if u.role != Role.student:
        data.pop("class_id", None)
        data.pop("roll_no", None)
    if u.role in (Role.vice_principal, Role.coordinator) and "permissions" in data:
        data["permissions"] = clean_permissions(data["permissions"], u.role)
    if "active" in data:
        u.archived_at = None if data["active"] else utcnow()
    for k, v in data.items():
        setattr(u, k, v.strip() if isinstance(v, str) else v)
    if kids is not None and u.role == Role.parent:
        _link_children(db, sid, u, kids)
    audit(db, me, "admin.user.updated", f"{u.name} ({u.login_id}): {', '.join(sorted(set(data) | ({'password'} if pw else set())))}", school_id=sid)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Login ID already used in this school")
    return _mask(users_out(db, [u])[0], full)


# ---------------------------------------------------------------- plans
@router.get("/plans", response_model=list[PlanOut])
def list_plans(me: User = Depends(admin_only), db: Session = Depends(get_db)):
    return list(db.scalars(select(Plan).order_by(Plan.sort, Plan.id)))


def _plan_data(body: PlanIn) -> dict:
    bad = set(body.modules) - set(MODULES)
    if bad:
        raise HTTPException(400, f"Unknown modules: {', '.join(sorted(bad))}")
    return {"name": body.name.strip(), "modules": sorted(set(body.modules) | {"core"}),
            "price_per_student": body.price_per_student, "min_monthly": body.min_monthly}


@router.post("/plans", response_model=PlanOut)
def create_plan(body: PlanIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = Plan(**_plan_data(body), sort=(db.scalar(select(func.max(Plan.sort))) or 0) + 1)
    db.add(p)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A plan with this name exists")
    return p


@router.put("/plans/{pid}", response_model=PlanOut)
def update_plan(pid: int, body: PlanIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    p = db.get(Plan, pid)
    if not p:
        raise HTTPException(404, "Plan not found")
    for k, v in _plan_data(body).items():
        setattr(p, k, v)
    audit(db, me, "plan.updated", p.name, school_id=None)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A plan with this name exists")
    return p


# ---------------------------------------------------------------- payments
@router.get("/schools/{sid}/payments", response_model=list[PaymentOut])
def list_payments(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    _school(db, sid)
    return list(db.scalars(select(SubscriptionPayment).where(SubscriptionPayment.school_id == sid).order_by(SubscriptionPayment.paid_on.desc())))


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(y, m, day)
        except ValueError:
            continue
    return d


@router.post("/schools/{sid}/payments", response_model=PaymentOut)
def record_payment(sid: int, body: PaymentIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = _school(db, sid)
    p = SubscriptionPayment(school_id=sid, recorded_by=me.id, **body.model_dump(exclude={"extend_valid_until"}))
    db.add(p)
    if body.extend_valid_until:
        if body.period_to:
            s.valid_until = max(s.valid_until or body.period_to, body.period_to)
        else:
            base = max(s.valid_until or today(), today())
            s.valid_until = _add_months(base, 12 if s.billing_cycle == "yearly" else 1)
    audit(db, me, "subscription.payment", f"₹{body.amount:g} on {body.paid_on}", school_id=sid)
    db.commit()
    return p


# ---------------------------------------------------------------- audit
_PHONE = re.compile(r"(?<!\d)\d{10,13}(?!\d)")


@router.get("/audit", response_model=list[AuditOut])
def platform_audit(school_id: int | None = None, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    q = select(AuditLog).order_by(AuditLog.at.desc()).limit(300)
    if school_id:
        q = q.where(AuditLog.school_id == school_id)
    open_schools = {s.id for s in db.scalars(select(School)) if full_access(s)}
    out = []
    for a in db.scalars(q):
        o = AuditOut.model_validate(a)
        if a.school_id and a.school_id not in open_schools:      # phone numbers inside the text stay hidden like everywhere else
            o.detail = _PHONE.sub(lambda m: mask_phone(m.group(0)), o.detail or "")
        out.append(o)
    return out
