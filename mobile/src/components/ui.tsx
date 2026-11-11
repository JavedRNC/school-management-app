import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ComponentProps, createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  View, ViewStyle,
} from 'react-native';
import { AnimatedFAB, Avatar, Button, IconButton, Text, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic, prefersReducedMotion } from '@/lib/feedback';
import { cardEdge, glow, initials, radius, shadow, space, Tone, toneColors, useAppTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export const Icon = MaterialCommunityIcons;

// ---------------------------------------------------------------- motion
/*
 * Motion rules
 *  - Entrances: 300 ms fade + 10 dp rise, 45 ms stagger, capped at 8 steps (nothing waits > 360 ms).
 *  - Press: scale to 0.97 with a quick spring (PressScale) or a ripple (rows / panels) — never both.
 *  - Numbers count up once (700 ms). Charts grow once.
 *  - Everything runs on the native driver except count-ups and SVG; all of it is skipped when the
 *    phone has "Remove animations" switched on.
 */

/** Fade + slide up on mount. `index` staggers siblings. */
export function FadeIn({ children, index = 0, style }: { children: ReactNode; index?: number; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return v.setValue(1);
    Animated.timing(v, { toValue: 1, duration: 300, delay: Math.min(index, 8) * 45, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, index]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Number that counts up to `value`. */
export function CountUp({ value, decimals = 0, suffix = '', style, variant = 'headlineMedium', format }: {
  value: number; decimals?: number; suffix?: string; style?: object; format?: (n: number) => string;
  variant?: ComponentProps<typeof Text>['variant'];
}) {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return setShown(value);
    const id = v.addListener(({ value: x }) => setShown(x));
    Animated.timing(v, { toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => setShown(value));
    return () => v.removeListener(id);
  }, [v, value]);
  return <Text variant={variant} style={[{ fontWeight: '700', fontVariant: ['tabular-nums'] }, style]}>{format ? format(shown) : shown.toFixed(decimals)}{suffix}</Text>;
}

/** Scale-down press feedback wrapper. */
export function PressScale({ children, onPress, style, disabled }: { children: ReactNode; onPress?: () => void; style?: ViewStyle; disabled?: boolean }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (x: number) => Animated.spring(s, { toValue: x, useNativeDriver: true, speed: 50, bounciness: x === 1 ? 8 : 0 }).start();
  return (
    <Pressable disabled={disabled || !onPress} onPressIn={() => to(0.97)} onPressOut={() => to(1)}
      onPress={() => { haptic.tap(); onPress?.(); }} style={style}>
      <Animated.View style={{ flexGrow: 1, transform: [{ scale: s }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- layout
export function Screen({ children, onRefresh, refreshing = false, header, padded = true, footerSpace = 96 }: {
  children: ReactNode; onRefresh?: () => void; refreshing?: boolean; header?: ReactNode; padded?: boolean; footerSpace?: number;
}) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: footerSpace, paddingTop: header ? 0 : insets.top }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.colors.primary, t.custom.amber]}
            progressBackgroundColor={t.colors.elevation.level3} tintColor={t.custom.amber} progressViewOffset={insets.top} />
        ) : undefined}
      >
        {header}
        <View style={padded ? { paddingHorizontal: space.lg, paddingTop: header ? 0 : space.md } : undefined}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** When true, Hero shows a back arrow (screens opened on top of the tabs). */
export const StackedContext = createContext(false);

/** Gradient hero header; children float over its bottom edge. */
export function Hero({ title, subtitle, eyebrow, right, children, compact }: {
  title: string; subtitle?: string; eyebrow?: string; right?: ReactNode; children?: ReactNode; compact?: boolean;
}) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const stacked = useContext(StackedContext);
  return (
    <View style={{ marginBottom: children ? 0 : space.lg }}>
      <LinearGradient colors={[t.custom.heroStart, t.custom.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: children ? 56 : compact ? space.lg : space.xl,
          borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl, overflow: 'hidden' }}>
        <View style={[styles.circle, { width: 220, height: 220, right: -70, top: -90, backgroundColor: 'rgba(255,255,255,0.07)' }]} />
        <View style={[styles.circle, { width: 110, height: 110, right: 60, top: 46, backgroundColor: 'rgba(245,166,35,0.14)' }]} />
        <View style={[styles.circle, { width: 150, height: 150, left: -60, bottom: -90, backgroundColor: 'rgba(255,255,255,0.05)' }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48 }}>
          {stacked ? (
            <IconButton icon="arrow-left" iconColor="#fff" size={22} accessibilityLabel="Back"
              style={{ marginLeft: -space.sm, marginRight: space.xs, backgroundColor: 'rgba(255,255,255,0.12)' }}
              onPress={() => { haptic.tap(); if (router.canGoBack()) router.back(); else router.replace('/'); }} />
          ) : null}
          <View style={{ flex: 1 }}>
            {eyebrow ? <Text variant="labelLarge" style={{ color: 'rgba(255,255,255,0.78)', fontWeight: '500' }}>{eyebrow}</Text> : null}
            <Text variant={compact || stacked ? 'headlineSmall' : 'headlineMedium'} numberOfLines={2} style={{ color: '#fff', fontWeight: '700' }}>{title}</Text>
            {subtitle ? <Text variant="bodyMedium" style={{ color: 'rgba(255,255,255,0.84)', marginTop: 1 }}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      </LinearGradient>
      {children ? <View style={{ marginTop: -40, paddingHorizontal: space.lg }}>{children}</View> : null}
    </View>
  );
}

// Six soft hues so a list of people is easier to scan than a column of identical blue discs.
const AVATAR_LIGHT = [['#D6E3FF', '#0B3A75'], ['#FFE3B5', '#5C3B00'], ['#C8F0D4', '#0B5229'], ['#FFD9E2', '#7A1F3D'], ['#E5DEFF', '#3B2A8C'], ['#B7EAFF', '#004D61']];
const AVATAR_DARK = [['#00468C', '#D6E3FF'], ['#5A3A00', '#FFE3B5'], ['#005229', '#C8F0D4'], ['#6B1F38', '#FFD9E2'], ['#3A2E7A', '#E5DEFF'], ['#004D61', '#B7EAFF']];

export function UserAvatar({ name, size = 44, light }: { name: string; size?: number; light?: boolean }) {
  const t = useAppTheme();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  const [bg, fg] = (t.dark ? AVATAR_DARK : AVATAR_LIGHT)[h % 6];
  return (
    <Avatar.Text size={size} label={initials(name)}
      style={light ? { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' } : { backgroundColor: bg }}
      color={light ? '#fff' : fg} labelStyle={{ fontWeight: '700', fontSize: size * 0.36, letterSpacing: 0.2 }} />
  );
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: ViewStyle }) {
  const t = useAppTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm, minHeight: 32 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 }}>
        <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: t.custom.amber }} />
        <Text variant="titleMedium" numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: t.colors.onBackground, flexShrink: 1 }}>{title}</Text>
      </View>
      {action ? <Button compact onPress={onAction}>{action}</Button> : null}
    </View>
  );
}

