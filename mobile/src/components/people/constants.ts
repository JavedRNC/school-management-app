import type { Area, Level, Role } from '@/lib/types';

export const AREAS: { key: Area; label: string; desc: string }[] = [
  { key: 'insights', label: 'Dashboard & analytics', desc: 'School insights and reports' },
  { key: 'people', label: 'Students, teachers & parents', desc: 'Accounts, profiles, passwords' },
  { key: 'classes', label: 'Classes, subjects & timetable', desc: 'Setup, subject teachers, periods' },
  { key: 'attendance', label: 'Attendance', desc: 'Daily attendance registers' },
  { key: 'exams', label: 'Exams & marks', desc: 'Exams and marks entry' },
  { key: 'notices', label: 'Notices & homework', desc: 'Announcements and homework' },
  { key: 'calendar', label: 'School calendar', desc: 'Holidays and events' },
  { key: 'settings', label: 'Settings, privacy & plan', desc: 'School settings, archive, audit' },
];

export const DEFAULT_PERMS: Record<'vice_principal' | 'coordinator', Record<Area, Level>> = {
  vice_principal: { insights: 'view', people: 'edit', classes: 'edit', attendance: 'edit', exams: 'edit', notices: 'edit', calendar: 'edit', settings: 'view' },
  coordinator: { insights: 'view', people: 'view', classes: 'view', attendance: 'edit', exams: 'edit', notices: 'edit', calendar: 'view', settings: 'none' },
};

export type PersonRole = 'student' | 'teacher' | 'parent' | 'vice_principal' | 'coordinator';

export const LOGIN_HINT: Record<PersonRole | 'principal', { label: string; placeholder: string; numeric?: boolean }> = {
  student: { label: 'Admission no. (login ID)', placeholder: 'e.g. 2026025' },
  teacher: { label: 'Employee code (login ID)', placeholder: 'e.g. T006' },
  parent: { label: 'Mobile number (login ID)', placeholder: '10-digit mobile', numeric: true },
  vice_principal: { label: 'Login ID', placeholder: 'e.g. vp2' },
  coordinator: { label: 'Login ID', placeholder: 'e.g. coord2' },
  principal: { label: 'Login ID', placeholder: 'principal' },
};

const CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Random 8-char temporary password with at least one letter and one digit. */
export function genPassword(): string {
  for (;;) {
    let s = '';
    for (let i = 0; i < 8; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
    if (/[0-9]/.test(s) && /[a-zA-Z]/.test(s)) return s;
  }
}

export const isDate = (s: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
export const BLOOD = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const RELATIONS = ['Father', 'Mother', 'Guardian'];

export function isStaffRole(r: Role) {
  return r === 'vice_principal' || r === 'coordinator';
}
