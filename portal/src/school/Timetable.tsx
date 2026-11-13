import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { DAYS, IconButton, Tabs, useAct, useConfirm } from '../kit';
import { Button, Empty, ErrorBox, Loading, Modal, PageHead, Select, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass, type Person, type Subject } from './ctx';

type Entry = { id: number; class_id: number; day: number; period: number; subject_id: number; teacher_id: number; subject_name: string; teacher_name: string };
type Slot = { kind: 'period' | 'break'; label: string; start: string; end: string; period?: number };
type Bell = { default: Slot[]; overrides: Record<string, Slot[]>; configured: boolean };
type Assignment = { teacher_id: number; class_id: number; subject_id: number };
const FALLBACK: Slot[] = Array.from({ length: 8 }, (_, i) => ({ kind: 'period' as const, label: `Period ${i + 1}`, start: '', end: '', period: i + 1 }));

export function Timetable() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<'grid' | 'bell'>('grid');
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const bell = useLoad(() => api<Bell>('/school/bell'), []);
  return (
    <>
      <PageHead title="Timetable" sub="Weekly periods for each class, and the school's period timings" />
      <ReadOnlyNote />
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'grid', label: 'Class timetable' }, { id: 'bell', label: 'Period timings' }]} />
      {classes.error || bell.error ? <ErrorBox message={(classes.error ?? bell.error)!} onRetry={() => { classes.reload(); bell.reload(); }} /> : null}
      {!classes.data || !bell.data ? (classes.error || bell.error ? null : <Loading />) : tab === 'grid'
        ? <Grid classes={classes.data} bell={bell.data} days={school?.working_days ?? [0, 1, 2, 3, 4, 5]} canWrite={canWrite} />
        : <BellEditor bell={bell.data} canWrite={canWrite} onSaved={(b) => bell.setData(b)} />}
    </>
  );
}

function Grid({ classes, bell, days, canWrite }: { classes: Klass[]; bell: Bell; days: number[]; canWrite: boolean }) {
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : '');
  const tt = useLoad(() => (classId ? api<Entry[]>('/timetable', { query: { class_id: classId } }) : Promise.resolve([] as Entry[])), [classId]);
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const teachers = useLoad(() => api<Person[]>('/users', { query: { role: 'teacher' } }), []);
  const asg = useLoad(() => api<Assignment[]>('/assignments'), []);
  const [cell, setCell] = useState<{ day: number; period: number; entry?: Entry } | null>(null);
  const base = bell.default.length ? bell.default : FALLBACK;
  const slotsOf = (d: number) => bell.overrides[String(d)] ?? base;
  const periodsOf = (d: number) => slotsOf(d).filter((s) => s.kind === 'period').length;
  const at = useMemo(() => new Map((tt.data ?? []).map((e) => [`${e.day}-${e.period}`, e])), [tt.data]);
  const sorted = [...days].sort((a, b) => a - b);

  if (!classes.length) return <div className="card"><Empty title="Add a class first">The timetable is set class by class.</Empty></div>;
  return (
    <>
      <div className="toolbar"><Select label="Class" value={classId} onChange={setClassId} options={classes.map((c): [string, string] => [String(c.id), c.name])} />
        {!bell.configured ? <div className="alert grow">Period timings are not set yet, so 8 periods are shown. Set them in the Period timings tab.</div> : null}</div>
      {tt.error ? <ErrorBox message={tt.error} onRetry={tt.reload} /> : null}
      <section className="card"><div className="tablewrap">
        <table className="tt" aria-label="Weekly timetable">
          <thead><tr><th style={{ width: 92 }}>Period</th>{sorted.map((d) => <th key={d}>{DAYS[d]}</th>)}</tr></thead>
          <tbody>{base.map((s, i) => (s.kind === 'break'
            ? <tr key={i}><th>{s.label || 'Break'}<small>{s.start}{s.end ? `–${s.end}` : ''}</small></th><td className="brk" colSpan={sorted.length}>{s.label || 'Break'}</td></tr>
            : (
              <tr key={i}><th>{s.label}<small>{s.start}{s.end ? `–${s.end}` : ''}</small></th>
                {sorted.map((d) => {
                  const p = s.period!;
                  const e = at.get(`${d}-${p}`);
                  if (p > periodsOf(d)) return <td key={d}><div className="cell off" title={`${DAYS[d]} has only ${periodsOf(d)} periods`} /></td>;
                  return (
                    <td key={d}><button type="button" className={`cell ${e ? 'on' : ''}`} disabled={!canWrite && !e} onClick={() => canWrite && setCell({ day: d, period: p, entry: e })}
                      aria-label={`${DAYS[d]} period ${p}: ${e ? `${e.subject_name}, ${e.teacher_name}` : 'free'}`}>
                      {e ? <><b>{e.subject_name}</b><small>{e.teacher_name}</small></> : <span className="add" aria-hidden="true">+</span>}
                    </button></td>
                  );
                })}
              </tr>
            )))}</tbody>
        </table>
      </div></section>
      {cell ? <CellForm classId={Number(classId)} cell={cell} subjects={subjects.data ?? []} teachers={teachers.data ?? []} asg={asg.data ?? []} onClose={() => setCell(null)} onSaved={() => { setCell(null); tt.reload(); }} /> : null}
    </>
  );
}

