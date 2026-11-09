"""Fees (F10/F11/F14): monthly + transport fees, extra-fee rollouts, payments, receipts, UPI claims, reports.

Ledger model: every charge is a FeeItem on a student; every payment is a FeePayment whose FeeAllocations
settle items. Only *confirmed* payments count. Receipts are never edited — a wrong one is cancelled
(balances come back) and a new one is issued.
"""
import calendar
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import audit, current_user, require, require_area, require_module
from ..db import get_db
from ..deps import children, get_school, owned, resolve_student
from ..models import (FeeAllocation, FeeBatch, FeeConfig, FeeItem, FeePayment, ParentLink, ReceiptCounter, Role,
                      Route, School, SchoolClass, StudentTransport, User, utcnow)
from ..perms import RANK, level_of
from ..subscription import school_modules
from ..util import today

router = APIRouter(prefix="/fees", tags=["fees"], dependencies=[Depends(require_module("fees"))])

PERIOD = r"^\d{4}-(0[1-9]|1[0-2])$"
MODES = ("cash", "upi", "cheque", "bank", "online")
KIND_LABEL = {"monthly": "Tuition fee", "transport": "Transport fee", "extra": "Extra fee", "fine": "Other charge"}


# ================================================================ helpers
def r2(x: float) -> float:
    return round(float(x or 0) + 1e-9, 2)


def period_of(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def month_label(p: str) -> str:
    y, m = p.split("-")
    return f"{calendar.month_abbr[int(m)]} {y}"


def academic_year(d: date) -> str:
    y = d.year if d.month >= 4 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


def due_date_for(period: str, due_day: int) -> date:
    y, m = map(int, period.split("-"))
    return date(y, m, min(max(due_day, 1), calendar.monthrange(y, m)[1]))


_ONES = ("", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
         "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen")
_TENS = ("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")


def _two(n: int) -> str:
    return _ONES[n] if n < 20 else (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else ""))


def _three(n: int) -> str:
    h, rest = divmod(n, 100)
    return " ".join(x for x in ((_ONES[h] + " Hundred") if h else "", _two(rest) if rest else "") if x)


def amount_in_words(amount: float) -> str:
    """Indian numbering: 1,25,000.50 → 'Rupees One Lakh Twenty Five Thousand and Fifty Paise Only'."""
    rupees = int(round(amount * 100)) // 100
    paise = int(round(amount * 100)) % 100
    if rupees == 0 and paise == 0:
        return "Rupees Zero Only"
    parts = []
    crore, rupees = divmod(rupees, 10_000_000)
    lakh, rupees = divmod(rupees, 100_000)
    thousand, rupees = divmod(rupees, 1000)
    if crore:
        parts.append((amount_in_words(crore)[7:-5] if crore >= 100 else _two(crore)) + " Crore")
    if lakh:
        parts.append(_two(lakh) + " Lakh")
    if thousand:
        parts.append(_two(thousand) + " Thousand")
    if rupees:
        parts.append(_three(rupees))
    words = "Rupees " + " ".join(parts) if parts else "Rupees Zero"
    if paise:
        words += f" and {_two(paise)} Paise"
    return words + " Only"


def get_config(db: Session, school_id: int) -> FeeConfig:
    cfg = db.get(FeeConfig, school_id)
    if not cfg:
        cfg = FeeConfig(school_id=school_id, monthly_amount=0, class_amounts={}, route_amounts={}, due_day=10,
                        auto_generate=True, upi_id="", upi_name="", receipt_prefix="", receipt_note="", generated_months=[])
        db.add(cfg)
        db.flush()
    return cfg


def active_students(db: Session, school_id: int, class_ids: set[int] | None = None) -> list[User]:
    q = select(User).where(User.school_id == school_id, User.role == Role.student, User.active.is_(True))
    if class_ids is not None:
        q = q.where(User.class_id.in_(class_ids or {-1}))
    return list(db.scalars(q.order_by(User.class_id, User.roll_no, User.name)))


def monthly_amount_for(cfg: FeeConfig, class_id: int | None) -> float:
    ov = (cfg.class_amounts or {}).get(str(class_id)) if class_id else None
    return r2(ov if ov is not None else cfg.monthly_amount)


def generate_month(db: Session, school: School, period: str, user: User | None, preview: bool = False) -> dict:
    """Idempotent: adds the missing tuition (+ transport) charges for `period` for every active student."""
    cfg = get_config(db, school.id)
    due = due_date_for(period, cfg.due_day)
    studs = active_students(db, school.id)
    have = set(db.execute(select(FeeItem.student_id, FeeItem.kind).where(
        FeeItem.school_id == school.id, FeeItem.period == period, FeeItem.kind.in_(("monthly", "transport")))).all())
    transport_on = "transport" in school_modules(db, school)
    rides = {t.student_id: t.route_id for t in db.scalars(select(StudentTransport).where(StudentTransport.school_id == school.id))} \
        if transport_on else {}
    route_names = {r.id: r.name for r in db.scalars(select(Route).where(Route.school_id == school.id))} if rides else {}
    new = []
    for s in studs:
        amt = monthly_amount_for(cfg, s.class_id)
        if amt > 0 and (s.id, "monthly") not in have:
            new.append(FeeItem(school_id=school.id, student_id=s.id, kind="monthly", period=period,
                               title=f"Tuition fee · {month_label(period)}", amount=amt, due_date=due,
                               created_by=user.id if user else None))
        rid = rides.get(s.id)
        ramt = r2((cfg.route_amounts or {}).get(str(rid), 0)) if rid else 0
        if ramt > 0 and (s.id, "transport") not in have:
            new.append(FeeItem(school_id=school.id, student_id=s.id, kind="transport", period=period,
                               title=f"Transport fee · {route_names.get(rid, 'Bus')} · {month_label(period)}",
                               amount=ramt, due_date=due, created_by=user.id if user else None))
    out = {"period": period, "label": month_label(period), "new_items": len(new),
           "new_amount": r2(sum(i.amount for i in new)), "students": len({i.student_id for i in new}), "due_date": due}
    if preview:
        return out
    db.add_all(new)
    if period not in (cfg.generated_months or []):
        cfg.generated_months = sorted({*(cfg.generated_months or []), period})
    if user:
        audit(db, user, "fees.month.generated", f"{month_label(period)}: {len(new)} charges, ₹{out['new_amount']}")
    db.flush()
    return out


