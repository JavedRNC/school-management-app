import { Platform, useColorScheme, ViewStyle } from 'react-native';
import { configureFonts, MD3DarkTheme, MD3LightTheme, useTheme } from 'react-native-paper';

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
  background: '#F2F5FB',
  onBackground: '#171A1F',
  surface: '#F2F5FB',
  onSurface: '#171A1F',
  surfaceVariant: '#E1E6F0',
  onSurfaceVariant: '#43474E',
  outline: '#6B6F78',
  outlineVariant: '#CDD2DC',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  elevation: {
    level0: 'transparent',
    // Cards are white on a cool-grey page: depth comes from the shadow, not from a tint.
    level1: '#FFFFFF',
    level2: '#FFFFFF',
    level3: '#FFFFFF',
    level4: '#FAFBFE',
    level5: '#F6F8FD',
  },
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: '#A9C7FF',
  onPrimary: '#003063',
  primaryContainer: '#12407A',
  onPrimaryContainer: '#D6E3FF',
  secondary: '#FFB951',
  onSecondary: '#482900',
  secondaryContainer: '#543807',
  onSecondaryContainer: '#FFDDB0',
  tertiary: '#5DD5FC',
  tertiaryContainer: '#0B4656',
  onTertiaryContainer: '#B7EAFF',
  background: '#0E1117',
  onBackground: '#E3E5EC',
  surface: '#0E1117',
  onSurface: '#E3E5EC',
  surfaceVariant: '#43474E',
  onSurfaceVariant: '#C4C6CF',
  outline: '#8E9099',
  outlineVariant: '#43474E',
  error: '#FFB4AB',
  errorContainer: '#5F1A1A',
  onErrorContainer: '#FFDAD6',
  elevation: {
    level0: 'transparent',
    level1: '#181C25',
    level2: '#1C212C',
    level3: '#222835',
    level4: '#252B39',
    level5: '#29303F',
  },
};

const lightCustom = {
  success: '#1E7A46', successContainer: '#C8F0D4', onSuccessContainer: '#00210E',
  warning: '#8A5A00', warningContainer: '#FFE3B5', onWarningContainer: '#2C1700',
  danger: '#BA1A1A', dangerContainer: '#FFDAD6', onDangerContainer: '#410002',
  heroStart: '#123A6E', heroEnd: '#2D6CC0', amber: '#F5A623', chartTrack: '#E3E8F2',
  inset: '#F0F3FA', cardBorder: 'rgba(26,77,143,0.07)', shadow: '#1A3A6B', onAmber: '#2B1B00',
};
const darkCustom = {
  success: '#7FD99E', successContainer: '#123F29', onSuccessContainer: '#C8F0D4',
  warning: '#FFB951', warningContainer: '#4A3305', onWarningContainer: '#FFE3B5',
  danger: '#FFB4AB', dangerContainer: '#5F1A1A', onDangerContainer: '#FFDAD6',
  heroStart: '#0B2547', heroEnd: '#1B4B8A', amber: '#FFB951', chartTrack: '#2A303B',
  inset: '#232937', cardBorder: 'rgba(255,255,255,0.07)', shadow: '#000000', onAmber: '#2B1B00',
};

/**
 * Type scale — one step tighter than stock Material 3 (body 16→15, titles 22/16→19/15, headlines 28/24→24/21) and
 * with the wide M3 tracking removed. Nothing goes below 12sp. Line-heights stay ≥1.3 so Devanagari matras
 * and descenders in names are never clipped.
 */
export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
const fonts = configureFonts({
  config: {
    displayLarge: { fontSize: 44, lineHeight: 52, letterSpacing: -0.5 },
    displayMedium: { fontSize: 36, lineHeight: 44, letterSpacing: -0.4 },
    displaySmall: { fontSize: 30, lineHeight: 38, letterSpacing: -0.3 },
    headlineLarge: { fontSize: 26, lineHeight: 33, letterSpacing: -0.3 },
    headlineMedium: { fontSize: 23, lineHeight: 30, letterSpacing: -0.2 },
    headlineSmall: { fontSize: 20, lineHeight: 26, letterSpacing: -0.1 },
    titleLarge: { fontSize: 18, lineHeight: 24, letterSpacing: 0 },
    titleMedium: { fontSize: 15, lineHeight: 21, letterSpacing: 0, fontWeight: '600' },
    titleSmall: { fontSize: 13, lineHeight: 18, letterSpacing: 0, fontWeight: '600' },
    bodyLarge: { fontSize: 15, lineHeight: 22, letterSpacing: 0 },
    bodyMedium: { fontSize: 13, lineHeight: 19, letterSpacing: 0 },
    bodySmall: { fontSize: 12, lineHeight: 17, letterSpacing: 0.1 },
    labelLarge: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1, fontWeight: '600' },
    labelMedium: { fontSize: 12, lineHeight: 16, letterSpacing: 0.1, fontWeight: '600' },
    labelSmall: { fontSize: 12, lineHeight: 16, letterSpacing: 0.1, fontWeight: '500' },
  },
});

export const lightTheme = { ...MD3LightTheme, roundness: 4, colors: lightColors, custom: lightCustom, dark: false, fonts };
export const darkTheme = { ...MD3DarkTheme, roundness: 4, colors: darkColors, custom: darkCustom, dark: true, fonts };
export type AppTheme = typeof lightTheme;

export const useAppTheme = () => useTheme<AppTheme>();
export function useSchemeTheme(): AppTheme {
  return useColorScheme() === 'dark' ? (darkTheme as AppTheme) : lightTheme;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 };
/** Minimum touch target (dp). */
export const HIT = 44;

/**
 * Elevation language.
 *  1 = resting card · 2 = floating card (over a hero, sticky bars) · 3 = FAB / sheet / toast.
 * Shadows are tinted with the brand blue in light mode; in dark mode depth comes from the lighter
 * surface + hairline border, so shadows are near-invisible by design.
 * Android gets native `elevation` (cheap on low-end GPUs); iOS / web get a soft blurred shadow.
 */
export function shadow(t: AppTheme, level: 0 | 1 | 2 | 3 = 1, color?: string): ViewStyle {
  if (!level) return {};
  const c = color ?? t.custom.shadow;
  const k = [0, 1, 2, 3][level];
  return Platform.select<ViewStyle>({
    android: { elevation: [0, 2, 5, 9][k], shadowColor: c },
    default: {
      shadowColor: c,
      shadowOpacity: color ? 0.3 : t.dark ? 0.35 : [0, 0.08, 0.12, 0.18][k],
      shadowRadius: [0, 10, 18, 24][k],
      shadowOffset: { width: 0, height: [0, 3, 7, 10][k] },
    },
  }) as ViewStyle;
}

/** Soft coloured glow — only for the ONE thing on screen that needs attention (primary CTA, overdue, success). */
export function glow(color: string, strong = false): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: strong ? 8 : 5, shadowColor: color },
    default: { shadowColor: color, shadowOpacity: strong ? 0.45 : 0.3, shadowRadius: strong ? 18 : 12, shadowOffset: { width: 0, height: 5 } },
  }) as ViewStyle;
}

/** Hairline card edge: keeps white cards crisp on the grey page and gives dark cards their shape. */
export function cardEdge(t: AppTheme): ViewStyle {
  return { borderWidth: 1, borderColor: t.custom.cardBorder };
}
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
