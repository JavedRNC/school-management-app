import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, createElement, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme, ViewStyle } from 'react-native';
import { configureFonts, MD3DarkTheme, MD3LightTheme, useTheme } from 'react-native-paper';

/**
 * Three looks the user can pick in Me → Appearance (saved per phone):
 *  - chalk:    chalkboard green + marigold on soft paper; follows the phone's light / dark setting.
 *  - register: the attendance register — white paper, blue ink, red margin for absent. Always light.
 *  - night:    "Marigold Night" — navy with marigold and mint. Always dark.
 * Every screen reads colours, fonts and shapes from the theme, so the layout stays the same in all three.
 * Extra semantic colours live under `custom`.
 */
export type ThemeKind = 'chalk' | 'register' | 'night';
export const THEME_KINDS: { kind: ThemeKind; name: string; blurb: string }[] = [
  { kind: 'chalk', name: 'Chalk', blurb: 'Calm green and marigold. Follows your phone’s dark mode.' },
  { kind: 'register', name: 'Register', blurb: 'White paper and blue ink, like the attendance register.' },
  { kind: 'night', name: 'Marigold Night', blurb: 'Dark navy with marigold. Easy on the eyes at night.' },
];

type Colors = typeof MD3LightTheme.colors;
const elev = (l1: string, l2: string, l3: string, l4: string, l5: string) => ({ level0: 'transparent', level1: l1, level2: l2, level3: l3, level4: l4, level5: l5 });

// ---------------------------------------------------------------- colours
const chalkLight: Colors = {
  ...MD3LightTheme.colors,
  primary: '#1E4D3F', onPrimary: '#FFFFFF', primaryContainer: '#DCEBE4', onPrimaryContainer: '#0E2B22',
  secondary: '#8F5E00', onSecondary: '#FFFFFF', secondaryContainer: '#FBE7BC', onSecondaryContainer: '#3A2600',
  tertiary: '#2F5D7C', onTertiary: '#FFFFFF', tertiaryContainer: '#DCE8F0', onTertiaryContainer: '#0F2A3B',
  background: '#F5F6F2', onBackground: '#14201B', surface: '#F5F6F2', onSurface: '#14201B',
  surfaceVariant: '#E7EBE6', onSurfaceVariant: '#4C5852', outline: '#5F6B64', outlineVariant: '#D5DAD4',
  error: '#B4410F', onError: '#FFFFFF', errorContainer: '#F8DCCB', onErrorContainer: '#4A1A04',
  inverseSurface: '#26322C', inverseOnSurface: '#EEF2EE', inversePrimary: '#8FCFB4', backdrop: 'rgba(20,32,27,0.45)',
  elevation: elev('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FBFCFA', '#F8F9F6'),
};
const chalkDark: Colors = {
  ...MD3DarkTheme.colors,
  primary: '#8FCFB4', onPrimary: '#003826', primaryContainer: '#1F4D3F', onPrimaryContainer: '#CDEBDD',
  secondary: '#F2C063', onSecondary: '#3F2C00', secondaryContainer: '#5A4200', onSecondaryContainer: '#FFE6B3',
  tertiary: '#9CC9E8', onTertiary: '#06344C', tertiaryContainer: '#1F4660', onTertiaryContainer: '#D3E9F8',
  background: '#0F1613', onBackground: '#E4EAE6', surface: '#0F1613', onSurface: '#E4EAE6',
  surfaceVariant: '#2A3530', onSurfaceVariant: '#B9C3BD', outline: '#87928C', outlineVariant: '#34403A',
  error: '#FFB59A', onError: '#5A1D00', errorContainer: '#6B2B0B', onErrorContainer: '#FFDBCC',
  inverseSurface: '#E4EAE6', inverseOnSurface: '#26322C', inversePrimary: '#1E4D3F', backdrop: 'rgba(0,0,0,0.6)',
  elevation: elev('#17201C', '#1B2520', '#202B26', '#232F29', '#27332D'),
};
const registerLight: Colors = {
  ...MD3LightTheme.colors,
  primary: '#2340B8', onPrimary: '#FFFFFF', primaryContainer: '#E3E8FB', onPrimaryContainer: '#0F1B3D',
  secondary: '#8F5E00', onSecondary: '#FFFFFF', secondaryContainer: '#FCEBC4', onSecondaryContainer: '#3A2600',
  tertiary: '#1D6B6B', onTertiary: '#FFFFFF', tertiaryContainer: '#D6EFEC', onTertiaryContainer: '#0A2E2E',
  background: '#FFFFFF', onBackground: '#0F1B3D', surface: '#FFFFFF', onSurface: '#0F1B3D',
  surfaceVariant: '#EEF1FA', onSurfaceVariant: '#4A5578', outline: '#5D6789', outlineVariant: '#C9D1E8',
  error: '#C23434', onError: '#FFFFFF', errorContainer: '#FDE3E3', onErrorContainer: '#4A0D0D',
  inverseSurface: '#1D2747', inverseOnSurface: '#EEF1FA', inversePrimary: '#AFC0FF', backdrop: 'rgba(15,27,61,0.45)',
  elevation: elev('#FFFFFF', '#FFFFFF', '#FFFFFF', '#FAFBFE', '#F6F8FD'),
};
const nightDark: Colors = {
  ...MD3DarkTheme.colors,
  primary: '#FFB02E', onPrimary: '#0D1321', primaryContainer: '#4A3A16', onPrimaryContainer: '#FFE2AE',
  secondary: '#4ADE9B', onSecondary: '#062B1A', secondaryContainer: '#173D2E', onSecondaryContainer: '#C9F6DF',
  tertiary: '#8FB8FF', onTertiary: '#0A2350', tertiaryContainer: '#1E3358', onTertiaryContainer: '#D8E6FF',
  background: '#0D1321', onBackground: '#EEF2FA', surface: '#0D1321', onSurface: '#EEF2FA',
  surfaceVariant: '#1E2A44', onSurfaceVariant: '#9AA6C0', outline: '#8390AD', outlineVariant: '#2E3B5C',
  error: '#FF7A6B', onError: '#2B0A06', errorContainer: '#4A1F24', onErrorContainer: '#FFD9D3',
  inverseSurface: '#EEF2FA', inverseOnSurface: '#161F33', inversePrimary: '#8A5A00', backdrop: 'rgba(0,0,0,0.65)',
  elevation: elev('#161F33', '#1A2440', '#1E2A44', '#222F4B', '#263452'),
};

