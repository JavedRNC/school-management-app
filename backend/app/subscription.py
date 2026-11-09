"""Subscription status, modules and billing estimate for a school (F26)."""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Plan, Role, School, User
from .util import today


def school_modules(db: Session, s: School) -> list[str]:
    if s.custom_modules is not None:
        mods = list(s.custom_modules)
    elif s.plan_id:
        p = db.get(Plan, s.plan_id)
        mods = list(p.modules) if p else []
    else:
        mods = []
    if "core" not in mods:
        mods.insert(0, "core")
    return mods


def is_free_now(s: School, d: date | None = None) -> bool:
    d = d or today()
    return s.is_free and (s.free_until is None or d <= s.free_until)


def school_status(s: School, d: date | None = None) -> str:
    """active | free | trial | grace | expired | suspended"""
    d = d or today()
    if s.suspended:
        return "suspended"
    if is_free_now(s, d):
        return "free"
    if s.trial_until and d <= s.trial_until:
        return "trial"
    if s.valid_until is None:
        return "active"  # not configured yet: never lock out
    if d <= s.valid_until:
        return "active"
    if d <= s.valid_until + timedelta(days=s.grace_days or 0):
        return "grace"
    return "expired"


def can_write(s: School) -> bool:
    return school_status(s) in ("active", "free", "trial", "grace")


def student_count(db: Session, school_id: int) -> int:
    return db.scalar(select(func.count()).select_from(User).where(
        User.school_id == school_id, User.role == Role.student, User.active.is_(True))) or 0


def monthly_estimate(db: Session, s: School) -> dict:
    p = db.get(Plan, s.plan_id) if s.plan_id else None
    pps = s.price_per_student if s.price_per_student is not None else (p.price_per_student if p else 0)
    minimum = s.min_monthly if s.min_monthly is not None else (p.min_monthly if p else 0)
    n = student_count(db, s.id)
    gross = max(n * pps, minimum)
    amount = 0.0 if is_free_now(s) else round(gross * (1 - (s.discount_pct or 0) / 100), 2)
    return {"students": n, "price_per_student": pps, "min_monthly": minimum, "discount_pct": s.discount_pct or 0,
            "gross": round(gross, 2), "amount": amount, "free": is_free_now(s)}


def subscription_summary(db: Session, s: School) -> dict:
    p = db.get(Plan, s.plan_id) if s.plan_id else None
    return {
        "status": school_status(s),
        "can_write": can_write(s),
        "plan": p.name if p else None,
        "plan_id": s.plan_id,
        "custom": s.custom_modules is not None,
        "modules": school_modules(db, s),
        "is_free": s.is_free, "free_until": s.free_until, "trial_until": s.trial_until,
        "valid_until": s.valid_until, "grace_days": s.grace_days, "max_students": s.max_students,
        "billing_cycle": s.billing_cycle,
        "estimate": monthly_estimate(db, s),
    }
