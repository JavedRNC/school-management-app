"""School onboarding requests: one workflow for the public web form and the app.

Public: submit a request, look up its status with reference + mobile.
Admin:  list/search/filter, detail with history, notes, assignment, status changes, and creating the school.
"""
import re
import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import push, ratelimit
from ..auth import admin_only, audit
from ..db import get_db
from ..models import OnboardingEvent, OnboardingRequest, Plan, Role, School, SchoolDetails, User, utcnow
from ..people import temp_password
from .admin import new_school

router = APIRouter(tags=["onboarding"])

STATUSES = ["PENDING", "UNDER_REVIEW", "ADDITIONAL_INFORMATION_REQUIRED", "APPROVED", "REJECTED", "ONBOARDED"]
# what an admin may move a request to from each status (ONBOARDED is reached only by creating the school)
NEXT = {
    "PENDING": {"UNDER_REVIEW", "ADDITIONAL_INFORMATION_REQUIRED", "APPROVED", "REJECTED"},
    "UNDER_REVIEW": {"ADDITIONAL_INFORMATION_REQUIRED", "APPROVED", "REJECTED"},
    "ADDITIONAL_INFORMATION_REQUIRED": {"UNDER_REVIEW", "APPROVED", "REJECTED"},
    "APPROVED": {"REJECTED", "UNDER_REVIEW"},
    "REJECTED": {"UNDER_REVIEW"},
    "ONBOARDED": set(),
}
OPEN = ("PENDING", "UNDER_REVIEW", "ADDITIONAL_INFORMATION_REQUIRED", "APPROVED")
CATEGORIES = {"", "Pre-primary", "Primary", "Middle", "Secondary", "Senior secondary", "Other"}
METHODS = {"", "Phone", "WhatsApp", "Email"}
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACES = re.compile(r"[ \t]+")


def _clean(v: str) -> str:
    return _SPACES.sub(" ", _CTRL.sub("", v or "")).strip()


def norm_mobile(v: str) -> str:
    d = re.sub(r"[^\d]", "", v or "")
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    elif len(d) == 11 and d.startswith("0"):
        d = d[1:]
    return d


class OnboardingIn(BaseModel):
    school_name: str = Field(min_length=3, max_length=160)
    reg_no: str = Field(default="", max_length=60)
    category: str = Field(default="", max_length=40)
    board: str = Field(default="", max_length=40)
    address: str = Field(min_length=5, max_length=500)
    state: str = Field(min_length=2, max_length=60)
    district: str = Field(min_length=2, max_length=60)
    city: str = Field(min_length=2, max_length=80)
    pin: str = Field(pattern=r"^[1-9][0-9]{5}$")
    principal_name: str = Field(default="", max_length=120)
    contact_name: str = Field(min_length=2, max_length=120)
    designation: str = Field(default="", max_length=60)
    mobile: str = Field(min_length=10, max_length=20)
    alt_phone: str = Field(default="", max_length=20)
    email: EmailStr
    contact_method: str = Field(default="", max_length=20)
    students: int | None = Field(default=None, ge=0, le=200_000)
    teachers: int | None = Field(default=None, ge=0, le=20_000)
    current_software: str = Field(default="", max_length=120)
    message: str = Field(default="", max_length=1000)
    consent_privacy: bool
    consent_contact: bool
    source: str = Field(default="web", pattern="^(web|app)$")
    website: str = Field(default="", max_length=200)      # trap field: people never see it, bots fill it

    @field_validator("school_name", "reg_no", "category", "board", "state", "district", "city", "principal_name",
                     "contact_name", "designation", "current_software", "contact_method", mode="before")
    @classmethod
    def _one_line(cls, v):
        return _clean(str(v or "")).replace("\n", " ")

    @field_validator("address", "message", mode="before")
    @classmethod
    def _text(cls, v):
        return _CTRL.sub("", str(v or "")).strip()

    @field_validator("mobile")
    @classmethod
    def _mobile(cls, v):
        m = norm_mobile(v)
        if not re.fullmatch(r"[6-9]\d{9}", m):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return m

    @field_validator("alt_phone")
    @classmethod
    def _alt(cls, v):
        d = re.sub(r"[^\d+]", "", v or "")
        if d and not 6 <= len(d) <= 15:
            raise ValueError("Enter a valid alternate number or leave it empty")
        return d

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v not in CATEGORIES:
            raise ValueError("Unknown school category")
        return v

    @field_validator("contact_method")
    @classmethod
    def _method(cls, v):
        if v not in METHODS:
            raise ValueError("Unknown contact method")
        return v


def _event(db: Session, r: OnboardingRequest, kind: str, actor: User | None, *, frm: str = "", to: str = "", remarks: str = "") -> None:
    db.add(OnboardingEvent(request_id=r.id, kind=kind, actor_id=actor.id if actor else None,
                           actor_name=actor.name if actor else "Applicant", from_status=frm, to_status=to, remarks=remarks[:2000]))


