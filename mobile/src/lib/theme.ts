import { Platform, useColorScheme, ViewStyle } from 'react-native';
import { configureFonts, MD3DarkTheme, MD3LightTheme, useTheme } from 'react-native-paper';

/**
 * "Chalk" theme — calm chalkboard green on a soft paper ground, with marigold (from the logo) as the one accent.
 * Cards are flat white with a hairline edge; depth is kept for things that float (sheets, FABs, toasts).
 * Extra semantic colours live under `custom`.
 */
const lightColors = {
  ...MD3LightTheme.colors,
  primary: '#1E4D3F',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DCEBE4',
  onPrimaryContainer: '#0E2B22',
  secondary: '#8F5E00',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#FBE7BC',
  onSecondaryContainer: '#3A2600',
  tertiary: '#2F5D7C',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#DCE8F0',
  onTertiaryContainer: '#0F2A3B',
  background: '#F5F6F2',
  onBackground: '#14201B',
  surface: '#F5F6F2',
  onSurface: '#14201B',
  surfaceVariant: '#E7EBE6',
  onSurfaceVariant: '#4C5852',
  outline: '#5F6B64',
  outlineVariant: '#D5DAD4',
  error: '#B4410F',
  onError: '#FFFFFF',
  errorContainer: '#F8DCCB',
  onErrorContainer: '#4A1A04',
  inverseSurface: '#26322C',
  inverseOnSurface: '#EEF2EE',
  inversePrimary: '#8FCFB4',
  backdrop: 'rgba(20,32,27,0.45)',
  elevation: {
    level0: 'transparent',
    level1: '#FFFFFF',
    level2: '#FFFFFF',
    level3: '#FFFFFF',
    level4: '#FBFCFA',
    level5: '#F8F9F6',
  },
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: '#8FCFB4',
  onPrimary: '#003826',
  primaryContainer: '#1F4D3F',
  onPrimaryContainer: '#CDEBDD',
  secondary: '#F2C063',
  onSecondary: '#3F2C00',
  secondaryContainer: '#5A4200',
  onSecondaryContainer: '#FFE6B3',
  tertiary: '#9CC9E8',
  onTertiary: '#06344C',
  tertiaryContainer: '#1F4660',
  onTertiaryContainer: '#D3E9F8',
  background: '#0F1613',
  onBackground: '#E4EAE6',
  surface: '#0F1613',
  onSurface: '#E4EAE6',
  surfaceVariant: '#2A3530',
  onSurfaceVariant: '#B9C3BD',
  outline: '#87928C',
  outlineVariant: '#34403A',
  error: '#FFB59A',
  onError: '#5A1D00',
  errorContainer: '#6B2B0B',
  onErrorContainer: '#FFDBCC',
  inverseSurface: '#E4EAE6',
  inverseOnSurface: '#26322C',
  inversePrimary: '#1E4D3F',
  backdrop: 'rgba(0,0,0,0.6)',
  elevation: {
    level0: 'transparent',
    level1: '#17201C',
    level2: '#1B2520',
    level3: '#202B26',
    level4: '#232F29',
    level5: '#27332D',
  },
};

const lightCustom = {
  success: '#2E7D4F', successContainer: '#D3EEDC', onSuccessContainer: '#0B2E19',
  warning: '#8F5E00', warningContainer: '#FBE7BC', onWarningContainer: '#3A2600',
  danger: '#B4410F', dangerContainer: '#F8DCCB', onDangerContainer: '#4A1A04',
  heroStart: '#1E4D3F', heroEnd: '#2C6A56', amber: '#E8A317', chartTrack: '#E4E8E3',
  inset: '#EEF1EC', cardBorder: '#E4E8E3', shadow: '#1E3A30', onAmber: '#2B1B00',
  /** Present / absent wash used on attendance rows and tiles. */
  absentWash: '#FFF4EE', absentEdge: '#F3C9B2',
};
const darkCustom = {
  success: '#7FD9A3', successContainer: '#143D27', onSuccessContainer: '#CFF2DC',
  warning: '#F2C063', warningContainer: '#4A3605', onWarningContainer: '#FFE6B3',
  danger: '#FFB59A', dangerContainer: '#6B2B0B', onDangerContainer: '#FFDBCC',
  heroStart: '#163A2F', heroEnd: '#1F4D3F', amber: '#F2B13A', chartTrack: '#2A3530',
  inset: '#1F2924', cardBorder: '#2A3530', shadow: '#000000', onAmber: '#2B1B00',
  absentWash: '#2E1D15', absentEdge: '#6B2B0B',
};

/**
 * Type — Mukta for text (drawn for Devanagari and Latin together, so Hindi names sit right next to English),
 * Bricolage Grotesque for headlines and big numbers. Both are bundled with the app (app.json → expo-font).
 * Mukta's x-height is small, so sizes run ~1sp above stock M3; line-heights stay ≥1.4× so matras never clip.
 */
export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
export const FONT_TEXT = 'Mukta';
/** On Android the family is named in app.json; on iOS/web the name comes from the font file. */
export const FONT_DISPLAY = Platform.select({ android: 'Bricolage', default: 'Bricolage Grotesque' }) as string;
const T = (fontSize: number, lineHeight: number, fontWeight: '400' | '500' | '600' | '700' = '400') =>
  ({ fontFamily: FONT_TEXT, fontSize, lineHeight, letterSpacing: 0, fontWeight });
const D = (fontSize: number, lineHeight: number, letterSpacing = -0.3) =>
  ({ fontFamily: FONT_DISPLAY, fontSize, lineHeight, letterSpacing, fontWeight: '700' as const });
const fonts = configureFonts({
  config: {
    // No size here: Paper applies `default` to every Text without a variant, and a fixed line-height would clip big custom sizes.
    default: { fontFamily: FONT_TEXT, letterSpacing: 0, fontWeight: '400' } as never,
    displayLarge: D(46, 58, -0.8),
    displayMedium: D(38, 48, -0.6),
    displaySmall: D(32, 41, -0.5),
    headlineLarge: D(29, 38, -0.4),
    headlineMedium: D(25, 33, -0.3),
    headlineSmall: D(21, 28, -0.2),
    titleLarge: T(19, 27, '700'),
    titleMedium: T(16, 23, '600'),
    titleSmall: T(14, 20, '600'),
    bodyLarge: T(16, 23),
    bodyMedium: T(14, 20),
    bodySmall: T(13, 18),
    labelLarge: T(14, 20, '600'),
    labelMedium: T(13, 18, '600'),
    labelSmall: T(12, 17, '500'),
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
export const radius = { sm: 8, md: 12, lg: 16, xl: 18, xxl: 26, pill: 999 };
/** Minimum touch target (dp). */
export const HIT = 44;

/**
 * Elevation language.
 *  1 = resting card · 2 = card on a header (both flat in Chalk: hairline edge only) · 3 = FAB / sheet / toast.
 * Shadows are tinted with the brand green in light mode; in dark mode depth comes from the lighter
 * surface + hairline border, so shadows are near-invisible by design.
 * Android gets native `elevation` (cheap on low-end GPUs); iOS / web get a soft blurred shadow.
 */
export function shadow(t: AppTheme, level: 0 | 1 | 2 | 3 = 1, color?: string): ViewStyle {
  // Chalk: resting cards are flat (hairline edge only). Only things that float get a shadow.
  if (!level || (level < 3 && !color)) return {};
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
