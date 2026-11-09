import type { IconName } from '@/components/ui';
import { isoDate, Tone, weekdayIdx } from '@/lib/theme';
import type { LeaveStatus } from '@/lib/types';

export const STAFF_TYPES = ['casual', 'sick', 'earned', 'other'] as const;
export const STUDENT_TYPES = ['sick', 'family', 'other'] as const;

export const TYPE_LABEL: Record<string, string> = {
  casual: 'Casual', sick: 'Sick', earned: 'Earned', family: 'Family', other: 'Other',
};
export const TYPE_ICON: Record<string, IconName> = {
  casual: 'beach', sick: 'medical-bag', earned: 'star-circle-outline', family: 'home-heart', other: 'dots-horizontal-circle-outline',
};

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};
export const STATUS_TONE: Record<LeaveStatus, Tone> = {
  pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral',
};
export const STATUS_ICON: Record<LeaveStatus, IconName> = {
  pending: 'clock-outline', approved: 'check-circle', rejected: 'close-circle', cancelled: 'cancel',
};

export function parseISO(s: string) {
  return new Date(s + 'T00:00:00');
}

export function fmtDay(s: string) {
  return parseISO(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function fmtRange(start: string, end: string) {
  if (start === end) return parseISO(start).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

export function daysLabel(n: number) {
  if (n === 0.5) return '½ day';
  return `${n % 1 === 0 ? n : n.toFixed(1)} day${n === 1 ? '' : 's'}`;
}

export function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export const isISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());

/** Client-side estimate of school days in a range (weekly offs only; holidays are checked by the server). */
export function estimateDays(start: string, end: string, workingDays: number[] | undefined, halfDay: boolean) {
  if (!isISO(start) || !isISO(end) || end < start) return 0;
  const wd = workingDays && workingDays.length ? workingDays : [0, 1, 2, 3, 4, 5];
  let n = 0;
  const d = parseISO(start);
  const last = parseISO(end);
  while (d <= last) {
    if (wd.includes(weekdayIdx(d))) n++;
    d.setDate(d.getDate() + 1);
  }
  return halfDay && n ? 0.5 : n;
}

export const STAFF_ROLES = ['teacher', 'vice_principal', 'coordinator'];