export function Panel({ children, title, subtitle, icon, right, style, onPress, tone }: {
  children?: ReactNode; title?: string; subtitle?: string; icon?: IconName; right?: ReactNode; style?: ViewStyle;
  onPress?: () => void; tone?: Tone;
}) {
  const t = useAppTheme();
  const tc = tone ? toneColors(t, tone) : null;
  const inner = (
    <View style={{ padding: space.lg }}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: children ? space.md : 0, gap: space.md }}>
          {icon ? <IconBadge icon={icon} tone={tone ?? 'primary'} /> : null}
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ fontWeight: '700', color: tc?.on ?? t.colors.onSurface }}>{title}</Text>
            {subtitle ? <Text variant="bodySmall" style={{ color: tc?.on ?? t.colors.onSurfaceVariant, opacity: tc ? 0.85 : 1 }}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
  return (
    <View style={[{ marginBottom: space.md, borderRadius: radius.xl, backgroundColor: tc ? tc.bg : t.colors.elevation.level1 },
      tc ? null : cardEdge(t), tc ? null : shadow(t, 1), style]}>
      {onPress ? (
        <TouchableRipple borderless onPress={() => { haptic.tap(); onPress(); }} style={{ borderRadius: radius.xl }} accessibilityRole="button">
          {inner}
        </TouchableRipple>
      ) : inner}
    </View>
  );
}

export function IconBadge({ icon, tone = 'primary', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const t = useAppTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: tone === 'primary' ? t.colors.primaryContainer : c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.54} color={tone === 'primary' ? t.colors.primary : c.fg} />
    </View>
  );
}

