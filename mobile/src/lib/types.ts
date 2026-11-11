export type Role = 'admin' | 'principal' | 'vice_principal' | 'coordinator' | 'teacher' | 'student' | 'parent';
export type Level = 'none' | 'view' | 'edit';
export type Area = 'insights' | 'people' | 'classes' | 'attendance' | 'exams' | 'notices' | 'calendar' | 'settings'
  | 'leaves' | 'staff_attendance' | 'transport' | 'fees';

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
  on_leave?: boolean;
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
  recent: { date: string; present: boolean; leave?: boolean }[];
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

// ================================================================ Phase 2
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type StaffLeaveType = 'casual' | 'sick' | 'earned' | 'other';
export type StudentLeaveType = 'sick' | 'family' | 'other';

/** GET /leaves?scope=mine|inbox&status= · POST /leaves · POST /leaves/{id}/decide|cancel */
export interface LeaveRequest {
  id: number;
  kind: 'staff' | 'student';
  user_id: number;
  user_name: string;
  class_name: string | null;
  applied_by: number;
  applied_by_name: string;
  leave_type: StaffLeaveType | StudentLeaveType;
  start_date: string;
  end_date: string;
  half_day: boolean;
  days: number;
  reason: string;
  status: LeaveStatus;
  decided_by_name: string | null;
  decided_at: string | null;
  comment: string;
  created_at: string;
  can_decide?: boolean;
}

/** GET /leaves/balance */
export interface LeaveBalance {
  year_start: string;
  year_end: string;
  types: { type: string; quota: number; used: number; left: number }[];
  other_used: number;
}

/** GET /leaves/today */
export interface OnLeaveToday {
  staff: { user_id: number; name: string; leave_type: string; half_day: boolean; class_name: string | null; until: string }[];
  students: { user_id: number; name: string; leave_type: string; half_day: boolean; class_name: string | null; until: string }[];
}

export type BannerColor = 'primary' | 'amber' | 'green' | 'red' | 'purple';

/** GET /banners/active · /banners · /admin/banners */
export interface Banner {
  id: number;
  school_id: number | null;
  title: string;
  text: string;
  image_url: string;
  color: BannerColor;
  roles: string[];
  class_ids: number[];
  start_date: string | null;
  end_date: string | null;
  popup: boolean;
  sort: number;
  platform: boolean;
  created_at: string;
}

/** GET /polls (each poll for me) */
export interface Poll {
  id: number;
  kind: 'consent' | 'poll';
  title: string;
  description: string;
  options: string[];
  multi: boolean;
  audience: ('parent' | 'teacher' | 'student')[];
  class_ids: number[];
  deadline: string | null;
  amount: number | null;
  closed: boolean;
  open: boolean;
  created_by_name: string;
  created_at: string;
  eligible: number;
  responded: number;
  counts: number[];
  /** What I (or each of my children, for parent consent) must answer. student_id 0 = not per child. */
  my_targets: { student_id: number; student_name: string | null; response: { choices: number[]; comment: string; at: string } | null }[];
  can_manage?: boolean;
}

/** GET /polls/{id}/results */
export interface PollResults extends Poll {
  answered: { user_id: number; name: string; student_id: number | null; student_name: string | null; class_name: string | null;
    choices: number[]; answer: string; comment: string; at: string }[];
  pending: { user_id: number; name: string; student_id: number | null; student_name: string | null; class_name: string | null }[];
}

export type StaffDayStatus = 'present' | 'late' | 'leave' | 'absent';

export interface StaffRecord {
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  late: boolean;
  in_distance_m: number | null;
  manual: boolean;
  note: string;
}

/** GET /staff-attendance/settings */
export interface StaffGeoSettings { lat: number | null; lng: number | null; radius_m: number; late_after: string; configured: boolean }

/** GET /staff-attendance/me?month=YYYY-MM */
export interface MyStaffAttendance {
  today: { date: string; is_school_day: boolean; reason: string; on_leave: boolean; record: StaffRecord | null };
  month: string;
  days: { date: string; status: StaffDayStatus; check_in_at: string | null; check_out_at: string | null }[];
  summary: Record<StaffDayStatus, number>;
  settings: StaffGeoSettings;
}

