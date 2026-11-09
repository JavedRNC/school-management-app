export type Role = 'admin' | 'principal' | 'vice_principal' | 'coordinator' | 'teacher' | 'student' | 'parent';
export type Level = 'none' | 'view' | 'edit';
export type Area = 'insights' | 'people' | 'classes' | 'attendance' | 'exams' | 'notices' | 'calendar' | 'settings';

export interface User {
  id: number;
  school_id: number | null;
  login_id: string;
  name: string;
  role: Role;
  phone: string;
  email: string;
  address: string;
  dob: string | null;
  blood_group: string;
  class_id: number | null;
  roll_no: number | null;
  permissions: Partial<Record<Area, Level>> | null;
  scope_class_ids: number[] | null;
  must_change_password: boolean;
  consent_at: string | null;
  active?: boolean;
  children_ids: number[];
  parent_ids: number[];
}

export interface Subscription {
  status: SchoolStatus;
  can_write: boolean;
  plan: string | null;
  plan_id: number | null;
  custom: boolean;
  modules: string[];
  is_free: boolean;
  free_until: string | null;
  trial_until: string | null;
  valid_until: string | null;
  grace_days: number;
  max_students: number | null;
  billing_cycle: 'monthly' | 'yearly';
  estimate: { students: number; price_per_student: number; min_monthly: number; discount_pct: number; gross: number; amount: number; free: boolean };
}

export type SchoolStatus = 'active' | 'free' | 'trial' | 'grace' | 'expired' | 'suspended';

/** GET /school/me */
export interface SchoolInfo {
  id: number;
  code: string;
  name: string;
  address: string;
  phone: string;
  board: string;
  working_days: number[]; // 0=Mon … 6=Sun
  today_is_school_day: boolean;
  closed_reason: string;
  share_contact_with_admin: boolean;
  support_access_until: string | null;
  modules: string[];
  status: SchoolStatus;
  can_write: boolean;
  permissions: Record<Area, Level>;
  module_names: Record<string, string>;
  subscription?: Subscription;
}

export interface Holiday {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  kind: 'national' | 'festival' | 'vacation' | 'exam' | 'event' | 'holiday' | 'other';
  is_off: boolean;
  note: string;
}

export interface ArchiveItem {
  kind: 'class' | 'subject' | 'exam' | 'post' | 'holiday' | 'user';
  id: number;
  label: string;
  archived_at: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  school_id: number | null;
  actor_name: string;
  actor_role: string;
  action: string;
  detail: string;
}

export interface Plan {
  id: number;
  name: string;
  modules: string[];
  price_per_student: number;
  min_monthly: number;
}

export interface Payment {
  id: number;
  school_id: number;
  amount: number;
  paid_on: string;
  period_from: string | null;
  period_to: string | null;
  method: string;
  reference: string;
  note: string;
  created_at: string;
}

export interface AdminSchoolRow {
  id: number;
  code: string;
  name: string;
  status: SchoolStatus;
  plan: string | null;
  students: number;
  teachers: number;
  parents: number;
  monthly_amount: number;
  is_free: boolean;
  valid_until: string | null;
  trial_until: string | null;
  suspended: boolean;
}

export interface AdminSchoolDetail extends AdminSchoolRow {
  address: string;
  phone: string;
  board: string;
  admin_notes: string;
  working_days: number[];
  subscription: Subscription;
  custom_price: boolean;
  price_override: number | null;
  min_override: number | null;
  discount_pct: number;
  free_until: string | null;
  grace_days: number;
  max_students: number | null;
  billing_cycle: 'monthly' | 'yearly';
  custom_modules: string[] | null;
  privacy: { full_access: boolean; share_contact_with_admin: boolean; support_access_until: string | null };
  classes: number;
}

export interface AdminOverview {
  schools: number;
  students: number;
  teachers: number;
  parents: number;
  by_status: Partial<Record<SchoolStatus, number>>;
  free_schools: number;
  revenue_this_month: number;
  expected_monthly: number;
  expiring_soon: AdminSchoolRow[];
  recent: AdminSchoolRow[];
}

export interface SchoolClass {
  id: number;
  name: string;
  class_teacher_id: number | null;
  student_count: number;
}

export interface Subject {
  id: number;
  name: string;
}

export interface Assignment {
  id: number;
  teacher_id: number;
  class_id: number;
  subject_id: number;
  teacher_name: string;
  class_name: string;
  subject_name: string;
}

export interface Slot {
  id: number;
  class_id: number;
  day: number;
  period: number;
  subject_id: number;
  teacher_id: number;
  class_name: string;
  subject_name: string;
  teacher_name: string;
}

export interface AttendanceRow {
  student_id: number;
  name: string;
  roll_no: number | null;
  present: boolean | null;
}

/** GET /attendance?class_id&day */
export interface AttendanceSheet {
  date: string;
  is_school_day: boolean;
  reason: string;
  can_edit: boolean;
  lock_reason: string;
  marked_by: string | null;
  rows: AttendanceRow[];
}

export interface Exam {
  id: number;
  name: string;
  date: string;
  max_marks: number;
  mark_count?: number;
}

export interface Usage {
  assignments: number;
  timetable: number;
  marks: number;
  posts: number;
}

export interface MarkRow {
  student_id: number;
  name: string;
  roll_no: number | null;
  score: number | null;
}

export interface Post {
  id: number;
  kind: 'notice' | 'homework';
  title: string;
  body: string;
  class_id: number | null;
  subject_id: number | null;
  due_date: string | null;
  author_id: number;
  author_name: string;
  class_name: string | null;
  subject_name: string | null;
  created_at: string;
}

export interface MyAttendance {
  total_days: number;
  present_days: number;
  percent: number;
  recent: { date: string; present: boolean }[];
}

export interface ReportCard {
  exam_id: number;
  exam: string;
  date: string;
  max_marks: number;
  subjects: { subject: string; score: number }[];
  total: number;
  percent: number;
}

export interface StudentStat {
  student_id: number;
  name: string;
  class_name: string;
  percent?: number;
  attendance_percent?: number | null;
  marks_percent?: number | null;
  reasons?: string[];
}

export interface Dashboard {
  date: string;
  today_is_school_day: boolean;
  closed_reason: string;
  overview: {
    students: number;
    teachers: number;
    parents: number;
    classes: number;
    attendance_today_percent: number | null;
    classes_marked: number;
    classes_total: number;
  };
  attendance_today: { class_id: number; class_name: string; present: number; total: number; percent: number | null }[];
  unmarked_classes: { class_id: number; class_name: string; class_teacher: string | null }[];
  attendance_trend: { date: string; percent: number }[];
  low_attendance: StudentStat[];
  academics: null | {
    exam: { id: number; name: string; date: string };
    exams: { id: number; name: string }[];
    avg_by_class: { class_name: string; percent: number }[];
    avg_by_subject: { subject: string; percent: number }[];
    top_students: StudentStat[];
    bottom_students: StudentStat[];
    pass_rate: number | null;
    school_avg: number | null;
  };
  at_risk: StudentStat[];
  thresholds: { low_attendance: number; pass: number; at_risk_marks: number };
}
