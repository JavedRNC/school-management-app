"""Platform bootstrap + demo data.

Demo logins (password demo123, school code DEMO01):
  principal · vp · coord · T001..T005 (teachers) · 2026001.. (students) · 98765000xx (parents)
Second school DEMO02 (Sun–Thu week). Super admin: school code ADMIN, login admin.
"""
import logging
import os
import random
from datetime import date, timedelta

from sqlalchemy import select

from .auth import hash_password, verify_password
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
        # The platform admin never starts with a publicly known password. Without ADMIN_PASSWORD a random temporary one is
        # made and written ONCE to the server log (Render → Logs); it must be changed at first sign-in.
        # ALLOW_DEFAULT_ADMIN_PASSWORD=1 keeps the old "admin123" for automated tests and local development only.
        env_pw = os.getenv("ADMIN_PASSWORD")
        allow_default = os.getenv("ALLOW_DEFAULT_ADMIN_PASSWORD") == "1"

        def first_password() -> str:
            if env_pw:
                return env_pw
            if allow_default:
                return "admin123"
            import secrets
            pw = secrets.token_urlsafe(9)
            logging.getLogger("seed").warning("Platform admin temporary password (shown once, change it at first sign-in): %s", pw)
            return pw

        admin = db.scalar(select(User).where(User.role == Role.admin).order_by(User.id))
        if not admin:
            db.add(User(school_id=None, login_id=os.getenv("ADMIN_LOGIN_ID", "admin"), name="Platform Admin", role=Role.admin,
                        password_hash=hash_password(first_password()), must_change_password=not env_pw))
        elif admin.must_change_password and not allow_default and verify_password("admin123", admin.password_hash):
            # an older install still on the well-known default that nobody has changed yet: replace it now
            admin.password_hash = hash_password(first_password())
            admin.must_change_password = not env_pw
            admin.failed_logins, admin.locked_until = 0, None
        reset_pw = os.getenv("ADMIN_RESET_PASSWORD")
        if reset_pw:
            # recovery switch: set ADMIN_RESET_PASSWORD on the server, restart, log in, then REMOVE the variable
            admin = db.scalar(select(User).where(User.role == Role.admin).order_by(User.id))
            if admin:
                admin.password_hash = hash_password(reset_pw)
                admin.failed_logins = 0
                admin.locked_until = None
                admin.must_change_password = True
                admin.active = True
                from . import ratelimit
                ratelimit.forget_user(admin.id)
                logging.getLogger("seed").warning("Admin password reset from ADMIN_RESET_PASSWORD — remove that variable now")
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


