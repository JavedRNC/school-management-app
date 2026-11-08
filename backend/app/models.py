from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Role(str, Enum):
    principal = "principal"
    teacher = "teacher"
    student = "student"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(SAEnum(Role))
    # students only
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    roll_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    school_class: Mapped["SchoolClass | None"] = relationship(back_populates="students", foreign_keys=[class_id])


class SchoolClass(Base):
    __tablename__ = "classes"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)  # e.g. "8-A"
    class_teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    students: Mapped[list[User]] = relationship(back_populates="school_class", foreign_keys=[User.class_id])


class Subject(Base):
    __tablename__ = "subjects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)


class Assignment(Base):
    """Teacher teaches subject in class."""
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("class_id", "subject_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))


class TimetableEntry(Base):
    __tablename__ = "timetable"
    __table_args__ = (UniqueConstraint("class_id", "day", "period"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"))
    day: Mapped[int] = mapped_column(Integer)  # 0=Mon .. 5=Sat
    period: Mapped[int] = mapped_column(Integer)  # 1..8
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("student_id", "date"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    present: Mapped[bool] = mapped_column(Boolean)
    marked_by: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Exam(Base):
    __tablename__ = "exams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    date: Mapped[date] = mapped_column(Date)
    max_marks: Mapped[float] = mapped_column(Float, default=100)


class Mark(Base):
    __tablename__ = "marks"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", "subject_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    score: Mapped[float] = mapped_column(Float)
    entered_by: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Post(Base):
    """Announcement (school-wide or class) or homework (class)."""
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))  # "notice" | "homework"
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)  # None = whole school
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
