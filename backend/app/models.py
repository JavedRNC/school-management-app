"""Database models. Every school-owned table carries `school_id` (multi-tenant).

Soft delete: rows with `is_active` are archived (hidden) instead of deleted.
"""
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Role(str, Enum):
    admin = "admin"                    # platform super admin (no school)
    principal = "principal"
    vice_principal = "vice_principal"
    coordinator = "coordinator"
    teacher = "teacher"
    student = "student"
    parent = "parent"


STAFF_MANAGERS = (Role.principal, Role.vice_principal, Role.coordinator)


class Archivable:
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    archived_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


# ---------------------------------------------------------------- platform
class Plan(Base):
    """Subscription bundle. Prices are set by Admin (₹ per student per month)."""
    __tablename__ = "plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    modules: Mapped[list] = mapped_column(JSON, default=list)
    price_per_student: Mapped[float] = mapped_column(Float, default=0)
    min_monthly: Mapped[float] = mapped_column(Float, default=0)
    sort: Mapped[int] = mapped_column(Integer, default=0)


class School(Base):
    __tablename__ = "schools"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    address: Mapped[str] = mapped_column(Text, default="")
    phone: Mapped[str] = mapped_column(String(30), default="")
    board: Mapped[str] = mapped_column(String(40), default="")
    working_days: Mapped[list] = mapped_column(JSON, default=lambda: [0, 1, 2, 3, 4, 5])  # 0=Mon … 6=Sun
    # privacy (F25)
    share_contact_with_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    support_access_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # subscription (F26)
    suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"), nullable=True)
    custom_modules: Mapped[list | None] = mapped_column(JSON, nullable=True)  # overrides plan modules
    price_per_student: Mapped[float | None] = mapped_column(Float, nullable=True)  # overrides plan price
    min_monthly: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount_pct: Mapped[float] = mapped_column(Float, default=0)
    is_free: Mapped[bool] = mapped_column(Boolean, default=False)          # sponsored
    free_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    trial_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    grace_days: Mapped[int] = mapped_column(Integer, default=7)
    max_students: Mapped[int | None] = mapped_column(Integer, nullable=True)
    billing_cycle: Mapped[str] = mapped_column(String(10), default="monthly")
    admin_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SubscriptionPayment(Base):
    __tablename__ = "subscription_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    amount: Mapped[float] = mapped_column(Float)
    paid_on: Mapped[date] = mapped_column(Date)
    period_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    method: Mapped[str] = mapped_column(String(20), default="")
    reference: Mapped[str] = mapped_column(String(80), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    recorded_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    school_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_name: Mapped[str] = mapped_column(String(120), default="")
    actor_role: Mapped[str] = mapped_column(String(20), default="")
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- people
class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("school_id", "login_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True, index=True)
    login_id: Mapped[str] = mapped_column(String(60), index=True)   # employee code / admission no. / mobile
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[Role] = mapped_column(SAEnum(Role, native_enum=False, length=20))
    password_hash: Mapped[str] = mapped_column(String(200))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # profile
    phone: Mapped[str] = mapped_column(String(20), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_group: Mapped[str] = mapped_column(String(5), default="")
    # students
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True, index=True)
    roll_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # VP / coordinator (F24): {"people": "view", ...}; class scope for coordinators
    permissions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scope_class_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # parents (F25 consent)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ParentLink(Base):
    __tablename__ = "parent_links"
    __table_args__ = (UniqueConstraint("parent_id", "student_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    relation: Mapped[str] = mapped_column(String(20), default="Parent")


# ---------------------------------------------------------------- school setup
class SchoolClass(Archivable, Base):
    __tablename__ = "classes"
    __table_args__ = (UniqueConstraint("school_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    class_teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class Subject(Archivable, Base):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("school_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    name: Mapped[str] = mapped_column(String(60))


class Assignment(Base):
    """Teacher teaches subject in class."""
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("class_id", "subject_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))


class TimetableEntry(Base):
    __tablename__ = "timetable"
    __table_args__ = (UniqueConstraint("class_id", "day", "period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"))
    day: Mapped[int] = mapped_column(Integer)  # 0=Mon .. 6=Sun
    period: Mapped[int] = mapped_column(Integer)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Holiday(Archivable, Base):
    __tablename__ = "holidays"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="holiday")  # national|festival|vacation|exam|event|other
    is_off: Mapped[bool] = mapped_column(Boolean, default=True)  # False = event, school open
    note: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- academics
class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("student_id", "date"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    present: Mapped[bool] = mapped_column(Boolean)
    marked_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    marked_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Exam(Archivable, Base):
    __tablename__ = "exams"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    date: Mapped[date] = mapped_column(Date)
    max_marks: Mapped[float] = mapped_column(Float, default=100)


class Mark(Base):
    __tablename__ = "marks"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", "subject_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    score: Mapped[float] = mapped_column(Float)
    entered_by: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Post(Archivable, Base):
    """Announcement (school-wide or class) or homework (class)."""
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # notice | homework
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Meta(Base):
    """Key/value for schema version etc."""
    __tablename__ = "meta"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))


# ================================================================ Phase 2
class SchoolPrefs(Base):
    """Per-school settings added after v2 (kept in a separate table → no ALTER TABLE needed)."""
    __tablename__ = "school_prefs"
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), primary_key=True)
    leave_quotas: Mapped[dict] = mapped_column(JSON, default=lambda: {"casual": 12, "sick": 10, "earned": 15})
    geo_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    geo_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    geo_radius_m: Mapped[int] = mapped_column(Integer, default=150)
    late_after: Mapped[str] = mapped_column(String(5), default="09:00")  # HH:MM school-local


class LeaveRequest(Base):
    """Staff leave (applicant = staff) or student leave (applicant = parent, user_id = student)."""
    __tablename__ = "leave_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))            # staff | student
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    applied_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    leave_type: Mapped[str] = mapped_column(String(20))      # casual|sick|earned|family|other
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date, index=True)
    half_day: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)  # pending|approved|rejected|cancelled
    decided_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Banner(Archivable, Base):
    """Home-screen announcement. school_id NULL = platform-wide (by Admin)."""
    __tablename__ = "banners"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(120))
    text: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str] = mapped_column(String(500), default="")
    color: Mapped[str] = mapped_column(String(20), default="primary")   # primary|amber|green|red|purple
    roles: Mapped[list] = mapped_column(JSON, default=list)             # [] = everyone
    class_ids: Mapped[list] = mapped_column(JSON, default=list)         # [] = all classes
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    popup: Mapped[bool] = mapped_column(Boolean, default=False)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Poll(Archivable, Base):
    """Consent form (Yes/No per child) or poll."""
    __tablename__ = "polls"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))       # consent | poll
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    options: Mapped[list] = mapped_column(JSON, default=list)
    multi: Mapped[bool] = mapped_column(Boolean, default=False)
    audience: Mapped[list] = mapped_column(JSON, default=lambda: ["parent"])   # parent|teacher|student
    class_ids: Mapped[list] = mapped_column(JSON, default=list)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PollResponse(Base):
    __tablename__ = "poll_responses"
    __table_args__ = (UniqueConstraint("poll_id", "user_id", "student_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    poll_id: Mapped[int] = mapped_column(ForeignKey("polls.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    student_id: Mapped[int] = mapped_column(Integer, default=0)   # child for parent consent; 0 otherwise
    choices: Mapped[list] = mapped_column(JSON, default=list)
    comment: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class StaffAttendance(Base):
    __tablename__ = "staff_attendance"
    __table_args__ = (UniqueConstraint("user_id", "date"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    check_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    in_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    out_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    in_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    late: Mapped[bool] = mapped_column(Boolean, default=False)
    marked_by: Mapped[int | None] = mapped_column(Integer, nullable=True)   # set when a manager marks manually
    note: Mapped[str] = mapped_column(String(200), default="")


class Vehicle(Archivable, Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    number: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(20), default="bus")
    capacity: Mapped[int] = mapped_column(Integer, default=40)
    insurance_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    fitness_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    driver_name: Mapped[str] = mapped_column(String(120), default="")
    driver_phone: Mapped[str] = mapped_column(String(20), default="")
    driver_licence: Mapped[str] = mapped_column(String(40), default="")
    licence_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    attendant_name: Mapped[str] = mapped_column(String(120), default="")
    attendant_phone: Mapped[str] = mapped_column(String(20), default="")


class Route(Archivable, Base):
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)


class Stop(Base):
    __tablename__ = "stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    seq: Mapped[int] = mapped_column(Integer, default=0)
    pickup_time: Mapped[str] = mapped_column(String(5), default="")
    drop_time: Mapped[str] = mapped_column(String(5), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class StudentTransport(Base):
    __tablename__ = "student_transport"
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    stop_id: Mapped[int | None] = mapped_column(ForeignKey("stops.id"), nullable=True)


# ================================================================ Phase 3 — fees
class FeeConfig(Base):
    __tablename__ = "fee_config"
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), primary_key=True)
    monthly_amount: Mapped[float] = mapped_column(Float, default=0)
    class_amounts: Mapped[dict] = mapped_column(JSON, default=dict)      # {"<class_id>": amount}
    route_amounts: Mapped[dict] = mapped_column(JSON, default=dict)      # {"<route_id>": amount} transport per month
    due_day: Mapped[int] = mapped_column(Integer, default=10)
    start_month: Mapped[str | None] = mapped_column(String(7), nullable=True)   # first month to bill, YYYY-MM
    auto_generate: Mapped[bool] = mapped_column(Boolean, default=True)
    upi_id: Mapped[str] = mapped_column(String(80), default="")
    upi_name: Mapped[str] = mapped_column(String(120), default="")
    receipt_prefix: Mapped[str] = mapped_column(String(20), default="")
    receipt_note: Mapped[str] = mapped_column(Text, default="")
    generated_months: Mapped[list] = mapped_column(JSON, default=list)   # periods already auto-billed


class FeeBatch(Archivable, Base):
    """An extra fee rolled out to the school / classes / students (F14)."""
    __tablename__ = "fee_batches"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    target: Mapped[str] = mapped_column(String(10))          # school | classes | students
    class_ids: Mapped[list] = mapped_column(JSON, default=list)
    student_ids: Mapped[list] = mapped_column(JSON, default=list)
    exclude_ids: Mapped[list] = mapped_column(JSON, default=list)
    count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FeeItem(Base):
    """A charge on a student's ledger."""
    __tablename__ = "fee_items"
    __table_args__ = (UniqueConstraint("student_id", "kind", "period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))            # monthly | transport | extra | fine
    period: Mapped[str] = mapped_column(String(20))          # YYYY-MM for monthly/transport; "b<batch>" / "f<n>" otherwise
    title: Mapped[str] = mapped_column(String(160))
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("fee_batches.id"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)   # False = waived/voided
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class FeePayment(Base):
    __tablename__ = "fee_payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    receipt_no: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Float)
    mode: Mapped[str] = mapped_column(String(12))           # cash | upi | cheque | bank | online
    reference: Mapped[str] = mapped_column(String(80), default="")
    paid_on: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(12), default="confirmed", index=True)   # confirmed | pending | rejected | cancelled
    note: Mapped[str] = mapped_column(Text, default="")
    cancel_reason: Mapped[str] = mapped_column(Text, default="")
    received_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    submitted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)   # parent for UPI claims
    requested_item_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class FeeAllocation(Base):
    __tablename__ = "fee_allocations"
    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("fee_payments.id"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("fee_items.id"), index=True)
    amount: Mapped[float] = mapped_column(Float)


class ReceiptCounter(Base):
    __tablename__ = "receipt_counters"
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), primary_key=True)
    year: Mapped[str] = mapped_column(String(7), primary_key=True)    # 2026-27
    last_no: Mapped[int] = mapped_column(Integer, default=0)