/** Tappable stat tile with count-up. */
export function StatTile({ icon, label, value, suffix, decimals, tone = 'primary', onPress, hint, format }: {
  icon: IconName; label: string; value: number | null; suffix?: string; decimals?: number; tone?: Tone; onPress?: () => void; hint?: string;
  format?: (n: number) => string;
}) {
  const t = useAppTheme();
  return (
    <PressScale onPress={onPress} style={{ flex: 1 }}>
      <View style={[{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: space.md, minHeight: 104 }, cardEdge(t), shadow(t, 1)]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconBadge icon={icon} tone={tone} size={34} />
          {onPress ? <Icon name="arrow-top-right" size={16} color={t.colors.outline} /> : null}
        </View>
        {value == null ? <Text variant="headlineMedium" style={{ fontWeight: '700', marginTop: space.sm, color: t.colors.onSurface }}>—</Text>
          : <CountUp value={value} suffix={suffix} decimals={decimals} format={format} style={{ marginTop: space.sm, color: t.colors.onSurface }} />}
        <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, fontWeight: '500' }} numberOfLines={1}>{label}</Text>
        {hint ? <Text variant="labelSmall" style={{ color: t.colors.outline }} numberOfLines={1}>{hint}</Text> : null}
      </View>
    </PressScale>
  );
}

export function ToneChip({ text, tone = 'neutral', icon, compact = true }: { text: string; tone?: Tone; icon?: IconName; compact?: boolean }) {
  const t = useAppTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg, borderRadius: radius.pill,
      paddingHorizontal: compact ? 9 : 12, paddingVertical: compact ? 3 : 6, alignSelf: 'flex-start', maxWidth: '100%' }}>
      {icon ? <Icon name={icon} size={13} color={c.fg} /> : null}
      <Text variant="labelMedium" numberOfLines={1} style={{ color: c.fg, fontWeight: '700', flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

function FilterChip({ label, icon, on, onPress }: { label: string; icon?: IconName; on: boolean; onPress: () => void }) {
  const t = useAppTheme();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on || prefersReducedMotion()) return;
    v.setValue(0.92);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 12 }).start();
  }, [v, on]);
  const fg = on ? t.colors.onSecondaryContainer : t.colors.onSurfaceVariant;
  return (
    <Animated.View style={{ transform: [{ scale: v }] }}>
      <Pressable onPress={onPress} hitSlop={{ top: 5, bottom: 5 }} accessibilityRole="button" accessibilityState={{ selected: on }}
        android_ripple={{ color: t.colors.surfaceVariant, borderless: false }}
        style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden',
          backgroundColor: on ? t.colors.secondaryContainer : t.colors.elevation.level1, borderWidth: 1,
          borderColor: on ? (t.dark ? 'transparent' : 'rgba(138,90,0,0.22)') : t.colors.outlineVariant }}>
        {icon ? <Icon name={icon} size={16} color={on ? fg : t.colors.primary} /> : null}
        <Text variant="labelLarge" style={{ color: fg, fontWeight: on ? '700' : '500' }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Horizontal, scrollable single-select filter chips. */
export function FilterChips<T extends string | number>({ options, value, onChange, label, style }: {
  options: { label: string; value: T; icon?: IconName }[]; value: T | null | undefined; onChange: (v: T) => void; label?: string; style?: ViewStyle;
}) {
  const t = useAppTheme();
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      {label ? <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, paddingRight: space.lg, paddingVertical: 2 }}>
        {options.map((o) => (
          <FilterChip key={String(o.value)} label={o.label} icon={o.icon} on={o.value === value}
            onPress={() => { haptic.tap(); onChange(o.value); }} />
        ))}
      </ScrollView>
    </View>
  );
}

export function Row({ title, subtitle, left, right, onPress, divider = true }: {
  title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void; divider?: boolean;
}) {
  const t = useAppTheme();
  return (
    <TouchableRipple onPress={onPress ? () => { haptic.tap(); onPress(); } : undefined} borderless={false}
      style={{ marginHorizontal: -space.lg, paddingHorizontal: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: space.md, minHeight: 52,
        borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0, borderBottomColor: t.colors.outlineVariant }}>
        {left}
        <View style={{ flex: 1 }}>
          <Text variant="bodyLarge" style={{ color: t.colors.onSurface, fontWeight: '500' }} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {right}
        {onPress && !right ? <Icon name="chevron-right" size={20} color={t.colors.outline} /> : null}
      </View>
    </TouchableRipple>
  );
}