def seed_phase2_demo() -> bool:
    """Phase 2 demo data for DEMO01 (idempotent; runs on existing databases too)."""
    from datetime import datetime, time, timezone

    from .models import (Banner, LeaveRequest, Poll, PollResponse, Route, SchoolPrefs, StaffAttendance, Stop, StudentTransport,
                         Vehicle)
    from .util import SCHOOL_TZ

    with SessionLocal() as db:
        s = db.scalar(select(School).where(School.code == "DEMO01"))
        if not s or db.scalar(select(Vehicle.id).where(Vehicle.school_id == s.id).limit(1)):
            return False
        t0 = today()
        users = {u.login_id: u for u in db.scalars(select(User).where(User.school_id == s.id))}
        students = sorted([u for u in users.values() if u.role == Role.student], key=lambda u: u.login_id)
        principal = users["principal"]
        prefs = db.get(SchoolPrefs, s.id) or SchoolPrefs(school_id=s.id)
        prefs.leave_quotas = {"casual": 12, "sick": 10, "earned": 15}
        prefs.geo_lat, prefs.geo_lng, prefs.geo_radius_m, prefs.late_after = 23.3441, 85.3096, 150, "08:45"
        db.merge(prefs)

        # transport
        v1 = Vehicle(school_id=s.id, number="JH01 AB 1234", kind="bus", capacity=40, insurance_until=t0 + timedelta(days=20),
                     fitness_until=t0 + timedelta(days=200), driver_name="Ramesh Yadav", driver_phone="9835011111",
                     driver_licence="JH0120180012345", licence_until=t0 + timedelta(days=400), attendant_name="Sita Devi", attendant_phone="9835022222")
        v2 = Vehicle(school_id=s.id, number="JH01 CD 5678", kind="van", capacity=12, insurance_until=t0 + timedelta(days=150),
                     fitness_until=t0 + timedelta(days=90), driver_name="Mohd. Salim", driver_phone="9835033333")
        db.add_all([v1, v2])
        db.flush()
        r1 = Route(school_id=s.id, name="Route 1 · Lalpur – Kanke Road", vehicle_id=v1.id)
        r2 = Route(school_id=s.id, name="Route 2 · Hinoo – Doranda", vehicle_id=v2.id)
        db.add_all([r1, r2])
        db.flush()
        stops1 = [Stop(school_id=s.id, route_id=r1.id, name=n, seq=i, pickup_time=p, drop_time=d) for i, (n, p, d) in enumerate(
            [("Lalpur Chowk", "07:05", "14:40"), ("Karamtoli", "07:15", "14:30"), ("Morabadi Ground", "07:25", "14:20"), ("Kanke Road", "07:35", "14:10")])]
        stops2 = [Stop(school_id=s.id, route_id=r2.id, name=n, seq=i, pickup_time=p, drop_time=d) for i, (n, p, d) in enumerate(
            [("Hinoo Chowk", "07:10", "14:35"), ("Doranda Market", "07:20", "14:25")])]
        db.add_all(stops1 + stops2)
        db.flush()
        for i, st in enumerate(students[:14]):
            stop = stops1[i % 4] if i < 10 else stops2[i % 2]
            db.add(StudentTransport(student_id=st.id, school_id=s.id, route_id=stop.route_id, stop_id=stop.id))

        # banners
        db.add_all([
            Banner(school_id=s.id, title="Annual Sports Day 🏆", text="Join us on the school ground. Students come in house uniform.",
                   color="amber", end_date=t0 + timedelta(days=12), popup=True, created_by=principal.id, sort=0),
            Banner(school_id=s.id, title="Half-yearly results are out", text="Check the Results tab for report cards.",
                   color="green", roles=["student", "parent"], end_date=t0 + timedelta(days=20), created_by=principal.id, sort=1),
        ])

        # consent form + poll
        trip = Poll(school_id=s.id, kind="consent", title="Science museum trip", description="Class 8 trip to the State Science Centre. Bus leaves 8:30 AM, returns 2 PM.",
                    options=["Yes", "No"], audience=["parent"], class_ids=[students[0].class_id], deadline=t0 + timedelta(days=5), amount=200,
                    created_by=principal.id)
        ptm = Poll(school_id=s.id, kind="poll", title="Preferred PTM time", options=["Saturday 10 AM", "Saturday 12 PM", "Sunday 11 AM"],
                   audience=["parent", "teacher"], deadline=t0 + timedelta(days=7), created_by=principal.id)
        db.add_all([trip, ptm])
        db.flush()
        from .models import ParentLink
        links = list(db.scalars(select(ParentLink).where(ParentLink.school_id == s.id)))
        for link in links[2:6]:
            st = db.get(User, link.student_id)
            if st and st.class_id == students[0].class_id:
                db.add(PollResponse(poll_id=trip.id, user_id=link.parent_id, student_id=link.student_id, choices=[0]))
        for link in links[3:9]:
            db.add(PollResponse(poll_id=ptm.id, user_id=link.parent_id, student_id=0, choices=[link.parent_id % 3]))

        # leaves
        t2 = users.get("T002")
        if t2:
            db.add(LeaveRequest(school_id=s.id, kind="staff", user_id=t2.id, applied_by=t2.id, leave_type="casual",
                                start_date=t0 + timedelta(days=3), end_date=t0 + timedelta(days=4), reason="Family function"))
        t4 = users.get("T004")
        if t4:
            db.add(LeaveRequest(school_id=s.id, kind="staff", user_id=t4.id, applied_by=t4.id, leave_type="sick",
                                start_date=t0 - timedelta(days=20), end_date=t0 - timedelta(days=19), reason="Fever",
                                status="approved", decided_by=principal.id, decided_at=datetime.now(timezone.utc).replace(tzinfo=None)))
        par = users.get("9876500003")
        if par:
            kid = db.scalar(select(ParentLink.student_id).where(ParentLink.parent_id == par.id))
            db.add(LeaveRequest(school_id=s.id, kind="student", user_id=kid, applied_by=par.id, leave_type="sick",
                                start_date=t0 + timedelta(days=1), end_date=t0 + timedelta(days=2), reason="Viral fever — doctor advised rest"))

        # staff attendance for the last school days
        import random
        rnd = random.Random(7)
        staff = [u for u in users.values() if u.role in (Role.teacher, Role.vice_principal, Role.coordinator)]
        for d in school_days(db, s, t0 - timedelta(days=14), t0 - timedelta(days=1)):
            for u in staff:
                if rnd.random() < 0.9:
                    hh, mm = (8, rnd.randint(15, 44)) if rnd.random() < 0.8 else (8, rnd.randint(46, 59))
                    local = datetime.combine(d, time(hh, mm), tzinfo=SCHOOL_TZ)
                    db.add(StaffAttendance(school_id=s.id, user_id=u.id, date=d, check_in_at=local.astimezone(timezone.utc).replace(tzinfo=None),
                                           check_out_at=(local + timedelta(hours=6)).astimezone(timezone.utc).replace(tzinfo=None),
                                           in_distance_m=rnd.randint(5, 90), late=(hh, mm) > (8, 45)))
        db.commit()
        return True


