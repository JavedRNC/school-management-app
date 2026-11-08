"""Demo data. All demo accounts use password: demo123"""
import random
from datetime import timedelta

from sqlalchemy import select

from .auth import hash_password
from .db import Base, SessionLocal, engine
from .models import Assignment, Attendance, Exam, Mark, Post, Role, SchoolClass, Subject, TimetableEntry, User
from .util import last_school_day, today

DEMO_PASSWORD = "demo123"
SUBJECTS = ["English", "Hindi", "Mathematics", "Science", "Social Science"]
TEACHERS = ["Anita Sharma", "Rakesh Verma", "Sunita Singh", "Imran Khan", "Priya Nair"]  # one per subject
CLASSES = ["8-A", "8-B", "9-A"]
FIRST = ["Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Ishita", "Kabir", "Meera", "Rohan", "Saanvi",
         "Aditya", "Zoya", "Krishna", "Riya", "Yusuf", "Pooja", "Dev", "Nisha", "Sameer", "Tanvi",
         "Harsh", "Fatima", "Kunal", "Sneha"]
LAST = ["Kumar", "Gupta", "Ansari", "Patel", "Das", "Yadav", "Mishra", "Reddy"]
PERIODS = 5


def seed_if_empty() -> bool:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            return False
        seed(db)
        return True


def seed(db) -> None:
    rnd = random.Random(42)
    pw = hash_password(DEMO_PASSWORD)
    principal = User(name="Dr. Meenakshi Rao", email="principal@school.com", password_hash=pw, role=Role.principal)
    db.add(principal)
    subjects = [Subject(name=n) for n in SUBJECTS]
    teachers = [User(name=n, email=f"{n.split()[0].lower()}@school.com", password_hash=pw, role=Role.teacher)
                for n in TEACHERS]
    db.add_all(subjects + teachers)
    db.flush()
    classes = [SchoolClass(name=n, class_teacher_id=teachers[i].id) for i, n in enumerate(CLASSES)]
    db.add_all(classes)
    db.flush()

    students: list[User] = []
    k = 0
    for c in classes:
        for roll in range(1, 9):
            first, last = FIRST[k], LAST[k % len(LAST)]
            students.append(User(name=f"{first} {last}", email=f"{first.lower()}@school.com", password_hash=pw,
                                 role=Role.student, class_id=c.id, roll_no=roll))
            k += 1
    db.add_all(students)
    db.flush()

    for c in classes:
        for s, t in zip(subjects, teachers):
            db.add(Assignment(teacher_id=t.id, class_id=c.id, subject_id=s.id))
    for day in range(6):
        for p in range(1, PERIODS + 1):
            for i, c in enumerate(classes):
                j = (p + i + day) % len(subjects)  # distinct subject per class each period -> no teacher clash
                db.add(TimetableEntry(class_id=c.id, day=day, period=p, subject_id=subjects[j].id,
                                      teacher_id=teachers[j].id))

    # attendance: last 30 days, Mon–Sat; today only for first two classes (third shows as "unmarked")
    reliability = {s.id: rnd.choice([0.97, 0.95, 0.92, 0.9, 0.88, 0.85, 0.65, 0.6]) for s in students}
    d0 = today()
    ref = last_school_day()
    for back in range(30, -1, -1):
        d = ref - timedelta(days=back)
        if d.weekday() == 6:
            continue
        for s in students:
            if back == 0 and s.class_id == classes[-1].id:
                continue
            teacher = next(c.class_teacher_id for c in classes if c.id == s.class_id)
            db.add(Attendance(student_id=s.id, class_id=s.class_id, date=d,
                              present=rnd.random() < reliability[s.id], marked_by=teacher))

    exams = [Exam(name="Unit Test 1", date=d0 - timedelta(days=60), max_marks=50),
             Exam(name="Half Yearly", date=d0 - timedelta(days=10), max_marks=100)]
    db.add_all(exams)
    db.flush()
    ability = {s.id: rnd.uniform(0.3, 0.95) for s in students}
    for e in exams:
        for s in students:
            for sub, t in zip(subjects, teachers):
                pct = min(1.0, max(0.05, rnd.gauss(ability[s.id], 0.1)))
                db.add(Mark(exam_id=e.id, student_id=s.id, subject_id=sub.id,
                            score=round(pct * e.max_marks), entered_by=t.id))

    db.add_all([
        Post(kind="notice", title="Annual Sports Day", body="Sports Day will be held on the school ground. "
             "Students should come in house uniform.", author_id=principal.id),
        Post(kind="notice", title="Parent-Teacher Meeting", body="PTM on Saturday, 10 AM to 1 PM.",
             author_id=principal.id),
        Post(kind="homework", title="Chapter 5 exercises", body="Solve exercise 5.1 and 5.2 in your notebook.",
             class_id=classes[0].id, subject_id=subjects[2].id, due_date=d0 + timedelta(days=2),
             author_id=teachers[2].id),
        Post(kind="homework", title="Essay: My Village", body="Write a 200-word essay.", class_id=classes[1].id,
             subject_id=subjects[0].id, due_date=d0 + timedelta(days=3), author_id=teachers[0].id),
    ])
    db.commit()


if __name__ == "__main__":
    print("Seeded" if seed_if_empty() else "DB not empty, skipped")
