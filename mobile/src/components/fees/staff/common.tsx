import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, View } from 'react-native';
import { Text } from 'react-native-paper';

import { EmptyState, Hero, Icon, Row, Screen, ToneChip } from '@/components/ui';
import { useCan, useModule, useAuth } from '@/lib/auth';
import { fmtDate, inr, inrShort, MODE_ICON, MODE_LABEL, PAY_LABEL, PAY_TONE } from '@/lib/fees';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeePayment, PayMode } from '@/lib/types';

export function isoToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return iso(d);
}
export function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Module + permission gate for staff fee screens. Returns a blocking screen or null. */
export function useFeeGate(title: string) {
  const enabled = useModule('fees');
  const canView = useCan('fees', 'view');
  const canEdit = useCan('fees', 'edit');
  const { school } = useAuth();
  let block: JSX.Element | null = null;
  if (!enabled) {
    block = (
      <Screen header={<Hero title={title} compact />}>
        <EmptyState icon="cash-lock" title="Fees aren't on your plan" text="Ask the platform admin to enable the Fees module." />
      </Screen>
    );
  } else if (!canView) {
    block = (
      <Screen header={<Hero title={title} compact />}>
        <EmptyState icon="lock-outline" title="No access" text="You don't have permission to view fees." />
      </Screen>
    );
  }
  return { block, canEdit: canEdit && school?.can_write !== false };
}

/** Money column chart (₹), tap a bar to see its value. */
export function MoneyBars({ data, height = 170 }: { data: { label: string; value: number; sub?: string }[]; height?: number }) {
  const t = useAppTheme();
  const [w, setW] = useState(300);
  const [sel, setSel] = useState<number | null>(null);
  const grow = useRef(new Animated.Value(0)).current;
  const key = data.map((d) => d.value).join(',');
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow, key]);
  const max = Math.max(1, ...data.map((d) => d.value));
  const h = height - 40;
  const slot = w / Math.max(1, data.length);
  const shown = sel ?? data.length - 1;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm }}>
        <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>{data[shown]?.sub ?? data[shown]?.label}</Text>
        <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.primary }}>{inr(data[shown]?.value ?? 0)}</Text>
      </View>
      <View onLayout={(e: LayoutChangeEvent) => setW(Math.max(100, e.nativeEvent.layout.width))}
        style={{ height, flexDirection: 'row', alignItems: 'flex-end' }}>
        {data.map((d, i) => {
          const full = (d.value / max) * h;
          const on = shown === i;
          const bh = grow.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(d.value > 0 ? 4 : 2, full)] });
          return (
            <Pressable key={i} onPress={() => { haptic.tap(); setSel(sel === i ? null : i); }}
              style={{ width: slot, height, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Animated.View style={{ width: Math.min(22, slot * 0.6), height: bh, borderRadius: 6,
                backgroundColor: d.value === 0 ? t.custom.chartTrack : on ? t.custom.amber : t.colors.primary,
                shadowColor: on ? t.custom.amber : 'transparent', shadowOpacity: 0.6, shadowRadius: 8, elevation: on ? 4 : 0 }} />
              <Text variant="labelSmall" style={{ marginTop: 4, height: 16, color: on ? t.colors.primary : t.colors.onSurfaceVariant, fontWeight: on ? '800' : '400' }}
                numberOfLines={1}>{i % 2 === (data.length - 1) % 2 ? d.label : ''}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Stacked horizontal split of collections by payment mode. */
export function ModeSplit({ byMode }: { byMode: Partial<Record<PayMode, number>> }) {
  const t = useAppTheme();
  const entries = (Object.entries(byMode) as [PayMode, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const colors = [t.colors.primary, t.custom.amber, t.custom.success, t.colors.tertiary, t.custom.danger];
  if (!total) return <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>No collections yet.</Text>;
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: t.custom.chartTrack, marginBottom: space.md }}>
        {entries.map(([m, v], i) => <View key={m} style={{ flex: v / total, backgroundColor: colors[i % colors.length] }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {entries.map(([m, v], i) => (
          <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: '45%' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[i % colors.length] }} />
            <Icon name={MODE_ICON[m]} size={16} color={t.colors.onSurfaceVariant} />
            <Text variant="labelLarge" style={{ color: t.colors.onSurface }}>{MODE_LABEL[m]}</Text>
            <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, fontWeight: '700' }}>
              {inrShort(v)} · {Math.round((v * 100) / total)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One payment line (receipt no, student, mode, amount, status). */
export function PaymentRow({ p, onPress, showStudent = true, divider = true }: { p: FeePayment; onPress?: () => void; showStudent?: boolean; divider?: boolean }) {
  const t = useAppTheme();
  const dim = p.status === 'cancelled' || p.status === 'rejected';
  return (
    <Row divider={divider} onPress={onPress}
      title={showStudent ? `${p.student_name}${p.class_name ? ` · ${p.class_name}` : ''}` : (p.receipt_no ?? 'Awaiting check')}
      subtitle={`${showStudent ? `${p.receipt_no ?? 'UPI claim'} · ` : ''}${MODE_LABEL[p.mode]}${p.reference ? ` ${p.reference}` : ''} · ${fmtDate(p.paid_on)}`}
      left={
        <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
          backgroundColor: dim ? t.colors.surfaceVariant : t.custom.successContainer }}>
          <Icon name={MODE_ICON[p.mode]} size={20} color={dim ? t.colors.outline : t.custom.success} />
        </View>
      }
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text variant="titleSmall" style={{ fontWeight: '800', color: dim ? t.colors.outline : t.colors.onSurface,
            textDecorationLine: p.status === 'cancelled' ? 'line-through' : 'none' }}>{inr(p.amount)}</Text>
          {p.status !== 'confirmed' ? <ToneChip text={PAY_LABEL[p.status]} tone={PAY_TONE[p.status]} /> : null}
        </View>
      } />
  );
}

/** Coloured money figure with caption, for hero panels. */
export function MoneyFigure({ label, value, color, align = 'flex-start' }: { label: string; value: number; color?: string; align?: 'flex-start' | 'flex-end' | 'center' }) {
  const t = useAppTheme();
  return (
    <View style={{ alignItems: align, flex: 1 }}>
      <Text variant="titleMedium" style={{ fontWeight: '800', color: color ?? t.colors.onSurface }} numberOfLines={1}>{inr(value)}</Text>
      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Small numeric badge (e.g. pending claims). */
export function CountBadge({ n }: { n: number }) {
  const t = useAppTheme();
  if (!n) return null;
  return (
    <View style={{ position: 'absolute', top: 8, right: 10, minWidth: 22, height: 22, borderRadius: radius.pill, paddingHorizontal: 6,
      backgroundColor: t.custom.danger, alignItems: 'center', justifyContent: 'center', shadowColor: t.custom.danger, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{n}</Text>
    </View>
  );
}
