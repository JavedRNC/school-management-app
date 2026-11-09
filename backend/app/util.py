import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

SCHOOL_TZ = ZoneInfo(os.getenv("SCHOOL_TZ", "Asia/Kolkata"))


def today() -> date:
    """School-local date (server may run in UTC)."""
    return datetime.now(SCHOOL_TZ).date()


def holiday_dates(db, school_id: int, start: date, end: date) -> dict[date, str]:
    """Off-days from the school calendar within [start, end] → {date: name}."""
    from sqlalchemy import select

    from .models import Holiday

    out: dict[date, str] = {}
    rows = db.scalars(select(Holiday).where(Holiday.school_id == school_id, Holiday.is_active.is_(True),
                                            Holiday.is_off.is_(True), Holiday.start_date <= end,
                                            Holiday.end_date >= start))
    for h in rows:
        d = max(h.start_date, start)
        while d <= min(h.end_date, end):
            out[d] = h.name
            d += timedelta(days=1)
    return out


def day_status(db, school, d: date) -> tuple[bool, str]:
    """(is_school_day, reason) using working days (F4) and calendar holidays (F18)."""
    if d.weekday() not in (school.working_days or []):
        return False, "Weekly off"
    name = holiday_dates(db, school.id, d, d).get(d)
    if name:
        return False, name
    return True, ""


def school_days(db, school, start: date, end: date) -> list[date]:
    off = holiday_dates(db, school.id, start, end)
    days, d = [], start
    while d <= end:
        if d.weekday() in (school.working_days or []) and d not in off:
            days.append(d)
        d += timedelta(days=1)
    return days


def last_school_day(db, school, ref: date | None = None) -> date:
    d = ref or today()
    for _ in range(60):
        if day_status(db, school, d)[0]:
            return d
        d -= timedelta(days=1)
    return ref or today()
