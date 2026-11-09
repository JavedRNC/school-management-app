"""Platform bootstrap + demo data.

Demo logins (password demo123, school code DEMO01):
  principal · vp · coord · T001..T005 (teachers) · 2026001.. (students) · 98765000xx (parents)
Second school DEMO02 (Sun–Thu week). Super admin: school code ADMIN, login admin.
"""
import os
import random
from datetime import date, timedelta

from sqlalchemy import select

from .auth import hash_password
from .db import SessionLocal
from .models import (Assignment, Attendance, Exam, Holiday, Mark, ParentLink, Plan, Post, Role, School, SchoolClass, Subject,
                     TimetableEntry, User)
from .perms import DEFAULT_PERMISSIONS, DEFAULT_PLANS
from .util import school_days, today

DEMO_PASSWORD = "demo123"
SUBJECTS = ["English", "Hindi", "Mathematics", "Science", "Social Science"]
TEACHERS = ["Anita Sharma", "Rakesh Verma", "Sunita Singh", "Imran Khan", "Priya Nair"]
CLASSES = ["8-A", "8-B", "9-A"]
FIRST = ["Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Ishita", "Kabir", "Meera", "Rohan", "Saanvi", "Aditya", "Zoya",
         "Krishna", "Riya", "Yusuf", "Pooja", "Dev", "Nisha", "Sameer", "Tanvi", "Harsh", "Fatima", "Kunal", "Sneha"]
LAST = ["Kumar", "Gupta", "Ansari", "Patel", "Das", "Yadav", "Mishra", "Reddy"]
PERIODS = 5


def ensure_platform() -> None:
    """Default plans and the super admin account (idempotent)."""
    with SessionLocal() as db:
        if not db.scalar(select(Plan.id).limit(1)):
            for i, (name, mods, pps, mn) in enumerate(DEFAULT_PLANS):
                db.add(Plan(name=name, modules=mods, price_per_student=pps, min_monthly=mn, sort=i))
        if not db.scalar(select(User.id).where(User.role == Role.admin).limit(1)):
            env_pw = os.getenv("ADMIN_PASSWORD")
            db.add(User(school_id=None, login_id=os.getenv("ADMIN_LOGIN_ID", "admin"), name="Platform Admin", role=Role.admin,
                        password_hash=hash_password(env_pw or "admin123"), must_change_password=not env_pw))
        db.commit()


def seed_demo_if_empty() -> bool:
    with SessionLocal() as db:
        if db.scalar(select(School.id).limit(1)):
            return False
        seed_demo(db)
        return True


def _u(school, login_id, name, role, pw, **kw):
    return User(school_id=school.id, login_id=login_id, name=name, role=role, password_hash=pw, must_change_password=False, **kw)


