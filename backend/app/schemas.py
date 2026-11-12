from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import Role


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- auth
class LoginIn(BaseModel):
    school_code: str = Field(min_length=1, max_length=40)
    login_id: str = Field(min_length=1, max_length=120)
    password: str = Field(max_length=200)
    client: str = Field(default="app", pattern="^(app|web)$")     # web = the portal: shorter session, Admin/Principal only


class UserOut(ORM):
    id: int
    school_id: int | None = None
    login_id: str
    name: str
    role: Role
    phone: str = ""
    email: str = ""
    address: str = ""
    dob: date | None = None
    blood_group: str = ""
    class_id: int | None = None
    roll_no: int | None = None
    permissions: dict | None = None
    scope_class_ids: list | None = None
    must_change_password: bool = False
    consent_at: datetime | None = None
    active: bool = True
    children_ids: list[int] = []
    parent_ids: list[int] = []


class LoginOut(BaseModel):
    token: str
    user: UserOut


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


# ---------------------------------------------------------------- people
class UserCreate(BaseModel):
    name: str = Field(min_length=1)
    login_id: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=6)
    role: Role
    phone: str = ""
    email: str = ""
    address: str = ""
    dob: date | None = None
    blood_group: str = ""
    class_id: int | None = None
    roll_no: int | None = None
    permissions: dict | None = None
    scope_class_ids: list[int] | None = None
    children_ids: list[int] | None = None   # for parents
    relation: str = "Parent"


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    login_id: str | None = Field(default=None, min_length=1, max_length=60)
    password: str | None = Field(default=None, min_length=6)
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    dob: date | None = None
    blood_group: str | None = None
    class_id: int | None = None
    roll_no: int | None = None
    permissions: dict | None = None
    scope_class_ids: list[int] | None = None
    children_ids: list[int] | None = None
    active: bool | None = None


# ---------------------------------------------------------------- school setup
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
    day: int = Field(ge=0, le=6)
    period: int = Field(ge=1, le=12)
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


class Usage(BaseModel):
    assignments: int = 0
    timetable: int = 0
    marks: int = 0
    posts: int = 0


# ---------------------------------------------------------------- attendance
class AttendanceRecord(BaseModel):
    student_id: int
    present: bool


class AttendanceIn(BaseModel):
    class_id: int
    date: date
    records: list[AttendanceRecord]
    override: bool = False   # managers: mark on a holiday / weekly off


class AttendanceRow(BaseModel):
    student_id: int
    name: str
    roll_no: int | None
    present: bool | None
    on_leave: bool = False


class AttendanceSheet(BaseModel):
    date: date
    is_school_day: bool
    reason: str = ""
    can_edit: bool
    lock_reason: str = ""
    marked_by: str | None = None
    rows: list[AttendanceRow]


class StudentAttendance(BaseModel):
    total_days: int
    present_days: int
    percent: float
    recent: list[dict]


# ---------------------------------------------------------------- exams
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


# ---------------------------------------------------------------- posts
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


# ---------------------------------------------------------------- calendar / settings
class HolidayIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    start_date: date
    end_date: date | None = None
    kind: str = Field(default="holiday", pattern="^(national|festival|vacation|exam|event|holiday|other)$")
    is_off: bool = True
    note: str = ""


class HolidayOut(ORM):
    id: int
    name: str
    start_date: date
    end_date: date
    kind: str
    is_off: bool
    note: str


class SchoolSettingsIn(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    address: str | None = None
    phone: str | None = None
    board: str | None = None
    working_days: list[int] | None = None
    share_contact_with_admin: bool | None = None


# ---------------------------------------------------------------- admin
class SchoolCreate(BaseModel):
    code: str = Field(min_length=3, max_length=20, pattern="^[A-Za-z0-9-]+$")
    name: str = Field(min_length=1)
    address: str = ""
    phone: str = ""
    board: str = ""
    plan_id: int | None = None
    principal_name: str = Field(min_length=1)
    principal_login_id: str = Field(default="principal", min_length=1)
    principal_password: str = Field(min_length=6)
    principal_phone: str = ""


class SchoolAdminUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    phone: str | None = None
    board: str | None = None
    suspended: bool | None = None
    plan_id: int | None = None
    custom_modules: list[str] | None = None
    use_plan_modules: bool | None = None     # True → clear custom_modules
    price_per_student: float | None = None
    min_monthly: float | None = None
    clear_custom_price: bool | None = None
    discount_pct: float | None = Field(default=None, ge=0, le=100)
    is_free: bool | None = None
    free_until: date | None = None
    trial_until: date | None = None
    valid_until: date | None = None
    grace_days: int | None = Field(default=None, ge=0, le=90)
    max_students: int | None = None
    billing_cycle: str | None = Field(default=None, pattern="^(monthly|yearly)$")
    admin_notes: str | None = None


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    modules: list[str]
    price_per_student: float = Field(ge=0)
    min_monthly: float = Field(default=0, ge=0)


class PlanOut(ORM):
    id: int
    name: str
    modules: list
    price_per_student: float
    min_monthly: float


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    paid_on: date
    period_from: date | None = None
    period_to: date | None = None
    method: str = ""
    reference: str = ""
    note: str = ""
    extend_valid_until: bool = True


class PaymentOut(ORM):
    id: int
    school_id: int
    amount: float
    paid_on: date
    period_from: date | None
    period_to: date | None
    method: str
    reference: str
    note: str
    created_at: datetime


class AuditOut(ORM):
    id: int
    at: datetime
    school_id: int | None
    actor_name: str
    actor_role: str
    action: str
    detail: str
