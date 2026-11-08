import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { DayDots, Ring } from '@/components/charts';
import { PostList } from '@/components/PostList';
import { subjectIcon } from '@/components/TimetableView';
import { ErrorState, FadeIn, Hero, Icon, LoadingCards, Panel, PressScale, Screen, SectionTitle, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { greeting, radius, space, useAppTheme } from '@/lib/theme';
import type { MyAttendance, Post, ReportCard, Slot } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentHome() {
  const t = useAppTheme();
  const { user } = useAuth();
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [att, notices, homework, cards, slots] = await Promise.all([
      api<MyAttendance>('/me/attendance'), api<Post[]>('/posts', { params: { kind: 'notice' } }),
      api<Post[]>('/posts', { params: { kind: 'homework' } }), api<ReportCard[]>('/me/marks'), api<Slot[]>('/timetable'),
    ]);
    return { att, notices, homework, cards, slots };
  });
  const todayIdx = (new Date().getDay() + 6) % 7;
  const today = data?.slots.filter((s) => s.day === todayIdx).sort((a, b) => a.period - b.period) ?? [];
  const pendingHw = data?.homework.filter((h) => h.due_date && new Date(h.due_date + 'T23:59:59') >= new Date()) ?? [];
  const latest = data?.cards[0];

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={
        <Hero eyebrow={greeting()} title={`${user?.name.split(' ')[0] ?? ''} 👋`} subtitle={`Roll no. ${user?.roll_no ?? '-'}`}
          right={user ? <UserAvatar name={user.name} light size={48} /> : null}>
          {data ? (
            <FadeIn>
              <Panel style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                  <Ring value={data.att.percent} label="attendance" />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.onSurface }}>{data.att.present_days} of {data.att.total_days} days</Text>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
                      {data.att.percent >= 75 ? 'Great going — keep it up!' : 'Below 75% — try not to miss school.'}
                    </Text>
                    <ToneChip text={data.att.percent >= 75 ? 'On track' : 'Needs improvement'} tone={data.att.percent >= 85 ? 'success' : data.att.percent >= 75 ? 'warning' : 'danger'}
                      icon={data.att.percent >= 75 ? 'thumb-up-outline' : 'alert-outline'} />
                  </View>
                </View>
              </Panel>
            </FadeIn>
          ) : <View style={{ height: 40 }} />}
        </Hero>
      }>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <View style={{ marginTop: space.lg }}><LoadingCards /></View> : (
        <>
          <FadeIn index={1}>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
              <PressScale style={{ flex: 1 }} onPress={() => router.push('/student/homework')}>
                <View style={{ backgroundColor: t.colors.secondaryContainer, borderRadius: radius.xl, padding: space.lg }}>
                  <Icon name="book-clock-outline" size={26} color={t.colors.onSecondaryContainer} />
                  <Text variant="headlineMedium" style={{ fontWeight: '800', color: t.colors.onSecondaryContainer, marginTop: space.sm }}>{pendingHw.length}</Text>
                  <Text variant="labelLarge" style={{ color: t.colors.onSecondaryContainer }}>Homework due</Text>
                </View>
              </PressScale>
              <PressScale style={{ flex: 1 }} onPress={() => router.push('/student/marks')}>
                <View style={{ backgroundColor: t.colors.primaryContainer, borderRadius: radius.xl, padding: space.lg }}>
                  <Icon name="trophy-outline" size={26} color={t.colors.onPrimaryContainer} />
                  <Text variant="headlineMedium" style={{ fontWeight: '800', color: t.colors.onPrimaryContainer, marginTop: space.sm }}>{latest ? `${latest.percent}%` : '—'}</Text>
                  <Text variant="labelLarge" style={{ color: t.colors.onPrimaryContainer }} numberOfLines={1}>{latest ? latest.exam : 'No results yet'}</Text>
                </View>
              </PressScale>
            </View>
          </FadeIn>

          <SectionTitle title="Today's classes" action="Full timetable" onAction={() => router.push('/student/timetable')} />
          <FadeIn index={2}>
            {today.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {today.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.colors.elevation.level2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text variant="labelMedium" style={{ color: t.colors.primary, fontWeight: '800' }}>P{s.period}</Text>
                    <Icon name={subjectIcon(s.subject_name)} size={16} color={t.colors.onSurfaceVariant} />
                    <Text variant="labelLarge" style={{ color: t.colors.onSurface }}>{s.subject_name}</Text>
                  </View>
                ))}
              </View>
            ) : <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>No classes today 🎉</Text>}
          </FadeIn>

          <SectionTitle title="Recent attendance" />
          <FadeIn index={3}>
            <Panel>
              <DayDots days={[...data.att.recent].reverse().slice(-21)} />
              <Text variant="labelSmall" style={{ color: t.colors.outline, marginTop: space.sm }}>Tap a day to see details</Text>
            </Panel>
          </FadeIn>

          <SectionTitle title="Notices" />
          <PostList posts={data.notices.slice(0, 5)} emptyText="No notices right now" />
        </>
      )}
    </Screen>
  );
}
