import { useState } from 'react';
import { View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { DAYS, radius, space, useAppTheme } from '@/lib/theme';
import type { Slot } from '@/lib/types';

import { currentSlot, periodCount, slotsForDay, toMin as bellMin, useBell } from './BellTimes';
import { EmptyState, FadeIn, Icon } from './ui';

// Fallback display times when the school hasn't set Period timings yet
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
  const { bell } = useBell();
  const byPeriod = new Map(slots.filter((s) => s.day === day).map((s) => [s.period, s]));
  const daySlots = slotsForDay(bell, day);
  const configured = periodCount(bell, day);
  const maxP = configured != null
    ? Math.max(configured, ...slots.filter((s) => s.day === day).map((s) => s.period))
    : Math.max(periods, ...slots.map((s) => s.period));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h < 7 ? h + 12 : h) * 60 + m; };
  const isToday = day === todayIdx;
  const cur = isToday && daySlots ? currentSlot(bell, day, now) : { now: null, next: null };
  const timeOf = (p: number) => daySlots?.find((x) => x.kind === 'period' && x.period === p) ?? null;
  // breaks that come right after period p (shown as slim rows)
  const breaksAfter = (p: number) => {
    if (!daySlots) return [];
    const i = daySlots.findIndex((x) => x.kind === 'period' && x.period === p);
    if (i < 0) return [];
    const out = [];
    for (let j = i + 1; j < daySlots.length && daySlots[j].kind === 'break'; j++) out.push(daySlots[j]);
    return out;
  };
  const breaksBefore = daySlots ? daySlots.slice(0, Math.max(0, daySlots.findIndex((x) => x.kind === 'period'))) : [];
  const BreakRow = ({ label, start, end, live }: { label: string; start: string; end: string; live: boolean }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
      <View style={{ width: 64, alignItems: 'center' }}>
        <Text variant="labelSmall" style={{ color: t.colors.outline }}>{start}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill,
        backgroundColor: live ? t.colors.tertiaryContainer : t.colors.elevation.level1 }}>
        <Icon name={/lunch/i.test(label) ? 'food-outline' : 'coffee-outline'} size={16} color={live ? t.colors.onTertiaryContainer : t.colors.outline} />
        <Text variant="labelMedium" style={{ color: live ? t.colors.onTertiaryContainer : t.colors.onSurfaceVariant, flex: 1 }}>{label}</Text>
        <Text variant="labelSmall" style={{ color: live ? t.colors.onTertiaryContainer : t.colors.outline }}>{start}–{end}{live ? ' · now' : ''}</Text>
      </View>
    </View>
  );

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
      {breaksBefore.map((b, i) => (
        <BreakRow key={`pre-${i}`} label={b.label} start={b.start} end={b.end} live={cur.now === b} />
      ))}
      {Array.from({ length: maxP }, (_, i) => i + 1).map((p, idx) => {
        const s = byPeriod.get(p);
        const tm = timeOf(p);
        const after = breaksAfter(p);
        if (!s && !onSlotPress) {
          return after.length && byPeriod.size ? (
            <View key={`${day}-${p}`}>{after.map((b, i) => <BreakRow key={i} label={b.label} start={b.start} end={b.end} live={cur.now === b} />)}</View>
          ) : null;
        }
        const live = tm
          ? isToday && nowMin >= bellMin(tm.start) && nowMin < bellMin(tm.end)
          : isToday && !daySlots && !!TIMES[p - 1] && nowMin >= toMin(TIMES[p - 1]) && nowMin < toMin(TIMES[p - 1]) + 45;
        const next = !live && !!tm && cur.next === tm;
        const bg = s ? t.colors[TONES[s.subject_id % 3]] : 'transparent';
        const sub = s ? (show === 'teacher' ? s.teacher_name : `Class ${s.class_name}`) : 'Free period · tap to assign';
        return (
          <FadeIn key={`${day}-${p}`} index={idx}>
            <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: space.sm }}>
              <View style={{ width: 64, alignItems: 'center', paddingTop: space.sm }}>
                <Text variant="labelLarge" style={{ fontWeight: '800', color: live ? t.colors.primary : t.colors.onSurface }}>P{p}</Text>
                {tm ? (
                  <>
                    <Text variant="labelSmall" style={{ color: live ? t.colors.primary : t.colors.onSurfaceVariant, fontWeight: live ? '700' : '400' }}>{tm.start}</Text>
                    <Text variant="labelSmall" style={{ color: t.colors.outline, fontSize: 10 }}>{tm.end}</Text>
                  </>
                ) : (
                  <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{daySlots ? '' : TIMES[p - 1] ?? ''}</Text>
                )}
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
                  ) : next ? (
                    <View style={{ backgroundColor: t.colors.secondaryContainer, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text variant="labelSmall" style={{ color: t.colors.onSecondaryContainer, fontWeight: '800' }}>NEXT</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableRipple>
            </View>
            {after.map((b, i) => <BreakRow key={i} label={b.label} start={b.start} end={b.end} live={cur.now === b} />)}
          </FadeIn>
        );
      })}
      {!byPeriod.size && !onSlotPress ? <EmptyState icon="beach" title="No classes this day" text="Enjoy the break!" /> : null}
    </View>
  );
}
