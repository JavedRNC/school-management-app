import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { DayDots, Ring } from '@/components/charts';
import { BannerCarousel } from '@/components/BannerCarousel';
import { MyBusCard } from '@/components/BusCard';
import { ChildSwitcher } from '@/components/ChildSwitcher';
import { FeeDueCard } from '@/components/fees/FeeDueCard';
import { LeaveSummaryCard } from '@/components/leaves/LeaveSummaryCard';
import { PendingPollsCard } from '@/components/PollsCard';
import { PostList } from '@/components/PostList';
import { subjectIcon } from '@/components/TimetableView';
import { ErrorState, FadeIn, Hero, Icon, LoadingCards, Panel, PressScale, Screen, SectionTitle, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { childParams, useChild } from '@/lib/child';
import { greeting, radius, space, useAppTheme } from '@/lib/theme';
import type { Holiday, MyAttendance, Post, ReportCard, Slot } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { isoToday, UpcomingCard, useBase, useChildGate } from './common';

export default function HomeScreen() {
  const t = useAppTheme();
  const { user } = useAuth();
  const { child, studentId, classNames } = useChild();
  const base = useBase();
  const { blocked, gate } = useChildGate();
  const isParent = user?.role === 'parent';

  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    if (isParent && !studentId) return null;
    const [att, notices, homework, cards, slots, upcoming] = await Promise.all([
      api<MyAttendance>('/me/attendance', { params: childParams(studentId) }),
      api<Post[]>('/posts', { params: childParams(studentId, { kind: 'notice' }) }),
      api<Post[]>('/posts', { params: childParams(studentId, { kind: 'homework' }) }),
      api<ReportCard[]>('/me/marks', { params: childParams(studentId) }),
      api<Slot[]>('/timetable', { params: childParams(studentId) }),
      api<Holiday[]>('/holidays', { params: { start: isoToday() } }).catch(() => [] as Holiday[]),
    ]);
    return { att, notices, homework, cards, slots, upcoming };
  }, [studentId, isParent]);

  const todayIdx = (new Date().getDay() + 6) % 7;
  const today = data?.slots.filter((s) => s.day === todayIdx).sort((a, b) => a.period - b.period) ?? [];
  const pendingHw = data?.homework.filter((h) => h.due_date && new Date(h.due_date + 'T23:59:59') >= new Date()) ?? [];
  const latest = data?.cards[0];
  const who = isParent ? child : user;
  const first = (n?: string) => n?.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').split(' ')[0] ?? '';
  const cls = who?.class_id ? classNames[who.class_id] : undefined;
  const pronoun = isParent ? `${first(child?.name)} is` : "You're";

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={
        <Hero eyebrow={isParent ? `${greeting()}, ${first(user?.name)}` : greeting()}
          title={isParent ? (child?.name ?? 'Your children') : `${first(user?.name)} 👋`}
          subtitle={isParent ? (child ? [cls ? `Class ${cls}` : null, child.roll_no ? `Roll no. ${child.roll_no}` : null].filter(Boolean).join(' · ') : ' ')
            : `Roll no. ${user?.roll_no ?? '-'}`}
          right={who ? <UserAvatar name={who.name} light size={48} /> : null}>
          {isParent ? <View style={{ marginBottom: space.md }}><ChildSwitcher /></View> : null}
          {data ? (
            <FadeIn>
              <Panel style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                  <Ring value={data.att.percent} label="attendance" />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>{data.att.present_days} of {data.att.total_days} days</Text>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
                      {data.att.percent >= 75 ? `${pronoun} doing great — keep it up!` : 'Below 75% — try not to miss school.'}
                    </Text>
                    <ToneChip text={data.att.percent >= 75 ? 'On track' : 'Needs improvement'} tone={data.att.percent >= 85 ? 'success' : data.att.percent >= 75 ? 'warning' : 'danger'}
                      icon={data.att.percent >= 75 ? 'thumb-up-outline' : 'alert-outline'} />
                  </View>
                </View>
              </Panel>
            </FadeIn>
          ) : !isParent || blocked ? <View style={{ height: 40 }} /> : null}
        </Hero>
      }>
      {blocked ? gate : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {blocked ? null : !data ? <View style={{ marginTop: space.lg }}><LoadingCards /></View> : (
        <>
          <FadeIn index={1}>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
              <PressScale style={{ flex: 1 }} onPress={() => router.push(`${base}/homework` as never)}>
                <View style={{ backgroundColor: t.colors.secondaryContainer, borderRadius: radius.xl, padding: space.lg }}>
                  <Icon name="book-clock-outline" size={26} color={t.colors.onSecondaryContainer} />
                  <Text variant="headlineMedium" style={{ fontWeight: '700', color: t.colors.onSecondaryContainer, marginTop: space.sm }}>{pendingHw.length}</Text>
                  <Text variant="labelLarge" style={{ color: t.colors.onSecondaryContainer }}>Homework due</Text>
                </View>
              </PressScale>
              <PressScale style={{ flex: 1 }} onPress={() => router.push(`${base}/marks` as never)}>
                <View style={{ backgroundColor: t.colors.primaryContainer, borderRadius: radius.xl, padding: space.lg }}>
                  <Icon name="trophy-outline" size={26} color={t.colors.onPrimaryContainer} />
                  <Text variant="headlineMedium" style={{ fontWeight: '700', color: t.colors.onPrimaryContainer, marginTop: space.sm }}>{latest ? `${latest.percent}%` : '—'}</Text>
                  <Text variant="labelLarge" style={{ color: t.colors.onPrimaryContainer }} numberOfLines={1}>{latest ? latest.exam : 'No results yet'}</Text>
                </View>
              </PressScale>
            </View>
          </FadeIn>

          <View style={{ height: space.md }} />
          <BannerCarousel style={{ marginBottom: space.md }} />
          <PendingPollsCard />
          <FeeDueCard />
          {isParent ? <LeaveSummaryCard /> : null}
          <MyBusCard studentId={studentId} />
          <UpcomingCard items={data.upcoming} />

          <SectionTitle title="Today's classes" action="Full timetable" onAction={() => router.push(`${base}/timetable` as never)} />
          <FadeIn index={2}>
            {today.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {today.map((s) => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.colors.elevation.level2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text variant="labelMedium" style={{ color: t.colors.primary, fontWeight: '700' }}>P{s.period}</Text>
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
