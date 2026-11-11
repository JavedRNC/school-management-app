"""F28 · Period timings (bell schedule)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import audit, require_area, school_user
from ..bell import clean_slots, numbered, period_count, schedules
from ..db import get_db
from ..models import BellSchedule, SchoolClass, TimetableEntry, User

router = APIRouter(prefix="/school/bell", tags=["bell"])
DAY = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def bell_out(db: Session, school_id: int) -> dict:
    sched = schedules(db, school_id)
    return {
        "default": numbered(sched.get(-1, [])),
        "overrides": {str(d): numbered(s) for d, s in sched.items() if d >= 0},
        "configured": -1 in sched,
    }


@router.get("")
def get_bell(user: User = Depends(school_user), db: Session = Depends(get_db)):
    return bell_out(db, user.school_id)


class BellIn(BaseModel):
    day: int = Field(ge=-1, le=6)          # -1 = default for all days
    slots: list[dict]


def _conflicts(db: Session, school_id: int, sched: dict[int, list[dict]]) -> list[str]:
    """Timetable periods that would fall beyond the number of periods of their day."""
    names = {c.id: c.name for c in db.scalars(select(SchoolClass).where(SchoolClass.school_id == school_id))}
    out = set()
    for e in db.scalars(select(TimetableEntry).where(TimetableEntry.school_id == school_id)):
        n = period_count(sched, e.day)
        if n is not None and e.period > n:
            out.add((e.day, e.period, names.get(e.class_id, "?")))
    return [f"{DAY[d]} period {p} · {c}" for d, p, c in sorted(out)]


def _check(db: Session, school_id: int, sched: dict[int, list[dict]]) -> None:
    bad = _conflicts(db, school_id, sched)
    if bad:
        more = f" and {len(bad) - 6} more" if len(bad) > 6 else ""
        raise HTTPException(409, "These timetable periods would be cut off — clear them in the timetable first: "
                            + ", ".join(bad[:6]) + more)


@router.put("")
def set_bell(body: BellIn, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    slots = clean_slots(body.slots)
    sched = schedules(db, user.school_id)
    if body.day >= 0 and -1 not in sched:
        raise HTTPException(400, "Set the timings for all days first, then a different one for a single day")
    sched[body.day] = slots
    _check(db, user.school_id, sched)
    row = db.get(BellSchedule, (user.school_id, body.day))
    if row:
        row.slots = slots
    else:
        db.add(BellSchedule(school_id=user.school_id, day=body.day, slots=slots))
    n = sum(1 for s in slots if s["kind"] == "period")
    audit(db, user, "bell.updated", f"{'All days' if body.day < 0 else DAY[body.day]}: {n} periods, {slots[0]['start']}–{slots[-1]['end']}")
    db.commit()
    return bell_out(db, user.school_id)


@router.delete("/{day}")
def clear_override(day: int, user: User = Depends(require_area("classes", "edit")), db: Session = Depends(get_db)):
    if not 0 <= day <= 6:
        raise HTTPException(400, "Only a single day's timings can be removed")
    sched = schedules(db, user.school_id)
    sched.pop(day, None)
    _check(db, user.school_id, sched)
    row = db.get(BellSchedule, (user.school_id, day))
    if row:
        db.delete(row)
        audit(db, user, "bell.day_removed", f"{DAY[day]} now uses the normal timings")
        db.commit()
    return bell_out(db, user.school_id)
