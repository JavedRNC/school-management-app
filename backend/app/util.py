import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

SCHOOL_TZ = ZoneInfo(os.getenv("SCHOOL_TZ", "Asia/Kolkata"))


def today() -> date:
    """School-local date (server may run in UTC)."""
    return datetime.now(SCHOOL_TZ).date()


def last_school_day() -> date:
    """Today, or Saturday if today is Sunday (school works Mon–Sat)."""
    d = today()
    return d.fromordinal(d.toordinal() - 1) if d.weekday() == 6 else d
