"""Period timings helpers (F28)."""
import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import BellSchedule

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_PERIODS = 12
MAX_SLOTS = 20


def clean_slots(slots: list[dict]) -> list[dict]:
    """Validate + normalise. Raises 400 with a friendly message."""
    if not isinstance(slots, list) or not slots:
        raise HTTPException(400, "Add at least one period")
    if len(slots) > MAX_SLOTS:
        raise HTTPException(400, f"At most {MAX_SLOTS} periods and breaks")
    out, prev_end, n = [], None, 0
    for i, s in enumerate(slots, 1):
        if not isinstance(s, dict):
            raise HTTPException(400, f"Row {i} is not valid")
        kind = s.get("kind", "period")
        if kind not in ("period", "break"):
            raise HTTPException(400, f"Row {i}: type must be period or break")
        start, end = str(s.get("start", "")).strip(), str(s.get("end", "")).strip()
        if len(start) == 4 and start[1] == ":":
            start = "0" + start
        if len(end) == 4 and end[1] == ":":
            end = "0" + end
        if not HHMM.match(start) or not HHMM.match(end):
            raise HTTPException(400, f"Row {i}: use 24-hour times like 08:00 and 13:30")
        if end <= start:
            raise HTTPException(400, f"Row {i}: ends before it starts ({start}–{end})")
        if prev_end and start < prev_end:
            raise HTTPException(400, f"Row {i}: starts at {start}, before the previous one ends ({prev_end})")
        prev_end = end
        label = str(s.get("label") or "").strip()[:30]
        if kind == "period":
            n += 1
            label = label or f"Period {n}"
        else:
            label = label or "Break"
        out.append({"kind": kind, "label": label, "start": start, "end": end})
    if n == 0:
        raise HTTPException(400, "Add at least one period")
    if n > MAX_PERIODS:
        raise HTTPException(400, f"At most {MAX_PERIODS} periods a day")
    return out


def numbered(slots: list[dict]) -> list[dict]:
    n = 0
    res = []
    for s in slots:
        d = dict(s)
        if s["kind"] == "period":
            n += 1
            d["period"] = n
        else:
            d["period"] = None
        res.append(d)
    return res


def schedules(db: Session, school_id: int) -> dict[int, list[dict]]:
    return {b.day: b.slots for b in db.scalars(select(BellSchedule).where(BellSchedule.school_id == school_id))}


def slots_for_day(sched: dict[int, list[dict]], day: int) -> list[dict] | None:
    return sched.get(day) if day in sched else sched.get(-1)


def period_count(sched: dict[int, list[dict]], day: int) -> int | None:
    s = slots_for_day(sched, day)
    return sum(1 for x in s if x["kind"] == "period") if s else None