def seed_fees_demo() -> bool:
    """Phase 3 demo fees for DEMO01 (idempotent): config, 3 billed months, payments, defaulters, a UPI claim, an extra fee."""
    from .models import FeeBatch, FeeConfig, FeeItem, FeePayment, Route, SchoolClass
    from .routers.fees import confirm_payment, due_date_for, generate_month, period_of

    with SessionLocal() as db:
        s = db.scalar(select(School).where(School.code == "DEMO01"))
        if not s or db.get(FeeConfig, s.id):
            return False
        t0 = today()
        users = {u.login_id: u for u in db.scalars(select(User).where(User.school_id == s.id))}
        principal = users.get("principal") or next((u for u in users.values() if u.role == Role.principal), None)
        if not principal:
            return False
        students = sorted([u for u in users.values() if u.role == Role.student], key=lambda u: u.login_id)
        c9a = db.scalar(select(SchoolClass.id).where(SchoolClass.school_id == s.id, SchoolClass.name == "9-A"))
        routes = list(db.scalars(select(Route.id).where(Route.school_id == s.id).order_by(Route.id)))
        periods = []
        y, m = t0.year, t0.month
        for _ in range(3):
            periods.insert(0, f"{y:04d}-{m:02d}")
            y, m = (y, m - 1) if m > 1 else (y - 1, 12)
        cfg = FeeConfig(school_id=s.id, monthly_amount=1500, class_amounts={str(c9a): 1800} if c9a else {},
                        route_amounts={str(r): a for r, a in zip(routes, (600, 800))}, due_day=10, start_month=periods[0],
                        auto_generate=True, upi_id="greenvalley@sbi", upi_name="Green Valley Public School",
                        receipt_prefix="GVPS", receipt_note="Fees once paid are not refundable. This is a computer-generated receipt.",
                        generated_months=[])
        db.add(cfg)
        db.flush()
        for p in periods:
            generate_month(db, s, p, principal)
        batch = FeeBatch(school_id=s.id, title="Annual day fee", amount=300, due_date=t0 + timedelta(days=10),
                         note="Costumes and stage", target="school", count=len(students), created_by=principal.id)
        db.add(batch)
        db.flush()
        for st in students:
            db.add(FeeItem(school_id=s.id, student_id=st.id, kind="extra", period=f"b{batch.id}", title=batch.title, amount=300,
                           due_date=batch.due_date, batch_id=batch.id, created_by=principal.id))
        db.flush()

        def items_for(st, period):
            return list(db.scalars(select(FeeItem).where(FeeItem.student_id == st.id, FeeItem.period == period)))

        modes = ["cash", "upi", "cash", "cheque", "bank", "cash"]
        for i, st in enumerate(students):
            # defaulters: last 4 students pay nothing; 2 more skip the last-but-one month
            paying = periods[:-1] if i < len(students) - 4 else []
            if i in (3, 11):
                paying = periods[:1]
            for k, p in enumerate(paying):
                its = items_for(st, p)
                amt = sum(x.amount for x in its)
                if not amt:
                    continue
                if i == 5 and k == len(paying) - 1:
                    amt = 1000          # partial
                mode = modes[(i + k) % len(modes)]
                due = due_date_for(p, 10)
                paid_on = min(due - timedelta(days=(i % 7)), t0)
                pay = FeePayment(school_id=s.id, student_id=st.id, amount=amt, mode=mode, paid_on=paid_on, status="pending",
                                 reference={"cash": "", "upi": f"6{st.id:05d}{k}20331", "cheque": f"00{i}{k}41",
                                            "bank": f"NEFT{st.id}{k}"}.get(mode, ""))
                db.add(pay)
                db.flush()
                confirm_payment(db, s, pay, principal, [x.id for x in its])
            # a few have already paid this month too
            if i < 6:
                its = items_for(st, periods[-1])
                amt = sum(x.amount for x in its)
                if amt:
                    pay = FeePayment(school_id=s.id, student_id=st.id, amount=amt, mode="cash" if i % 2 else "upi", status="pending",
                                     paid_on=t0 - timedelta(days=i % 3), reference="" if i % 2 else f"63{st.id:06d}1188")
                    db.add(pay)
                    db.flush()
                    confirm_payment(db, s, pay, principal, [x.id for x in its])
        # one UPI claim waiting for the principal (from the 2-kid parent)
        par = users.get("9876500001")
        if par:
            from .models import ParentLink
            kid = db.scalar(select(ParentLink.student_id).where(ParentLink.parent_id == par.id).order_by(ParentLink.student_id))
            its = items_for(db.get(User, kid), periods[-1])
            if its and sum(x.amount for x in its):
                db.add(FeePayment(school_id=s.id, student_id=kid, amount=sum(x.amount for x in its), mode="upi",
                                  reference="634512987745", paid_on=t0, status="pending", submitted_by=par.id,
                                  requested_item_ids=[x.id for x in its]))
        db.commit()
        _ = period_of
        return True


