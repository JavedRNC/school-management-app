import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CountUp } from '../kit';
import { useSchool } from '../school/ctx';
import { Bars, LineChart } from '../charts';
import { Badge, Empty, ErrorBox, fmtInt, fmtMoney, Icon, Loading, PageHead, Select, useLoad } from '../ui';

type Dash = {
  date: string; today_is_school_day: boolean; closed_reason: string;
  overview: { students: number; teachers: number; parents: number; classes: number; attendance_today_percent: number | null; classes_marked: number; classes_total: number };
  attendance_today: { class_id: number; class_name: string; present: number; total: number; percent: number | null }[];
  unmarked_classes: { class_id: number; class_name: string; class_teacher: string | null }[];
  attendance_trend: { date: string; percent: number }[];
  low_attendance: { student_id: number; name: string; class_name: string; percent: number }[];
  academics: { exam: { id: number; name: string } | null; exams?: { id: number; name: string }[]; avg_by_class: { class_name: string; percent: number }[]; avg_by_subject: { subject: string; percent: number }[]; pass_rate: number | null; school_avg: number | null } | null;
  at_risk: { student_id: number; name: string; class_name: string; reasons: string[] }[];
};
type Fees = { period_label: string; collected_month: number; expected_month: number; collection_pct: number; outstanding: number; overdue: number; defaulters: number; pending_claims: number; configured: boolean };

