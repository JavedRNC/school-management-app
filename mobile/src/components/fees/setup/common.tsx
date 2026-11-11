import { ReactNode, useEffect, useRef } from 'react';
import { Animated, View, ViewStyle } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { monthLabel, shiftMonth } from '@/lib/fees';
import { fieldOutline, radius, space, useAppTheme } from '@/lib/theme';

export const UPI_RE = /^[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,64}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a rupee input ('1,500' → 1500). NaN when empty/invalid. */
export function parseAmount(s: string): number {
  const v = Number(s.replace(/[,\s₹]/g, ''));
  return s.trim() === '' || !Number.isFinite(v) ? NaN : v;
}

export function amountText(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '' : String(n);
}

export function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Academic-year label for a date: Apr–Mar ('2026-27'). */
export function academicYear(d = new Date()): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}

/** ₹ amount input with a rupee affix. */
export function MoneyInput({ label, value, onChange, editable = true, style, dense, error }: {
  label: string; value: string; onChange: (s: string) => void; editable?: boolean; style?: ViewStyle; dense?: boolean; error?: boolean;
}) {
  return (
    <TextInput mode="outlined" outlineStyle={fieldOutline} label={label} value={value} onChangeText={(s) => onChange(s.replace(/[^\d.]/g, ''))} editable={editable}
      keyboardType="decimal-pad" left={<TextInput.Affix text="₹" />} dense={dense} error={error} style={style} />
  );
}

/** Rounded progress bar. */
export function Bar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const t = useAppTheme();
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: t.custom.chartTrack, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: radius.pill, backgroundColor: color ?? t.colors.primary }} />
    </View>
  );
}

/** ‹ Nov 2026 › month stepper. */
export function MonthStepper({ value, onChange, min, max }: { value: string; onChange: (p: string) => void; min?: string; max?: string }) {
  const t = useAppTheme();
  const prev = shiftMonth(value, -1);
  const next = shiftMonth(value, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.secondaryContainer, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <IconButton icon="chevron-left" size={20} disabled={!!min && prev < min} onPress={() => { haptic.tap(); onChange(prev); }} />
      <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSecondaryContainer, minWidth: 92, textAlign: 'center' }}>{monthLabel(value)}</Text>
      <IconButton icon="chevron-right" size={20} disabled={!!max && next > max} onPress={() => { haptic.tap(); onChange(next); }} />
    </View>
  );
}

/** Wraps content with a soft coloured glow that pulses when `trigger` changes. */
export function Glow({ trigger, color, children, style }: { trigger: unknown; color?: string; children: ReactNode; style?: ViewStyle }) {
  const t = useAppTheme();
  const v = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    v.setValue(1);
    Animated.timing(v, { toValue: 0, duration: 1600, useNativeDriver: false }).start();
  }, [trigger, v]);
  const c = color ?? t.custom.success;
  return (
    <Animated.View style={[{ borderRadius: radius.xl, shadowColor: c, shadowOffset: { width: 0, height: 0 },
      shadowOpacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }), shadowRadius: 18,
      borderWidth: 2, borderColor: v.interpolate({ inputRange: [0, 1], outputRange: ['transparent', c] }) }, style]}>
      {children}
    </Animated.View>
  );
}

/** Small key/value line. */
export function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  const t = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: space.md }}>
      <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>{k}</Text>
      <Text variant="bodyMedium" style={{ color: t.colors.onSurface, fontWeight: strong ? '800' : '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}