def _norm_name(v: str) -> str:
    return re.sub(r"[^a-z0-9]", "", v.lower())


def existing_school(db: Session, reg_no: str, name: str, pin: str) -> School | None:
    """A school already on Prangan that matches this request (registration number, or same name + PIN)."""
    if reg_no:
        d = db.scalar(select(SchoolDetails).where(func.lower(SchoolDetails.reg_no) == reg_no.lower()))
        if d:
            return db.get(School, d.school_id)
    if pin:
        for d in db.scalars(select(SchoolDetails).where(SchoolDetails.pin == pin)):
            s = db.get(School, d.school_id)
            if s and _norm_name(s.name) == _norm_name(name):
                return s
    return None


def _duplicate(db: Session, b: OnboardingIn) -> bool:
    """An open request that is clearly the same school."""
    conds = [(OnboardingRequest.mobile == b.mobile), (func.lower(OnboardingRequest.email) == str(b.email).lower())]
    if b.reg_no:
        conds.append(func.lower(OnboardingRequest.reg_no) == b.reg_no.lower())
    rows = db.scalars(select(OnboardingRequest).where(OnboardingRequest.status.in_(OPEN), or_(*conds)))
    for r in rows:
        if b.reg_no and r.reg_no and r.reg_no.lower() == b.reg_no.lower():
            return True
        if _norm_name(r.school_name) == _norm_name(b.school_name):
            return True
    return False


# ---------------------------------------------------------------- public
REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"      # no 0/O, 1/I/L: read aloud over the phone without mistakes
DAILY_CAP = 2000                                      # stored requests per 24 h across everyone (protects the database)
QUIET_AFTER = 50                                      # after this many in 24 h, stop sending a push for each one
ALREADY = ("We already have a request or a registration for this school. "
           "If you sent it, use your reference number to check its status; otherwise please contact Prangan support.")


def new_reference(db: Session) -> str:
    """PRN-<year>-<8 random characters>: not guessable from another reference."""
    for _ in range(8):
        ref = f"PRN-{date.today().year}-{''.join(secrets.choice(REF_ALPHABET) for _ in range(8))}"
        if not db.scalar(select(OnboardingRequest.id).where(OnboardingRequest.reference == ref)):
            return ref
    raise HTTPException(503, "Please try again")


@router.post("/public/onboarding", status_code=201)
def submit(body: OnboardingIn, request: Request, db: Session = Depends(get_db)):
    """No login. Limited per address; the reply never says which detail matched an earlier request or school."""
    ratelimit.check(request, "onboard", 5, 3600, "You've sent several requests already. Please try again in an hour.")
    if not (body.consent_privacy and body.consent_contact):
        raise HTTPException(400, "Please accept the privacy policy and agree to be contacted")
    if body.website:                                     # a bot: look successful, store nothing
        return {"reference": f"PRN-{date.today().year}-{''.join(secrets.choice(REF_ALPHABET) for _ in range(8))}", "status": "PENDING"}
    if existing_school(db, body.reg_no, body.school_name, body.pin) or _duplicate(db, body):
        raise HTTPException(409, ALREADY)
    recent = db.scalar(select(func.count()).select_from(OnboardingRequest).where(OnboardingRequest.created_at > utcnow() - timedelta(hours=24))) or 0
    if recent >= DAILY_CAP:
        raise HTTPException(429, "We're receiving too many requests right now. Please try again tomorrow.")
    r = OnboardingRequest(reference=new_reference(db), status="PENDING", **body.model_dump(exclude={"website", "email"}), email=str(body.email).lower())
    db.add(r)
    db.flush()
    _event(db, r, "created", None, to="PENDING", remarks=f"Submitted from the {'app' if body.source == 'app' else 'website'}")
    db.commit()
    if recent <= QUIET_AFTER:                                       # one push each, then a single "many waiting" notice
        admins = list(db.scalars(select(User.id).where(User.role == Role.admin, User.active.is_(True))))
        many = recent == QUIET_AFTER
        push.notify(admins, "Many onboarding requests are waiting" if many else "New school onboarding request",
                    "More than 50 in a day. Further alerts are paused; open Prangan to review them." if many else "Open Prangan to review it.",
                    {"type": "onboarding", "id": r.id})
    return {"reference": r.reference, "status": r.status}


class StatusQuery(BaseModel):
    reference: str = Field(min_length=6, max_length=24)
    mobile: str = Field(min_length=10, max_length=20)