/**
 * custom tokens. `present` / `presentContainer` colour a present student; `feature` is the one bold card on a
 * home screen (attendance today, your class) with `onFeature` text on it.
 */
const chalkLightCustom = {
  success: '#2E7D4F', successContainer: '#D3EEDC', onSuccessContainer: '#0B2E19',
  warning: '#8F5E00', warningContainer: '#FBE7BC', onWarningContainer: '#3A2600',
  danger: '#B4410F', dangerContainer: '#F8DCCB', onDangerContainer: '#4A1A04',
  heroStart: '#1E4D3F', heroEnd: '#2C6A56', amber: '#E8A317', chartTrack: '#E4E8E3',
  inset: '#EEF1EC', cardBorder: '#E4E8E3', shadow: '#1E3A30', onAmber: '#2B1B00',
  absentWash: '#FFF4EE', absentEdge: '#F3C9B2',
  present: '#1E4D3F', presentContainer: '#DCEBE4', onPresentContainer: '#1E4D3F',
  feature: '#1E4D3F', onFeature: '#FFFFFF', featureTrack: 'rgba(255,255,255,0.16)', featureLow: '#FF9A73', featureWait: '#FFD27A',
};
type Custom = typeof chalkLightCustom;
const chalkDarkCustom: Custom = {
  success: '#7FD9A3', successContainer: '#143D27', onSuccessContainer: '#CFF2DC',
  warning: '#F2C063', warningContainer: '#4A3605', onWarningContainer: '#FFE6B3',
  danger: '#FFB59A', dangerContainer: '#6B2B0B', onDangerContainer: '#FFDBCC',
  heroStart: '#163A2F', heroEnd: '#1F4D3F', amber: '#F2B13A', chartTrack: '#2A3530',
  inset: '#1F2924', cardBorder: '#2A3530', shadow: '#000000', onAmber: '#2B1B00',
  absentWash: '#2E1D15', absentEdge: '#6B2B0B',
  present: '#8FCFB4', presentContainer: '#1F4D3F', onPresentContainer: '#CDEBDD',
  feature: '#1F4D3F', onFeature: '#FFFFFF', featureTrack: 'rgba(255,255,255,0.16)', featureLow: '#FF9A73', featureWait: '#FFD27A',
};
const registerCustom: Custom = {
  success: '#1F7A4D', successContainer: '#D7F0E2', onSuccessContainer: '#062E19',
  warning: '#8F5E00', warningContainer: '#FCEBC4', onWarningContainer: '#3A2600',
  danger: '#C23434', dangerContainer: '#FDE3E3', onDangerContainer: '#4A0D0D',
  heroStart: '#2340B8', heroEnd: '#3A57D0', amber: '#E8A317', chartTrack: '#E3E8F5',
  inset: '#F5F7FC', cardBorder: '#E3E8F5', shadow: '#16245E', onAmber: '#2B1B00',
  absentWash: '#FFF6F6', absentEdge: '#F2B8B8',
  present: '#2340B8', presentContainer: '#E3E8FB', onPresentContainer: '#2340B8',
  feature: '#2340B8', onFeature: '#FFFFFF', featureTrack: 'rgba(255,255,255,0.2)', featureLow: '#FFB4A8', featureWait: '#FFD27A',
};
const nightCustom: Custom = {
  success: '#4ADE9B', successContainer: '#173D2E', onSuccessContainer: '#C9F6DF',
  warning: '#FFB02E', warningContainer: '#4A3A16', onWarningContainer: '#FFE2AE',
  danger: '#FF7A6B', dangerContainer: '#4A1F24', onDangerContainer: '#FFD9D3',
  heroStart: '#1E2A44', heroEnd: '#26365A', amber: '#FFB02E', chartTrack: '#26324F',
  inset: '#1A2440', cardBorder: '#26324F', shadow: '#000000', onAmber: '#0D1321',
  absentWash: '#3A1F26', absentEdge: '#FF7A6B',
  present: '#4ADE9B', presentContainer: '#173D2E', onPresentContainer: '#4ADE9B',
  feature: '#1E2A44', onFeature: '#EEF2FA', featureTrack: 'rgba(255,255,255,0.10)', featureLow: '#FF7A6B', featureWait: '#FFB02E',
};

