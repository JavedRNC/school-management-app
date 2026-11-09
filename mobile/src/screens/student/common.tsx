import { router } from 'expo-router';
import { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { EmptyState, FadeIn, Icon, LoadingCards, Panel, PressScale, ToneChip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useChild } from '@/lib/child';
import { space, useAppTheme } from '@/lib/theme';
import type { Holiday } from '@/lib/types';

/** '/student' or '/parent' — tab root for router.push from shared screens. */
export function useBase(): '/student' | '/parent' {
  const { user } = useAuth();
  return user?.role === 'parent' ? '/parent' : '/student';
}

/** True while a parent's children are loading or none selected. Renders the reason. */
export function useChildGate(): { blocked: boolean; gate: ReactNode } {
  const { user } = useAuth();
  const { child, loading, error, children, reload } = useChild();
  if (user?.role !== 'parent') return { blocked: false, gate: null };
  if (child) return { blocked: false, gate: null };
  if (loading) return { blocked: true, gate: <View style={{ marginTop: space.lg }}><LoadingCards /></View> };
  if (error) return { blocked: true, gate: <EmptyState icon="wifi-off" title="Couldn't load your children" text={error} action="Try again" onAction={reload} /> };
  if (!children.length) {
    return { blocked: true, gate: <EmptyState icon="account-child-outline" title="No children linked yet" text="Ask your school to link your child to this account." /> };
  }
  return { blocked: true, gate: null };
}

/** Child picker placed under the hero on parent screens. */
export function ChildBar() {
  const { user } = useAuth();
  if (user?.role !== 'parent') return null;
  return <View style={{ marginBottom: space.md }}><ChildSwitcher /></View>;
}

const KIND_TONE = { national: 'primary', festival: 'warning', vacation: 'success', exam: 'danger', event: 'primary', holiday: 'neutral', other: 'neutral' } as const;

function fmtRange(h: Holiday) {
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const a = new Date(h.start_date + 'T00:00:00');
  const b = new Date(h.end_date + 'T00:00:00');
  const wd = a.toLocaleDateString('en-IN', { weekday: 'short' });
  return h.start_date === h.end_date ? `${wd}, ${a.toLocaleDateString('en-IN', o)}` : `${a.toLocaleDateString('en-IN', o)} – ${b.toLocaleDateString('en-IN', o)}`;
}

function daysAway(iso: string) {
  const d = new Date(iso + 'T00:00:00').getTime();
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const n = Math.round((d - t0) / 86400000);
  return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

/** "Next holiday / upcoming events" card → opens the school calendar. */
export function UpcomingCard({ items }: { items: Holiday[] }) {
  const t = useAppTheme();
  const open = () => router.push('/more/calendar' as never);
  if (!items.length) return null;
  return (
    <FadeIn index={2}>
      <PressScale onPress={open}>
        <Panel title="Coming up" subtitle="Holidays & events · tap for full calendar" icon="calendar-star" style={{ marginTop: space.lg }}
          right={<Icon name="chevron-right" size={22} color={t.colors.outline} />}>
          {items.slice(0, 3).map((h, i) => (
            <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8,
              borderTopWidth: i ? 0.5 : 0, borderTopColor: t.colors.outlineVariant }}>
              <View style={{ width: 46, alignItems: 'center', backgroundColor: h.is_off ? t.custom.successContainer : t.colors.primaryContainer,
                borderRadius: 12, paddingVertical: 4 }}>
                <Text variant="titleMedium" style={{ fontWeight: '800', color: h.is_off ? t.custom.onSuccessContainer : t.colors.onPrimaryContainer }}>
                  {new Date(h.start_date + 'T00:00:00').getDate()}
                </Text>
                <Text variant="labelSmall" style={{ color: h.is_off ? t.custom.onSuccessContainer : t.colors.onPrimaryContainer }}>
                  {new Date(h.start_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyLarge" style={{ fontWeight: '700', color: t.colors.onSurface }} numberOfLines={1}>{h.name}</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{fmtRange(h)} · {daysAway(h.start_date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <ToneChip text={h.is_off ? 'School closed' : 'Event'} tone={h.is_off ? 'success' : 'primary'} icon={h.is_off ? 'beach' : 'party-popper'} />
                <ToneChip text={h.kind} tone={KIND_TONE[h.kind] ?? 'neutral'} />
              </View>
            </View>
          ))}
        </Panel>
      </PressScale>
    </FadeIn>
  );
}

export function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