@router.post("/public/onboarding/status")
def public_status(body: StatusQuery, request: Request, db: Session = Depends(get_db)):
    """Applicant checks progress with the reference number AND the mobile number used on the form.
    A POST, so neither value ends up in server or proxy logs."""
    ratelimit.check(request, "onboard-status", 20, 600)
    r = db.scalar(select(OnboardingRequest).where(OnboardingRequest.reference == body.reference.strip().upper()))
    if not r or not secrets.compare_digest(r.mobile, norm_mobile(body.mobile)):
        raise HTTPException(404, "No request matches that reference and mobile number")
    out = {"reference": r.reference, "school_name": r.school_name, "status": r.status, "submitted_on": r.created_at.date(),
           "updated_on": r.updated_at.date(), "message": ""}
    if r.status in ("ADDITIONAL_INFORMATION_REQUIRED", "REJECTED"):
        ev = db.scalar(select(OnboardingEvent).where(OnboardingEvent.request_id == r.id, OnboardingEvent.kind == "status",
                                                     OnboardingEvent.to_status == r.status).order_by(OnboardingEvent.id.desc()))
        out["message"] = ev.remarks if ev else ""        # the reason / what is needed (never internal notes)
    return out


# ---------------------------------------------------------------- admin
def _row(r: OnboardingRequest) -> dict:
    return {"id": r.id, "reference": r.reference, "status": r.status, "source": r.source, "school_name": r.school_name,
            "reg_no": r.reg_no, "city": r.city, "district": r.district, "state": r.state, "contact_name": r.contact_name,
            "mobile": r.mobile, "email": r.email, "students": r.students, "assigned_name": r.assigned_name,
            "created_at": r.created_at, "updated_at": r.updated_at, "school_id": r.school_id}


def _get(db: Session, rid: int) -> OnboardingRequest:
    r = db.get(OnboardingRequest, rid)
    if not r:
        raise HTTPException(404, "Request not found")
    return r


def _like(v: str) -> str:
    return "%" + v.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


