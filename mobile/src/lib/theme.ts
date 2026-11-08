export const colors = {
  primary: '#1F5F8B',
  primaryDark: '#164866',
  primarySoft: '#E3EEF6',
  accent: '#F2A33A',
  bg: '#F5F7FA',
  card: '#FFFFFF',
  text: '#1B2430',
  muted: '#6B7684',
  border: '#E1E6EC',
  good: '#2E8B57',
  goodSoft: '#E4F4EA',
  bad: '#C0392B',
  badSoft: '#FBE7E5',
  warn: '#B7791F',
  warnSoft: '#FDF3E1',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Color for a percentage given school thresholds. */
export function pctColor(p: number | null | undefined, low = 75): string {
  if (p == null) return colors.muted;
  if (p >= low + 10) return colors.good;
  if (p >= low) return colors.warn;
  return colors.bad;
}
