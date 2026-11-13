import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { dayLabel, today, useAct } from '../kit';
import { Badge, Button, Empty, ErrorBox, Loading, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass } from './ctx';

type Row = { student_id: number; name: string; roll_no: number | null; present: boolean | null; on_leave: boolean };
type Sheet = { date: string; is_school_day: boolean; reason: string; can_edit: boolean; lock_reason: string; marked_by: string | null; rows: Row[] };

export function Attendance() {
  const { school } = useSchool();
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const [classId, setClassId] = useState('');
  const [day, setDay] = useState(today());
  useEffect(() => { if (!classId && classes.data?.[0]) setClassId(String(classes.data[0].id)); }, [classes.data, classId]);
  const sheet = useLoad(() => (classId && day ? api<Sheet>('/attendance', { query: { class_id: classId, day } }) : Promise.resolve(null)), [classId, day]);
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [override, setOverride] = useState(false);
  const { act, busy } = useAct();
  // a class that is not marked yet starts with everyone present, except students on approved leave
  useEffect(() => { setMarks(Object.fromEntries((sheet.data?.rows ?? []).map((r) => [r.student_id, r.present ?? !r.on_leave]))); setDirty(false); setOverride(false); }, [sheet.data]);
  const s = sheet.data;
  const canWrite = school?.can_write !== false;
  const editable = !!s && canWrite && s.can_edit && (s.is_school_day || override);
  const present = useMemo(() => Object.values(marks).filter(Boolean).length, [marks]);
  const total = s?.rows.length ?? 0;
  const setAll = (v: boolean) => { setMarks(Object.fromEntries((s?.rows ?? []).map((r) => [r.student_id, r.on_leave ? false : v]))); setDirty(true); };
  const shift = (n: number) => { const d = new Date(`${day}T00:00:00`); d.setDate(d.getDate() + n); setDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); };
  async function save() {
    const records = (s?.rows ?? []).map((r) => ({ student_id: r.student_id, present: !!marks[r.student_id] }));
    if (await act('save', () => api('/attendance', { body: { class_id: Number(classId), date: day, records, override } }), `Attendance saved: ${present} of ${total} present`)) sheet.reload();
  }

  return (
    <>
      <PageHead title="Attendance" sub="Open any class and day. Tap a student to switch between present and absent." />
      <ReadOnlyNote />
      <div className="toolbar">
        <Select label="Class" value={classId} onChange={setClassId} options={(classes.data ?? []).map((c): [string, string] => [String(c.id), c.name])} />
        <Text label="Day" type="date" value={day} onChange={(v) => v && setDay(v)} max={today()} />
        <div className="row"><Button kind="small" onClick={() => shift(-1)} aria-label="Previous day">← Previous</Button><Button kind="small" onClick={() => shift(1)} disabled={day >= today()} aria-label="Next day">Next →</Button>
          {day !== today() ? <Button kind="small" onClick={() => setDay(today())}>Today</Button> : null}</div>
      </div>
      {classes.data && !classes.data.length ? <div className="card"><Empty title="Add a class first">Attendance is marked class by class.</Empty></div>
        : sheet.error ? <ErrorBox message={sheet.error} onRetry={sheet.reload} />
        : !s ? <Loading rows={6} /> : (
          <section className="card flush">
            <div className="spread" style={{ padding: '14px 18px' }}>
              <div><h2>{dayLabel(s.date)}</h2><p className="small muted">{s.marked_by ? `Marked by ${s.marked_by}` : 'Not marked yet'}</p></div>
              <div className="row">
                {s.marked_by || dirty ? <Badge status={present === total ? 'active' : 'grace'}>{present} of {total} present</Badge> : null}
                {editable ? <><Button kind="small" onClick={() => setAll(true)}>All present</Button><Button kind="small" onClick={() => setAll(false)}>All absent</Button></> : null}
              </div>
            </div>
            <div style={{ padding: '0 18px 18px' }} className="stack">
              {!s.is_school_day ? (
                <div className="alert warn"><span className="grow">Not a school day{s.reason ? ` (${s.reason})` : ''}. Attendance isn't needed.</span>
                  {canWrite && s.can_edit && !override ? <button type="button" className="btn small" onClick={() => setOverride(true)}>Mark anyway</button> : null}</div>
              ) : null}
              {!s.can_edit && s.lock_reason ? <div className="alert">{s.lock_reason}</div> : null}
              {!s.rows.length ? <Empty title="No students in this class">Add students from People.</Empty> : (
                <div className="register" role="group" aria-label="Students">
                  {s.rows.map((r) => (
                    <button key={r.student_id} type="button" aria-pressed={!!marks[r.student_id]} disabled={!editable}
                      onClick={() => { setMarks((m) => ({ ...m, [r.student_id]: !m[r.student_id] })); setDirty(true); }}
                      aria-label={`${r.name}: ${marks[r.student_id] ? 'present' : 'absent'}${r.on_leave ? ', on approved leave' : ''}`}>
                      <span className="roll">{r.roll_no ?? '–'}</span><span className="grow">{r.name}{r.on_leave ? <small className="muted"> · on leave</small> : null}</span>
                      <span className="mark" aria-hidden="true">{marks[r.student_id] ? 'P' : 'A'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {editable && s.rows.length ? (
              <div className="savebar"><span className="muted small">{dirty ? 'You have changes that are not saved.' : s.marked_by ? 'Saved.' : 'Everyone starts as present. Change who is absent, then save.'}</span>
                <Button kind="primary" busy={busy === 'save'} disabled={!dirty && !!s.marked_by} onClick={save}>Save attendance</Button></div>
            ) : null}
          </section>
        )}
    </>
  );
}