DEMO_BELL = [
    {"kind": "period", "label": "Period 1", "start": "08:00", "end": "08:40"},
    {"kind": "period", "label": "Period 2", "start": "08:40", "end": "09:20"},
    {"kind": "break", "label": "Short break", "start": "09:20", "end": "09:35"},
    {"kind": "period", "label": "Period 3", "start": "09:35", "end": "10:15"},
    {"kind": "period", "label": "Period 4", "start": "10:15", "end": "10:55"},
    {"kind": "break", "label": "Lunch", "start": "10:55", "end": "11:30"},
    {"kind": "period", "label": "Period 5", "start": "11:30", "end": "12:10"},
    {"kind": "period", "label": "Period 6", "start": "12:10", "end": "12:50"},
]


def seed_bell_demo() -> bool:
    """F28 demo period timings for DEMO01 (idempotent)."""
    from .models import BellSchedule

    with SessionLocal() as db:
        s = db.scalar(select(School).where(School.code == "DEMO01"))
        if not s or db.get(BellSchedule, (s.id, -1)):
            return False
        db.add(BellSchedule(school_id=s.id, day=-1, slots=DEMO_BELL))
        db.commit()
        return True


def seed_showcase_demo() -> bool:
    """List the demo schools on the website (marked as demo there)."""
    from .models import SchoolShowcase

    with SessionLocal() as db:
        done = False
        for code, city in (("DEMO01", "Ranchi"), ("DEMO02", "Patna")):
            s = db.scalar(select(School).where(School.code == code))
            if s and not db.get(SchoolShowcase, s.id):
                db.add(SchoolShowcase(school_id=s.id, show=True, city=city))
                done = True
        db.commit()
        return done
