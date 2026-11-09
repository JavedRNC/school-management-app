import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { LayoutAnimation, View } from 'react-native';
import { Button, SegmentedButtons, Text } from 'react-native-paper';

import { ColumnChart, ProgressRows, Ring, TrendChart } from '@/components/charts';
import { fmtDate } from '@/components/PostList';
import { StatusBanner } from '@/components/StatusBanner';
import {
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, IconBadge, LoadingCards, Panel, Row, SectionTitle, Sheet, StatTile,
  ToneChip, UserAvatar,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { greeting, pctTone, space, useAppTheme } from '@/lib/theme';
import type { Dashboard, StudentStat } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';
import { Screen } from '@/components/ui';

export default function PrincipalDashboard() {
  const canInsights = useCan('insights', 'view');
  const canPeople = useCan('people', 'view');
  const canClasses = useCan('classes', 'view');
  const canNotices = useCan('notices', 'view');
  if (!canInsights) {
    const to = canPeople ? '/principal/people' : canClasses ? '/principal/classes' : canNotices ? '/principal/notices' : '/principal/profile';
    return <Redirect href={to} />;
  }
  return <Insights />;
}

function Insights() {
  const { user } = useAuth();
  const [examId, setExamId] = useState<number | null>(null);
  const { data, error, loading, refreshing, refresh, reload } = useLoad(
    () => api<Dashboard>('/dashboard', { params: { exam_id: examId } }), [examId]);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={
        <Hero eyebrow={greeting()} title={user?.name ?? 'Principal'}
          subtitle={data ? `School snapshot · ${new Date(data.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}` : 'Loading insights…'}
          right={user ? <UserAvatar name={user.name} light size={48} /> : null}>
          {data ? <TodayCard d={data} /> : <View style={{ height: 40 }} />}
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      <StatusBanner closed />
      {loading && !data ? <LoadingCards count={4} /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? <Body d={data} examId={examId} setExamId={setExamId} /> : null}
    </Screen>
  );
}

function TodayCard({ d }: { d: Dashboard }) {
  const t = useAppTheme();
  const o = d.overview;
  return (
    <FadeIn>
      <Panel style={{ marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          {o.attendance_today_percent != null ? <Ring value={o.attendance_today_percent} label="present" low={d.thresholds.low_attendance} />
            : <IconBadge icon="clipboard-text-clock-outline" size={72} tone="warning" />}
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.onSurface }}>
              {d.today_is_school_day ? "Today's attendance" : `Last school day · ${fmtDate(d.date)}`}
            </Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
              {d.today_is_school_day ? '' : `Today: ${d.closed_reason || 'no school'} · `}{o.classes_marked} of {o.classes_total} classes marked
            </Text>
            {d.unmarked_classes.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {d.unmarked_classes.map((c) => (
                  <ToneChip key={c.class_id} tone="warning" icon="clock-alert-outline"
                    text={`${c.class_name} · ${c.class_teacher ?? 'no class teacher'}`} />
                ))}
              </View>
            ) : <ToneChip text="All classes marked" tone="success" icon="check-circle" />}
          </View>
        </View>
      </Panel>
    </FadeIn>
  );
}

