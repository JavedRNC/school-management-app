import type { AppTheme } from '@/lib/theme';
import type { BannerColor } from '@/lib/types';

export function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "Closes today", "3 days left", "Closed". */
export function deadlineText(deadline: string | null, open: boolean): string {
  if (!open) return 'Closed';
  if (!deadline) return 'No deadline';
  const end = new Date(deadline + 'T23:59:59').getTime();
  const days = Math.ceil((end - Date.now()) / 86400000) - 1;
  if (days <= 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  return `${days} days left`;
}

export function rupees(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

export const COLOR_KEYS: BannerColor[] = ['primary', 'amber', 'green', 'red', 'purple'];

/** Gradient pair for a banner colour. */
export function bannerGradient(t: AppTheme, color: BannerColor): [string, string] {
  switch (color) {
    case 'amber': return t.dark ? ['#7A4A00', '#B7791F'] : ['#E08E0B', '#F5B544'];
    case 'green': return t.dark ? ['#0B4D2B', '#1E7A46'] : ['#16794A', '#35A86B'];
    case 'red': return t.dark ? ['#6B1010', '#A52A2A'] : ['#B3261E', '#E25546'];
    case 'purple': return t.dark ? ['#3A1E6B', '#5B3BA0'] : ['#5B3BA0', '#8A63D2'];
    default: return [t.custom.heroStart, t.custom.heroEnd];
  }
}

export const AUDIENCE_OPTIONS: { label: string; value: string; roles: string[] }[] = [
  { label: 'Everyone', value: 'all', roles: [] },
  { label: 'Parents', value: 'parent', roles: ['parent'] },
  { label: 'Students', value: 'student', roles: ['student'] },
  { label: 'Teachers', value: 'teacher', roles: ['teacher'] },
  { label: 'Staff', value: 'staff', roles: ['principal', 'vice_principal', 'coordinator', 'teacher'] },
];

export function audienceLabel(roles: string[]): string {
  if (!roles.length) return 'Everyone';
  const names: Record<string, string> = {
    parent: 'Parents', student: 'Students', teacher: 'Teachers', principal: 'Principal', vice_principal: 'VP', coordinator: 'Coordinators',
  };
  return roles.map((r) => names[r] ?? r).join(', ');
}
