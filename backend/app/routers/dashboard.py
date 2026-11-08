"""Principal analytics dashboard."""
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import principal_only
from ..db import get_db
from ..models import Attendance, Exam, Mark, Role, SchoolClass, Subject, User
from ..util import last_school_day

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(principal_only)])

LOW_ATTENDANCE = 75.0  # %
PASS_MARK = 33.0  # % (CBSE-style)
AT_RISK_MARKS = 40.0  # %
WINDOW_DAYS = 30


def _pct(a: float, b: float) -> float | None:
    return round(100 * a / b, 1) if b else None


@router.get("")
def dashboard(exam_id: int | None = None, db: Session = Depends(get_db)):
    d_today = last_school_day()
    since = d_today - timedelta(days=WINDOW_DAYS)
    classes = {c.id: c.name for c in db.scalars(select(SchoolClass).order_by(SchoolClass.name))}
    subjects = {s.id: s.name for s in db.scalars(select(Subject))}
    students = {u.id: u for u in db.scalars(select(User).where(User.role == Role.student, User.active.is_(True)))}
    n_teachers = len(list(db.scalars(select(User.id).where(User.role == Role.teacher, User.active.is_(True)))))
    roster = defaultdict(int)
    for s in students.values():
        roster[s.class_id] += 1

    # ----- attendance
    att = list(db.scalars(select(Attendance).where(Attendance.date >= since, Attendance.student_id.in_(students))))
    today_rows = [a for a in att if a.date == d_today]
    by_class_today = defaultdict(lambda: [0, 0])  # present, marked
    for a in today_rows:
        by_class_today[a.class_id][1] += 1
        by_class_today[a.class_id][0] += a.present
    attendance_today = [
        {"class_id": cid, "class_name": name, "present": by_class_today[cid][0], "total": roster[cid],
         "percent": _pct(*by_class_today[cid]) if cid in by_class_today else None}
        for cid, name in classes.items()
    ]
    unmarked = [{"class_id": r["class_id"], "class_name": r["class_name"]}
                for r in attendance_today if r["percent"] is None and r["total"] > 0]
    tp = sum(v[0] for v in by_class_today.values())
    tm = sum(v[1] for v in by_class_today.values())

    by_day = defaultdict(lambda: [0, 0])
    per_student = defaultdict(lambda: [0, 0])
    for a in att:
        by_day[a.date][0] += a.present
        by_day[a.date][1] += 1
        per_student[a.student_id][0] += a.present
        per_student[a.student_id][1] += 1
    trend = [{"date": d.isoformat(), "percent": _pct(*v)} for d, v in sorted(by_day.items())]
    student_att = {sid: _pct(*v) for sid, v in per_student.items()}

    def srow(sid, **extra):
        s = students[sid]
        return {"student_id": sid, "name": s.name, "class_name": classes.get(s.class_id, ""), **extra}

    low_att = sorted(
        (srow(sid, percent=p) for sid, p in student_att.items() if p is not None and p < LOW_ATTENDANCE),
        key=lambda r: r["percent"],
    )

    # ----- academics (one exam)
    exams = list(db.scalars(select(Exam).order_by(Exam.date.desc())))
    exam = next((e for e in exams if e.id == exam_id), None) if exam_id else None
    if not exam:
        with_marks = set(db.scalars(select(Mark.exam_id).distinct()))
        exam = next((e for e in exams if e.id in with_marks), None)
    academics = None
    student_avg: dict[int, float] = {}
    if exam:
        marks = [m for m in db.scalars(select(Mark).where(Mark.exam_id == exam.id)) if m.student_id in students]
        per_s = defaultdict(list)
        per_c = defaultdict(list)
        per_sub = defaultdict(list)
        for m in marks:
            pct = 100 * m.score / exam.max_marks
            per_s[m.student_id].append(pct)
            per_c[students[m.student_id].class_id].append(pct)
            per_sub[m.subject_id].append(pct)
        avg = lambda xs: round(sum(xs) / len(xs), 1)  # noqa: E731
        student_avg = {sid: avg(v) for sid, v in per_s.items()}
        ranked = sorted(student_avg.items(), key=lambda kv: kv[1], reverse=True)
        academics = {
            "exam": {"id": exam.id, "name": exam.name, "date": exam.date.isoformat()},
            "exams": [{"id": e.id, "name": e.name} for e in exams],
            "avg_by_class": [{"class_name": classes.get(c, ""), "percent": avg(v)}
                             for c, v in sorted(per_c.items(), key=lambda kv: classes.get(kv[0], ""))],
            "avg_by_subject": sorted(({"subject": subjects.get(s, ""), "percent": avg(v)} for s, v in per_sub.items()),
                                     key=lambda r: r["percent"]),
            "top_students": [srow(sid, percent=p) for sid, p in ranked[:5]],
            "bottom_students": [srow(sid, percent=p) for sid, p in ranked[-5:][::-1]] if len(ranked) > 5 else [],
            "pass_rate": _pct(sum(1 for p in student_avg.values() if p >= PASS_MARK), len(student_avg)),
            "school_avg": avg(list(student_avg.values())) if student_avg else None,
        }

    # ----- at risk
    at_risk = []
    for sid in students:
        a, m = student_att.get(sid), student_avg.get(sid)
        reasons = []
        if a is not None and a < LOW_ATTENDANCE:
            reasons.append(f"Attendance {a}%")
        if m is not None and m < AT_RISK_MARKS:
            reasons.append(f"Marks {m}%")
        if reasons:
            at_risk.append(srow(sid, attendance_percent=a, marks_percent=m, reasons=reasons))
    at_risk.sort(key=lambda r: (-len(r["reasons"]), r["attendance_percent"] or 100, r["marks_percent"] or 100))

    return {
        "date": d_today.isoformat(),
        "overview": {
            "students": len(students), "teachers": n_teachers, "classes": len(classes),
            "attendance_today_percent": _pct(tp, tm),
            "classes_marked": len(by_class_today), "classes_total": len([c for c in classes if roster[c]]),
        },
        "attendance_today": attendance_today,
        "unmarked_classes": unmarked,
        "attendance_trend": trend,
        "low_attendance": low_att,
        "academics": academics,
        "at_risk": at_risk,
        "thresholds": {"low_attendance": LOW_ATTENDANCE, "pass": PASS_MARK, "at_risk_marks": AT_RISK_MARKS},
    }