// ---------------------------------------------------------------- type
/**
 * Fonts are bundled with the app (app.json → expo-font). Chalk: Mukta (Devanagari + Latin) with Bricolage Grotesque
 * headlines. Register: Lexend. Night: Sora. Hindi in Register / Night falls back to the phone's Devanagari font,
 * so line-heights stay ≥1.4× and matras never clip. Mukta's x-height is small, so Chalk runs ~1sp larger.
 */
export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
type W = '400' | '500' | '600' | '700' | '800';
function makeFonts(text: string, display: string, d: number, displayWeight: W = '700') {
  const T = (fontSize: number, lineHeight: number, fontWeight: W = '400') =>
    ({ fontFamily: text, fontSize: fontSize + d, lineHeight: lineHeight + d, letterSpacing: 0, fontWeight });
  const D = (fontSize: number, lineHeight: number, letterSpacing = -0.3) =>
    ({ fontFamily: display, fontSize: fontSize + d * 2, lineHeight: lineHeight + d * 2, letterSpacing, fontWeight: displayWeight });
  return configureFonts({
    config: {
      // No size here: Paper applies `default` to every Text without a variant, and a fixed line-height would clip big custom sizes.
      default: { fontFamily: text, letterSpacing: 0, fontWeight: '400' } as never,
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
}
/** On Android the family names come from app.json; on iOS / web from the font files. */
const BRICOLAGE = Platform.select({ android: 'Bricolage', default: 'Bricolage Grotesque' }) as string;
const FONTS = {
  chalk: { text: 'Mukta', display: BRICOLAGE, fonts: makeFonts('Mukta', BRICOLAGE, 0) },
  register: { text: 'Lexend', display: 'Lexend', fonts: makeFonts('Lexend', 'Lexend', -1) },
  night: { text: 'Sora', display: 'Sora', fonts: makeFonts('Sora', 'Sora', -1, '800') },
};

/** Shape and style choices that differ per theme (the layout itself never does). */
const SHAPE = {
  chalk: { card: 18, feature: 26, tabs: 'pill' as const, header: 'plain' as const, attendanceRow: 'pill' as const, defaultView: 'list' as const },
  register: { card: 12, feature: 16, tabs: 'line' as const, header: 'ruled' as const, attendanceRow: 'register' as const, defaultView: 'list' as const },
  night: { card: 24, feature: 28, tabs: 'floating' as const, header: 'plain' as const, attendanceRow: 'pill' as const, defaultView: 'grid' as const },
};

function build(kind: ThemeKind, dark: boolean, colors: Colors, custom: Custom) {
  const f = FONTS[kind];
  return {
    ...(dark ? MD3DarkTheme : MD3LightTheme), roundness: 4, colors, dark, fonts: f.fonts,
    custom: { ...custom, fontText: f.text, fontDisplay: f.display },
    kind, shape: SHAPE[kind],
  };
}
export const lightTheme = build('chalk', false, chalkLight, chalkLightCustom);
export type AppTheme = typeof lightTheme;
const THEMES: Record<string, AppTheme> = {
  'chalk-light': lightTheme,
  'chalk-dark': build('chalk', true, chalkDark, chalkDarkCustom),
  register: build('register', false, registerLight, registerCustom),
  night: build('night', true, nightDark, nightCustom),
};
export function themeFor(kind: ThemeKind, phoneDark: boolean): AppTheme {
  if (kind === 'register') return THEMES.register;
  if (kind === 'night') return THEMES.night;
  return phoneDark ? THEMES['chalk-dark'] : THEMES['chalk-light'];
}

export const useAppTheme = () => useTheme<AppTheme>();

// ---------------------------------------------------------------- chosen theme (per phone)
const THEME_KEY = 'app_theme';
const isKind = (x: unknown): x is ThemeKind => x === 'chalk' || x === 'register' || x === 'night';
type Pref = { kind: ThemeKind; setKind: (k: ThemeKind) => void; ready: boolean };
const PrefContext = createContext<Pref>({ kind: 'chalk', setKind: () => {}, ready: true });

/** Holds the user's theme choice and remembers it on this phone. */
export function ThemePrefProvider({ children }: { children: ReactNode }) {
  const [kind, setK] = useState<ThemeKind>('chalk');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; setReady(true); } };
    const giveUp = setTimeout(finish, 600);      // never keep the app hidden if storage is slow
    AsyncStorage.getItem(THEME_KEY).then((x) => { if (!done && isKind(x)) setK(x); }).catch(() => {}).finally(finish);
    return () => clearTimeout(giveUp);
  }, []);
  const value = useMemo<Pref>(() => ({
    kind, ready,
    setKind: (k) => { setK(k); AsyncStorage.setItem(THEME_KEY, k).catch(() => {}); },
  }), [kind, ready]);
  return createElement(PrefContext.Provider, { value }, children);
}
export const useThemePref = () => useContext(PrefContext);
/** The theme to draw with: the user's choice, plus the phone's light / dark for Chalk. */
export function useChosenTheme(): AppTheme {
  const { kind } = useThemePref();
  return themeFor(kind, useColorScheme() === 'dark');
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

/** Text colour that reads on a filled background: white on dark colours, near-black on bright ones (Night's mint, marigold, coral). */
export function inkOn(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#FFFFFF';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.06 ? '#FFFFFF' : '#0D1321';
}

export function initials(name: string) {
  return name.replace(/^(Dr|Mr|Mrs|Ms)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
