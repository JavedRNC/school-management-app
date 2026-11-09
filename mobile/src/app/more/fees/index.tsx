import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { Ring } from '@/components/charts';
import { CountBadge, ModeSplit, MoneyBars, MoneyFigure, PaymentRow, useFeeGate } from '@/components/fees/staff/common';
import {
  CountUp, EmptyState, ErrorState, FadeIn, Hero, Icon, IconName, LoadingCards, Panel, PressScale, Screen, SectionTitle, StatTile,
} from '@/components/ui';
import { api } from '@/lib/api';
import { inr, inrShort } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeeSummary } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function FeesHome() {
  const gate = useFeeGate('Fees');
  if (gate.block) return gate.block;
  return <Dashboard canEdit={gate.canEdit} />;
}

function Dashboard({ canEdit }: { canEdit: boolean }) {
  const t = useAppTheme();
  const s = useLoad(() => api<FeeSummary>('/fees/summary'));
  const d = s.data;
  const pct = d?.collection_pct ?? null;

  const actions: { label: string; icon: IconName; to: string; badge?: number; show: boolean }[] = [
    { label: 'Students & dues', icon: 'account-cash-outline', to: '/more/fees/students', show: true },
    { label: 'Verify UPI', icon: 'qrcode-scan', to: '/more/fees/claims', badge: d?.pending_claims ?? 0, show: true },
    { label: 'Collections', icon: 'chart-box-outline', to: '/more/fees/payments', show: true },
    { label: 'Defaulters', icon: 'alert-circle-outline', to: '/more/fees/students?status=overdue', show: true },
    { label: 'Fee setup', icon: 'tune-variant', to: '/more/fees/setup', show: canEdit },
    { label: 'Extra fees', icon: 'star-four-points-outline', to: '/more/fees/extra', show: canEdit },
  ];
  const tones = [t.colors.primaryContainer, t.colors.secondaryContainer, t.colors.tertiaryContainer];
  const fg = [t.colors.onPrimaryContainer, t.colors.onSecondaryContainer, t.colors.onTertiaryContainer];

  return (
    <Screen onRefresh={s.refresh} refreshing={s.refreshing}
      header={
        <Hero title="Fees" subtitle={d ? `${d.period_label} · ${d.students_with_dues} students with dues` : 'Dues, payments and receipts'} compact>
          {d ? (
            <FadeIn>
              <Panel style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Collected in {d.period_label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text variant="headlineSmall" style={{ fontWeight: '800', color: t.colors.primary }}>₹</Text>
                      <CountUp value={d.collected_month} style={{ color: t.colors.primary }} />
                    </View>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
                      {d.expected_month ? `${inr(d.settled_month)} of ${inr(d.expected_month)} billed this month` : 'Nothing billed this month yet'}
                    </Text>
                  </View>
                  {pct != null ? <Ring value={pct} size={92} label="collected" low={70} /> : null}
                </View>
                <View style={{ flexDirection: 'row', marginTop: space.md, paddingTop: space.md, borderTopWidth: 0.5, borderTopColor: t.colors.outlineVariant }}>
                  <MoneyFigure label="Outstanding" value={d.outstanding} color={t.custom.warning} />
                  <MoneyFigure label="Overdue" value={d.overdue} color={t.custom.danger} align="center" />
                  <MoneyFigure label="Today" value={d.collected_today} color={t.custom.success} align="flex-end" />
                </View>
              </Panel>
            </FadeIn>
          ) : null}
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      {s.error ? <ErrorState message={s.error} onRetry={s.reload} /> : null}
      {!d ? (s.error ? null : <LoadingCards />) : (
        <>
          {!d.configured ? (
            <FadeIn>
              <Panel tone="warning" icon="cash-plus" title="Set up your fees" subtitle="Add the monthly fee, class-wise amounts, transport fees and your UPI ID. Bills are then created every month automatically.">
                {canEdit ? <Button mode="contained" icon="tune-variant" onPress={() => router.push('/more/fees/setup' as never)}>Open fee setup</Button> : null}
              </Panel>
            </FadeIn>
          ) : null}

          <FadeIn index={1}>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
              <StatTile icon="cash-check" label="Collected today" value={d.collected_today} tone="success"
                hint={`${d.receipts_today} receipt${d.receipts_today === 1 ? '' : 's'}`} onPress={() => router.push('/more/fees/payments?range=today' as never)} />
              <StatTile icon="account-alert-outline" label="Defaulters" value={d.defaulters} tone="danger"
                hint={`${inrShort(d.overdue)} overdue`} onPress={() => router.push('/more/fees/students?status=overdue' as never)} />
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <StatTile icon="qrcode-scan" label="UPI to verify" value={d.pending_claims} tone={d.pending_claims ? 'warning' : 'neutral'}
                hint={d.upi_enabled ? 'Parent payments' : 'UPI not set up'} onPress={() => router.push('/more/fees/claims' as never)} />
              <StatTile icon="account-cash-outline" label="Students with dues" value={d.students_with_dues} tone="primary"
                hint={`${inrShort(d.outstanding)} pending`} onPress={() => router.push('/more/fees/students?status=due' as never)} />
            </View>
          </FadeIn>

          <FadeIn index={2}>
            <SectionTitle title="Quick actions" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {actions.filter((a) => a.show).map((a, i) => (
                <PressScale key={a.label} style={{ width: '31.5%' }} onPress={() => router.push(a.to as never)}>
                  <View style={{ backgroundColor: tones[i % 3], borderRadius: radius.xl, paddingVertical: space.lg, paddingHorizontal: space.sm,
                    alignItems: 'center', gap: 6, minHeight: 92 }}>
                    <Icon name={a.icon} size={26} color={fg[i % 3]} />
                    <Text variant="labelLarge" style={{ color: fg[i % 3], fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>{a.label}</Text>
                    <CountBadge n={a.badge ?? 0} />
                  </View>
                </PressScale>
              ))}
            </View>
          </FadeIn>

          <FadeIn index={3}>
            <SectionTitle title="Last 14 days" />
            <Panel>
              <MoneyBars data={d.trend.map((x) => {
                const dt = new Date(x.date + 'T00:00:00');
                return { label: String(dt.getDate()), value: x.amount, sub: dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) };
              })} />
            </Panel>
          </FadeIn>

          <FadeIn index={4}>
            <SectionTitle title={`By payment mode · ${d.period_label}`} />
            <Panel><ModeSplit byMode={d.by_mode} /></Panel>
          </FadeIn>

          <FadeIn index={5}>
            <SectionTitle title="Class-wise dues" />
            <Panel>
              {d.by_class.length ? d.by_class.map((c, i) => {
                const tot = c.collected_month + c.outstanding;
                const p = tot ? c.collected_month / tot : 0;
                return (
                  <PressScale key={c.class_id ?? 0} onPress={() => router.push(`/more/fees/students?class_id=${c.class_id ?? ''}` as never)}>
                    <View style={{ paddingVertical: space.sm, borderBottomWidth: i < d.by_class.length - 1 ? 0.5 : 0, borderBottomColor: t.colors.outlineVariant }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>
                          {c.class_name} <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{c.students} students</Text>
                        </Text>
                        <Text variant="labelLarge" style={{ color: c.overdue ? t.custom.danger : t.colors.onSurfaceVariant, fontWeight: '700' }}>
                          {c.defaulters ? `${c.defaulters} overdue · ` : ''}{inrShort(c.outstanding)} due
                        </Text>
                      </View>
                      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.custom.warningContainer, overflow: 'hidden', flexDirection: 'row' }}>
                        <View style={{ flex: p, backgroundColor: t.custom.success }} />
                        <View style={{ flex: Math.max(0, 1 - p) }} />
                      </View>
                      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4 }}>
                        {inr(c.collected_month)} collected this month
                      </Text>
                    </View>
                  </PressScale>
                );
              }) : <Text style={{ color: t.colors.onSurfaceVariant }}>No classes yet.</Text>}
            </Panel>
          </FadeIn>

          <FadeIn index={6}>
            <SectionTitle title="Recent receipts" action="See all" onAction={() => router.push('/more/fees/payments' as never)} />
            <Panel style={{ paddingVertical: 0 }}>
              {d.recent.length ? d.recent.map((p, i) => (
                <PaymentRow key={p.id} p={p} divider={i < d.recent.length - 1} onPress={() => router.push(`/more/fees/receipt/${p.id}` as never)} />
              )) : <EmptyState icon="receipt-text-outline" title="No receipts yet" text="Payments you record show up here." />}
            </Panel>
          </FadeIn>
        </>
      )}
    </Screen>
  );
}