const tone = (v: number) => (v < 60 ? 'low' : v < 80 ? 'mid' : 'high');
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function SchoolDashboard() {
  const { school, has } = useSchool();
  const sc = { data: school };
  const [examId, setExamId] = useState('');
  const d = useLoad(() => api<Dash>('/dashboard', { query: { exam_id: examId } }), [examId]);
  const feesOn = has('fees');
  const fees = useLoad(() => (feesOn ? api<Fees>('/fees/summary').catch(() => null) : Promise.resolve(null)), [feesOn]);
  const leaves = useLoad(() => (has('leaves') ? api<unknown[]>('/leaves', { query: { scope: 'inbox', status: 'pending' } }).catch(() => []) : Promise.resolve([])), [school?.id]);
  const todo: { to: string; text: string }[] = [];
  if (d.data?.today_is_school_day && d.data.unmarked_classes.length) todo.push({ to: '/school/attendance', text: `${d.data.unmarked_classes.length} ${d.data.unmarked_classes.length === 1 ? 'class has' : 'classes have'} no attendance yet today` });
  if (leaves.data?.length) todo.push({ to: '/school/leaves', text: `${leaves.data.length} leave ${leaves.data.length === 1 ? 'request is' : 'requests are'} waiting for you` });
  if (fees.data?.pending_claims) todo.push({ to: '/school/fees', text: `${fees.data.pending_claims} UPI ${fees.data.pending_claims === 1 ? 'payment needs' : 'payments need'} checking` });
  const quick = [{ to: '/school/attendance', icon: 'check', label: 'Mark attendance' }, { to: '/school/people', icon: 'people', label: 'Add people' }, ...(feesOn ? [{ to: '/school/fees', icon: 'rupee', label: 'Collect a fee' }] : []),
    { to: '/school/notices', icon: 'megaphone', label: 'Post a notice' }, { to: '/school/exams', icon: 'book', label: 'Enter marks' }, { to: '/school/timetable', icon: 'grid', label: 'Timetable' }];
  const o = d.data?.overview;
  const a = d.data?.academics;
  return (
    <>
      <PageHead title={sc.data?.name ?? 'School dashboard'} sub={sc.data ? `School code ${sc.data.code}${sc.data.subscription.plan ? ` · ${sc.data.subscription.plan} plan` : ''}` : undefined}>
        {sc.data ? <Badge status={sc.data.status} /> : null}
      </PageHead>
      {d.error ? <ErrorBox message={d.error} onRetry={d.reload} /> : null}
      {d.data && !d.data.today_is_school_day ? <div className="alert" style={{ marginBottom: 14 }}>School is closed today{d.data.closed_reason ? `: ${d.data.closed_reason}` : ''}.</div> : null}
      {todo.length ? <div className="todo" role="region" aria-label="Needs your attention">{todo.map((t) => <Link key={t.to} to={t.to} className="alert warn"><span className="grow">{t.text}</span><b>Open →</b></Link>)}</div> : null}
      <div className="grid g4 keep2">
        <Link to="/school/attendance" className="card stat accent"><span className="label">Attendance today</span><span className="value">{o ? (o.attendance_today_percent === null ? '—' : `${o.attendance_today_percent}%`) : '…'}</span>
          <span className="hint">{o ? `${o.classes_marked} of ${o.classes_total} classes marked` : ' '}</span></Link>
        <Link to="/school/people" className="card stat"><span className="label">Students</span><span className="value">{o ? <CountUp value={o.students} /> : '…'}</span><span className="hint">{o ? `${fmtInt(o.classes)} classes` : ' '}</span></Link>
        <Link to="/school/people" className="card stat"><span className="label">Teachers</span><span className="value">{o ? <CountUp value={o.teachers} /> : '…'}</span><span className="hint">{o ? `${fmtInt(o.parents)} parents` : ' '}</span></Link>
        <Link to="/school/exams" className="card stat"><span className="label">{a?.exam ? `${a.exam.name} pass rate` : 'Pass rate'}</span><span className="value">{a?.pass_rate != null ? `${a.pass_rate}%` : '—'}</span>
          <span className="hint">{a?.school_avg != null ? `School average ${a.school_avg}%` : 'No exam marks yet'}</span></Link>
      </div>
      <nav className="quick" aria-label="Quick actions">{quick.map((q) => <Link key={q.label} to={q.to}><Icon name={q.icon} /><span>{q.label}</span></Link>)}</nav>

      <div className="grid g21" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Attendance, last 30 days</h2>
          {d.loading ? <Loading rows={3} /> : d.data ? <LineChart points={d.data.attendance_trend.map((p) => ({ label: day(p.date), value: p.percent }))} unit="%" max={100}
            summary={`Daily attendance percentage for the last ${d.data.attendance_trend.length} school days.`} /> : null}
        </section>
        <section className="card">
          <h2>Today by class</h2>
          {d.data?.attendance_today.length ? <Bars rows={d.data.attendance_today.map((c) => ({ label: c.class_name, value: c.percent }))} tone={tone} /> : <Empty title="No attendance marked yet today" />}
          {d.data?.unmarked_classes.length ? <p className="small muted" style={{ marginTop: 12 }}>Not marked yet: {d.data.unmarked_classes.map((c) => `${c.class_name}${c.class_teacher ? ` (${c.class_teacher})` : ''}`).join(', ')}</p> : null}
        </section>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="spread" style={{ marginBottom: 12 }}><h2>{a?.exam ? `${a.exam.name}: average by subject` : 'Results'}</h2>
            {a?.exams && a.exams.length > 1 ? <div style={{ minWidth: 160 }}><Select label="Exam" value={examId || String(a.exam?.id ?? '')} onChange={setExamId} options={a.exams.map((e): [string, string] => [String(e.id), e.name])} /></div> : null}</div>
          {a?.avg_by_subject.length ? <Bars rows={a.avg_by_subject.map((s) => ({ label: s.subject, value: s.percent }))} tone={tone} /> : <Empty title="No exam marks entered yet" />}
        </section>
        <section className="card">
          <h2>Fees{fees.data?.configured ? `, ${fees.data.period_label}` : ''}</h2>
          {fees.loading ? <Loading rows={3} /> : fees.data?.configured ? (
            <div className="stack">
              <div className="spread"><span className="muted">Collected this month</span><b className="num">{fmtMoney(fees.data.collected_month)} of {fmtMoney(fees.data.expected_month)}</b></div>
              <div className={`meter ${tone(fees.data.collection_pct)}`} role="img" aria-label={`${fees.data.collection_pct}% collected`}><i style={{ width: `${Math.min(100, fees.data.collection_pct)}%` }} /></div>
              <dl className="dl"><div><dt>Outstanding</dt><dd className="num">{fmtMoney(fees.data.outstanding)}</dd></div><div><dt>Overdue</dt><dd className="num">{fmtMoney(fees.data.overdue)}</dd></div>
                <div><dt>Students with overdue fees</dt><dd className="num">{fmtInt(fees.data.defaulters)}</dd></div><div><dt>UPI payments to confirm</dt><dd className="num">{fmtInt(fees.data.pending_claims)}</dd></div></dl>
            </div>
          ) : <Empty title={feesOn ? 'Fees are not set up' : 'Fees are not part of your plan'}>{feesOn ? <Link to="/school/fees">Set up fees</Link> : null}</Empty>}
        </section>
      </div>

      <section className="card flush" style={{ marginTop: 14 }}>
        <div style={{ padding: '16px 18px 8px' }}><h2>Students who need attention</h2></div>
        {d.data?.at_risk.length ? (
          <div className="tablewrap"><table className="t"><thead><tr><th>Student</th><th>Class</th><th>Why</th></tr></thead>
            <tbody>{d.data.at_risk.slice(0, 12).map((s) => (
              <tr key={s.student_id}><td className="primary-cell"><span>{s.name}</span></td><td data-label="Class">{s.class_name}</td><td data-label="Why">{s.reasons.join(' · ')}</td></tr>
            ))}</tbody></table></div>
        ) : <Empty title="Nobody is flagged right now">Students with low attendance or low marks appear here.</Empty>}
      </section>
    </>
  );
}
