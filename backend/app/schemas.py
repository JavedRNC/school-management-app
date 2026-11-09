from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import Role


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth / users
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    name: str
    email: str
    role: Role
    class_id: int | None = None
    roll_no: int | None = None
    active: bool = True


class LoginOut(BaseModel):
    token: str
    user: UserOut


class UserCreate(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)
    role: Role
    class_id: int | None = None
    roll_no: int | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=6)
    class_id: int | None = None
    roll_no: int | None = None
    active: bool | None = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)


# ---- school setup
class NameIn(BaseModel):
    name: str = Field(min_length=1)


class ClassIn(BaseModel):
    name: str = Field(min_length=1)
    class_teacher_id: int | None = None


class ClassOut(ORM):
    id: int
    name: str
    class_teacher_id: int | None = None
    student_count: int = 0


class SubjectOut(ORM):
    id: int
    name: str


class AssignmentIn(BaseModel):
    teacher_id: int
    class_id: int
    subject_id: int


class AssignmentOut(ORM):
    id: int
    teacher_id: int
    class_id: int
    subject_id: int
    teacher_name: str = ""
    class_name: str = ""
    subject_name: str = ""


class TimetableIn(BaseModel):
    class_id: int
    day: int = Field(ge=0, le=5)
    period: int = Field(ge=1, le=10)
    subject_id: int
    teacher_id: int


class TimetableOut(ORM):
    id: int
    class_id: int
    day: int
    period: int
    subject_id: int
    teacher_id: int
    class_name: str = ""
    subject_name: str = ""
    teacher_name: str = ""


# ---- attendance
class AttendanceRecord(BaseModel):
    student_id: int
    present: bool


class AttendanceIn(BaseModel):
    class_id: int
    date: date
    records: list[AttendanceRecord]


class AttendanceRow(BaseModel):
    student_id: int
    name: str
    roll_no: int | None
    present: bool | None  # None = not marked


class StudentAttendance(BaseModel):
    total_days: int
    present_days: int
    percent: float
    recent: list[dict]  # [{date, present}]


# ---- exams / marks
class ExamIn(BaseModel):
    name: str = Field(min_length=1)
    date: date
    max_marks: float = Field(default=100, gt=0)


class ExamOut(ORM):
    id: int
    name: str
    date: date
    max_marks: float
    mark_count: int = 0


class Usage(BaseModel):
    assignments: int = 0
    timetable: int = 0
    marks: int = 0
    posts: int = 0


class MarkRecord(BaseModel):
    student_id: int
    score: float = Field(ge=0)


class MarksIn(BaseModel):
    exam_id: int
    class_id: int
    subject_id: int
    records: list[MarkRecord]


class MarkRow(BaseModel):
    student_id: int
    name: str
    roll_no: int | None
    score: float | None


# ---- posts
class PostIn(BaseModel):
    kind: str = Field(pattern="^(notice|homework)$")
    title: str = Field(min_length=1)
    body: str = ""
    class_id: int | None = None
    subject_id: int | None = None
    due_date: date | None = None


class PostOut(ORM):
    id: int
    kind: str
    title: str
    body: str
    class_id: int | None
    subject_id: int | None
    due_date: date | None
    author_id: int
    created_at: datetime
    author_name: str = ""
    class_name: str | None = None
    subject_name: str | None = None