def seed_demo(db) -> None:
    rnd = random.Random(42)
    pw = hash_password(DEMO_PASSWORD)
    plans = {p.name: p for p in db.scalars(select(Plan))}
    t0 = today()

    # ------------------------------------------------ school 1 (Mon–Sat, Premium, sponsored)
    s = School(code="DEMO01", name="Green Valley Public School", address="Station Road, Ranchi, Jharkhand",
               phone="0651-2200000", board="CBSE", working_days=[0, 1, 2, 3, 4, 5], plan_id=plans["Premium"].id,
               is_free=True, admin_notes="Demo school (sponsored).")
    db.add(s)
    db.flush()
    principal = _u(s, "principal", "Dr. Meenakshi Rao", Role.principal, pw, phone="9876543210")
    subjects = [Subject(school_id=s.id, name=n) for n in SUBJECTS]
    teachers = [_u(s, f"T00{i + 1}", n, Role.teacher, pw, phone=f"98350000{i + 1:02d}") for i, n in enumerate(TEACHERS)]
    db.add_all([principal, *subjects, *teachers])
    db.flush()
    classes = [SchoolClass(school_id=s.id, name=n, class_teacher_id=teachers[i].id) for i, n in enumerate(CLASSES)]
    db.add_all(classes)
    db.flush()
    db.add_all([
        _u(s, "vp", "Ramesh Iyer", Role.vice_principal, pw, permissions=DEFAULT_PERMISSIONS[Role.vice_principal]),
        _u(s, "coord", "Kavita Joshi", Role.coordinator, pw, permissions=DEFAULT_PERMISSIONS[Role.coordinator],
           scope_class_ids=[classes[0].id, classes[1].id]),
    ])

    students: list[User] = []
    k = 0
    for c in classes:
        for roll in range(1, 9):
            first, last = FIRST[k], LAST[k % len(LAST)]
            students.append(_u(s, f"2026{k + 1:03d}", f"{first} {last}", Role.student, pw, class_id=c.id, roll_no=roll,
                               blood_group=rnd.choice(["A+", "B+", "O+", "AB+"]), address=f"{rnd.randint(1, 200)}, Lalpur, Ranchi",
                               dob=date(2012 + (c.name.startswith("8") and 1 or 0), rnd.randint(1, 12), rnd.randint(1, 28))))
            k += 1
    db.add_all(students)
    db.flush()
    # parents: one per student, except the first parent has two children (siblings)
    parents = []
    for i, st in enumerate(students):
        if i == 9:
            continue  # student #10 shares parent #1
        last = st.name.split()[-1]
        parents.append((_u(s, f"98765000{i + 1:02d}", f"Mr. {['Rajesh', 'Suresh', 'Anil', 'Vijay', 'Manoj'][i % 5]} {last}",
                           Role.parent, pw, phone=f"98765000{i + 1:02d}"), [st]))
    parents[0][1].append(students[9])
    for p, kids in parents:
        db.add(p)
        db.flush()
        for kid in kids:
            db.add(ParentLink(school_id=s.id, parent_id=p.id, student_id=kid.id, relation="Father"))

    for c in classes:
        for sub, t in zip(subjects, teachers):
            db.add(Assignment(school_id=s.id, teacher_id=t.id, class_id=c.id, subject_id=sub.id))
    for day in s.working_days:
        for p in range(1, PERIODS + 1):
            for i, c in enumerate(classes):
                j = (p + i + day) % len(subjects)
                db.add(TimetableEntry(school_id=s.id, class_id=c.id, day=day, period=p, subject_id=subjects[j].id, teacher_id=teachers[j].id))

    # calendar
    db.add_all([
        Holiday(school_id=s.id, name="Republic Day", start_date=date(t0.year + (1 if t0.month > 1 else 0), 1, 26),
                end_date=date(t0.year + (1 if t0.month > 1 else 0), 1, 26), kind="national"),
        Holiday(school_id=s.id, name="Winter vacation", start_date=date(t0.year, 12, 25), end_date=date(t0.year + 1, 1, 1), kind="vacation"),
        Holiday(school_id=s.id, name="Annual Sports Day", start_date=t0 + timedelta(days=12), end_date=t0 + timedelta(days=12),
                kind="event", is_off=False, note="Students come in house uniform"),
        Holiday(school_id=s.id, name="School foundation day", start_date=t0 - timedelta(days=9), end_date=t0 - timedelta(days=9), kind="other"),
    ])
    db.flush()

    # attendance on real school days in the last ~30 days (today: only 2 of 3 classes marked)
    reliability = {st.id: rnd.choice([0.97, 0.95, 0.92, 0.9, 0.88, 0.85, 0.65, 0.6]) for st in students}
    days = school_days(db, s, t0 - timedelta(days=30), t0)
    for d in days:
        for st in students:
            if d == t0 and st.class_id == classes[-1].id:
                continue
            ct = next(c.class_teacher_id for c in classes if c.id == st.class_id)
            db.add(Attendance(school_id=s.id, student_id=st.id, class_id=st.class_id, date=d, present=rnd.random() < reliability[st.id], marked_by=ct))

    exams = [Exam(school_id=s.id, name="Unit Test 1", date=t0 - timedelta(days=60), max_marks=50),
             Exam(school_id=s.id, name="Half Yearly", date=t0 - timedelta(days=10), max_marks=100)]
    db.add_all(exams)
    db.flush()
    ability = {st.id: rnd.uniform(0.3, 0.95) for st in students}
    for e in exams:
        for st in students:
            for sub, t in zip(subjects, teachers):
                pct = min(1.0, max(0.05, rnd.gauss(ability[st.id], 0.1)))
                db.add(Mark(school_id=s.id, exam_id=e.id, student_id=st.id, subject_id=sub.id, score=round(pct * e.max_marks), entered_by=t.id))

    db.add_all([
        Post(school_id=s.id, kind="notice", title="Annual Sports Day", body="Sports Day will be held on the school ground. Students should come in house uniform.", author_id=principal.id),
        Post(school_id=s.id, kind="notice", title="Parent-Teacher Meeting", body="PTM on Saturday, 10 AM to 1 PM.", author_id=principal.id),
        Post(school_id=s.id, kind="homework", title="Chapter 5 exercises", body="Solve exercise 5.1 and 5.2 in your notebook.",
             class_id=classes[0].id, subject_id=subjects[2].id, due_date=t0 + timedelta(days=2), author_id=teachers[2].id),
        Post(school_id=s.id, kind="homework", title="Essay: My Village", body="Write a 200-word essay.", class_id=classes[1].id,
             subject_id=subjects[0].id, due_date=t0 + timedelta(days=3), author_id=teachers[0].id),
    ])

    # ------------------------------------------------ school 2 (Sun–Thu week, Basic plan, paid)
    s2 = School(code="DEMO02", name="Sunrise Academy", address="Hyderabad", board="State", working_days=[6, 0, 1, 2, 3],
                plan_id=plans["Basic"].id, valid_until=t0 + timedelta(days=20))
    db.add(s2)
    db.flush()
    p2 = _u(s2, "principal", "Mrs. Farah Siddiqui", Role.principal, pw)
    t2 = _u(s2, "T001", "Mohan Rao", Role.teacher, pw)
    sub2 = Subject(school_id=s2.id, name="Mathematics")
    db.add_all([p2, t2, sub2])
    db.flush()
    c2 = SchoolClass(school_id=s2.id, name="5-A", class_teacher_id=t2.id)
    db.add(c2)
    db.flush()
    db.add(Assignment(school_id=s2.id, teacher_id=t2.id, class_id=c2.id, subject_id=sub2.id))
    for i, n in enumerate(["Ayaan Khan", "Sara Reddy", "Neel Sharma"]):
        db.add(_u(s2, f"S{i + 1:03d}", n, Role.student, pw, class_id=c2.id, roll_no=i + 1))
    db.commit()


if __name__ == "__main__":
    from .migrate import migrate

    migrate()
    ensure_platform()
    print("Seeded" if seed_demo_if_empty() else "DB not empty, skipped")