def ensure_current(db: Session, school: School) -> None:
    """Lazily bill the current month once (auto_generate on, amounts configured)."""
    cfg = db.get(FeeConfig, school.id)
    if not cfg or not cfg.auto_generate:
        return
    p = period_of(today())
    if p in (cfg.generated_months or []) or (cfg.start_month and p < cfg.start_month):
        return
    if cfg.monthly_amount <= 0 and not any(v > 0 for v in (cfg.class_amounts or {}).values()) \
            and not any(v > 0 for v in (cfg.route_amounts or {}).values()):
        return
    generate_month(db, school, p, None)
    db.commit()


def paid_map(db: Session, item_ids: list[int] | None = None, school_id: int | None = None) -> dict[int, float]:
    q = (select(FeeAllocation.item_id, func.sum(FeeAllocation.amount))
         .join(FeePayment, FeePayment.id == FeeAllocation.payment_id)
         .where(FeePayment.status == "confirmed").group_by(FeeAllocation.item_id))
    if item_ids is not None:
        q = q.where(FeeAllocation.item_id.in_(item_ids or [-1]))
    if school_id is not None:
        q = q.where(FeePayment.school_id == school_id)
    return {i: r2(a) for i, a in db.execute(q).all()}


def item_status(balance: float, paid: float, due: date | None, t: date) -> str:
    if balance <= 0:
        return "paid"
    if due and due < t:
        return "overdue"
    return "partial" if paid > 0 else "due"


def items_out(db: Session, items: list[FeeItem]) -> list[dict]:
    pm = paid_map(db, [i.id for i in items])
    t = today()
    out = []
    for i in items:
        paid = pm.get(i.id, 0.0)
        bal = r2(max(i.amount - paid, 0))
        out.append({"id": i.id, "kind": i.kind, "period": i.period, "title": i.title, "amount": r2(i.amount),
                    "paid": paid, "balance": bal, "due_date": i.due_date, "status": item_status(bal, paid, i.due_date, t),
                    "batch_id": i.batch_id})
    return out


def student_items(db: Session, student_id: int) -> list[FeeItem]:
    return list(db.scalars(select(FeeItem).where(FeeItem.student_id == student_id, FeeItem.is_active.is_(True))
                           .order_by(FeeItem.due_date.is_(None), FeeItem.due_date, FeeItem.id)))


def balances(db: Session, school_id: int, student_ids: set[int] | None = None) -> dict[int, dict]:
    """student_id → {charged, paid, outstanding, overdue, oldest_due, overdue_items}."""
    q = select(FeeItem).where(FeeItem.school_id == school_id, FeeItem.is_active.is_(True))
    if student_ids is not None:
        q = q.where(FeeItem.student_id.in_(student_ids or {-1}))
    items = list(db.scalars(q))
    pm = paid_map(db, school_id=school_id)
    t = today()
    out: dict[int, dict] = {}
    for i in items:
        b = out.setdefault(i.student_id, {"charged": 0.0, "paid": 0.0, "outstanding": 0.0, "overdue": 0.0,
                                          "oldest_due": None, "overdue_items": 0})
        paid = min(pm.get(i.id, 0.0), i.amount)
        bal = max(i.amount - paid, 0)
        b["charged"] += i.amount
        b["paid"] += paid
        b["outstanding"] += bal
        if bal > 0 and i.due_date and i.due_date < t:
            b["overdue"] += bal
            b["overdue_items"] += 1
            if b["oldest_due"] is None or i.due_date < b["oldest_due"]:
                b["oldest_due"] = i.due_date
    for b in out.values():
        for k in ("charged", "paid", "outstanding", "overdue"):
            b[k] = r2(b[k])
    return out


def parents_of(db: Session, student_ids: set[int]) -> dict[int, list[User]]:
    rows = db.execute(select(ParentLink.student_id, User).join(User, User.id == ParentLink.parent_id)
                      .where(ParentLink.student_id.in_(student_ids or {-1}), User.active.is_(True))).all()
    out: dict[int, list[User]] = {}
    for sid, p in rows:
        out.setdefault(sid, []).append(p)
    return out


def next_receipt_no(db: Session, school: School, cfg: FeeConfig, paid_on: date) -> str:
    year = academic_year(paid_on)
    q = select(ReceiptCounter).where(ReceiptCounter.school_id == school.id, ReceiptCounter.year == year)
    if db.bind.dialect.name == "postgresql":
        q = q.with_for_update()
    c = db.scalar(q)
    if not c:
        c = ReceiptCounter(school_id=school.id, year=year, last_no=0)
        db.add(c)
    c.last_no += 1
    db.flush()
    return f"{(cfg.receipt_prefix or school.code).strip()}/{year}/{c.last_no:04d}"


