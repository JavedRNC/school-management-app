import { useColorScheme } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, useTheme } from 'react-native-paper';

/**
 * Material 3 theme — deep blue (primary) + amber (secondary).
 * Extra semantic colours live under `custom`.
 */
const lightColors = {
  ...MD3LightTheme.colors,
  primary: '#1A4D8F',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D6E3FF',
  onPrimaryContainer: '#001B3E',
  secondary: '#8A5A00',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#FFDDB0',
  onSecondaryContainer: '#2C1700',
  tertiary: '#00677F',
  tertiaryContainer: '#B7EAFF',
  onTertiaryContainer: '#001F28',
  background: '#F8F9FF',
  onBackground: '#191C20',
  surface: '#F8F9FF',
  onSurface: '#191C20',
  surfaceVariant: '#E0E2EC',
  onSurfaceVariant: '#43474E',
  outline: '#74777F',
  outlineVariant: '#C4C6CF',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  elevation: {
    level0: 'transparent',
    level1: '#EFF3FC',
    level2: '#E9EEF9',
    level3: '#E3E9F6',
    level4: '#E1E8F5',
    level5: '#DDE5F3',
  },
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: '#A9C7FF',
  onPrimary: '#003063',
  primaryContainer: '#00468C',
  onPrimaryContainer: '#D6E3FF',
  secondary: '#FFB951',
  onSecondary: '#482900',
  secondaryContainer: '#673D00',
  onSecondaryContainer: '#FFDDB0',
  tertiary: '#5DD5FC',
  tertiaryContainer: '#004D61',
  onTertiaryContainer: '#B7EAFF',
  background: '#111318',
  onBackground: '#E1E2E9',
  surface: '#111318',
  onSurface: '#E1E2E9',
  surfaceVariant: '#43474E',
  onSurfaceVariant: '#C4C6CF',
  outline: '#8E9099',
  outlineVariant: '#43474E',
  error: '#FFB4AB',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  elevation: {
    level0: 'transparent',
    level1: '#191C23',
    level2: '#1D212A',
    level3: '#212631',
    level4: '#222833',
    level5: '#252B37',
  },
};

const lightCustom = {
  success: '#1E7A46', successContainer: '#C8F0D4', onSuccessContainer: '#00210E',
  warning: '#8A5A00', warningContainer: '#FFE3B5', onWarningContainer: '#2C1700',
  danger: '#BA1A1A', dangerContainer: '#FFDAD6', onDangerContainer: '#410002',
  heroStart: '#123A6E', heroEnd: '#2D6CC0', amber: '#F5A623', chartTrack: '#E0E6F0',
};
const darkCustom = {
  success: '#7FD99E', successContainer: '#005229', onSuccessContainer: '#C8F0D4',
  warning: '#FFB951', warningContainer: '#5A3A00', onWarningContainer: '#FFE3B5',
  danger: '#FFB4AB', dangerContainer: '#93000A', onDangerContainer: '#FFDAD6',
  heroStart: '#0B2547', heroEnd: '#1B4B8A', amber: '#FFB951', chartTrack: '#2A303B',
};

export const lightTheme = { ...MD3LightTheme, roundness: 4, colors: lightColors, custom: lightCustom, dark: false };
export const darkTheme = { ...MD3DarkTheme, roundness: 4, colors: darkColors, custom: darkCustom, dark: true };
export type AppTheme = typeof lightTheme;

export const useAppTheme = () => useTheme<AppTheme>();
export function useSchemeTheme(): AppTheme {
  return useColorScheme() === 'dark' ? (darkTheme as AppTheme) : lightTheme;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, xxl: 28, pill: 999 };
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // index 0=Mon … 6=Sun
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** JS Date → our weekday index (0=Mon … 6=Sun). */
export const weekdayIdx = (d: Date) => (d.getDay() + 6) % 7;

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

/** Map a percentage to a tone, given the "low" threshold. */
export function pctTone(p: number | null | undefined, low = 75): Tone {
  if (p == null) return 'neutral';
  if (p >= low + 10) return 'success';
  if (p >= low) return 'warning';
  return 'danger';
}

export function toneColors(t: AppTheme, tone: Tone) {
  const c = t.custom;
  switch (tone) {
    case 'success': return { fg: c.success, bg: c.successContainer, on: c.onSuccessContainer };
    case 'warning': return { fg: c.warning, bg: c.warningContainer, on: c.onWarningContainer };
    case 'danger': return { fg: c.danger, bg: c.dangerContainer, on: c.onDangerContainer };
    case 'primary': return { fg: t.colors.primary, bg: t.colors.primaryContainer, on: t.colors.onPrimaryContainer };
    default: return { fg: t.colors.onSurfaceVariant, bg: t.colors.surfaceVariant, on: t.colors.onSurfaceVariant };
  }
}

export function gradeOf(p: number): string {
  if (p >= 91) return 'A1';
  if (p >= 81) return 'A2';
  if (p >= 71) return 'B1';
  if (p >= 61) return 'B2';
  if (p >= 51) return 'C1';
  if (p >= 41) return 'C2';
  if (p >= 33) return 'D';
  return 'E';
}

export function initials(name: string) {
  return name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