function CellForm({ classId, cell, subjects, teachers, asg, onClose, onSaved }: { classId: number; cell: { day: number; period: number; entry?: Entry }; subjects: Subject[]; teachers: Person[]; asg: Assignment[]; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [s, setS] = useState(cell.entry ? String(cell.entry.subject_id) : '');
  const [t, setT] = useState(cell.entry ? String(cell.entry.teacher_id) : '');
  // picking a subject fills in that class's subject teacher
  useEffect(() => {
    if (!s || cell.entry?.subject_id === Number(s)) return;
    const a = asg.find((x) => x.class_id === classId && x.subject_id === Number(s));
    if (a) setT(String(a.teacher_id));
  }, [s, asg, classId, cell.entry]);
  const save = async () => { if (await act('save', () => api('/timetable', { method: 'PUT', body: { class_id: classId, day: cell.day, period: cell.period, subject_id: Number(s), teacher_id: Number(t) } }), 'Period saved')) onSaved(); };
  const clear = async () => { if (cell.entry && await act('clear', () => api(`/timetable/${cell.entry!.id}`, { method: 'DELETE' }), 'Period cleared')) onSaved(); };
  return (
    <Modal title={`${DAYS[cell.day]} · period ${cell.period}`} onClose={onClose}
      actions={<>{cell.entry ? <Button kind="danger" busy={busy === 'clear'} onClick={clear}>Clear period</Button> : null}<Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'save'} disabled={!s || !t} onClick={save}>Save</Button></>}>
      <div className="stack" style={{ marginTop: 10 }}>
        <Select label="Subject" value={s} onChange={setS} options={[['', 'Pick a subject'], ...subjects.map((x): [string, string] => [String(x.id), x.name])]} />
        <Select label="Teacher" value={t} onChange={setT} options={[['', 'Pick a teacher'], ...teachers.map((x): [string, string] => [String(x.id), x.name])]} hint="A teacher can't be in two classes in the same period." />
      </div>
    </Modal>
  );
}

