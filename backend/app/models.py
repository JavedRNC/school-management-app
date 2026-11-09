"""Database models. Every school-owned table carries `school_id` (multi-tenant).

Soft delete: rows with `is_active` are archived (hidden) instead of deleted.
"""
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
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
