import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ComponentProps, createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  View, ViewStyle,
} from 'react-native';
import { Avatar, Button, Card, Chip, IconButton, Text, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/feedback';
import { initials, radius, space, Tone, toneColors, useAppTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export const Icon = MaterialCommunityIcons;

// ---------------------------------------------------------------- motion
/** Fade + slide up on mount. `index` staggers siblings. */
export function FadeIn({ children, index = 0, style }: { children: ReactNode; index?: number; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 380, delay: Math.min(index, 10) * 55, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, index]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Number that counts up to `value`. */
export function CountUp({ value, decimals = 0, suffix = '', style, variant = 'headlineMedium' }: {
  value: number; decimals?: number; suffix?: string; style?: object;
  variant?: ComponentProps<typeof Text>['variant'];
}) {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = v.addListener(({ value: x }) => setShown(x));
    Animated.timing(v, { toValue: value, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [v, value]);
  return <Text variant={variant} style={[{ fontWeight: '800' }, style]}>{shown.toFixed(decimals)}{suffix}</Text>;
}

/** Scale-down press feedback wrapper. */
export function PressScale({ children, onPress, style, disabled }: { children: ReactNode; onPress?: () => void; style?: ViewStyle; disabled?: boolean }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (x: number) => Animated.spring(s, { toValue: x, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable disabled={disabled || !onPress} onPressIn={() => to(0.96)} onPressOut={() => to(1)}
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.colors.primary]} tintColor={t.custom.amber} progressViewOffset={insets.top} />
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
        <View style={[styles.circle, { width: 220, height: 220, right: -60, top: -70, backgroundColor: 'rgba(255,255,255,0.07)' }]} />
        <View style={[styles.circle, { width: 120, height: 120, right: 70, top: 40, backgroundColor: 'rgba(245,166,35,0.16)' }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {stacked ? (
            <IconButton icon="arrow-left" iconColor="#fff" size={24} style={{ marginLeft: -space.sm, marginRight: space.xs }}
              onPress={() => { haptic.tap(); if (router.canGoBack()) router.back(); else router.replace('/'); }} />
          ) : null}
          <View style={{ flex: 1 }}>
            {eyebrow ? <Text variant="labelLarge" style={{ color: 'rgba(255,255,255,0.75)' }}>{eyebrow}</Text> : null}
            <Text variant={compact ? 'headlineSmall' : 'headlineMedium'} style={{ color: '#fff', fontWeight: '800' }}>{title}</Text>
            {subtitle ? <Text variant="bodyMedium" style={{ color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      </LinearGradient>
      {children ? <View style={{ marginTop: -40, paddingHorizontal: space.lg }}>{children}</View> : null}
    </View>
  );
}

export function UserAvatar({ name, size = 44, light }: { name: string; size?: number; light?: boolean }) {
  const t = useAppTheme();
  return (
    <Avatar.Text size={size} label={initials(name)}
      style={{ backgroundColor: light ? 'rgba(255,255,255,0.18)' : t.colors.primaryContainer }}
      color={light ? '#fff' : t.colors.onPrimaryContainer} labelStyle={{ fontWeight: '700', fontSize: size * 0.38 }} />
  );
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: ViewStyle }) {
  const t = useAppTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm }, style]}>
      <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onBackground }}>{title}</Text>
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
  return (
    <Card mode="elevated" elevation={1} onPress={onPress}
      style={[{ marginBottom: space.md, borderRadius: radius.xl, backgroundColor: tc ? tc.bg : t.colors.elevation.level1 }, style]}>
      <View style={{ padding: space.lg }}>
        {title ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: children ? space.md : 0, gap: space.md }}>
            {icon ? <IconBadge icon={icon} tone={tone ?? 'primary'} /> : null}
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: '700', color: tc?.on ?? t.colors.onSurface }}>{title}</Text>
              {subtitle ? <Text variant="bodySmall" style={{ color: tc?.on ?? t.colors.onSurfaceVariant, opacity: 0.85 }}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </View>
    </Card>
  );
}

export function IconBadge({ icon, tone = 'primary', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const t = useAppTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: tone === 'primary' ? t.colors.primaryContainer : c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.55} color={tone === 'primary' ? t.colors.primary : c.fg} />
    </View>
  );
}

/** Tappable stat tile with count-up. */
export function StatTile({ icon, label, value, suffix, decimals, tone = 'primary', onPress, hint }: {
  icon: IconName; label: string; value: number | null; suffix?: string; decimals?: number; tone?: Tone; onPress?: () => void; hint?: string;
}) {
  const t = useAppTheme();
  return (
    <PressScale onPress={onPress} style={{ flex: 1 }}>
      <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: space.md, minHeight: 112,
        shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
        <IconBadge icon={icon} tone={tone} size={34} />
        {value == null ? <Text variant="headlineMedium" style={{ fontWeight: '800', marginTop: space.sm }}>—</Text>
          : <CountUp value={value} suffix={suffix} decimals={decimals} style={{ marginTop: space.sm, color: t.colors.onSurface }} />}
        <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }} numberOfLines={1}>{label}</Text>
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
      paddingHorizontal: compact ? 10 : 12, paddingVertical: compact ? 3 : 6, alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={13} color={c.fg} /> : null}
      <Text variant="labelMedium" style={{ color: c.fg, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** Horizontal, scrollable single-select filter chips. */
export function FilterChips<T extends string | number>({ options, value, onChange, label, style }: {
  options: { label: string; value: T; icon?: IconName }[]; value: T | null | undefined; onChange: (v: T) => void; label?: string; style?: ViewStyle;
}) {
  const t = useAppTheme();
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      {label ? <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }}>
        {options.map((o) => (
          <Chip key={String(o.value)} selected={o.value === value} showSelectedCheck={false} icon={o.icon}
            mode={o.value === value ? 'flat' : 'outlined'}
            style={o.value === value ? { backgroundColor: t.colors.secondaryContainer } : { backgroundColor: 'transparent' }}
            textStyle={{ fontWeight: o.value === value ? '700' : '500' }}
            onPress={() => { haptic.tap(); onChange(o.value); }}>
            {o.label}
          </Chip>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md,
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

// ---------------------------------------------------------------- states
export function Skeleton({ height = 16, width = '100%', style, radiusPx = 8 }: { height?: number; width?: number | `${number}%`; style?: ViewStyle; radiusPx?: number }) {
  const t = useAppTheme();
  const v = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width, borderRadius: radiusPx, backgroundColor: t.colors.surfaceVariant, opacity: v }, style]} />;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: space.md }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ gap: space.sm }}>
          <Skeleton height={i === 0 ? 120 : 84} radiusPx={radius.xl} />
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
    <FadeIn style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.colors.secondaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }}>
        <Icon name={icon} size={36} color={t.colors.onSecondaryContainer} />
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
      {onRetry ? <Button mode="contained" buttonColor={t.custom.danger} textColor={t.colors.onPrimary} icon="refresh" onPress={onRetry}>Try again</Button> : null}
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
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' }} onPress={onDismiss} />
        <View style={{ backgroundColor: t.colors.elevation.level1, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
          paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.lg, maxHeight: '88%' }}>
          <View style={{ alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: t.colors.outline, marginVertical: space.md, opacity: 0.6 }} />
          {title ? <Text variant="titleLarge" style={{ fontWeight: '700', marginBottom: space.md, color: t.colors.onSurface }}>{title}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  circle: { position: 'absolute', borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