def allocate(db: Session, student_id: int, amount: float, item_ids: list[int] | None) -> list[tuple[FeeItem, float]]:
    """Plan how `amount` settles the student's dues: chosen items first (in order), else oldest first."""
    items = student_items(db, student_id)
    pm = paid_map(db, [i.id for i in items])
    by_id = {i.id: i for i in items}
    if item_ids:
        bad = [x for x in item_ids if x not in by_id]
        if bad:
            raise HTTPException(400, "Some selected charges don't belong to this student")
        order = [by_id[x] for x in item_ids]
    else:
        order = items
    left = r2(amount)
    plan = []
    for i in order:
        bal = r2(i.amount - pm.get(i.id, 0))
        if bal <= 0 or left <= 0:
            continue
        take = min(bal, left)
        plan.append((i, r2(take)))
        left = r2(left - take)
    if left > 0.009:
        due = r2(sum(r2(i.amount - pm.get(i.id, 0)) for i in order if i.amount - pm.get(i.id, 0) > 0))
        raise HTTPException(400, f"Amount is more than the dues selected (₹{due:g}). Add a charge first or reduce the amount.")
    return plan


def confirm_payment(db: Session, school: School, p: FeePayment, user: User, item_ids: list[int] | None) -> None:
    plan = allocate(db, p.student_id, p.amount, item_ids)
    cfg = get_config(db, school.id)
    p.receipt_no = next_receipt_no(db, school, cfg, p.paid_on)
    p.status = "confirmed"
    p.received_by = user.id
    p.confirmed_at = utcnow()
    for item, amt in plan:
        db.add(FeeAllocation(payment_id=p.id, item_id=item.id, amount=amt))


def payment_out(p: FeePayment, users: dict[int, User] | None = None, classes: dict[int, str] | None = None) -> dict:
    s = (users or {}).get(p.student_id)
    rb = (users or {}).get(p.received_by) if p.received_by else None
    sb = (users or {}).get(p.submitted_by) if p.submitted_by else None
    return {"id": p.id, "receipt_no": p.receipt_no, "student_id": p.student_id, "student_name": s.name if s else "",
            "admission_no": s.login_id if s else "", "class_name": (classes or {}).get(s.class_id, "") if s else "",
            "amount": r2(p.amount), "mode": p.mode, "reference": p.reference, "paid_on": p.paid_on, "status": p.status,
            "note": p.note, "cancel_reason": p.cancel_reason, "received_by_name": rb.name if rb else "",
            "submitted_by_name": sb.name if sb else "", "created_at": p.created_at}


def user_map(db: Session, school_id: int) -> dict[int, User]:
    return {u.id: u for u in db.scalars(select(User).where(User.school_id == school_id))}


def class_map(db: Session, school_id: int) -> dict[int, str]:
    return {c.id: c.name for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == school_id))}


def get_student(db: Session, user: User, sid: int) -> User:
    s = db.get(User, sid)
    if not s or s.school_id != user.school_id or s.role != Role.student:
        raise HTTPException(404, "Student not found")
    return s


def can_view_student_fees(db: Session, user: User, student: User) -> bool:
    if user.role in (Role.principal, Role.vice_principal, Role.coordinator):
        return RANK[level_of(user, "fees")] >= RANK["view"]
    if user.role == Role.student:
        return user.id == student.id
    if user.role == Role.parent:
        return any(k.id == student.id for k in children(db, user))
    return False


def ledger(db: Session, school: School, s: User) -> dict:
    items = items_out(db, student_items(db, s.id))
    pays = list(db.scalars(select(FeePayment).where(FeePayment.student_id == s.id).order_by(FeePayment.paid_on.desc(), FeePayment.id.desc())))
    um = user_map(db, school.id)
    cm = class_map(db, school.id)
    pending = [x for x in items if x["balance"] > 0]
    return {
        "student": {"id": s.id, "name": s.name, "admission_no": s.login_id, "class_id": s.class_id,
                    "class_name": cm.get(s.class_id, ""), "roll_no": s.roll_no, "active": s.active},
        "totals": {"charged": r2(sum(x["amount"] for x in items)), "paid": r2(sum(x["paid"] for x in items)),
                   "outstanding": r2(sum(x["balance"] for x in items)),
                   "overdue": r2(sum(x["balance"] for x in items if x["status"] == "overdue")),
                   "next_due": min((x["due_date"] for x in pending if x["due_date"]), default=None)},
        "items": items,
        "payments": [payment_out(p, um, cm) for p in pays],
    }


# ================================================================ config
class ConfigIn(BaseModel):
    monthly_amount: float = Field(ge=0, le=1_000_000)
    class_amounts: dict[str, float] = {}
    route_amounts: dict[str, float] = {}
    due_day: int = Field(default=10, ge=1, le=28)
    start_month: str | None = Field(default=None, pattern=PERIOD)
    auto_generate: bool = True
    upi_id: str = Field(default="", max_length=80)
    upi_name: str = Field(default="", max_length=120)
    receipt_prefix: str = Field(default="", max_length=20)
    receipt_note: str = Field(default="", max_length=500)


