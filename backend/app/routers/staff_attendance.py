"""GPS staff attendance (F22). Module: staff_attendance. Location is read only at check-in/out."""
import math
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import audit, require, require_area, require_module, school_user
from ..db import get_db
from ..deps import get_prefs, get_school
from ..models import Role, StaffAttendance, User, utcnow
from ..routers.leaves import approved_leave_dates
from ..util import SCHOOL_TZ, day_status, school_days, today

router = APIRouter(prefix="/staff-attendance", tags=["staff attendance"], dependencies=[Depends(require_module("staff_attendance"))])

STAFF = (Role.teacher, Role.vice_principal, Role.coordinator)
MAX_ACCURACY_M = 100


class GeoIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)
    mocked: bool = False


class SchoolGeoIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=150, ge=50, le=1000)
    late_after: str = Field(default="09:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class ManualIn(BaseModel):
    user_id: int
    date: date
    present: bool = True
    note: str = Field(default="", max_length=200)


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _local_now() -> datetime:
    return datetime.now(SCHOOL_TZ)


def _check_geo(db: Session, user: User, body: GeoIn) -> float:
    prefs = get_prefs(db, user.school_id)
    if prefs.geo_lat is None or prefs.geo_lng is None:
        raise HTTPException(409, "The principal hasn't set the school location yet")
    if body.mocked:
        raise HTTPException(400, "A fake-location app seems to be on. Turn it off to check in.")
    if body.accuracy is not None and body.accuracy > MAX_ACCURACY_M:
        raise HTTPException(400, f"Location isn't precise enough (±{body.accuracy:.0f} m). Step outside or turn on GPS and try again.")
    d = distance_m(prefs.geo_lat, prefs.geo_lng, body.lat, body.lng)
    if d > prefs.geo_radius_m:
        raise HTTPException(403, f"You're {d:.0f} m from school — check-in works within {prefs.geo_radius_m} m.")
    return d


def _row(a: StaffAttendance | None) -> dict | None:
    if not a:
        return None
    return {"date": a.date, "check_in_at": a.check_in_at, "check_out_at": a.check_out_at, "late": a.late,
            "in_distance_m": a.in_distance_m, "manual": a.marked_by is not None, "note": a.note}


@router.get("/settings")
def get_geo(user: User = Depends(school_user), db: Session = Depends(get_db)):
    p = get_prefs(db, user.school_id)
    db.commit()
    return {"lat": p.geo_lat, "lng": p.geo_lng, "radius_m": p.geo_radius_m, "late_after": p.late_after, "configured": p.geo_lat is not None}


@router.put("/settings")
def set_geo(body: SchoolGeoIn, user: User = Depends(require_area("settings", "edit")), db: Session = Depends(get_db)):
    p = get_prefs(db, user.school_id)
    p.geo_lat, p.geo_lng, p.geo_radius_m, p.late_after = body.lat, body.lng, body.radius_m, body.late_after
    audit(db, user, "staff_attendance.location_set", f"radius {body.radius_m} m, late after {body.late_after}")
    db.commit()
    return get_geo(user, db)


@router.get("/me")
def my_status(month: str | None = None, user: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    t = today()
    school = get_school(db, user)
    ok, reason = day_status(db, school, t)
    rec = db.scalar(select(StaffAttendance).where(StaffAttendance.user_id == user.id, StaffAttendance.date == t))
    on_leave = t in approved_leave_dates(db, [user.id], t, t).get(user.id, set())
    y, m = (int(month[:4]), int(month[5:7])) if month else (t.year, t.month)
    start = date(y, m, 1)
    end = min((date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)), t)
    rows = {a.date: a for a in db.scalars(select(StaffAttendance).where(StaffAttendance.user_id == user.id,
                                                                        StaffAttendance.date >= start, StaffAttendance.date <= end))}
    leave = approved_leave_dates(db, [user.id], start, end).get(user.id, set())
    days = []
    for d in school_days(db, school, start, end) if end >= start else []:
        a = rows.get(d)
        days.append({"date": d, "status": "leave" if d in leave else ("late" if a and a.late else "present" if a and a.check_in_at else "absent"),
                     "check_in_at": a.check_in_at if a else None, "check_out_at": a.check_out_at if a else None})
    summary = {k: sum(1 for x in days if x["status"] == k) for k in ("present", "late", "leave", "absent")}
    return {"today": {"date": t, "is_school_day": ok, "reason": reason, "on_leave": on_leave, "record": _row(rec)},
            "month": f"{y:04d}-{m:02d}", "days": days, "summary": summary, "settings": get_geo(user, db)}


@router.post("/check-in")
def check_in(body: GeoIn, user: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    t = today()
    ok, reason = day_status(db, get_school(db, user), t)
    if not ok:
        raise HTTPException(400, f"No school today ({reason})")
    d = _check_geo(db, user, body)
    rec = db.scalar(select(StaffAttendance).where(StaffAttendance.user_id == user.id, StaffAttendance.date == t))
    if rec and rec.check_in_at:
        raise HTTPException(409, "You've already checked in today")
    late_after = get_prefs(db, user.school_id).late_after or "09:00"
    hh, mm = map(int, late_after.split(":"))
    now = _local_now()
    late = (now.hour, now.minute) > (hh, mm)
    if not rec:
        rec = StaffAttendance(school_id=user.school_id, user_id=user.id, date=t)
        db.add(rec)
    rec.check_in_at, rec.in_distance_m, rec.in_accuracy_m, rec.late = utcnow(), round(d, 1), body.accuracy, late
    db.commit()
    return _row(rec)


@router.post("/check-out")
def check_out(body: GeoIn, user: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    t = today()
    rec = db.scalar(select(StaffAttendance).where(StaffAttendance.user_id == user.id, StaffAttendance.date == t))
    if not rec or not rec.check_in_at:
        raise HTTPException(409, "Check in first")
    if rec.check_out_at:
        raise HTTPException(409, "You've already checked out today")
    d = _check_geo(db, user, body)
    rec.check_out_at, rec.out_distance_m = utcnow(), round(d, 1)
    db.commit()
    return _row(rec)


def _staff(db: Session, school_id: int) -> list[User]:
    return list(db.scalars(select(User).where(User.school_id == school_id, User.role.in_(STAFF), User.active.is_(True)).order_by(User.name)))


@router.get("/day")
def day_board(day: date | None = None, user: User = Depends(require_area("staff_attendance", "view")), db: Session = Depends(get_db)):
    d = day or today()
    ok, reason = day_status(db, get_school(db, user), d)
    staff = _staff(db, user.school_id)
    recs = {a.user_id: a for a in db.scalars(select(StaffAttendance).where(StaffAttendance.school_id == user.school_id, StaffAttendance.date == d))}
    leave = approved_leave_dates(db, [s.id for s in staff], d, d)
    rows = []
    for s in staff:
        a = recs.get(s.id)
        status = "leave" if d in leave.get(s.id, set()) else ("late" if a and a.late else "present" if a and a.check_in_at else "absent")
        rows.append({"user_id": s.id, "name": s.name, "role": s.role.value, "login_id": s.login_id, "status": status, **(_row(a) or {})})
    summary = {k: sum(1 for r in rows if r["status"] == k) for k in ("present", "late", "leave", "absent")}
    return {"date": d, "is_school_day": ok, "reason": reason, "rows": rows, "summary": summary}


@router.post("/manual")
def manual_mark(body: ManualIn, user: User = Depends(require_area("staff_attendance", "edit")), db: Session = Depends(get_db)):
    """Manager marks a staff member present/absent (e.g. phone problem). Logged."""
    target = db.get(User, body.user_id)
    if not target or target.school_id != user.school_id or target.role not in STAFF:
        raise HTTPException(404, "Staff member not found")
    if body.date > today():
        raise HTTPException(400, "Can't mark a future date")
    rec = db.scalar(select(StaffAttendance).where(StaffAttendance.user_id == target.id, StaffAttendance.date == body.date))
    if body.present:
        if not rec:
            rec = StaffAttendance(school_id=user.school_id, user_id=target.id, date=body.date)
            db.add(rec)
        rec.check_in_at = rec.check_in_at or utcnow()
        rec.marked_by, rec.note, rec.late = user.id, body.note.strip(), False
    elif rec:
        db.delete(rec)
    audit(db, user, "staff_attendance.manual", f"{target.name} {body.date} {'present' if body.present else 'absent'}")
    db.commit()
    return {"ok": True}


@router.get("/report")
def month_report(month: str | None = None, user: User = Depends(require_area("staff_attendance", "view")), db: Session = Depends(get_db)):
    t = today()
    y, m = (int(month[:4]), int(month[5:7])) if month else (t.year, t.month)
    start = date(y, m, 1)
    end = min(date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1), t)
    days = school_days(db, get_school(db, user), start, end) if end >= start else []
    staff = _staff(db, user.school_id)
    recs = list(db.scalars(select(StaffAttendance).where(StaffAttendance.school_id == user.school_id,
                                                         StaffAttendance.date >= start, StaffAttendance.date <= end)))
    leave = approved_leave_dates(db, [s.id for s in staff], start, end)
    by_user: dict[int, dict[date, StaffAttendance]] = {}
    for a in recs:
        by_user.setdefault(a.user_id, {})[a.date] = a
    rows = []
    for s in staff:
        mine = by_user.get(s.id, {})
        lv = leave.get(s.id, set())
        present = sum(1 for d in days if d in mine and mine[d].check_in_at and d not in lv)
        late = sum(1 for d in days if d in mine and mine[d].late and d not in lv)
        on_leave = sum(1 for d in days if d in lv)
        rows.append({"user_id": s.id, "name": s.name, "role": s.role.value, "present": present, "late": late, "leave": on_leave,
                     "absent": len(days) - present - on_leave, "percent": round(100 * present / max(1, len(days) - on_leave), 1)})
    return {"month": f"{y:04d}-{m:02d}", "school_days": len(days), "rows": rows}