function BellEditor({ bell, canWrite, onSaved }: { bell: Bell; canWrite: boolean; onSaved: (b: Bell) => void }) {
  const { act, busy } = useAct();
  const confirm = useConfirm();
  const [day, setDay] = useState('-1');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dirty, setDirty] = useState(false);
  const override = day !== '-1' && !!bell.overrides[day];
  useEffect(() => { setSlots((day === '-1' ? bell.default : bell.overrides[day] ?? bell.default).map((s) => ({ ...s }))); setDirty(false); }, [day, bell]);
  const change = (i: number, patch: Partial<Slot>) => { setSlots((x) => x.map((s, n) => (n === i ? { ...s, ...patch } : s))); setDirty(true); };
  const add = (kind: Slot['kind']) => {
    const last = slots[slots.length - 1];
    const start = last?.end ?? '08:00';
    const [h, m] = start.split(':').map(Number);
    const mins = (h || 0) * 60 + (m || 0) + (kind === 'break' ? 20 : 40);
    const end = `${String(Math.min(23, Math.floor(mins / 60))).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    setSlots([...slots, { kind, label: kind === 'break' ? 'Break' : '', start, end }]); setDirty(true);
  };
  const problem = useMemo(() => {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s.start || !s.end) return `Row ${i + 1}: set both times`;
      if (s.end <= s.start) return `Row ${i + 1}: ends before it starts`;
      if (i && s.start < slots[i - 1].end) return `Row ${i + 1}: starts before the previous one ends`;
    }
    return slots.some((s) => s.kind === 'period') ? null : 'Add at least one period';
  }, [slots]);
  async function save() {
    const b = await act('save', () => api<Bell>('/school/bell', { method: 'PUT', body: { day: Number(day), slots: slots.map(({ kind, label, start, end }) => ({ kind, label, start, end })) } }), 'Period timings saved');
    if (b) onSaved(b);
  }
  async function reset() {
    if (!(await confirm({ title: `Use the usual timings on ${DAYS[Number(day)]}?`, body: 'The separate timings for this day are removed.', confirm: 'Use usual timings' }))) return;
    const b = await act('reset', () => api<Bell>(`/school/bell/${day}`, { method: 'DELETE' }), `${DAYS[Number(day)]} now follows the usual timings`);
    if (b) onSaved(b);
  }
  let n = 0;
  return (
    <section className="card stack" style={{ maxWidth: 760 }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <Select label="Timings for" value={day} onChange={setDay} options={[['-1', 'All days (usual timings)'], ...DAYS.map((d, i): [string, string] => [String(i), `${d} only${bell.overrides[String(i)] ? ' · different' : ''}`])]} />
        {override && canWrite ? <Button busy={busy === 'reset'} onClick={reset}>Use usual timings</Button> : null}
      </div>
      {day !== '-1' && !bell.configured ? <div className="alert warn">Save the usual timings for all days first. Then you can set a different day, such as a short Saturday.</div> : null}
      {!slots.length ? <Empty title="No periods yet">Add your first period below.</Empty> : (
        <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>{slots.map((s, i) => {
          if (s.kind === 'period') n += 1;
          return (
            <div key={i} className="item" style={{ flexWrap: 'wrap', padding: '10px 12px' }}>
              <b style={{ width: 28 }} className="num muted">{s.kind === 'period' ? n : '·'}</b>
              <input className="input grow" style={{ minWidth: 120 }} value={s.label} placeholder={s.kind === 'period' ? `Period ${n}` : 'Break'} onChange={(e) => change(i, { label: e.target.value })} aria-label={`Name of row ${i + 1}`} maxLength={30} disabled={!canWrite} />
              <input className="input" style={{ width: 130 }} type="time" value={s.start} onChange={(e) => change(i, { start: e.target.value })} aria-label={`Start of row ${i + 1}`} disabled={!canWrite} />
              <input className="input" style={{ width: 130 }} type="time" value={s.end} onChange={(e) => change(i, { end: e.target.value })} aria-label={`End of row ${i + 1}`} disabled={!canWrite} />
              {canWrite ? <IconButton icon="trash" danger label={`Remove row ${i + 1}`} onClick={() => { setSlots(slots.filter((_, x) => x !== i)); setDirty(true); }} /> : null}
            </div>
          );
        })}</div>
      )}
      {canWrite ? (
        <div className="spread">
          <div className="row"><Button kind="small" icon="plus" onClick={() => add('period')}>Add period</Button><Button kind="small" icon="plus" onClick={() => add('break')}>Add break</Button></div>
          <div className="row">{dirty && problem ? <span className="small" style={{ color: 'var(--bad)' }} role="alert">{problem}</span> : null}
            <Button kind="primary" busy={busy === 'save'} disabled={!dirty || !!problem} onClick={save}>Save timings</Button></div>
        </div>
      ) : null}
    </section>
  );
}


