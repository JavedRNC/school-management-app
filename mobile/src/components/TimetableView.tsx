import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors, DAYS, radius, space } from '@/lib/theme';
import type { Slot } from '@/lib/types';

import { Chips, Empty, styles } from './ui';

/** Day picker + list of periods. `show` decides the secondary line. */
export function TimetableView({ slots, show, onSlotPress, periods = 5 }: {
  slots: Slot[]; show: 'teacher' | 'class' | 'both'; onSlotPress?: (day: number, period: number, slot?: Slot) => void;
  periods?: number;
}) {
  const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0
  const [day, setDay] = useState(todayIdx > 5 ? 0 : todayIdx);
  const byPeriod = new Map(slots.filter((s) => s.day === day).map((s) => [s.period, s]));
  const maxP = Math.max(periods, ...slots.map((s) => s.period));
  const rows = Array.from({ length: maxP }, (_, i) => i + 1);
  if (!slots.length && !onSlotPress) return <Empty text="No timetable yet" />;
  return (
    <View>
      <Chips options={DAYS.map((d, i) => ({ label: i === todayIdx ? `${d} •` : d, value: i }))} value={day} onChange={setDay} />
      {rows.map((p) => {
        const s = byPeriod.get(p);
        if (!s && !onSlotPress) return null;
        const sub = s ? (show === 'teacher' ? s.teacher_name : show === 'class' ? `Class ${s.class_name}` : `${s.class_name} · ${s.teacher_name}`) : 'Free — tap to set';
        return (
          <Pressable key={p} disabled={!onSlotPress} onPress={() => onSlotPress?.(day, p, s)}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm, opacity: pressed ? 0.7 : 1,
            }]}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: s ? colors.primarySoft : colors.bg,
              alignItems: 'center', justifyContent: 'center', marginRight: space.md }}>
              <Text style={{ fontWeight: '800', color: colors.primary }}>P{p}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.body, { fontWeight: '600', color: s ? colors.text : colors.muted }]}>{s ? s.subject_name : '—'}</Text>
              <Text style={[styles.muted, { fontSize: 13 }]}>{sub}</Text>
            </View>
          </Pressable>
        );
      })}
      {!byPeriod.size && !onSlotPress ? <Empty text="No classes this day" /> : null}
    </View>
  );
}