@router.get("/admin/onboarding")
def admin_list(q: str = "", status: str = "", date_from: date | None = None, date_to: date | None = None,
               page: int = 1, size: int = 20, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    page, size = max(1, page), min(max(1, size), 100)
    cond = []
    if status:
        if status not in STATUSES:
            raise HTTPException(400, "Unknown status")
        cond.append(OnboardingRequest.status == status)
    q = _clean(q)[:80]
    if q:
        like = _like(q.lower())
        digits = re.sub(r"\D", "", q)
        ors = [func.lower(OnboardingRequest.school_name).like(like, escape="\\"), func.lower(OnboardingRequest.reg_no).like(like, escape="\\"),
               func.lower(OnboardingRequest.reference).like(like, escape="\\"), func.lower(OnboardingRequest.city).like(like, escape="\\")]
        if len(digits) >= 4:
            ors.append(OnboardingRequest.mobile.like(_like(digits), escape="\\"))
        cond.append(or_(*ors))
    if date_from:
        cond.append(OnboardingRequest.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        cond.append(OnboardingRequest.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    total = db.scalar(select(func.count()).select_from(OnboardingRequest).where(*cond)) or 0
    rows = db.scalars(select(OnboardingRequest).where(*cond).order_by(OnboardingRequest.created_at.desc(), OnboardingRequest.id.desc())
                      .offset((page - 1) * size).limit(size))
    return {"items": [_row(r) for r in rows], "total": total, "page": page, "size": size}


@router.get("/admin/onboarding/summary")
def admin_summary(me: User = Depends(admin_only), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(OnboardingRequest.status, func.count()).group_by(OnboardingRequest.status)).all())
    latest = db.scalars(select(OnboardingRequest).order_by(OnboardingRequest.created_at.desc(), OnboardingRequest.id.desc()).limit(5))
    return {"by_status": {s: int(counts.get(s, 0)) for s in STATUSES}, "total": int(sum(counts.values())),
            "pending": int(counts.get("PENDING", 0)), "latest": [_row(r) for r in latest]}


@router.get("/admin/onboarding/{rid}")
def admin_detail(rid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _get(db, rid)
    events = db.scalars(select(OnboardingEvent).where(OnboardingEvent.request_id == rid).order_by(OnboardingEvent.id))
    match = existing_school(db, r.reg_no, r.school_name, r.pin) if r.status != "ONBOARDED" else None
    school = db.get(School, r.school_id) if r.school_id else None
    return {**_row(r), "category": r.category, "board": r.board, "address": r.address, "pin": r.pin,
            "principal_name": r.principal_name, "designation": r.designation, "alt_phone": r.alt_phone,
            "contact_method": r.contact_method, "teachers": r.teachers, "current_software": r.current_software,
            "message": r.message, "allowed_next": sorted(NEXT[r.status]),
            "can_onboard": r.status == "APPROVED" and not match,
            "possible_duplicate": {"id": match.id, "code": match.code, "name": match.name} if match else None,
            "school": {"id": school.id, "code": school.code, "name": school.name} if school else None,
            "events": [{"id": e.id, "at": e.at, "actor_name": e.actor_name, "kind": e.kind, "from_status": e.from_status,
                        "to_status": e.to_status, "remarks": e.remarks} for e in events]}


class StatusIn(BaseModel):
    status: str
    remarks: str = Field(default="", max_length=1000)


@router.post("/admin/onboarding/{rid}/status")
def admin_status(rid: int, body: StatusIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _get(db, rid)
    new = body.status
    remarks = _CTRL.sub("", body.remarks).strip()
    if new not in NEXT[r.status]:
        raise HTTPException(400, f"A {r.status.replace('_', ' ').lower()} request can't be moved to {new.replace('_', ' ').lower()}")
    if new == "REJECTED" and len(remarks) < 5:
        raise HTTPException(400, "Give the reason for rejecting (the school can see it)")
    if new == "ADDITIONAL_INFORMATION_REQUIRED" and len(remarks) < 5:
        raise HTTPException(400, "Say what information is needed (the school can see it)")
    old, r.status, r.updated_at = r.status, new, utcnow()
    _event(db, r, "status", me, frm=old, to=new, remarks=remarks)
    audit(db, me, "onboarding.status", f"{r.reference} {old} → {new}")
    db.commit()
    return admin_detail(rid, me, db)


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


@router.post("/admin/onboarding/{rid}/notes")
def admin_note(rid: int, body: NoteIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    r = _get(db, rid)
    _event(db, r, "note", me, remarks=_CTRL.sub("", body.note).strip())
    r.updated_at = utcnow()
    db.commit()
    return admin_detail(rid, me, db)


@router.post("/admin/onboarding/{rid}/assign")
def admin_assign(rid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Take (or release) the request. With one admin today this simply records who is handling it."""
    r = _get(db, rid)
    if r.assigned_to == me.id:
        r.assigned_to, r.assigned_name = None, ""
        _event(db, r, "assigned", me, remarks="Released")
    else:
        r.assigned_to, r.assigned_name = me.id, me.name
        _event(db, r, "assigned", me, remarks=f"Assigned to {me.name}")
    r.updated_at = utcnow()
    db.commit()
    return admin_detail(rid, me, db)


class OnboardIn(BaseModel):
    code: str = Field(min_length=3, max_length=20, pattern="^[A-Za-z0-9-]+$")
    plan_id: int | None = None
    principal_login_id: str = Field(default="principal", min_length=1, max_length=60)


@router.post("/admin/onboarding/{rid}/onboard")
def admin_onboard(rid: int, body: OnboardIn, response: Response, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Create the school from an APPROVED request, through the same logic as the admin 'new school' form.
    The principal's temporary password is returned once (never stored readable) and must be changed at first sign-in."""
    r = db.scalar(select(OnboardingRequest).where(OnboardingRequest.id == rid).with_for_update())
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "APPROVED":
        raise HTTPException(400, "Approve the request before creating the school")
    if r.school_id or existing_school(db, r.reg_no, r.school_name, r.pin):
        raise HTTPException(409, "This school already exists on Prangan — it was not created again")
    if body.plan_id and not db.get(Plan, body.plan_id):
        raise HTTPException(400, "Plan not found")
    pw = temp_password()
    s = new_school(db, me, code=body.code, name=r.school_name, address=f"{r.address}, {r.city}, {r.district}, {r.state} {r.pin}",
                   phone=r.mobile, board=r.board, plan_id=body.plan_id,
                   principal_name=r.principal_name or r.contact_name, principal_login_id=body.principal_login_id,
                   principal_password=pw, principal_phone=r.mobile)
    db.add(SchoolDetails(school_id=s.id, reg_no=r.reg_no, category=r.category, state=r.state, district=r.district, city=r.city,
                         pin=r.pin, email=r.email, contact_name=r.contact_name, onboarding_id=r.id))
    old, r.status, r.school_id, r.updated_at = r.status, "ONBOARDED", s.id, utcnow()
    _event(db, r, "status", me, frm=old, to="ONBOARDED", remarks=f"School created with code {s.code}")
    audit(db, me, "onboarding.onboarded", f"{r.reference} → {s.code}", school_id=s.id)
    try:
        db.commit()
    except IntegrityError:                                         # another admin created it a moment ago
        db.rollback()
        raise HTTPException(409, "This school was just created from this request — it was not created again") from None
    response.headers["Cache-Control"] = "no-store"
    return {"request": admin_detail(rid, me, db),
            "credentials": {"school_code": s.code, "login_id": body.principal_login_id.strip(), "password": pw,
                            "note": "Shown once. The principal must set a new password at first sign-in."}}
