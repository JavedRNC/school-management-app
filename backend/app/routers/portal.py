"""Endpoints added for the web portal (the app can use them too): paged school list, schools export,
platform trends, school details, import/export history, push-token registration."""
import io
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..auth import admin_only, audit, current_user, require
from ..databook import safe
from ..db import get_db
from ..deps import get_school
from ..models import AuditLog, OnboardingRequest, PushToken, Role, School, SchoolDetails, User, utcnow
from ..subscription import school_status
from .admin import _school_row
from .data import XLSX, _admin_school

router = APIRouter(tags=["portal"])
SORTS = {"name": School.name, "code": School.code, "newest": School.id}


def _details(db: Session, sid: int) -> dict:
    d = db.get(SchoolDetails, sid)
    return {"reg_no": d.reg_no if d else "", "category": d.category if d else "", "state": d.state if d else "",
            "district": d.district if d else "", "city": d.city if d else "", "pin": d.pin if d else "",
            "email": d.email if d else "", "contact_name": d.contact_name if d else ""}


def _like(v: str) -> str:
    return "%" + v.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _filtered(db: Session, q: str, status: str, sort: str, direction: str) -> list[School]:
    stmt = select(School)
    q = (q or "").strip()[:80]
    if q:
        like = _like(q.lower())
        ids = select(SchoolDetails.school_id).where(or_(func.lower(SchoolDetails.reg_no).like(like, escape="\\"),
                                                        func.lower(SchoolDetails.city).like(like, escape="\\"),
                                                        func.lower(SchoolDetails.district).like(like, escape="\\")))
        stmt = stmt.where(or_(func.lower(School.name).like(like, escape="\\"), func.lower(School.code).like(like, escape="\\"),
                              School.id.in_(ids)))
    col = SORTS.get(sort, School.name)
    stmt = stmt.order_by(col.desc() if direction == "desc" else col.asc(), School.id)
    rows = list(db.scalars(stmt))
    if status:
        rows = [s for s in rows if school_status(s) == status]
    return rows


