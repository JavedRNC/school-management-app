export type Role = 'principal' | 'teacher' | 'student';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  class_id: number | null;
  roll_no: number | null;
  active?: boolean;
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
  overview: {
    students: number;
    teachers: number;
    classes: number;
    attendance_today_percent: number | null;
    classes_marked: number;
    classes_total: number;
  };
  attendance_today: { class_id: number; class_name: string; present: number; total: number; percent: number | null }[];
  unmarked_classes: { class_id: number; class_name: string }[];
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