def config_out(db: Session, school: School, cfg: FeeConfig) -> dict:
    classes = list(db.scalars(select(SchoolClass).where(SchoolClass.school_id == school.id, SchoolClass.is_active.is_(True)).order_by(SchoolClass.name)))
    counts = dict(db.execute(select(User.class_id, func.count()).where(User.school_id == school.id, User.role == Role.student,
                                                                      User.active.is_(True)).group_by(User.class_id)).all())
    transport_on = "transport" in school_modules(db, school)
    routes = []
    if transport_on:
        riders = dict(db.execute(select(StudentTransport.route_id, func.count()).where(StudentTransport.school_id == school.id)
                                 .group_by(StudentTransport.route_id)).all())
        routes = [{"id": r.id, "name": r.name, "riders": riders.get(r.id, 0), "amount": r2((cfg.route_amounts or {}).get(str(r.id), 0))}
                  for r in db.scalars(select(Route).where(Route.school_id == school.id, Route.is_active.is_(True)).order_by(Route.name))]
    expected = 0.0
    for c in classes:
        expected += monthly_amount_for(cfg, c.id) * counts.get(c.id, 0)
    expected += sum(r["amount"] * r["riders"] for r in routes)
    return {
        "monthly_amount": r2(cfg.monthly_amount), "class_amounts": cfg.class_amounts or {}, "route_amounts": cfg.route_amounts or {},
        "due_day": cfg.due_day, "start_month": cfg.start_month, "auto_generate": cfg.auto_generate,
        "upi_id": cfg.upi_id, "upi_name": cfg.upi_name or school.name, "receipt_prefix": cfg.receipt_prefix or school.code,
        "receipt_note": cfg.receipt_note, "generated_months": cfg.generated_months or [],
        "classes": [{"id": c.id, "name": c.name, "students": counts.get(c.id, 0),
                     "amount": monthly_amount_for(cfg, c.id), "custom": str(c.id) in (cfg.class_amounts or {})} for c in classes],
        "routes": routes, "transport_enabled": transport_on, "expected_monthly": r2(expected),
        "current_period": period_of(today()),
    }


