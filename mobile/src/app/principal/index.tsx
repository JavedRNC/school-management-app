import { useState } from 'react';
import { Text, View } from 'react-native';

import { ColumnChart, HBarChart, LineChart, Ring } from '@/components/charts';
import { fmtDate } from '@/components/PostList';
import { Card, Chips, Empty, ErrorBox, Header, ListRow, Loading, Pill, Screen, Stat, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, pctColor, space } from '@/lib/theme';
import type { Dashboard, StudentStat } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function PrincipalDashboard() {
  const { user } = useAuth();
  const [examId, setExamId] = useState<number | null>(null);
  const { data, error, loading, refreshing, refresh, reload } = useLoad(
    () => api<Dashboard>('/dashboard', { params: { exam_id: examId } }), [examId]);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Dashboard" subtitle={`Hello, ${user?.name.split(' ').slice(-1)[0] ?? ''} · ${data ? fmtDate(data.date) : ''}`} />
      {loading && !data ? <Loading /> : null}
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <DashboardBody d={data} examId={examId} setExamId={setExamId} /> : null}
    </Screen>
  );
}

function DashboardBody({ d, examId, setExamId }: { d: Dashboard; examId: number | null; setExamId: (n: number) => void }) {
  const o = d.overview;
  const low = d.thresholds.low_attendance;
  const ac = d.academics;
  return (
    <View>
      {/* Overview */}
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
        <Stat label="Students" value={String(o.students)} />
        <Stat label="Teachers" value={String(o.teachers)} />
        <Stat label="Classes" value={String(o.classes)} />
      </View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          {o.attendance_today_percent != null ? <Ring value={o.attendance_today_percent} label="present" />
            : <View style={{ width: 96, alignItems: 'center' }}><Text style={styles.h2}>—</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.h3}>Today's attendance</Text>
            <Text style={styles.muted}>{o.classes_marked} of {o.classes_total} classes marked</Text>
            {d.unmarked_classes.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
                {d.unmarked_classes.map((c) => <Pill key={c.class_id} text={`${c.class_name} not marked`} color={colors.warn} bg={colors.warnSoft} />)}
              </View>
            ) : <View style={{ marginTop: space.sm }}><Pill text="All classes marked" color={colors.good} bg={colors.goodSoft} /></View>}
          </View>
        </View>
      </Card>

      {/* At risk */}
      <Card title="Students needing attention" right={<Pill text={String(d.at_risk.length)} color={colors.bad} bg={colors.badSoft} />}>
        {d.at_risk.length ? d.at_risk.slice(0, 8).map((s) => (
          <ListRow key={s.student_id} title={s.name} subtitle={`Class ${s.class_name}`}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}>{s.reasons?.map((r) => <Pill key={r} text={r} color={colors.bad} bg={colors.badSoft} />)}</View>} />
        )) : <Empty text="No students at risk 🎉" />}
        {d.at_risk.length > 8 ? <Text style={[styles.muted, { marginTop: space.sm }]}>+{d.at_risk.length - 8} more</Text> : null}
        <Text style={[styles.muted, { fontSize: 11, marginTop: space.sm }]}>
          Attendance below {low}% (last 30 days) or exam average below {d.thresholds.at_risk_marks}%
        </Text>
      </Card>

      {/* Attendance */}
      <Card title="Attendance by class (today)">
        <HBarChart low={low} data={d.attendance_today.map((c) => ({ label: `${c.class_name}  (${c.present}/${c.total})`, value: c.percent }))} />
      </Card>
      <Card title="Attendance trend · 30 days">
        <LineChart threshold={low} data={d.attendance_trend.map((t) => ({ label: fmtDate(t.date), value: t.percent }))} />
        <Text style={[styles.muted, { fontSize: 11, marginTop: 4 }]}>Dashed line = {low}% target</Text>
      </Card>
      <Card title={`Low attendance (< ${low}%)`}>
        <StudentList rows={d.low_attendance.slice(0, 10)} empty="Everyone is above target" />
      </Card>

      {/* Academics */}
      {ac ? (
        <>
          <Text style={[styles.h2, { marginTop: space.md, marginBottom: space.sm }]}>Academics</Text>
          {ac.exams.length > 1 ? (
            <Chips options={ac.exams.map((e) => ({ label: e.name, value: e.id }))} value={examId ?? ac.exam.id} onChange={setExamId} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
            <Stat label="School average" value={ac.school_avg != null ? `${ac.school_avg}%` : '—'} color={pctColor(ac.school_avg, 50)} />
            <Stat label={`Pass rate (≥${d.thresholds.pass}%)`} value={ac.pass_rate != null ? `${ac.pass_rate}%` : '—'} color={pctColor(ac.pass_rate, 80)} />
          </View>
          <Card title="Average by class">
            <ColumnChart data={ac.avg_by_class.map((c) => ({ label: c.class_name, value: c.percent }))} colorFn={(v) => pctColor(v, 50)} />
          </Card>
          <Card title="Average by subject" right={<Text style={[styles.muted, { fontSize: 12 }]}>weakest first</Text>}>
            <HBarChart low={50} data={ac.avg_by_subject.map((s) => ({ label: s.subject, value: s.percent }))} />
          </Card>
          <Card title="Top 5 students">
            <StudentList rows={ac.top_students} empty="No marks yet" good />
          </Card>
          {ac.bottom_students.length ? (
            <Card title="Bottom 5 students">
              <StudentList rows={ac.bottom_students} empty="" />
            </Card>
          ) : null}
        </>
      ) : <Card><Empty text="No exam marks yet — academics will appear once teachers enter marks." /></Card>}
    </View>
  );
}

function StudentList({ rows, empty, good }: { rows: StudentStat[]; empty: string; good?: boolean }) {
  if (!rows.length) return <Empty text={empty} />;
  return (
    <View>
      {rows.map((s, i) => (
        <ListRow key={s.student_id} title={`${i + 1}. ${s.name}`} subtitle={`Class ${s.class_name}`}
          right={<Text style={{ fontWeight: '800', color: good ? colors.good : pctColor(s.percent) }}>{s.percent}%</Text>} />
      ))}
    </View>
  );
}