@router.get("/admin/schools-page")
def schools_page(q: str = "", status: str = "", sort: str = "name", dir: str = "asc", page: int = 1, size: int = 20,
                 me: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Search (name, code, registration no., city, district), filter by subscription status, sort and page."""
    page, size = max(1, page), min(max(1, size), 100)
    rows = _filtered(db, q, status, sort, dir)
    chunk = rows[(page - 1) * size: page * size]
    return {"items": [{**_school_row(db, s), **_details(db, s.id), "created_at": s.created_at} for s in chunk],
            "total": len(rows), "page": page, "size": size}


@router.get("/admin/schools-export")
def schools_export(q: str = "", status: str = "", me: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Excel list of schools with counts. Platform-level facts only — no student, parent or staff personal data."""
    from openpyxl import Workbook
    from openpyxl.styles import Font

    rows = _filtered(db, q, status, "name", "asc")[:5000]
    wb = Workbook()
    ws = wb.active
    ws.title = "Schools"
    head = ["School code", "School name", "Status", "Plan", "Students", "Teachers", "Parents", "Registration no.", "Category",
            "City", "District", "State", "PIN", "Board", "Valid until", "Joined on"]
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True)
    for s in rows:
        r, d = _school_row(db, s), _details(db, s.id)
        ws.append([safe(v) for v in (r["code"], r["name"], r["status"], r["plan"] or "", r["students"], r["teachers"], r["parents"],
                                     d["reg_no"], d["category"], d["city"], d["district"], d["state"], d["pin"], s.board,
                                     r["valid_until"], s.created_at.date() if s.created_at else None)])
    for i, w in enumerate([14, 36, 12, 14, 10, 10, 10, 20, 16, 16, 16, 16, 9, 12, 12, 12], start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    audit(db, me, "schools.exported", f"{len(rows)} schools")
    db.commit()
    return Response(buf.getvalue(), media_type=XLSX, headers={
        "Content-Disposition": f'attachment; filename="Prangan-Schools-{date.today().isoformat()}.xlsx"', "Cache-Control": "no-store"})


@router.get("/admin/trends")
def trends(months: int = 12, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    """Real counts per month: schools joined and onboarding requests received."""
    months = min(max(1, months), 36)
    t = date.today().replace(day=1)
    keys = []
    for _ in range(months):
        keys.append(t.strftime("%Y-%m"))
        t = (t.replace(day=1) - __import__("datetime").timedelta(days=1)).replace(day=1)
    keys.reverse()
    start = datetime.strptime(keys[0], "%Y-%m")
    joined = {k: 0 for k in keys}
    asked = {k: 0 for k in keys}
    for (at,) in db.execute(select(School.created_at).where(School.created_at >= start)):
        if at and at.strftime("%Y-%m") in joined:
            joined[at.strftime("%Y-%m")] += 1
    for (at,) in db.execute(select(OnboardingRequest.created_at).where(OnboardingRequest.created_at >= start)):
        if at and at.strftime("%Y-%m") in asked:
            asked[at.strftime("%Y-%m")] += 1
    return {"months": keys, "schools_joined": [joined[k] for k in keys], "requests": [asked[k] for k in keys]}


class DetailsIn(BaseModel):
    reg_no: str = Field(default="", max_length=60)
    category: str = Field(default="", max_length=40)
    state: str = Field(default="", max_length=60)
    district: str = Field(default="", max_length=60)
    city: str = Field(default="", max_length=80)
    pin: str = Field(default="", pattern=r"^([1-9][0-9]{5})?$")
    email: str = Field(default="", max_length=160)
    contact_name: str = Field(default="", max_length=120)


@router.get("/admin/schools/{sid}/details")
def get_details(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    if not db.get(School, sid):
        raise HTTPException(404, "School not found")
    return _details(db, sid)


@router.put("/admin/schools/{sid}/details")
def put_details(sid: int, body: DetailsIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    if not db.get(School, sid):
        raise HTTPException(404, "School not found")
    reg = body.reg_no.strip()
    if reg:
        other = db.scalar(select(SchoolDetails).where(func.lower(SchoolDetails.reg_no) == reg.lower(), SchoolDetails.school_id != sid))
        if other:
            raise HTTPException(409, "Another school already has this registration number")
    d = db.get(SchoolDetails, sid)
    if not d:
        d = SchoolDetails(school_id=sid)
        db.add(d)
    for k, v in body.model_dump().items():
        setattr(d, k, v.strip())
    audit(db, me, "school.details.updated", "", school_id=sid)
    db.commit()
    return _details(db, sid)


# ---------------------------------------------------------------- import / export history (from the audit log)
def _history(db: Session, sid: int) -> list[dict]:
    rows = db.scalars(select(AuditLog).where(AuditLog.school_id == sid, AuditLog.action.like("data.%"))
                      .order_by(AuditLog.at.desc()).limit(100))
    return [{"id": a.id, "at": a.at, "actor_name": a.actor_name, "actor_role": a.actor_role, "action": a.action, "detail": a.detail}
            for a in rows]


@router.get("/data/history")
def data_history(me: User = Depends(require(Role.principal)), db: Session = Depends(get_db)):
    """Who downloaded the template or a backup, and who imported what, for the principal's own school."""
    return _history(db, get_school(db, me).id)


@router.get("/admin/schools/{sid}/data/history")
def admin_data_history(sid: int, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    return _history(db, _admin_school(db, sid).id)


# ---------------------------------------------------------------- push tokens
class PushIn(BaseModel):
    token: str = Field(min_length=20, max_length=400)
    platform: str = Field(default="android", pattern="^(android|ios)$")


@router.post("/push/register")
def push_register(body: PushIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    """This phone should get this user's notifications. A token belongs to one user at a time."""
    row = db.scalar(select(PushToken).where(PushToken.token == body.token))
    if row:
        row.user_id, row.platform, row.updated_at = me.id, body.platform, utcnow()
    else:
        # keep at most 5 phones per user
        old = list(db.scalars(select(PushToken).where(PushToken.user_id == me.id).order_by(PushToken.updated_at.desc()).offset(4)))
        for o in old:
            db.delete(o)
        db.add(PushToken(user_id=me.id, token=body.token, platform=body.platform))
    db.commit()
    return {"ok": True}


@router.post("/push/unregister")
def push_unregister(body: PushIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.scalar(select(PushToken).where(PushToken.token == body.token, PushToken.user_id == me.id))
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}
