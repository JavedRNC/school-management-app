"""Principal analytics dashboard."""
from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_area
from ..db import get_db
from ..deps import get_school
from ..models import Attendance, Exam, Mark, Role, SchoolClass, Subject, User
from ..util import day_status, last_school_day, school_days, today

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

LOW_ATTENDANCE = 75.0  # %
PASS_MARK = 33.0  # % (CBSE-style)
AT_RISK_MARKS = 40.0  # %
WINDOW_DAYS = 30


def _pct(a: float, b: float) -> float | None:
    return round(100 * a / b, 1) if b else None


@router.get("")
def dashboard(exam_id: int | None = None, user: User = Depends(require_area("insights", "view")), db: Session = Depends(get_db)):
    sid_ = user.school_id
    school = get_school(db, user)
    is_open, closed_reason = day_status(db, school, today())
    d_today = last_school_day(db, school)
    since = d_today - timedelta(days=WINDOW_DAYS)
    valid_days = set(school_days(db, school, since, d_today))
    class_rows = list(db.scalars(select(SchoolClass).where(SchoolClass.school_id == sid_, SchoolClass.is_active.is_(True)).order_by(SchoolClass.name)))
    classes = {c.id: c.name for c in class_rows}
    class_teacher = {c.id: c.class_teacher_id for c in class_rows}
    subjects = {s.id: s.name for s in db.scalars(select(Subject).where(Subject.school_id == sid_, Subject.is_active.is_(True)))}
    students = {u.id: u for u in db.scalars(select(User).where(User.school_id == sid_, User.role == Role.student, User.active.is_(True)))}
    staff_names = {u.id: u.name for u in db.scalars(select(User).where(User.school_id == sid_, User.role == Role.teacher))}
    n_teachers = len(list(db.scalars(select(User.id).where(User.school_id == sid_, User.role == Role.teacher, User.active.is_(True)))))
    n_parents = len(list(db.scalars(select(User.id).where(User.school_id == sid_, User.role == Role.parent, User.active.is_(True)))))
    roster = defaultdict(int)
    for s in students.values():
        roster[s.class_id] += 1

    # ----- attendance
    att = [a for a in db.scalars(select(Attendance).where(Attendance.school_id == sid_, Attendance.date >= since,
                                                          Attendance.student_id.in_(students or {0})))
           if a.date in valid_days]
    today_rows = [a for a in att if a.date == d_today]
    by_class_today = defaultdict(lambda: [0, 0])  # present, marked
    for a in today_rows:
        by_class_today[a.class_id][1] += 1
        by_class_today[a.class_id][0] += a.present
    attendance_today = [
        {"class_id": cid, "class_name": name, "present": by_class_today[cid][0] if cid in by_class_today else 0,
         "total": roster[cid], "percent": _pct(*by_class_today[cid]) if cid in by_class_today else None}
        for cid, name in classes.items()
    ]
    unmarked = [{"class_id": r["class_id"], "class_name": r["class_name"],
                 "class_teacher": staff_names.get(class_teacher.get(r["class_id"])) if class_teacher.get(r["class_id"]) else None}
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
    exams = list(db.scalars(select(Exam).where(Exam.school_id == sid_, Exam.is_active.is_(True)).order_by(Exam.date.desc())))
    exam = next((e for e in exams if e.id == exam_id), None) if exam_id else None
    if not exam:
        with_marks = set(db.scalars(select(Mark.exam_id).where(Mark.school_id == sid_).distinct()))
        exam = next((e for e in exams if e.id in with_marks), None)
    academics = None
    student_avg: dict[int, float] = {}
    if exam:
        marks = [m for m in db.scalars(select(Mark).where(Mark.exam_id == exam.id))
                 if m.student_id in students and m.subject_id in subjects]
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
        "today_is_school_day": is_open,
        "closed_reason": closed_reason,
        "overview": {
            "students": len(students), "teachers": n_teachers, "parents": n_parents, "classes": len(classes),
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
