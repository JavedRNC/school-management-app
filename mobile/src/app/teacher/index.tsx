import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { BannerCarousel } from '@/components/BannerCarousel';
import { CheckInCard } from '@/components/CheckInCard';
import { LeaveSummaryCard } from '@/components/leaves/LeaveSummaryCard';
import { OpsGrid } from '@/components/OpsGrid';
import { PendingPollsCard } from '@/components/PollsCard';
import { StatusBanner } from '@/components/StatusBanner';
import { subjectIcon, TimetableView } from '@/components/TimetableView';
import { ErrorState, FadeIn, Hero, Icon, LoadingCards, Panel, PressScale, Screen, SectionTitle, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { greeting, radius, space, useAppTheme } from '@/lib/theme';
import type { Assignment, SchoolClass, Slot } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function TeacherHome() {
  const t = useAppTheme();
  const { user, school } = useAuth();
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [slots, classes, assignments] = await Promise.all([api<Slot[]>('/timetable'), api<SchoolClass[]>('/classes'), api<Assignment[]>('/assignments')]);
    return { slots, classes, assignments };
  });
  const myClass = data?.classes.find((c) => c.class_teacher_id === user?.id);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayCount = data?.slots.filter((s) => s.day === todayIdx).length ?? 0;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={
        <Hero eyebrow={greeting()} title={user?.name.split(' ')[0] ?? ''}
          subtitle={!data ? ' ' : school && !school.today_is_school_day ? `No school today${school.closed_reason ? ` · ${school.closed_reason}` : ''} 🎉`
            : `You have ${todayCount} period${todayCount === 1 ? '' : 's'} today`}
          right={user ? <UserAvatar name={user.name} light size={48} /> : null}>
          {myClass ? (
            <FadeIn>
              <Panel style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: t.colors.secondaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                    <Text variant="titleLarge" style={{ fontWeight: '700', color: t.colors.onSecondaryContainer }}>{myClass.name}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Your class</Text>
                    <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>{myClass.student_count} students</Text>
                  </View>
                  <Button mode="contained" icon="clipboard-check-outline" onPress={() => router.push('/teacher/attendance')}>Attendance</Button>
                </View>
              </Panel>
            </FadeIn>
          ) : <View style={{ height: 40 }} />}
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      <StatusBanner closed />
      <BannerCarousel style={{ marginBottom: space.md }} />
      <CheckInCard />
      <LeaveSummaryCard />
      <PendingPollsCard />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <LoadingCards /> : (
        <>
          <FadeIn>
            <PressScale onPress={() => router.push('/more/calendar')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.colors.tertiaryContainer, borderRadius: radius.xl, padding: space.md }}>
                <Icon name="calendar-month-outline" size={26} color={t.colors.onTertiaryContainer} />
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onTertiaryContainer }}>School calendar</Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onTertiaryContainer }}>Holidays, vacations & events</Text>
                </View>
                <Icon name="chevron-right" size={20} color={t.colors.onTertiaryContainer} />
              </View>
            </PressScale>
          </FadeIn>
          <SectionTitle title="Quick actions" />
          <FadeIn index={1}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[
                { icon: 'clipboard-check-outline', label: 'Attendance', to: '/teacher/attendance', bg: t.colors.primaryContainer, fg: t.colors.onPrimaryContainer },
                { icon: 'pencil-box-multiple-outline', label: 'Enter marks', to: '/teacher/marks', bg: t.colors.secondaryContainer, fg: t.colors.onSecondaryContainer },
                { icon: 'book-plus-outline', label: 'Homework', to: '/teacher/posts', bg: t.colors.tertiaryContainer, fg: t.colors.onTertiaryContainer },
              ].map((a) => (
                <PressScale key={a.label} style={{ flex: 1 }} onPress={() => router.push(a.to as '/teacher/marks')}>
                  <View style={{ backgroundColor: a.bg, borderRadius: radius.xl, paddingVertical: space.lg, alignItems: 'center', gap: 6 }}>
                    <Icon name={a.icon as 'book-plus-outline'} size={28} color={a.fg} />
                    <Text variant="labelLarge" style={{ color: a.fg, fontWeight: '700' }}>{a.label}</Text>
                  </View>
                </PressScale>
              ))}
            </View>
          </FadeIn>
          <OpsGrid title="More" />
          <SectionTitle title="My subjects" />
          <FadeIn index={2}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {data.assignments.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.colors.elevation.level2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Icon name={subjectIcon(a.subject_name)} size={16} color={t.colors.primary} />
                  <Text variant="labelLarge" style={{ color: t.colors.onSurface }}>{a.subject_name} · {a.class_name}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
          <SectionTitle title="My timetable" />
          <TimetableView slots={data.slots} show="class" />
        </>
      )}
    </Screen>
  );
}
