import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

import { CheckInCard } from '@/components/CheckInCard';
import { ErrorState, LoadingCards, Panel, StatTile } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { MyStaffAttendance, StaffDayStatus } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { fmtTime, monthKey, monthLabel, shiftMonth, STATUS_LABEL, statusColors } from './util';

const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function MonthSwitcher({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  const t = useAppTheme();
  const atMax = !!max && month >= max;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
      <IconButton icon="chevron-left" onPress={() => { haptic.tap(); onChange(shiftMonth(month, -1)); }} />
      <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.onSurface }}>{monthLabel(month)}</Text>
      <IconButton icon="chevron-right" disabled={atMax} onPress={() => { haptic.tap(); onChange(shiftMonth(month, 1)); }} />
    </View>
  );
}

export function StatusLegend() {
  const t = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md }}>
      {(['present', 'late', 'leave', 'absent'] as StaffDayStatus[]).map((s) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColors(t, s).fg }} />
          <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{STATUS_LABEL[s]}</Text>
        </View>
      ))}
    </View>
  );
}

/** "My attendance" for staff: check-in card, month grid coloured by status, summary tiles. */
export function MyAttendance() {
  const t = useAppTheme();
  const now = monthKey(new Date());
  const [month, setMonth] = useState(now);
  const [sel, setSel] = useState<string | null>(null);
  const { data, error, reload } = useLoad(() => api<MyStaffAttendance>('/staff-attendance/me', { params: { month } }), [month]);

  const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const selDay = sel ? byDate.get(sel) : undefined;

  return (
    <View>
      <CheckInCard onChange={reload} />
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <LoadingCards count={2} /> : (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            <StatTile icon="check-circle-outline" label="Present" value={data.summary.present} tone="success" />
            <StatTile icon="clock-alert-outline" label="Late" value={data.summary.late} tone="warning" />
            <StatTile icon="airplane-takeoff" label="Leave" value={data.summary.leave} tone="primary" />
            <StatTile icon="close-circle-outline" label="Absent" value={data.summary.absent} tone="danger" />
          </View>
          <Panel>
            <MonthSwitcher month={month} onChange={(mm) => { setMonth(mm); setSel(null); }} max={now} />
            <View style={{ flexDirection: 'row' }}>
              {WEEK.map((w) => (
                <Text key={w} variant="labelSmall" style={{ flex: 1, textAlign: 'center', color: t.colors.onSurfaceVariant, marginBottom: 4 }}>{w}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((d, i) => {
                const iso = d ? `${month}-${String(d).padStart(2, '0')}` : '';
                const rec = d ? byDate.get(iso) : undefined;
                const c = rec ? statusColors(t, rec.status) : null;
                const on = sel === iso && !!d;
                return (
                  <View key={i} style={{ width: `${100 / 7}%`, padding: 3 }}>
                    {d ? (
                      <Pressable disabled={!rec} onPress={() => { haptic.tap(); setSel(on ? null : iso); }}
                        style={{ aspectRatio: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: c ? (on ? c.fg : c.bg) : 'transparent', borderWidth: on ? 0 : c ? 0 : 1, borderColor: t.colors.outlineVariant,
                          opacity: rec ? 1 : 0.45 }}>
                        <Text variant="labelLarge" style={{ fontWeight: '700', color: c ? (on ? '#fff' : c.fg) : t.colors.onSurfaceVariant }}>{d}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {selDay ? (
              <Text variant="bodyMedium" style={{ color: t.colors.onSurface, marginTop: space.md }}>
                {new Date(selDay.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — {STATUS_LABEL[selDay.status]}
                {selDay.check_in_at ? ` · ${fmtTime(selDay.check_in_at)}${selDay.check_out_at ? ` – ${fmtTime(selDay.check_out_at)}` : ''}` : ''}
              </Text>
            ) : null}
            <StatusLegend />
            <Text variant="labelSmall" style={{ color: t.colors.outline, marginTop: space.sm }}>Only school days are coloured. Tap a day for times.</Text>
          </Panel>
        </>
      )}
    </View>
  );
}