# ================================================================ Phase 4 — period timings (F28)
class BellSchedule(Base):
    """Period timings. day = -1 is the school default; 0..6 (Mon..Sun) overrides one weekday (e.g. Saturday half day).
    slots: [{"kind": "period"|"break", "label": "Lunch", "start": "08:00", "end": "08:40"}, ...] in time order."""
    __tablename__ = "bell_schedules"
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), primary_key=True)
    day: Mapped[int] = mapped_column(Integer, primary_key=True)
    slots: Mapped[list] = mapped_column(JSON, default=list)


class DataSnapshot(Base):
    """Automatic full backup taken just before a Replace import, so it can be undone (last 3 per school, 30 days)."""
    __tablename__ = "data_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    created_by: Mapped[str] = mapped_column(String(120), default="")
    content: Mapped[bytes] = mapped_column(LargeBinary)


# ================================================================ F16 — in-app update prompt
class AppVersion(Base):
    """Single row (id=1): what build phones should run. Builds = GitHub Actions run numbers (Android versionCode)."""
    __tablename__ = "app_version"
    id: Mapped[int] = mapped_column(primary_key=True)
    auto_latest: Mapped[bool] = mapped_column(Boolean, default=True)     # read the newest build from the GitHub release
    latest_build: Mapped[int] = mapped_column(Integer, default=0)        # used when auto_latest is off (or GitHub unreachable)
    min_build: Mapped[int] = mapped_column(Integer, default=0)           # below this the app must update (forced)
    message: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_by: Mapped[str] = mapped_column(String(120), default="")