/** GET /staff-attendance/day?day= */
export interface StaffDayBoard {
  date: string;
  is_school_day: boolean;
  reason: string;
  rows: ({ user_id: number; name: string; role: Role; login_id: string; status: StaffDayStatus } & Partial<StaffRecord>)[];
  summary: Record<StaffDayStatus, number>;
}

/** GET /staff-attendance/report?month= */
export interface StaffReport {
  month: string;
  school_days: number;
  rows: { user_id: number; name: string; role: Role; present: number; late: number; leave: number; absent: number; percent: number }[];
}

export interface Vehicle {
  id: number;
  number: string;
  kind: 'bus' | 'van' | 'auto' | 'other';
  capacity: number;
  insurance_until: string | null;
  fitness_until: string | null;
  driver_name: string;
  driver_phone: string;
  driver_licence: string;
  licence_until: string | null;
  attendant_name: string;
  attendant_phone: string;
  expiring: string[];
  seats_used: number;
}

export interface RouteStop { id: number; name: string; seq: number; pickup_time: string; drop_time: string; riders: number }

export interface TransportRoute {
  id: number;
  name: string;
  vehicle_id: number | null;
  vehicle_number: string | null;
  capacity: number | null;
  riders: number;
  stops: RouteStop[];
}

/** GET /transport/overview */
export interface TransportOverview {
  vehicles: Vehicle[];
  routes: TransportRoute[];
  riders: number;
  students: number;
  alerts: { vehicle: string; items: string[] }[];
}

/** GET /transport/students?route_id= */
export interface Rider { student_id: number; name: string; class_name: string | null; route_id: number; stop_id: number | null; stop_name: string | null }

/** GET /transport/me?student_id= */
export type MyBus = { assigned: false } | {
  assigned: true;
  student_name: string;
  route: string;
  stop: string | null;
  pickup_time: string | null;
  drop_time: string | null;
  vehicle_number: string | null;
  vehicle_kind: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  attendant_name: string | null;
  attendant_phone: string | null;
  stops: { name: string; pickup_time: string; drop_time: string; mine: boolean }[];
};

// ================================================================ Phase 3 — fees
export type FeeKind = 'monthly' | 'transport' | 'extra' | 'fine';
export type FeeItemStatus = 'paid' | 'partial' | 'due' | 'overdue';
export type PayMode = 'cash' | 'upi' | 'cheque' | 'bank' | 'online';
export type PayStatus = 'confirmed' | 'pending' | 'rejected' | 'cancelled';

export interface FeeItem {
  id: number; kind: FeeKind; period: string; title: string; amount: number; paid: number; balance: number;
  due_date: string | null; status: FeeItemStatus; batch_id: number | null;
}

export interface FeePayment {
  id: number; receipt_no: string | null; student_id: number; student_name: string; admission_no: string; class_name: string;
  amount: number; mode: PayMode; reference: string; paid_on: string; status: PayStatus; note: string; cancel_reason: string;
  received_by_name: string; submitted_by_name: string; created_at: string;
  outstanding?: number;   // only on /fees/claims
}

export interface FeeTotals { charged: number; paid: number; outstanding: number; overdue: number; next_due: string | null }

/** GET /fees/students/{id} (staff) and GET /fees/me?student_id= (parent/student) */
export interface FeeLedger {
  student: { id: number; name: string; admission_no: string; class_id: number | null; class_name: string; roll_no: number | null; active: boolean };
  totals: FeeTotals;
  items: FeeItem[];
  payments: FeePayment[];
  parent?: { name: string; phone: string } | null;               // staff view
  upi?: { enabled: boolean; upi_id: string; payee: string };      // parent/student view
}

/** GET /fees/students?class_id=&status=all|due|overdue|clear&q= */
export interface FeeStudentRow {
  id: number; name: string; admission_no: string; class_id: number | null; class_name: string; roll_no: number | null;
  status: 'clear' | 'due' | 'overdue'; charged: number; paid: number; outstanding: number; overdue: number;
  oldest_due: string | null; overdue_items: number; parent_name: string; parent_phone: string;
}