@router.get("/config")
def read_config(user: User = Depends(require_area("fees", "view")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    cfg = get_config(db, school.id)
    db.commit()
    return config_out(db, school, cfg)


@router.put("/config")
def save_config(body: ConfigIn, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    cfg = get_config(db, school.id)
    class_ids = {str(c) for c in db.scalars(select(SchoolClass.id).where(SchoolClass.school_id == school.id))}
    route_ids = {str(r) for r in db.scalars(select(Route.id).where(Route.school_id == school.id))}
    for k, v in body.class_amounts.items():
        if k not in class_ids or v < 0:
            raise HTTPException(400, "Unknown class in class fees")
    for k, v in body.route_amounts.items():
        if k not in route_ids or v < 0:
            raise HTTPException(400, "Unknown route in transport fees")
    upi = body.upi_id.strip()
    if upi and not re.fullmatch(r"[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,64}", upi):
        raise HTTPException(400, "UPI ID looks wrong — it should look like schoolname@bank")
    cfg.monthly_amount = r2(body.monthly_amount)
    cfg.class_amounts = {k: r2(v) for k, v in body.class_amounts.items()}
    cfg.route_amounts = {k: r2(v) for k, v in body.route_amounts.items() if v > 0}
    cfg.due_day = body.due_day
    cfg.start_month = body.start_month
    cfg.auto_generate = body.auto_generate
    cfg.upi_id = upi
    cfg.upi_name = body.upi_name.strip()
    cfg.receipt_prefix = re.sub(r"[^A-Za-z0-9\-]", "", body.receipt_prefix)[:20]
    cfg.receipt_note = body.receipt_note.strip()
    audit(db, user, "fees.config.updated", f"monthly ₹{cfg.monthly_amount}, due day {cfg.due_day}")
    db.commit()
    return config_out(db, school, cfg)


class GenerateIn(BaseModel):
    period: str = Field(pattern=PERIOD)
    preview: bool = False


@router.post("/generate")
def generate(body: GenerateIn, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    t = today()
    if body.period > period_of(t + timedelta(days=62)):
        raise HTTPException(400, "You can bill at most one month ahead")
    out = generate_month(db, school, body.period, user, preview=body.preview)
    db.commit()
    return out


# ================================================================ extra fees (rollout)
class BatchIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    amount: float = Field(gt=0, le=1_000_000)
    due_date: date | None = None
    note: str = Field(default="", max_length=500)
    target: str = Field(pattern="^(school|classes|students)$")
    class_ids: list[int] = []
    student_ids: list[int] = []
    exclude_ids: list[int] = []
    preview: bool = False


def batch_targets(db: Session, school_id: int, b: BatchIn) -> list[User]:
    if b.target == "school":
        studs = active_students(db, school_id)
    elif b.target == "classes":
        if not b.class_ids:
            raise HTTPException(400, "Pick at least one class")
        studs = active_students(db, school_id, set(b.class_ids))
    else:
        if not b.student_ids:
            raise HTTPException(400, "Pick at least one student")
        ids = set(b.student_ids)
        studs = [s for s in active_students(db, school_id) if s.id in ids]
    ex = set(b.exclude_ids)
    return [s for s in studs if s.id not in ex]


def batch_out(db: Session, b: FeeBatch, cm: dict[int, str]) -> dict:
    items = list(db.scalars(select(FeeItem).where(FeeItem.batch_id == b.id)))
    active = [i for i in items if i.is_active]
    pm = paid_map(db, [i.id for i in items])
    collected = r2(sum(min(pm.get(i.id, 0), i.amount) for i in active))
    paid_count = sum(1 for i in active if pm.get(i.id, 0) >= i.amount - 0.009)
    target_label = "Whole school" if b.target == "school" else (
        ", ".join(cm.get(c, "?") for c in b.class_ids) if b.target == "classes" else f"{len(b.student_ids)} students")
    return {"id": b.id, "title": b.title, "amount": r2(b.amount), "due_date": b.due_date, "note": b.note, "target": b.target,
            "target_label": target_label, "class_ids": b.class_ids, "count": len(active), "paid_count": paid_count,
            "expected": r2(sum(i.amount for i in active)), "collected": collected,
            "outstanding": r2(sum(i.amount for i in active) - collected), "is_active": b.is_active, "created_at": b.created_at}


@router.get("/batches")
def list_batches(user: User = Depends(require_area("fees", "view")), db: Session = Depends(get_db)):
    cm = class_map(db, user.school_id)
    rows = db.scalars(select(FeeBatch).where(FeeBatch.school_id == user.school_id, FeeBatch.is_active.is_(True))
                      .order_by(FeeBatch.created_at.desc()))
    return [batch_out(db, b, cm) for b in rows]


@router.post("/batches")
def create_batch(body: BatchIn, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    studs = batch_targets(db, user.school_id, body)
    cm = class_map(db, user.school_id)
    if body.preview:
        by_class: dict[str, int] = {}
        for s in studs:
            by_class[cm.get(s.class_id, "No class")] = by_class.get(cm.get(s.class_id, "No class"), 0) + 1
        return {"count": len(studs), "total": r2(len(studs) * body.amount),
                "by_class": [{"class_name": k, "students": v} for k, v in sorted(by_class.items())],
                "sample": [s.name for s in studs[:5]]}
    if not studs:
        raise HTTPException(400, "No students match this selection")
    b = FeeBatch(school_id=user.school_id, title=body.title.strip(), amount=r2(body.amount), due_date=body.due_date,
                 note=body.note.strip(), target=body.target, class_ids=body.class_ids if body.target == "classes" else [],
                 student_ids=body.student_ids if body.target == "students" else [], exclude_ids=body.exclude_ids,
                 count=len(studs), created_by=user.id)
    db.add(b)
    db.flush()
    db.add_all(FeeItem(school_id=user.school_id, student_id=s.id, kind="extra", period=f"b{b.id}", title=b.title,
                       amount=b.amount, due_date=b.due_date, batch_id=b.id, created_by=user.id) for s in studs)
    audit(db, user, "fees.batch.created", f"{b.title}: ₹{b.amount} × {len(studs)}")
    db.commit()
    return batch_out(db, b, cm)


@router.delete("/batches/{bid}")
def archive_batch(bid: int, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    b = owned(db, FeeBatch, bid, user, "Fee")
    items = list(db.scalars(select(FeeItem).where(FeeItem.batch_id == b.id, FeeItem.is_active.is_(True))))
    pm = paid_map(db, [i.id for i in items])
    voided = 0
    for i in items:
        if pm.get(i.id, 0) <= 0:
            i.is_active = False
            voided += 1
    b.is_active = False
    b.archived_at = utcnow()
    b.archived_by = user.id
    audit(db, user, "fees.batch.withdrawn", f"{b.title}: {voided} unpaid charges removed")
    db.commit()
    return {"ok": True, "voided": voided, "kept_paid": len(items) - voided}


# ================================================================ students & ledger
@router.get("/students")
def students(class_id: int | None = None, status: str = "all", q: str = "",
             user: User = Depends(require_area("fees", "view")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    ensure_current(db, school)
    studs = active_students(db, school.id, {class_id} if class_id else None)
    if q.strip():
        ql = q.strip().lower()
        studs = [s for s in studs if ql in s.name.lower() or ql in s.login_id.lower()]
    bal = balances(db, school.id, {s.id for s in studs})
    cm = class_map(db, school.id)
    par = parents_of(db, {s.id for s in studs})
    rows = []
    for s in studs:
        b = bal.get(s.id, {"charged": 0, "paid": 0, "outstanding": 0, "overdue": 0, "oldest_due": None, "overdue_items": 0})
        st = "overdue" if b["overdue"] > 0 else ("due" if b["outstanding"] > 0 else "clear")
        if status != "all" and st != status and not (status == "due" and st == "overdue"):
            continue
        p = (par.get(s.id) or [None])[0]
        rows.append({"id": s.id, "name": s.name, "admission_no": s.login_id, "class_id": s.class_id,
                     "class_name": cm.get(s.class_id, ""), "roll_no": s.roll_no, "status": st, **b,
                     "parent_name": p.name if p else "", "parent_phone": p.phone or p.login_id if p else ""})
    if status in ("overdue", "due"):
        rows.sort(key=lambda r: (-r["overdue"], -r["outstanding"]))
    return rows


@router.get("/students/{sid}")
def student_ledger(sid: int, user: User = Depends(require_area("fees", "view")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    ensure_current(db, school)
    s = get_student(db, user, sid)
    out = ledger(db, school, s)
    p = (parents_of(db, {s.id}).get(s.id) or [None])[0]
    out["parent"] = {"name": p.name, "phone": p.phone or p.login_id} if p else None
    return out


class ChargeIn(BaseModel):
    student_id: int
    title: str = Field(min_length=2, max_length=160)
    amount: float = Field(gt=0, le=1_000_000)
    due_date: date | None = None


@router.post("/items")
def add_charge(body: ChargeIn, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    s = get_student(db, user, body.student_id)
    i = FeeItem(school_id=user.school_id, student_id=s.id, kind="fine", period=f"x{int(datetime.now().timestamp() * 1000)}",
                title=body.title.strip(), amount=r2(body.amount), due_date=body.due_date or today(), created_by=user.id)
    db.add(i)
    audit(db, user, "fees.charge.added", f"{s.name}: {i.title} ₹{i.amount}")
    db.commit()
    return items_out(db, [i])[0]


class ItemEdit(BaseModel):
    amount: float = Field(ge=0, le=1_000_000)
    reason: str = Field(default="", max_length=200)


@router.put("/items/{iid}")
def edit_charge(iid: int, body: ItemEdit, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    """Concession / correction. Can't go below what's already paid; 0 with nothing paid waives it."""
    i = db.get(FeeItem, iid)
    if not i or i.school_id != user.school_id or not i.is_active:
        raise HTTPException(404, "Charge not found")
    paid = paid_map(db, [i.id]).get(i.id, 0)
    if body.amount < paid - 0.009:
        raise HTTPException(400, f"₹{paid:g} is already paid against this charge — cancel that receipt first")
    old = i.amount
    if body.amount == 0 and paid == 0:
        i.is_active = False
    else:
        i.amount = r2(body.amount)
    audit(db, user, "fees.charge.edited", f"{i.title}: ₹{old} → ₹{body.amount}. {body.reason}".strip())
    db.commit()
    return {"ok": True, "waived": not i.is_active}


# ================================================================ payments (counter)
class PaymentIn(BaseModel):
    student_id: int
    amount: float = Field(gt=0, le=10_000_000)
    mode: str = Field(pattern="^(cash|upi|cheque|bank|online)$")
    reference: str = Field(default="", max_length=80)
    paid_on: date | None = None
    item_ids: list[int] = []
    note: str = Field(default="", max_length=300)


@router.post("/payments")
def record_payment(body: PaymentIn, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    s = get_student(db, user, body.student_id)
    paid_on = body.paid_on or today()
    if paid_on > today():
        raise HTTPException(400, "Payment date can't be in the future")
    if body.mode in ("cheque", "bank", "upi") and not body.reference.strip():
        raise HTTPException(400, {"cheque": "Cheque number is needed", "bank": "Bank reference is needed",
                                  "upi": "UPI reference (UTR) is needed"}[body.mode])
    p = FeePayment(school_id=school.id, student_id=s.id, amount=r2(body.amount), mode=body.mode,
                   reference=body.reference.strip(), paid_on=paid_on, note=body.note.strip(), status="pending",
                   requested_item_ids=body.item_ids)
    db.add(p)
    db.flush()
    confirm_payment(db, school, p, user, body.item_ids or None)
    audit(db, user, "fees.payment.recorded", f"{p.receipt_no} · {s.name} · ₹{p.amount} {p.mode}")
    db.commit()
    return receipt_out(db, school, p)


@router.get("/payments")
def list_payments(date_from: date | None = None, date_to: date | None = None, mode: str | None = None,
                  class_id: int | None = None, status: str = "confirmed",
                  user: User = Depends(require_area("fees", "view")), db: Session = Depends(get_db)):
    t = today()
    date_from = date_from or t.replace(day=1)
    date_to = date_to or t
    q = select(FeePayment).where(FeePayment.school_id == user.school_id, FeePayment.paid_on >= date_from, FeePayment.paid_on <= date_to)
    if status != "all":
        q = q.where(FeePayment.status == status)
    if mode:
        q = q.where(FeePayment.mode == mode)
    um = user_map(db, user.school_id)
    cm = class_map(db, user.school_id)
    rows = [p for p in db.scalars(q.order_by(FeePayment.paid_on.desc(), FeePayment.id.desc()))
            if not class_id or (um.get(p.student_id) and um[p.student_id].class_id == class_id)]
    by_mode: dict[str, float] = {}
    for p in rows:
        if p.status == "confirmed":
            by_mode[p.mode] = r2(by_mode.get(p.mode, 0) + p.amount)
    return {"from": date_from, "to": date_to, "count": len(rows),
            "total": r2(sum(p.amount for p in rows if p.status == "confirmed")), "by_mode": by_mode,
            "rows": [payment_out(p, um, cm) for p in rows]}


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/payments/{pid}/cancel")
def cancel_payment(pid: int, body: CancelIn, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    p = owned_payment(db, user, pid)
    if p.status != "confirmed":
        raise HTTPException(400, "Only issued receipts can be cancelled")
    p.status = "cancelled"
    p.cancel_reason = body.reason.strip()
    audit(db, user, "fees.receipt.cancelled", f"{p.receipt_no} ₹{p.amount}: {p.cancel_reason}")
    db.commit()
    return {"ok": True}


def owned_payment(db: Session, user: User, pid: int) -> FeePayment:
    p = db.get(FeePayment, pid)
    if not p or p.school_id != user.school_id:
        raise HTTPException(404, "Payment not found")
    return p


# ================================================================ receipts
def receipt_out(db: Session, school: School, p: FeePayment) -> dict:
    s = db.get(User, p.student_id)
    cm = class_map(db, school.id)
    cfg = get_config(db, school.id)
    allocs = db.execute(select(FeeAllocation, FeeItem).join(FeeItem, FeeItem.id == FeeAllocation.item_id)
                        .where(FeeAllocation.payment_id == p.id).order_by(FeeItem.due_date, FeeItem.id)).all()
    par = (parents_of(db, {s.id}).get(s.id) or [None])[0]
    rb = db.get(User, p.received_by) if p.received_by else None
    out_now = balances(db, school.id, {s.id}).get(s.id, {}).get("outstanding", 0.0)
    return {
        "id": p.id, "receipt_no": p.receipt_no, "status": p.status, "cancel_reason": p.cancel_reason,
        "amount": r2(p.amount), "amount_words": amount_in_words(p.amount), "mode": p.mode, "reference": p.reference,
        "paid_on": p.paid_on, "note": p.note, "received_by_name": rb.name if rb else "", "issued_at": p.confirmed_at or p.created_at,
        "academic_year": academic_year(p.paid_on),
        "school": {"name": school.name, "code": school.code, "address": school.address, "phone": school.phone, "board": school.board},
        "student": {"id": s.id, "name": s.name, "admission_no": s.login_id, "class_name": cm.get(s.class_id, ""), "roll_no": s.roll_no},
        "parent_name": par.name if par else "",
        "lines": [{"title": it.title, "kind": it.kind, "period": it.period, "charge": r2(it.amount), "amount": r2(a.amount)} for a, it in allocs],
        "balance_after": r2(out_now), "footer": cfg.receipt_note,
    }


@router.get("/receipts/{pid}")
def get_receipt(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(FeePayment, pid)
    if not p or p.school_id != user.school_id or not p.receipt_no:
        raise HTTPException(404, "Receipt not found")
    s = db.get(User, p.student_id)
    if not can_view_student_fees(db, user, s):
        raise HTTPException(403, "You can't view this receipt")
    return receipt_out(db, get_school(db, user), p)


# ================================================================ UPI claims (option B)
class ClaimIn(BaseModel):
    student_id: int | None = None
    amount: float = Field(gt=0, le=10_000_000)
    reference: str = Field(min_length=6, max_length=30)
    item_ids: list[int] = []
    paid_on: date | None = None


@router.post("/me/claim")
def submit_claim(body: ClaimIn, user: User = Depends(require(Role.parent, Role.student)), db: Session = Depends(get_db)):
    school = get_school(db, user)
    s = resolve_student(db, user, body.student_id)
    ref = re.sub(r"\s", "", body.reference)
    if not re.fullmatch(r"[A-Za-z0-9]{6,30}", ref):
        raise HTTPException(400, "Enter the UPI reference / UTR number exactly as shown in your UPI app")
    dup = db.scalar(select(FeePayment).where(FeePayment.school_id == school.id, FeePayment.reference == ref,
                                             FeePayment.status.in_(("pending", "confirmed"))))
    if dup:
        raise HTTPException(409, "This UTR has already been submitted")
    if not get_config(db, school.id).upi_id:
        raise HTTPException(400, "This school hasn't set up UPI payments yet")
    allocate(db, s.id, body.amount, body.item_ids or None)   # validates amount against dues
    paid_on = body.paid_on or today()
    if paid_on > today() or paid_on < today() - timedelta(days=30):
        raise HTTPException(400, "Payment date must be within the last 30 days")
    p = FeePayment(school_id=school.id, student_id=s.id, amount=r2(body.amount), mode="upi", reference=ref, paid_on=paid_on,
                   status="pending", submitted_by=user.id, requested_item_ids=body.item_ids)
    db.add(p)
    audit(db, user, "fees.upi.claimed", f"{s.name} ₹{p.amount} UTR {ref}")
    db.commit()
    return {"ok": True, "id": p.id, "status": "pending"}


@router.get("/claims")
def list_claims(status: str = "pending", user: User = Depends(require_area("fees", "view")), db: Session = Depends(get_db)):
    q = select(FeePayment).where(FeePayment.school_id == user.school_id, FeePayment.submitted_by.is_not(None))
    if status != "all":
        q = q.where(FeePayment.status == status)
    um = user_map(db, user.school_id)
    cm = class_map(db, user.school_id)
    rows = list(db.scalars(q.order_by(FeePayment.created_at.desc()).limit(200)))
    bal = balances(db, user.school_id, {p.student_id for p in rows})
    return [{**payment_out(p, um, cm), "outstanding": bal.get(p.student_id, {}).get("outstanding", 0.0)} for p in rows]


class ConfirmIn(BaseModel):
    amount: float | None = Field(default=None, gt=0)


@router.post("/claims/{pid}/confirm")
def confirm_claim(pid: int, body: ConfirmIn | None = None, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    p = owned_payment(db, user, pid)
    if p.status != "pending":
        raise HTTPException(400, "This payment was already handled")
    if body and body.amount:
        p.amount = r2(body.amount)
    items = p.requested_item_ids or None
    try:
        confirm_payment(db, school, p, user, items)
    except HTTPException:
        if not items:
            raise
        db.rollback()
        p = owned_payment(db, user, pid)
        if body and body.amount:
            p.amount = r2(body.amount)
        confirm_payment(db, school, p, user, None)   # chosen dues were settled meanwhile → oldest first
    audit(db, user, "fees.upi.confirmed", f"{p.receipt_no} ₹{p.amount} UTR {p.reference}")
    db.commit()
    return receipt_out(db, school, p)


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/claims/{pid}/reject")
def reject_claim(pid: int, body: RejectIn, user: User = Depends(require_area("fees", "edit")), db: Session = Depends(get_db)):
    p = owned_payment(db, user, pid)
    if p.status != "pending":
        raise HTTPException(400, "This payment was already handled")
    p.status = "rejected"
    p.cancel_reason = body.reason.strip()
    audit(db, user, "fees.upi.rejected", f"₹{p.amount} UTR {p.reference}: {p.cancel_reason}")
    db.commit()
    return {"ok": True}


# ================================================================ parent / student
@router.get("/me")
def my_fees(student_id: int | None = None, user: User = Depends(require(Role.parent, Role.student)), db: Session = Depends(get_db)):
    school = get_school(db, user)
    ensure_current(db, school)
    s = resolve_student(db, user, student_id)
    out = ledger(db, school, s)
    cfg = get_config(db, school.id)
    out["upi"] = {"enabled": bool(cfg.upi_id), "upi_id": cfg.upi_id, "payee": cfg.upi_name or school.name}
    out["payments"] = [p for p in out["payments"] if p["status"] in ("confirmed", "pending", "rejected")]
    return out


# ================================================================ summary / reports
@router.get("/summary")
def summary(user: User = Depends(require_area("fees", "view")), db: Session = Depends(get_db)):
    school = get_school(db, user)
    ensure_current(db, school)
    t = today()
    period = period_of(t)
    m_start = t.replace(day=1)
    pays = list(db.scalars(select(FeePayment).where(FeePayment.school_id == school.id, FeePayment.status == "confirmed",
                                                    FeePayment.paid_on >= min(m_start, t - timedelta(days=13)))))
    month_pays = [p for p in pays if p.paid_on >= m_start]
    by_mode: dict[str, float] = {}
    for p in month_pays:
        by_mode[p.mode] = r2(by_mode.get(p.mode, 0) + p.amount)
    trend = []
    for k in range(13, -1, -1):
        d = t - timedelta(days=k)
        trend.append({"date": d, "amount": r2(sum(p.amount for p in pays if p.paid_on == d))})
    studs = active_students(db, school.id)
    sids = {s.id for s in studs}
    bal = balances(db, school.id, sids)
    cm = class_map(db, school.id)
    this_month_items = list(db.scalars(select(FeeItem).where(
        FeeItem.school_id == school.id, FeeItem.is_active.is_(True), FeeItem.student_id.in_(sids or {-1}),
        FeeItem.due_date >= m_start, FeeItem.due_date <= date(t.year, t.month, calendar.monthrange(t.year, t.month)[1]))))
    pm = paid_map(db, [i.id for i in this_month_items])
    expected = r2(sum(i.amount for i in this_month_items))
    settled = r2(sum(min(pm.get(i.id, 0), i.amount) for i in this_month_items))
    by_class: dict[int, dict] = {}
    for s in studs:
        c = by_class.setdefault(s.class_id or 0, {"class_id": s.class_id, "class_name": cm.get(s.class_id, "No class"), "students": 0,
                                                   "outstanding": 0.0, "overdue": 0.0, "defaulters": 0, "collected_month": 0.0})
        b = bal.get(s.id)
        c["students"] += 1
        if b:
            c["outstanding"] = r2(c["outstanding"] + b["outstanding"])
            c["overdue"] = r2(c["overdue"] + b["overdue"])
            c["defaulters"] += 1 if b["overdue"] > 0 else 0
    stud_class = {s.id: s.class_id or 0 for s in studs}
    for p in month_pays:
        k = stud_class.get(p.student_id)
        if k is not None:
            by_class[k]["collected_month"] = r2(by_class[k]["collected_month"] + p.amount)
    pending = db.scalar(select(func.count()).select_from(FeePayment).where(FeePayment.school_id == school.id, FeePayment.status == "pending")) or 0
    cfg = get_config(db, school.id)
    um = user_map(db, school.id)
    recent = list(db.scalars(select(FeePayment).where(FeePayment.school_id == school.id, FeePayment.status == "confirmed")
                             .order_by(FeePayment.confirmed_at.desc().nulls_last(), FeePayment.id.desc()).limit(5)))
    db.commit()
    return {
        "period": period, "period_label": month_label(period),
        "collected_today": r2(sum(p.amount for p in pays if p.paid_on == t)),
        "receipts_today": sum(1 for p in pays if p.paid_on == t),
        "collected_month": r2(sum(p.amount for p in month_pays)), "by_mode": by_mode,
        "expected_month": expected, "settled_month": settled,
        "collection_pct": round(settled * 100 / expected) if expected else None,
        "outstanding": r2(sum(b["outstanding"] for b in bal.values())),
        "overdue": r2(sum(b["overdue"] for b in bal.values())),
        "defaulters": sum(1 for b in bal.values() if b["overdue"] > 0),
        "students_with_dues": sum(1 for b in bal.values() if b["outstanding"] > 0),
        "pending_claims": pending, "trend": trend,
        "by_class": sorted(by_class.values(), key=lambda c: c["class_name"]),
        "recent": [payment_out(p, um, cm) for p in recent],
        "configured": cfg.monthly_amount > 0 or any(v > 0 for v in (cfg.class_amounts or {}).values()),
        "upi_enabled": bool(cfg.upi_id), "billed_this_month": period in (cfg.generated_months or []),
    }
