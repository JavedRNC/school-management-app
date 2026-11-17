"""Staff payroll (F36). Module: payroll. The principal sets salaries, prepares each month's payroll, locks it,
records how each person was paid, and every staff member sees their own payslips.

Prangan only keeps the record: it never moves money."""
import calendar
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import push
from ..auth import audit, require, require_module
from ..db import get_db
from ..deps import get_school
from ..models import Meta, PayrollConfig, PayrollRun, Payslip, Role, SalaryStructure, School, StaffAttendance, User, utcnow
from ..routers.leaves import approved_leave_dates
from ..subscription import school_modules
from ..util import SCHOOL_TZ, school_days, today

log = logging.getLogger("payroll")
router = APIRouter(prefix="/payroll", tags=["payroll"], dependencies=[Depends(require_module("payroll"))])

principal = require(Role.principal)
PAID_ROLES = (Role.principal, Role.vice_principal, Role.coordinator, Role.teacher)
ATTENDANCE_ROLES = (Role.teacher, Role.vice_principal, Role.coordinator)      # the people who check in
MODES = ("cash", "bank", "upi", "cheque")
MAX_AMOUNT = 10_000_000
MAX_LINES = 12
OLDEST_MONTHS = 24            # payroll can be prepared for this month or up to two years back


# ---------------------------------------------------------------- input
class Line(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    amount: float = Field(gt=0, le=MAX_AMOUNT)

    @field_validator("amount")
    @classmethod
    def _amount(cls, v: float) -> float:
        v = round(v, 2)
        if v < 0.01:
            raise ValueError("Enter an amount of at least 0.01")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Give this line a name")
        return v


def _lines(rows: list[Line]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for r in rows:
        key = r.name.lower()
        if key in seen:
            raise HTTPException(400, f"'{r.name}' is listed twice")
        seen.add(key)
        out.append({"name": r.name, "amount": round(r.amount, 2)})
    return out


class StructureIn(BaseModel):
    basic: float = Field(ge=0, le=MAX_AMOUNT)
    allowances: list[Line] = Field(default_factory=list, max_length=MAX_LINES)
    deductions: list[Line] = Field(default_factory=list, max_length=MAX_LINES)
    note: str = Field(default="", max_length=200)


class ConfigIn(BaseModel):
    lop_enabled: bool = False
    lop_basis: str = Field(default="calendar", pattern="^(calendar|working)$")
    slip_prefix: str = Field(default="SAL", min_length=1, max_length=12, pattern=r"^[A-Za-z0-9/-]+$")


class RunIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class SlipIn(BaseModel):
    lop_days: float | None = Field(default=None, ge=0, le=31)
    extra_earnings: list[Line] = Field(default_factory=list, max_length=MAX_LINES)
    extra_deductions: list[Line] = Field(default_factory=list, max_length=MAX_LINES)
    note: str = Field(default="", max_length=300)


class PayIn(BaseModel):
    paid_on: date
    mode: str
    reference: str = Field(default="", max_length=80)


class PayManyIn(PayIn):
    payslip_ids: list[int] | None = Field(default=None, max_length=2000)


class UndoIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


# ---------------------------------------------------------------- helpers
def money(x: float) -> float:
    return round(float(x) + 0.0, 2)


def rupees(x: float) -> float:
    """Whole rupees, halves rounded up (the same rule the portal and the app use for their preview)."""
    return float(Decimal(str(x)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def total(lines: list | None) -> float:
    return money(sum(float(x.get("amount", 0)) for x in (lines or [])))


def school_date(at: datetime | None) -> date | None:
    """A stored time (UTC) as the school's calendar day."""
    return at.replace(tzinfo=timezone.utc).astimezone(SCHOOL_TZ).date() if at else None


def left_on(u: User) -> date | None:
    """The day a removed staff member left; None while they are with the school."""
    return None if u.active else school_date(u.archived_at)


def month_bounds(month: str) -> tuple[date, date]:
    y, m = int(month[:4]), int(month[5:7])
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def month_label(month: str) -> str:
    y, m = int(month[:4]), int(month[5:7])
    return f"{calendar.month_name[m]} {y}"


def get_config(db: Session, school_id: int) -> PayrollConfig:
    """The school's payroll settings, or the defaults when none were saved yet (reading never writes)."""
    return db.get(PayrollConfig, school_id) or PayrollConfig(school_id=school_id, lop_enabled=False, lop_basis="calendar", slip_prefix="SAL")


def _config_out(db: Session, school: School, cfg: PayrollConfig) -> dict:
    return {"lop_enabled": cfg.lop_enabled, "lop_basis": cfg.lop_basis, "slip_prefix": cfg.slip_prefix,
            "attendance_available": "staff_attendance" in school_modules(db, school)}


def _structure_out(s: SalaryStructure | None) -> dict | None:
    if not s:
        return None
    gross = money(s.basic + total(s.allowances))
    ded = total(s.deductions)
    return {"basic": s.basic, "allowances": s.allowances or [], "deductions": s.deductions or [], "note": s.note,
            "gross": gross, "total_deductions": ded, "net": money(gross - ded), "updated_at": s.updated_at}


def _slip_out(p: Payslip, run: PayrollRun) -> dict:
    return {"id": p.id, "run_id": p.run_id, "month": run.month, "month_label": month_label(run.month), "run_status": run.status,
            "user_id": p.user_id, "slip_no": p.slip_no, "name": p.name, "role": p.role, "login_id": p.login_id,
            "basic": p.basic, "allowances": p.allowances or [], "deductions": p.deductions or [],
            "extra_earnings": p.extra_earnings or [], "extra_deductions": p.extra_deductions or [],
            "absent_days": p.absent_days, "lop_days": p.lop_days, "lop_manual": p.lop_manual, "lop_amount": p.lop_amount,
            "gross": p.gross, "total_deductions": p.total_deductions, "net": p.net, "note": p.note,
            "status": p.status, "paid_on": p.paid_on, "mode": p.mode, "reference": p.reference,
            "days_in_month": run.days_in_month, "working_days": run.working_days, "lop_basis": run.lop_basis}


def _run_out(run: PayrollRun, slips: list[Payslip]) -> dict:
    paid = [p for p in slips if p.status == "paid"]
    return {"id": run.id, "month": run.month, "month_label": month_label(run.month), "status": run.status,
            "days_in_month": run.days_in_month, "working_days": run.working_days, "counted_until": run.counted_until,
            "lop_enabled": run.lop_enabled, "lop_basis": run.lop_basis, "created_at": run.created_at,
            "finalized_at": run.finalized_at, "people": len(slips), "gross": money(sum(p.gross for p in slips)),
            "total_deductions": money(sum(p.total_deductions for p in slips)), "net": money(sum(p.net for p in slips)),
            "paid_count": len(paid), "paid_amount": money(sum(p.net for p in paid)),
            "unpaid_count": len(slips) - len(paid), "unpaid_amount": money(sum(p.net for p in slips if p.status != "paid"))}


def _own_run(db: Session, run_id: int, user: User, lock: bool = False) -> PayrollRun:
    """lock=True holds the month's row until the request ends, so two changes to the same month (two phones, two tabs)
    run one after the other and each sees what the other did."""
    q = select(PayrollRun).where(PayrollRun.id == run_id, PayrollRun.school_id == user.school_id)
    if lock:
        q = q.with_for_update().execution_options(populate_existing=True)
    run = db.scalar(q)
    if not run:
        raise HTTPException(404, "Payroll not found")
    return run


def _slips(db: Session, run_id: int) -> list[Payslip]:
    return list(db.scalars(select(Payslip).where(Payslip.run_id == run_id).order_by(Payslip.name, Payslip.id)))


def _own_slip(db: Session, slip_id: int, user: User, lock: bool = False) -> tuple[Payslip, PayrollRun]:
    p = db.get(Payslip, slip_id)
    if not p or p.school_id != user.school_id:
        raise HTTPException(404, "Payslip not found")
    run = _own_run(db, p.run_id, user, lock)
    if lock:                          # read again now that the month is held: another request may just have changed or removed it
        p = db.scalar(select(Payslip).where(Payslip.id == slip_id).execution_options(populate_existing=True))
        if not p:
            raise HTTPException(404, "Payslip not found")
    return p, run


def _slip_seq(slip_no: str | None) -> int:
    tail = (slip_no or "").rsplit("/", 1)[-1]
    return int(tail) if tail.isdigit() else 0


def _draft(run: PayrollRun) -> None:
    if run.status != "draft":
        raise HTTPException(409, "This payroll is locked. Reopen it to make changes.")


def _settle(p: Payslip, run: PayrollRun) -> None:
    """Work out one payslip's totals from its lines."""
    fixed = money(p.basic + total(p.allowances))
    basis = run.days_in_month if run.lop_basis == "calendar" else run.working_days
    p.lop_days = min(float(p.lop_days or 0), float(basis)) if basis else 0.0
    p.gross = money(fixed + total(p.extra_earnings))
    other = money(total(p.deductions) + total(p.extra_deductions))
    cut = rupees(fixed * p.lop_days / basis) if basis and p.lop_days else 0.0
    p.lop_amount = money(min(cut, max(p.gross - other, 0.0)))        # the cut for absence never takes a payslip below zero
    p.total_deductions = money(other + p.lop_amount)
    p.net = money(p.gross - p.total_deductions)


def _absent_days(db: Session, school: School, staff: list[User], start: date, until: date) -> dict[int, float]:
    """School days with no check-in and no approved leave, per person, from the day their account was made."""
    ids = [u.id for u in staff if u.role in ATTENDANCE_ROLES]
    if not ids or until < start:
        return {}
    days = school_days(db, school, start, until)
    present: dict[int, set[date]] = {}
    for a in db.scalars(select(StaffAttendance).where(StaffAttendance.school_id == school.id, StaffAttendance.date >= start,
                                                      StaffAttendance.date <= until, StaffAttendance.user_id.in_(ids))):
        if a.check_in_at:
            present.setdefault(a.user_id, set()).add(a.date)
    leave = approved_leave_dates(db, ids, start, until)
    out: dict[int, float] = {}
    for u in staff:
        if u.id not in ids:
            continue
        joined = school_date(u.created_at) or start
        left = left_on(u) or until                # removed staff are not "absent" after they left: those days are unpaid, see _build
        mine, lv = present.get(u.id, set()), leave.get(u.id, set())
        out[u.id] = float(sum(1 for d in days if joined <= d <= left and d not in mine and d not in lv))
    return out


LEFT_NOTE = "Left the school on "


def _days_after_leaving(db: Session, school: School, u: User | None, end: date, basis: str) -> float:
    """Someone who left during the month is not paid for the days after leaving."""
    gone = left_on(u) if u else None
    if not gone or gone >= end:
        return 0.0
    return float((end - gone).days if basis == "calendar" else len(school_days(db, school, gone + timedelta(days=1), end)))


def _build(db: Session, run: PayrollRun, school: School) -> None:
    """Create or refresh every payslip of a draft from today's salaries and attendance.
    Lines added by hand for this month (extras, a hand-set number of unpaid days, the note) are kept.
    Someone removed from the school during or after this month is still paid for it."""
    start, end = month_bounds(run.month)
    cfg = get_config(db, school.id)
    use_att = cfg.lop_enabled and "staff_attendance" in school_modules(db, school)
    t = today()
    until = end if end < t else t - timedelta(days=1)       # today is still going on: people may yet check in
    run.days_in_month = (end - start).days + 1
    run.working_days = len(school_days(db, school, start, end))
    run.counted_until = until if until >= start else None
    run.lop_enabled, run.lop_basis = bool(use_att), cfg.lop_basis
    staff = [u for u in db.scalars(select(User).where(User.school_id == school.id, User.role.in_(PAID_ROLES)))
             if u.active or (left_on(u) and left_on(u) >= start)]
    by_id = {u.id: u for u in staff}
    structures = {s.user_id: s for s in db.scalars(select(SalaryStructure).where(SalaryStructure.school_id == school.id))}
    payable = {uid: s for uid, s in structures.items() if uid in by_id and money(s.basic + total(s.allowances)) > 0}
    absent = _absent_days(db, school, [by_id[i] for i in payable], start, until) if use_att else {}
    existing = {p.user_id: p for p in db.scalars(select(Payslip).where(Payslip.run_id == run.id))}
    for uid, p in existing.items():
        if uid not in payable:
            db.delete(p)
    for uid, s in payable.items():
        u = by_id[uid]
        p = existing.get(uid)
        if not p:
            p = Payslip(school_id=school.id, run_id=run.id, user_id=uid, extra_earnings=[], extra_deductions=[], lop_days=0, note="")
            db.add(p)
        p.name, p.role, p.login_id = u.name, u.role.value, u.login_id
        p.basic, p.allowances, p.deductions = s.basic, list(s.allowances or []), list(s.deductions or [])
        p.absent_days = absent.get(uid, 0.0)
        gone = left_on(u)
        if (p.note or "").startswith(LEFT_NOTE):          # our own note: written afresh each time, so it never outlives its reason
            p.note = ""
        if gone and gone <= end and not p.note:
            p.note = f"{LEFT_NOTE}{gone.day} {calendar.month_name[gone.month]} {gone.year}"
        if not p.lop_manual:
            p.lop_days = (p.absent_days if use_att else 0.0) + _days_after_leaving(db, school, u, end, cfg.lop_basis)
        _settle(p, run)
    db.flush()


# ---------------------------------------------------------------- settings and salaries
@router.get("/config")
def read_config(user: User = Depends(principal), db: Session = Depends(get_db)):
    return _config_out(db, get_school(db, user), get_config(db, user.school_id))


@router.put("/config")
def save_config(body: ConfigIn, user: User = Depends(principal), db: Session = Depends(get_db)):
    school = get_school(db, user)
    if body.lop_enabled and "staff_attendance" not in school_modules(db, school):
        raise HTTPException(400, "Pay can be cut for absent days only when Staff attendance is part of your plan")
    cfg = db.get(PayrollConfig, user.school_id)
    if not cfg:
        cfg = PayrollConfig(school_id=user.school_id)
        db.add(cfg)
    cfg.lop_enabled, cfg.lop_basis, cfg.slip_prefix = body.lop_enabled, body.lop_basis, body.slip_prefix.upper()
    audit(db, user, "payroll.settings", f"cut pay for absence: {'on' if body.lop_enabled else 'off'} ({body.lop_basis} days), slip prefix {cfg.slip_prefix}")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "These settings were just saved from another screen. Open them again.")
    return _config_out(db, school, cfg)


@router.get("/staff")
def staff_salaries(user: User = Depends(principal), db: Session = Depends(get_db)):
    staff = list(db.scalars(select(User).where(User.school_id == user.school_id, User.role.in_(PAID_ROLES),
                                               User.active.is_(True)).order_by(User.name, User.id)))
    structures = {s.user_id: s for s in db.scalars(select(SalaryStructure).where(SalaryStructure.school_id == user.school_id))}
    rows = [{"user_id": u.id, "name": u.name, "role": u.role.value, "login_id": u.login_id,
             "salary": _structure_out(structures.get(u.id))} for u in staff]
    with_pay = [r["salary"] for r in rows if r["salary"] and r["salary"]["gross"] > 0]
    return {"rows": rows, "people": len(rows), "with_salary": len(with_pay),
            "monthly_gross": money(sum(s["gross"] for s in with_pay)), "monthly_net": money(sum(s["net"] for s in with_pay))}


@router.put("/staff/{user_id}")
def set_salary(user_id: int, body: StructureIn, user: User = Depends(principal), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target or target.school_id != user.school_id or target.role not in PAID_ROLES or not target.active:
        raise HTTPException(404, "Staff member not found")
    allowances, deductions = _lines(body.allowances), _lines(body.deductions)
    gross = money(body.basic + total(allowances))
    if total(deductions) > gross:
        raise HTTPException(400, "Deductions can't be more than the pay")
    s = db.scalar(select(SalaryStructure).where(SalaryStructure.user_id == target.id))
    if not s:
        s = SalaryStructure(school_id=user.school_id, user_id=target.id)
        db.add(s)
    s.basic, s.allowances, s.deductions, s.note = money(body.basic), allowances, deductions, body.note.strip()
    s.updated_by, s.updated_at = user.id, utcnow()
    audit(db, user, "payroll.salary_set", f"{target.name} ({target.login_id})")      # amounts stay out of the activity log
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This salary was just saved from another screen. Open it again.")
    return {"user_id": target.id, "salary": _structure_out(s)}


# ---------------------------------------------------------------- monthly payroll
@router.get("/runs")
def list_runs(user: User = Depends(principal), db: Session = Depends(get_db)):
    runs = list(db.scalars(select(PayrollRun).where(PayrollRun.school_id == user.school_id).order_by(PayrollRun.month.desc())))
    by_run: dict[int, list[Payslip]] = {}
    for p in db.scalars(select(Payslip).where(Payslip.school_id == user.school_id)):
        by_run.setdefault(p.run_id, []).append(p)
    t = today()
    return {"runs": [_run_out(r, by_run.get(r.id, [])) for r in runs], "this_month": f"{t.year:04d}-{t.month:02d}"}


@router.post("/runs")
def create_run(body: RunIn, user: User = Depends(principal), db: Session = Depends(get_db)):
    t = today()
    start, _ = month_bounds(body.month)
    if start > t:
        raise HTTPException(400, "Payroll can't be prepared for a month that hasn't started")
    if (t.year - start.year) * 12 + (t.month - start.month) > OLDEST_MONTHS:
        raise HTTPException(400, "That month is too far back")
    if db.scalar(select(PayrollRun.id).where(PayrollRun.school_id == user.school_id, PayrollRun.month == body.month)):
        raise HTTPException(409, f"Payroll for {month_label(body.month)} already exists")
    run = PayrollRun(school_id=user.school_id, month=body.month, status="draft", created_by=user.id)
    db.add(run)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Payroll for {month_label(body.month)} already exists")
    _build(db, run, get_school(db, user))
    slips = _slips(db, run.id)
    if not slips:
        db.rollback()
        raise HTTPException(400, "Set a salary for at least one staff member first")
    audit(db, user, "payroll.prepared", f"{month_label(body.month)}: {len(slips)} people")
    db.commit()
    return {"run": _run_out(run, slips), "payslips": [_slip_out(p, run) for p in slips]}


@router.get("/runs/{run_id}")
def read_run(run_id: int, user: User = Depends(principal), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user)
    slips = _slips(db, run.id)
    return {"run": _run_out(run, slips), "payslips": [_slip_out(p, run) for p in slips]}


@router.post("/runs/{run_id}/recalculate")
def recalculate(run_id: int, user: User = Depends(principal), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user, lock=True)
    _draft(run)
    _build(db, run, get_school(db, user))
    slips = _slips(db, run.id)
    if not slips:
        db.rollback()
        raise HTTPException(400, "Nobody has a salary set any more. Delete this payroll instead.")
    audit(db, user, "payroll.recalculated", month_label(run.month))
    db.commit()
    return {"run": _run_out(run, slips), "payslips": [_slip_out(p, run) for p in slips]}


@router.delete("/runs/{run_id}")
def delete_run(run_id: int, user: User = Depends(principal), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user, lock=True)
    _draft(run)
    for p in _slips(db, run.id):
        db.delete(p)
    db.flush()
    mark = db.get(Meta, f"payroll_seq:{run.id}")
    if mark:
        db.delete(mark)
    db.delete(run)
    audit(db, user, "payroll.deleted", month_label(run.month))
    db.commit()
    return {"ok": True}


@router.post("/runs/{run_id}/finalize")
def finalize(run_id: int, user: User = Depends(principal), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user, lock=True)
    _draft(run)
    _, end = month_bounds(run.month)
    slips = _slips(db, run.id)
    if not slips:
        raise HTTPException(400, "There are no payslips in this payroll")
    prefix = get_config(db, user.school_id).slip_prefix or "SAL"
    mark = db.get(Meta, f"payroll_seq:{run.id}")      # the highest number ever given in this month, so none is ever reused
    last = max([_slip_seq(p.slip_no) for p in slips] + [int(mark.value) if mark else 0])
    for p in slips:
        _settle(p, run)
        if p.net < 0:
            db.rollback()
            raise HTTPException(400, f"{p.name}'s deductions are more than the pay. Fix that payslip first.")
        if not p.slip_no:                 # a number, once given, stays with that person even if the month is reopened
            last += 1
            p.slip_no = f"{prefix}/{run.month.replace('-', '')}/{last:03d}"
    if mark:
        mark.value = str(last)
    else:
        db.add(Meta(key=f"payroll_seq:{run.id}", value=str(last)))
    run.status, run.finalized_by, run.finalized_at = "final", user.id, utcnow()
    audit(db, user, "payroll.locked", f"{month_label(run.month)}: {len(slips)} payslips" + ("" if today() >= end else " (before the month ended)"))
    db.commit()
    return {"run": _run_out(run, slips), "payslips": [_slip_out(p, run) for p in slips]}


@router.post("/runs/{run_id}/reopen")
def reopen(run_id: int, user: User = Depends(principal), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user, lock=True)
    if run.status != "final":
        raise HTTPException(409, "This payroll is already open")
    slips = _slips(db, run.id)
    if any(p.status == "paid" for p in slips):
        raise HTTPException(409, "Some salaries are already marked paid. Undo those payments first.")
    run.status, run.finalized_by, run.finalized_at = "draft", None, None
    audit(db, user, "payroll.reopened", month_label(run.month))
    db.commit()
    return {"run": _run_out(run, slips), "payslips": [_slip_out(p, run) for p in slips]}


# ---------------------------------------------------------------- payslips
@router.put("/payslips/{slip_id}")
def edit_slip(slip_id: int, body: SlipIn, user: User = Depends(principal), db: Session = Depends(get_db)):
    p, run = _own_slip(db, slip_id, user, lock=True)
    _draft(run)
    p.extra_earnings, p.extra_deductions, p.note = _lines(body.extra_earnings), _lines(body.extra_deductions), body.note.strip()
    if body.lop_days is not None:
        basis = run.days_in_month if run.lop_basis == "calendar" else run.working_days
        if body.lop_days > basis:
            raise HTTPException(400, f"Unpaid days can't be more than {basis}")
        if round(body.lop_days * 2) != body.lop_days * 2:
            raise HTTPException(400, "Use whole or half days")
        _, end = month_bounds(run.month)
        auto = (p.absent_days if run.lop_enabled else 0.0) + _days_after_leaving(db, get_school(db, user), db.get(User, p.user_id), end, run.lop_basis)
        if body.lop_days == auto:                         # back to the worked-out number: follow it again from now on
            p.lop_manual = False
        elif body.lop_days != p.lop_days:                 # a number changed by hand is kept when the month is worked out again
            p.lop_manual = True
        p.lop_days = body.lop_days
    _settle(p, run)
    if p.net < 0:
        db.rollback()
        raise HTTPException(400, "Deductions can't be more than the pay")
    audit(db, user, "payroll.payslip_edited", f"{p.name}, {month_label(run.month)}")
    db.commit()
    return _slip_out(p, run)


def _mark_paid(p: Payslip, body: PayIn, user: User) -> None:
    p.status, p.paid_on, p.mode, p.reference, p.paid_by = "paid", body.paid_on, body.mode, body.reference.strip(), user.id


def _check_pay(body: PayIn, run: PayrollRun) -> None:
    if run.status != "final":
        raise HTTPException(409, "Lock the payroll before marking salaries as paid")
    if body.mode not in MODES:
        raise HTTPException(400, "Choose how it was paid: cash, bank transfer, UPI or cheque")
    start, _ = month_bounds(run.month)
    if body.paid_on > today():
        raise HTTPException(400, "The payment date can't be in the future")
    if body.paid_on < start:
        raise HTTPException(400, f"The payment date can't be before {month_label(run.month)}")


@router.post("/payslips/{slip_id}/pay")
def pay_one(slip_id: int, body: PayIn, user: User = Depends(principal), db: Session = Depends(get_db)):
    p, run = _own_slip(db, slip_id, user, lock=True)
    _check_pay(body, run)
    if p.status == "paid":
        raise HTTPException(409, "This salary is already marked paid")
    _mark_paid(p, body, user)
    audit(db, user, "payroll.paid", f"{p.name}, {month_label(run.month)}, {body.mode}")
    db.commit()
    push.notify([p.user_id], "Salary paid", f"Your salary for {month_label(run.month)} is marked as paid.", {"type": "payslip", "id": p.id})
    return _slip_out(p, run)


@router.post("/runs/{run_id}/pay")
def pay_many(run_id: int, body: PayManyIn, user: User = Depends(principal), db: Session = Depends(get_db)):
    run = _own_run(db, run_id, user, lock=True)
    _check_pay(body, run)
    slips = [p for p in _slips(db, run.id) if p.status != "paid"]
    if body.payslip_ids is not None:
        wanted = set(body.payslip_ids)
        slips = [p for p in slips if p.id in wanted]
    if not slips:
        raise HTTPException(409, "There is nothing left to mark as paid")
    for p in slips:
        _mark_paid(p, body, user)
    audit(db, user, "payroll.paid", f"{month_label(run.month)}: {len(slips)} salaries, {body.mode}")
    db.commit()
    push.notify([p.user_id for p in slips], "Salary paid", f"Your salary for {month_label(run.month)} is marked as paid.", {"type": "payslip"})
    all_slips = _slips(db, run.id)
    return {"paid": len(slips), "run": _run_out(run, all_slips), "payslips": [_slip_out(p, run) for p in all_slips]}


@router.post("/payslips/{slip_id}/undo-payment")
def undo_payment(slip_id: int, body: UndoIn, user: User = Depends(principal), db: Session = Depends(get_db)):
    p, run = _own_slip(db, slip_id, user, lock=True)
    if p.status != "paid":
        raise HTTPException(409, "This salary isn't marked paid")
    audit(db, user, "payroll.payment_undone", f"{p.name}, {month_label(run.month)} (was {p.mode} on {p.paid_on}): {body.reason.strip()}")
    p.status, p.paid_on, p.mode, p.reference, p.paid_by = "unpaid", None, "", "", None
    db.commit()
    return _slip_out(p, run)


# ---------------------------------------------------------------- staff: my payslips
@router.get("/me")
def my_payslips(user: User = Depends(require(*PAID_ROLES)), db: Session = Depends(get_db)):
    rows = db.execute(select(Payslip, PayrollRun).join(PayrollRun, PayrollRun.id == Payslip.run_id)
                      .where(Payslip.user_id == user.id, Payslip.school_id == user.school_id, PayrollRun.status == "final")
                      .order_by(PayrollRun.month.desc()).limit(36)).all()
    school = get_school(db, user)
    return {"school": {"name": school.name, "address": school.address}, "payslips": [_slip_out(p, r) for p, r in rows]}


@router.get("/payslips/{slip_id}")
def read_slip(slip_id: int, user: User = Depends(require(*PAID_ROLES)), db: Session = Depends(get_db)):
    p, run = _own_slip(db, slip_id, user)
    if user.role != Role.principal and (p.user_id != user.id or run.status != "final"):
        raise HTTPException(404, "Payslip not found")
    school = get_school(db, user)
    return {"school": {"name": school.name, "address": school.address, "phone": school.phone}, "payslip": _slip_out(p, run)}
