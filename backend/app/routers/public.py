"""Public data for the Prangan website: schools that opted in to be listed + platform-wide totals.
Nothing personal: names of schools, city, board, and aggregate counts only."""
import hashlib
import time

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import admin_only, audit, require
from ..db import get_db
from ..models import Role, School, SchoolShowcase, User, utcnow

router = APIRouter(tags=["public"])
_cache: dict = {"at": 0.0, "data": None}
CACHE_SECONDS = 300
PALETTE = ["#1E40AF", "#B45309", "#047857", "#7C3AED", "#BE123C", "#0E7490", "#4D7C0F", "#C2410C"]
STOP = {"the", "of", "and", "school", "public", "academy", "vidyalaya", "high", "senior", "secondary", "convent", "international"}


def initials(name: str) -> str:
    words = [w for w in "".join(c if c.isalnum() else " " for c in name).split() if w]
    key = [w for w in words if w.lower() not in STOP] or words
    return "".join(w[0] for w in key[:2]).upper() or "S"


def crest(code: str, name: str) -> dict:
    h = int(hashlib.sha256(code.upper().encode()).hexdigest(), 16)
    return {"initials": initials(name), "color": PALETTE[h % len(PALETTE)], "shape": ("shield", "circle", "hex")[(h >> 8) % 3],
            "motif": ("book", "star", "lamp", "leaf")[(h >> 16) % 4]}


def public_data(db: Session) -> dict:
    rows = db.execute(select(School, SchoolShowcase).join(SchoolShowcase, SchoolShowcase.school_id == School.id)
                      .where(SchoolShowcase.show.is_(True), School.suspended.is_(False)).order_by(School.created_at)).all()
    schools = [{"name": s.name, "city": sc.city, "board": s.board, "demo": s.code.upper().startswith("DEMO"),
                "since": s.created_at.year if s.created_at else None, "crest": crest(s.code, s.name)} for s, sc in rows]
    real = select(School.id).where(School.suspended.is_(False), ~School.code.ilike("DEMO%"))
    count = lambda role: db.scalar(select(func.count()).select_from(User).where(  # noqa: E731
        User.role == role, User.active.is_(True), User.school_id.in_(real))) or 0
    stats = {"schools": db.scalar(select(func.count()).select_from(real.subquery())) or 0,
             "students": count(Role.student), "teachers": count(Role.teacher), "parents": count(Role.parent)}
    return {"schools": schools, "stats": stats}


@router.get("/public/schools")
def public_schools(response: Response, db: Session = Depends(get_db)):
    now = time.monotonic()
    if _cache["data"] is None or now - _cache["at"] > CACHE_SECONDS:
        _cache["data"], _cache["at"] = public_data(db), now
    response.headers["Cache-Control"] = "public, max-age=300"
    return _cache["data"]


class ShowcaseIn(BaseModel):
    show: bool
    city: str = Field(default="", max_length=60)


def _get(db: Session, sid: int) -> SchoolShowcase:
    row = db.get(SchoolShowcase, sid)
    if not row:
        row = SchoolShowcase(school_id=sid, show=False, city="")
        db.add(row)
        db.flush()
    return row


def _out(row: SchoolShowcase, s: School) -> dict:
    return {"show": row.show, "city": row.city, "name": s.name, "board": s.board, "crest": crest(s.code, s.name)}


@router.get("/school/showcase")
def get_showcase(me: User = Depends(require(Role.principal)), db: Session = Depends(get_db)):
    s = db.get(School, me.school_id)
    row = _get(db, s.id)
    db.commit()
    return _out(row, s)


@router.put("/school/showcase")
def set_showcase(body: ShowcaseIn, me: User = Depends(require(Role.principal)), db: Session = Depends(get_db)):
    s = db.get(School, me.school_id)
    row = _get(db, s.id)
    row.show, row.city, row.updated_at = body.show, body.city.strip(), utcnow()
    audit(db, me, "website.listing", f"{'shown' if body.show else 'hidden'} on the Prangan website")
    db.commit()
    _cache["data"] = None
    return _out(row, s)


@router.put("/admin/schools/{sid}/showcase")
def admin_showcase(sid: int, body: ShowcaseIn, me: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = db.get(School, sid)
    if not s:
        raise HTTPException(404, "School not found")
    row = _get(db, s.id)
    row.show, row.city, row.updated_at = body.show, body.city.strip(), utcnow()
    audit(db, me, "website.listing", f"{'shown' if body.show else 'hidden'} by platform admin", school_id=s.id)
    db.commit()
    _cache["data"] = None
    return _out(row, s)