/** GET/PUT /fees/config */
export interface FeeConfig {
  monthly_amount: number; class_amounts: Record<string, number>; route_amounts: Record<string, number>;
  due_day: number; start_month: string | null; auto_generate: boolean; upi_id: string; upi_name: string;
  receipt_prefix: string; receipt_note: string; generated_months: string[];
  classes: { id: number; name: string; students: number; amount: number; custom: boolean }[];
  routes: { id: number; name: string; riders: number; amount: number }[];
  transport_enabled: boolean; expected_monthly: number; current_period: string;
}

/** POST /fees/generate */
export interface GenerateResult { period: string; label: string; new_items: number; new_amount: number; students: number; due_date: string }

/** GET /fees/batches · POST /fees/batches */
export interface FeeBatch {
  id: number; title: string; amount: number; due_date: string | null; note: string; target: 'school' | 'classes' | 'students';
  target_label: string; class_ids: number[]; count: number; paid_count: number; expected: number; collected: number;
  outstanding: number; is_active: boolean; created_at: string;
}
export interface BatchPreview { count: number; total: number; by_class: { class_name: string; students: number }[]; sample: string[] }

/** GET /fees/receipts/{id} · POST /fees/payments · POST /fees/claims/{id}/confirm */
export interface FeeReceipt {
  id: number; receipt_no: string; status: PayStatus; cancel_reason: string; amount: number; amount_words: string;
  mode: PayMode; reference: string; paid_on: string; note: string; received_by_name: string; issued_at: string; academic_year: string;
  school: { name: string; code: string; address: string; phone: string; board: string };
  student: { id: number; name: string; admission_no: string; class_name: string; roll_no: number | null };
  parent_name: string;
  lines: { title: string; kind: FeeKind; period: string; charge: number; amount: number }[];
  balance_after: number; footer: string;
}

/** GET /fees/payments?date_from=&date_to=&mode=&class_id=&status= */
export interface PaymentReport { from: string; to: string; count: number; total: number; by_mode: Partial<Record<PayMode, number>>; rows: FeePayment[] }

/** GET /fees/summary */
export interface FeeSummary {
  period: string; period_label: string; collected_today: number; receipts_today: number; collected_month: number;
  by_mode: Partial<Record<PayMode, number>>; expected_month: number; settled_month: number; collection_pct: number | null;
  outstanding: number; overdue: number; defaulters: number; students_with_dues: number; pending_claims: number;
  trend: { date: string; amount: number }[];
  by_class: { class_id: number | null; class_name: string; students: number; outstanding: number; overdue: number; defaulters: number; collected_month: number }[];
  recent: FeePayment[]; configured: boolean; upi_enabled: boolean; billed_this_month: boolean;
}

// ================================================================ Phase 4 — period timings, add many, import/backup
export interface BellSlot { kind: 'period' | 'break'; label: string; start: string; end: string; period: number | null }
/** GET/PUT /school/bell · DELETE /school/bell/{day}. overrides keyed "0".."6" (Mon..Sun). */
export interface BellSchedule { default: BellSlot[]; overrides: Record<string, BellSlot[]>; configured: boolean }

export interface ImportIssue { sheet: string; row: number; field: string; message: string }
export interface NewLogin { name: string; role: string; login_id: string; password: string; class?: string }

/** POST /users/bulk {role, rows, dry_run} */
export interface BulkResult {
  ok: boolean; errors: ImportIssue[]; by_role: Record<string, { add: number; update: number }>; links: number; count: number;
  credentials?: NewLogin[];
}

/** POST /data/import (multipart: file, mode=merge|replace, confirm, confirm_code) */
export interface ImportReport {
  ok: boolean; saved: boolean; mode: 'merge' | 'replace'; kind: 'template' | 'backup';
  errors: ImportIssue[]; error_count: number; warnings: string[]; passwords_kept: boolean; verified: boolean; undo_saved?: boolean;
  sheets: { sheet: string; add: number; update: number; skip: number }[]; new_logins: number;
  credentials?: NewLogin[];
}
