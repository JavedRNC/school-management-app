import { Linking, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { Vehicle } from '@/lib/types';

import { Icon, IconName } from '../ui';

export const KIND_ICON: Record<string, IconName> = { bus: 'bus-school', van: 'van-passenger', auto: 'rickshaw', other: 'car' };

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDay(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Days until a date (negative = past). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + 'T00:00:00').getTime() - t.getTime()) / 86400000);
}

/** Yellow Indian number-plate style chip. */
export function PlateChip({ number, kind, large }: { number: string; kind?: string | null; large?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: '#FFD54A',
      borderRadius: 6, borderWidth: 2, borderColor: '#1B1B1B', paddingHorizontal: large ? 12 : 8, paddingVertical: large ? 5 : 2 }}>
      {kind ? <Icon name={KIND_ICON[kind] ?? 'bus'} size={large ? 18 : 14} color="#1B1B1B" /> : null}
      <Text style={{ color: '#1B1B1B', fontWeight: '900', letterSpacing: 1, fontSize: large ? 16 : 12 }}>{number}</Text>
    </View>
  );
}

export function CallButton({ phone }: { phone?: string | null }) {
  const t = useAppTheme();
  if (!phone) return null;
  return (
    <IconButton icon="phone" size={18} mode="contained-tonal" containerColor={t.custom.successContainer} iconColor={t.custom.success}
      style={{ margin: 0 }} onPress={() => { haptic.tap(); Linking.openURL(`tel:${phone}`).catch(() => {}); }} />
  );
}

export function PersonLine({ icon, label, name, phone }: { icon: IconName; label: string; name?: string | null; phone?: string | null }) {
  const t = useAppTheme();
  if (!name && !phone) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 }}>
      <Icon name={icon} size={18} color={t.colors.onSurfaceVariant} />
      <View style={{ flex: 1 }}>
        <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{label}</Text>
        <Text variant="bodyMedium" style={{ color: t.colors.onSurface, fontWeight: '600' }}>{name || '—'}{phone ? `  ·  ${phone}` : ''}</Text>
      </View>
      <CallButton phone={phone} />
    </View>
  );
}

/** Vertical stop timeline. */
export function StopTimeline({ stops, compact }: {
  stops: { name: string; pickup_time: string; drop_time: string; mine?: boolean; riders?: number }[]; compact?: boolean;
}) {
  const t = useAppTheme();
  if (!stops.length) return <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>No stops yet</Text>;
  return (
    <View>
      {stops.map((s, i) => {
        const last = i === stops.length - 1;
        const dot = s.mine ? t.custom.amber : t.colors.primary;
        return (
          <View key={`${s.name}-${i}`} style={{ flexDirection: 'row', minHeight: compact ? 30 : 40 }}>
            <View style={{ width: 22, alignItems: 'center' }}>
              <View style={{ width: s.mine ? 14 : 10, height: s.mine ? 14 : 10, borderRadius: 7, backgroundColor: dot, marginTop: 4,
                borderWidth: s.mine ? 3 : 0, borderColor: t.custom.warningContainer }} />
              {!last ? <View style={{ flex: 1, width: 2, backgroundColor: t.colors.outlineVariant, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', paddingBottom: compact ? 4 : 8, paddingLeft: 4 }}>
              <Text variant={s.mine ? 'titleSmall' : 'bodyMedium'} style={{ flex: 1, color: t.colors.onSurface, fontWeight: s.mine ? '800' : '400' }} numberOfLines={1}>
                {s.name}{s.mine ? '  · your stop' : ''}
              </Text>
              {s.riders !== undefined ? (
                <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginRight: space.sm }}>{s.riders} 👤</Text>
              ) : null}
              <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>
                {s.pickup_time || '--:--'}{s.drop_time ? ` / ${s.drop_time}` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Seats used vs capacity bar. */
export function SeatsBar({ used, capacity }: { used: number; capacity: number | null }) {
  const t = useAppTheme();
  if (!capacity) {
    return <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>{used} riders · no vehicle</Text>;
  }
  const pct = Math.min(1, used / capacity);
  const over = used > capacity;
  const color = over ? t.custom.danger : pct > 0.85 ? t.custom.warning : t.custom.success;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>Seats</Text>
        <Text variant="labelMedium" style={{ color, fontWeight: '800' }}>{used} / {capacity}{over ? ' · over capacity' : ''}</Text>
      </View>
      <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: t.custom.chartTrack, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 8, borderRadius: radius.pill, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function expiryTone(v: Pick<Vehicle, 'insurance_until'>['insurance_until']): 'danger' | 'warning' | 'success' | 'neutral' {
  const d = daysUntil(v);
  if (d === null) return 'neutral';
  if (d < 0) return 'danger';
  if (d <= 30) return 'warning';
  return 'success';
}
