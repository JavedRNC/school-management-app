import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { rupees, SchoolRow, STATUS_LABEL, STATUS_TONE } from '@/components/admin/common';
import {
  EmptyState, ErrorState, FadeIn, Hero, Icon, LoadingCards, Panel, Screen, SectionTitle, StatTile, ToneChip, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { greeting, space, useAppTheme } from '@/lib/theme';
import type { RequestSummary } from '@/lib/onboarding';
import type { AdminOverview, SchoolStatus } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function AdminOverviewScreen() {
  const t = useAppTheme();
  const { user } = useAuth();
  const { data, error, loading, reload, refresh, refreshing } = useLoad(() => api<AdminOverview>('/admin/overview'));
  const reqs = useLoad(() => api<RequestSummary>('/admin/onboarding/summary'));

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={
        <Hero eyebrow={greeting()} title="Platform" subtitle="All schools at a glance"
          right={user ? <UserAvatar name={user.name} light size={48} /> : null}>
          {data ? (
            <FadeIn>
              <Panel style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Collected this month</Text>
                    <Text variant="headlineSmall" style={{ fontWeight: '700', color: t.custom.success }}>{rupees(data.revenue_this_month)}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Expected / month</Text>
                    <Text variant="headlineSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{rupees(data.expected_monthly)}</Text>
                  </View>
                </View>
              </Panel>
            </FadeIn>
          ) : <View style={{ height: 40 }} />}
        </Hero>
      }>
      {loading && !data ? <View style={{ marginTop: space.lg }}><LoadingCards /></View> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <View style={{ marginTop: space.lg }}>
          <FadeIn index={1}>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
              <StatTile icon="domain" label="Schools" value={data.schools} onPress={() => router.push('/admin/schools')} />
              <StatTile icon="account-school-outline" label="Students" value={data.students} tone="success" />
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <StatTile icon="human-male-board" label="Teachers" value={data.teachers} tone="warning" />
              <StatTile icon="human-male-female-child" label="Parents" value={data.parents} tone="neutral" />
            </View>
          </FadeIn>

          <Panel title="Onboarding requests" icon="inbox-arrow-down-outline" tone={reqs.data?.pending ? 'warning' : undefined}
            subtitle={reqs.data ? (reqs.data.pending ? `${reqs.data.pending} waiting for you · ${reqs.data.total} in all` : `Nothing waiting · ${reqs.data.total} in all`) : 'Schools asking to join Prangan'}
            onPress={() => router.push('/admin-requests' as never)} right={<Icon name="chevron-right" size={22} color={t.colors.outline} />} />
          <Panel title="Platform banners" subtitle="Announcements shown in every school's app" icon="bullhorn-variant-outline"
            onPress={() => router.push('/admin-banners' as never)} right={<Icon name="chevron-right" size={22} color={t.colors.outline} />} />
          <SectionTitle title="Schools by status" />
          <FadeIn index={2}>
            <Panel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {(Object.keys(data.by_status) as SchoolStatus[]).map((k) => (
                  <ToneChip key={k} text={`${STATUS_LABEL[k] ?? k} · ${data.by_status[k]}`} tone={STATUS_TONE[k] ?? 'neutral'} compact={false} />
                ))}
                <ToneChip text={`Sponsored · ${data.free_schools}`} tone="primary" icon="gift-outline" compact={false} />
              </View>
            </Panel>
          </FadeIn>

          <SectionTitle title="Expiring in 15 days" />
          <FadeIn index={3}>
            <Panel tone={data.expiring_soon.length ? 'warning' : undefined}>
              {data.expiring_soon.length ? data.expiring_soon.map((s, i) => (
                <SchoolRow key={s.id} s={s} divider={i < data.expiring_soon.length - 1} />
              )) : <EmptyState icon="calendar-check-outline" title="Nothing expiring soon" />}
            </Panel>
          </FadeIn>

          <SectionTitle title="Recently added" action="All schools" onAction={() => router.push('/admin/schools')} />
          <FadeIn index={4}>
            <Panel>
              {data.recent.length ? data.recent.map((s, i) => <SchoolRow key={s.id} s={s} divider={i < data.recent.length - 1} />)
                : <EmptyState icon="domain-plus" title="No schools yet" />}
            </Panel>
          </FadeIn>
        </View>
      ) : null}
    </Screen>
  );
}