function Body({ d, examId, setExamId }: { d: Dashboard; examId: number | null; setExamId: (n: number) => void }) {
  const t = useAppTheme();
  const [student, setStudent] = useState<StudentStat | null>(null);
  const [cls, setCls] = useState<number | null>(null);
  const [showAllRisk, setShowAllRisk] = useState(false);
  const [rank, setRank] = useState<'top' | 'bottom'>('top');
  const low = d.thresholds.low_attendance;
  const ac = d.academics;
  const o = d.overview;
  const risk = showAllRisk ? d.at_risk : d.at_risk.slice(0, 4);
  const selClass = d.attendance_today.find((c) => c.class_id === cls);
  const ranked = ac ? (rank === 'top' ? ac.top_students : ac.bottom_students) : [];

  return (
    <View style={{ marginTop: space.lg }}>
      <FadeIn index={1}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <StatTile icon="account-school-outline" label="Students" value={o.students} onPress={() => router.push('/principal/people')} />
          <StatTile icon="human-male-board" label="Teachers" value={o.teachers} tone="warning" onPress={() => router.push('/principal/people')} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <StatTile icon="human-male-female-child" label="Parents" value={o.parents ?? 0} tone="primary" onPress={() => router.push('/principal/people')} />
          <StatTile icon="google-classroom" label="Classes" value={o.classes} tone="success" onPress={() => router.push('/principal/classes')} />
        </View>
      </FadeIn>

      {/* At-risk */}
      <SectionTitle title="Needs attention" action={d.at_risk.length > 4 ? (showAllRisk ? 'Show less' : `See all ${d.at_risk.length}`) : undefined}
        onAction={() => { LayoutAnimation.easeInEaseOut(); setShowAllRisk((s) => !s); }} />
      <FadeIn index={2}>
        <Panel>
          {d.at_risk.length ? risk.map((s, i) => (
            <Row key={s.student_id} title={s.name} subtitle={`Class ${s.class_name}`} divider={i < risk.length - 1}
              left={<UserAvatar name={s.name} size={40} />} onPress={() => setStudent(s)}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}>{s.reasons?.map((r) => <ToneChip key={r} text={r} tone="danger" />)}</View>} />
          )) : <EmptyState icon="party-popper" title="No students at risk" text="Attendance and marks look healthy." />}
        </Panel>
      </FadeIn>

      {/* Attendance */}
      <SectionTitle title="Attendance" />
      <FadeIn index={3}>
        <Panel title="By class · today" subtitle="Tap a class for details" icon="google-classroom">
          <ProgressRows low={low} onPress={(i) => setCls(d.attendance_today[i].class_id)}
            data={d.attendance_today.map((c) => ({ key: String(c.class_id), label: c.class_name, caption: `${c.present}/${c.total}`, value: c.percent }))} />
        </Panel>
      </FadeIn>
      <FadeIn index={4}>
        <Panel title="30-day trend" subtitle={`Dashed line = ${low}% target`} icon="chart-line">
          <TrendChart threshold={low} data={d.attendance_trend.map((p) => ({ label: fmtDate(p.date), value: p.percent }))} />
        </Panel>
      </FadeIn>
      <FadeIn index={5}>
        <Panel title={`Below ${low}%`} subtitle="Last 30 days" icon="account-alert-outline" tone={d.low_attendance.length ? 'warning' : 'success'}
          right={<Text variant="headlineSmall" style={{ fontWeight: '800', color: d.low_attendance.length ? t.custom.warning : t.custom.success }}>{d.low_attendance.length}</Text>}>
          {d.low_attendance.slice(0, 6).map((s, i, arr) => (
            <Row key={s.student_id} title={s.name} subtitle={`Class ${s.class_name}`} divider={i < arr.length - 1} onPress={() => setStudent({ ...s, attendance_percent: s.percent })}
              right={<Text variant="titleMedium" style={{ fontWeight: '800', color: t.custom.danger }}>{s.percent}%</Text>} />
          ))}
          {!d.low_attendance.length ? <Text variant="bodyMedium" style={{ color: t.custom.onSuccessContainer }}>Everyone is above target 🎯</Text> : null}
        </Panel>
      </FadeIn>

      {/* Academics */}
      <SectionTitle title="Academics" />
      {ac ? (
        <>
          {ac.exams.length > 1 ? (
            <FilterChips options={ac.exams.map((e) => ({ label: e.name, value: e.id, icon: 'file-document-outline' as const }))}
              value={examId ?? ac.exam.id} onChange={setExamId} />
          ) : null}
          <FadeIn index={6}>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
              <StatTile icon="chart-bell-curve-cumulative" label="School average" value={ac.school_avg} suffix="%" decimals={1} tone={pctTone(ac.school_avg, 50)} />
              <StatTile icon="check-decagram-outline" label={`Pass rate (≥${d.thresholds.pass}%)`} value={ac.pass_rate} suffix="%" decimals={1} tone={pctTone(ac.pass_rate, 80)} />
            </View>
          </FadeIn>
          <FadeIn index={7}>
            <Panel title="Average by class" subtitle="Tap a bar" icon="chart-bar">
              <ColumnChart data={ac.avg_by_class.map((c) => ({ label: c.class_name, value: c.percent }))} />
            </Panel>
          </FadeIn>
          <FadeIn index={8}>
            <Panel title="Average by subject" subtitle="Weakest first" icon="book-education-outline">
              <ProgressRows low={50} data={ac.avg_by_subject.map((s) => ({ label: s.subject, value: s.percent }))} />
            </Panel>
          </FadeIn>
          <FadeIn index={9}>
            <Panel title="Rankings" icon="trophy-outline">
              {ac.bottom_students.length ? (
                <SegmentedButtons value={rank} onValueChange={(v) => { haptic.tap(); setRank(v as 'top' | 'bottom'); }} density="small" style={{ marginBottom: space.sm }}
                  buttons={[{ value: 'top', label: 'Top 5', icon: 'arrow-up-bold' }, { value: 'bottom', label: 'Bottom 5', icon: 'arrow-down-bold' }]} />
              ) : null}
              {ranked.map((s, i) => (
                <Row key={s.student_id} title={s.name} subtitle={`Class ${s.class_name}`} divider={i < ranked.length - 1}
                  onPress={() => setStudent({ ...s, marks_percent: s.percent })}
                  left={<View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: rank === 'top' && i < 3 ? ['#F5C542', '#C9CED6', '#D9A36A'][i] : t.colors.surfaceVariant }}>
                    <Text variant="labelLarge" style={{ fontWeight: '800', color: rank === 'top' && i < 3 ? '#2B2100' : t.colors.onSurfaceVariant }}>{i + 1}</Text>
                  </View>}
                  right={<Text variant="titleMedium" style={{ fontWeight: '800', color: rank === 'top' ? t.custom.success : t.custom.danger }}>{s.percent}%</Text>} />
              ))}
            </Panel>
          </FadeIn>
        </>
      ) : <Panel><EmptyState icon="file-chart-outline" title="No exam marks yet" text="Academics appear once teachers enter marks." /></Panel>}

      {/* Sheets */}
      <Sheet visible={!!student} onDismiss={() => setStudent(null)}>
        {student ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
              <UserAvatar name={student.name} size={56} />
              <View style={{ flex: 1 }}>
                <Text variant="titleLarge" style={{ fontWeight: '800', color: t.colors.onSurface }}>{student.name}</Text>
                <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Class {student.class_name}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Panel style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ alignItems: 'center' }}>
                  {student.attendance_percent != null ? <Ring value={student.attendance_percent} size={88} label="attendance" low={low} /> : <Text>—</Text>}
                </View>
              </Panel>
              <Panel style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ alignItems: 'center' }}>
                  {student.marks_percent != null ? <Ring value={student.marks_percent} size={88} label="exam avg" low={50} /> : <Text>—</Text>}
                </View>
              </Panel>
            </View>
            {student.reasons?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
                {student.reasons.map((r) => <ToneChip key={r} text={r} tone="danger" icon="alert-circle-outline" compact={false} />)}
              </View>
            ) : null}
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
              Suggested: talk to the class teacher and schedule a parent call.
            </Text>
            <Button mode="contained-tonal" onPress={() => setStudent(null)}>Close</Button>
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={!!selClass} onDismiss={() => setCls(null)} title={selClass ? `Class ${selClass.class_name}` : ''}>
        {selClass ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.lg }}>
              {selClass.percent != null ? <Ring value={selClass.percent} label="today" low={low} /> : <IconBadge icon="clock-alert-outline" tone="warning" size={72} />}
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>
                  {selClass.percent != null ? `${selClass.present} of ${selClass.total} present` : 'Attendance not marked yet'}
                </Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{selClass.total} students enrolled</Text>
              </View>
            </View>
            <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: space.xs, color: t.colors.onSurface }}>Low attendance in this class</Text>
            {d.low_attendance.filter((s) => s.class_name === selClass.class_name).map((s, i, arr) => (
              <Row key={s.student_id} title={s.name} divider={i < arr.length - 1}
                right={<Text variant="titleSmall" style={{ fontWeight: '800', color: t.custom.danger }}>{s.percent}%</Text>} />
            ))}
            {!d.low_attendance.some((s) => s.class_name === selClass.class_name) ? (
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>No one below {low}% 👏</Text>
            ) : null}
            <Button mode="contained-tonal" onPress={() => setCls(null)} style={{ marginTop: space.lg }}>Close</Button>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
