import { useState } from 'react';
import { View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { DAYS, radius, space, useAppTheme } from '@/lib/theme';
import type { Slot } from '@/lib/types';

import { EmptyState, FadeIn, Icon } from './ui';

// Approximate bell schedule for display
const TIMES = ['8:00', '8:45', '9:30', '10:30', '11:15', '12:00', '1:30', '2:15', '3:00', '3:45'];
const SUBJECT_ICONS: [string, string][] = [
  ['social', 'earth'], ['english', 'alphabetical-variant'], ['hindi', 'abjad-hebrew'], ['math', 'calculator-variant'],
  ['computer', 'laptop'], ['physics', 'atom'], ['chemistry', 'test-tube'], ['biology', 'leaf'], ['science', 'flask-outline'],
  ['history', 'castle'], ['geography', 'map-outline'], ['art', 'palette-outline'], ['music', 'music-note'], ['sport', 'basketball'],
];
export function subjectIcon(name: string) {
  const k = name.toLowerCase();
  return (SUBJECT_ICONS.find(([s]) => k.includes(s))?.[1] ?? 'book-outline') as 'book-outline';
}

const TONES = ['primaryContainer', 'secondaryContainer', 'tertiaryContainer'] as const;

/** Day switcher + period cards. `show` decides the second line. */
/** Order working days so a Sunday-start week (Sun–Thu) shows Sunday first. */
function orderWeek(days: number[]): number[] {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.includes(6) && !set.includes(5) && set.includes(0)) return [6, ...set.filter((d) => d !== 6)];
  return set;
}

export function TimetableView({ slots, show, onSlotPress, periods = 5 }: {
  slots: Slot[]; show: 'teacher' | 'class'; onSlotPress?: (day: number, period: number, slot?: Slot) => void; periods?: number;
}) {
  const t = useAppTheme();
  const { school } = useAuth();
  const todayIdx = (new Date().getDay() + 6) % 7;
  // School's working days in week order starting from its first day (e.g. Sun–Thu → [6,0,1,2,3])
  const working = orderWeek(school?.working_days?.length ? school.working_days : [0, 1, 2, 3, 4, 5]);
  const [day, setDay] = useState(working.includes(todayIdx) ? todayIdx : working[0]);
  const byPeriod = new Map(slots.filter((s) => s.day === day).map((s) => [s.period, s]));
  const maxP = Math.max(periods, ...slots.map((s) => s.period));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h < 7 ? h + 12 : h) * 60 + m; };

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: space.md }}>
        {working.map((i) => {
          const d = DAYS[i];
          const on = i === day;
          const count = slots.filter((s) => s.day === i).length;
          return (
            <TouchableRipple key={d} borderless onPress={() => { haptic.tap(); setDay(i); }}
              style={{ flex: 1, borderRadius: radius.lg, backgroundColor: on ? t.colors.primary : t.colors.elevation.level2 }}>
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text variant="labelLarge" style={{ fontWeight: '700', color: on ? t.colors.onPrimary : t.colors.onSurface }}>{d}</Text>
                <View style={{ flexDirection: 'row', gap: 2, marginTop: 4, height: 5 }}>
                  {i === todayIdx ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.custom.amber }} />
                    : <Text style={{ fontSize: 9, lineHeight: 10, color: on ? t.colors.onPrimary : t.colors.outline }}>{count || ''}</Text>}
                </View>
              </View>
            </TouchableRipple>
          );
        })}
      </View>
      {Array.from({ length: maxP }, (_, i) => i + 1).map((p, idx) => {
        const s = byPeriod.get(p);
        if (!s && !onSlotPress) return null;
        const live = day === todayIdx && !!TIMES[p - 1] && nowMin >= toMin(TIMES[p - 1]) && nowMin < toMin(TIMES[p - 1]) + 45;
        const bg = s ? t.colors[TONES[s.subject_id % 3]] : 'transparent';
        const sub = s ? (show === 'teacher' ? s.teacher_name : `Class ${s.class_name}`) : 'Free period · tap to assign';
        return (
          <FadeIn key={`${day}-${p}`} index={idx}>
            <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: space.sm }}>
              <View style={{ width: 52, alignItems: 'center', paddingTop: space.md }}>
                <Text variant="labelLarge" style={{ fontWeight: '800', color: live ? t.colors.primary : t.colors.onSurface }}>P{p}</Text>
                <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{TIMES[p - 1] ?? ''}</Text>
              </View>
              <TouchableRipple disabled={!onSlotPress} onPress={() => { haptic.tap(); onSlotPress?.(day, p, s); }}
                borderless style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden' }}>
                <View style={{ backgroundColor: bg, borderRadius: radius.lg, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md,
                  borderWidth: s ? (live ? 2 : 0) : 1, borderColor: live ? t.colors.primary : t.colors.outlineVariant, borderStyle: s ? 'solid' : 'dashed' }}>
                  <Icon name={s ? subjectIcon(s.subject_name) : 'plus-circle-outline'} size={26} color={s ? t.colors.onSurface : t.colors.outline} />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '700', color: s ? t.colors.onSurface : t.colors.outline }}>{s ? s.subject_name : 'Free'}</Text>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{sub}</Text>
                  </View>
                  {live ? (
                    <View style={{ backgroundColor: t.colors.primary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text variant="labelSmall" style={{ color: t.colors.onPrimary, fontWeight: '800' }}>NOW</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableRipple>
            </View>
          </FadeIn>
        );
      })}
      {!byPeriod.size && !onSlotPress ? <EmptyState icon="beach" title="No classes this day" text="Enjoy the break!" /> : null}
    </View>
  );
}
