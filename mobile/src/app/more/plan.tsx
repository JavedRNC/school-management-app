import { View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';

import { StatusBanner } from '@/components/StatusBanner';
import { EmptyState, FadeIn, Hero, Icon, LoadingCards, Panel, Screen, StatTile, ToneChip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { space, Tone, useAppTheme } from '@/lib/theme';
import type { SchoolStatus } from '@/lib/types';

const STATUS: Record<SchoolStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' }, free: { label: 'Sponsored (free)', tone: 'success' },
  trial: { label: 'Trial', tone: 'primary' }, grace: { label: 'Renewal due', tone: 'warning' },
  expired: { label: 'Expired — read-only', tone: 'danger' }, suspended: { label: 'Suspended', tone: 'danger' },
};

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmt = (iso: string | null) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Subscription plan, usage and modules (F26). */
export default function PlanScreen() {
  const t = useAppTheme();
  const { school } = useAuth();
  if (!school) return <Screen header={<Hero title="Plan & usage" compact />}><LoadingCards /></Screen>;
  const sub = school.subscription;
  if (!sub) return <Screen header={<Hero title="Plan & usage" compact />}><EmptyState icon="lock-outline" title="Only the principal can see plan details" /></Screen>;
  const st = STATUS[sub.status] ?? STATUS.active;
  const est = sub.estimate;
  const enabled = new Set(sub.modules);
  const names = school.module_names ?? {};

  const dates: [string, string | null][] = [
    ['Trial until', sub.trial_until], ['Paid until', sub.valid_until], ...(sub.is_free ? [['Free until', sub.free_until ?? null] as [string, string | null]] : []),
  ];

  return (
    <Screen header={
      <Hero title="Plan & usage" subtitle={`${sub.plan ?? 'Custom'} plan${sub.custom ? ' · custom modules' : ''}`} compact>
        <FadeIn>
          <Panel style={{ marginBottom: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Estimated this month</Text>
                <Text variant="headlineMedium" style={{ fontWeight: '800', color: t.colors.onSurface }}>{est.free ? 'Free' : inr(est.amount)}</Text>
              </View>
              <ToneChip text={st.label} tone={st.tone} compact={false} />
            </View>
            {!est.free ? (
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
                {est.students} students × {inr(est.price_per_student)}{est.min_monthly ? ` (minimum ${inr(est.min_monthly)})` : ''}
                {est.discount_pct ? ` · ${est.discount_pct}% discount` : ''} · billed {sub.billing_cycle}
              </Text>
            ) : null}
          </Panel>
        </FadeIn>
      </Hero>
    }>
      <View style={{ height: space.lg }} />
      <StatusBanner />
      <FadeIn index={1}>
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          <StatTile icon="account-school-outline" label="Active students" value={est.students} hint={sub.max_students ? `of ${sub.max_students} allowed` : 'No limit'} />
          <StatTile icon="puzzle-outline" label="Modules on" value={sub.modules.length} tone="success" hint={`of ${Object.keys(names).length}`} />
        </View>
      </FadeIn>
      {sub.max_students ? (
        <FadeIn index={2}>
          <Panel title="Student limit" subtitle={`${est.students} of ${sub.max_students}`} icon="account-multiple-check-outline">
            <ProgressBar progress={Math.min(1, est.students / sub.max_students)} color={est.students >= sub.max_students ? t.custom.danger : t.colors.primary}
              style={{ height: 8, borderRadius: 4 }} />
          </Panel>
        </FadeIn>
      ) : null}
      <FadeIn index={3}>
        <Panel title="Dates" icon="calendar-clock">
          {dates.map(([label, v]) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>{label}</Text>
              <Text variant="bodyMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>{fmt(v)}</Text>
            </View>
          ))}
        </Panel>
      </FadeIn>
      <FadeIn index={4}>
        <Panel title="Modules" subtitle="Features included in your plan" icon="puzzle-outline">
          {Object.entries(names).map(([key, label]) => {
            const on = enabled.has(key);
            return (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 }}>
                <Icon name={on ? 'check-circle' : 'lock-outline'} size={20} color={on ? t.custom.success : t.colors.outline} />
                <Text variant="bodyMedium" style={{ flex: 1, color: on ? t.colors.onSurface : t.colors.onSurfaceVariant }}>{label}</Text>
              </View>
            );
          })}
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>To change your plan or add modules, contact support.</Text>
        </Panel>
      </FadeIn>
    </Screen>
  );
}