/** Extended FAB in solid brand blue with a soft glow — the one primary action of a screen. */
export function Fab({ style, ...rest }: ComponentProps<typeof AnimatedFAB>) {
  const t = useAppTheme();
  return <AnimatedFAB color={t.colors.onPrimary} rippleColor="rgba(255,255,255,0.2)" {...rest}
    style={[{ backgroundColor: t.colors.primary }, t.dark ? null : glow(t.colors.primary), style]} />;
}

// ---------------------------------------------------------------- states
export function Skeleton({ height = 16, width = '100%', style, radiusPx = 8 }: { height?: number; width?: number | `${number}%`; style?: ViewStyle; radiusPx?: number }) {
  const t = useAppTheme();
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.45, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width, borderRadius: radiusPx, backgroundColor: t.colors.surfaceVariant, opacity: v }, style]} />;
}

/** Placeholder cards shaped like real content (badge + two lines), so the page doesn't jump when data lands. */
export function LoadingCards({ count = 3 }: { count?: number }) {
  const t = useAppTheme();
  return (
    <View style={{ gap: space.md }} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[{ borderRadius: radius.xl, backgroundColor: t.colors.elevation.level1, padding: space.lg, gap: space.md }, cardEdge(t)]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Skeleton height={40} width={40} radiusPx={13} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton height={13} width={i % 2 ? '45%' : '60%'} />
              <Skeleton height={10} width={i % 2 ? '70%' : '40%'} />
            </View>
          </View>
          {i === 0 ? <Skeleton height={54} radiusPx={radius.md} /> : null}
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ icon = 'inbox-outline', title, text, action, onAction }: {
  icon?: IconName; title: string; text?: string; action?: string; onAction?: () => void;
}) {
  const t = useAppTheme();
  return (
    <FadeIn style={{ alignItems: 'center', paddingVertical: space.xl, paddingHorizontal: space.lg }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: t.dark ? 'rgba(255,185,81,0.10)' : 'rgba(245,166,35,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: space.md }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: t.colors.secondaryContainer, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={30} color={t.colors.onSecondaryContainer} />
        </View>
      </View>
      <Text variant="titleMedium" style={{ fontWeight: '700', textAlign: 'center', color: t.colors.onSurface }}>{title}</Text>
      {text ? <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }}>{text}</Text> : null}
      {action ? <Button mode="contained-tonal" onPress={onAction} style={{ marginTop: space.md }}>{action}</Button> : null}
    </FadeIn>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useAppTheme();
  return (
    <Panel tone="danger" icon="wifi-off" title="Something went wrong" subtitle={message}>
      {onRetry ? <Button mode="contained" buttonColor={t.custom.danger} textColor={t.dark ? t.custom.dangerContainer : '#fff'} icon="refresh" onPress={onRetry}>Try again</Button> : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- sheets
/** Material-style bottom sheet. */
export function Sheet({ visible, onDismiss, title, children }: { visible: boolean; onDismiss: () => void; title?: string; children: ReactNode }) {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: t.dark ? 'rgba(0,0,0,0.6)' : 'rgba(10,22,44,0.45)' }} onPress={onDismiss} accessibilityLabel="Close" />
        <View style={{ backgroundColor: t.colors.elevation.level1, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
          paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.lg, maxHeight: '88%',
          borderTopWidth: 1, borderColor: t.custom.cardBorder }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: t.colors.outlineVariant, marginTop: 10, marginBottom: space.md }} />
          {title ? <Text variant="titleLarge" style={{ fontWeight: '700', marginBottom: space.md, color: t.colors.onSurface }}>{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Wrap a Paper <Dialog> in this instead of <Portal>. A Portal draws under native modals, so a dialog
 *  opened from inside a <Sheet> was invisible on phones (e.g. "Archive entry" seemed to do nothing). */
export function TopLayer({ visible, onDismiss, children }: { visible: boolean; onDismiss: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      {children}
    </Modal>
  );
}

export const styles = StyleSheet.create({
  circle: { position: 'absolute', borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
