import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Drawer, IconButton, RowActions, Tabs, today, useAct, useConfirm } from '../kit';
import { Button, Empty, ErrorBox, fmtDate, Loading, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass, type Subject } from './ctx';

type Exam = { id: number; name: string; date: string; max_marks: number; mark_count: number };
type MarkRow = { student_id: number; name: string; roll_no: number | null; score: number | null };

export function Exams() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<'exams' | 'marks'>('exams');
  const exams = useLoad(() => api<Exam[]>('/exams'), []);
  const [edit, setEdit] = useState<Exam | 'new' | null>(null);
  const [marksFor, setMarksFor] = useState('');
  const confirm = useConfirm();
  const { act } = useAct();
  async function remove(e: Exam) {
    if (!(await confirm({ title: `Archive ${e.name}?`, body: e.mark_count ? `${e.mark_count} marks are entered for this exam. They are hidden from students and parents, and come back if you restore it from Settings → Archive.` : 'No marks are entered for this exam yet.', confirm: 'Archive', danger: true }))) return;
    if (await act('rm', () => api(`/exams/${e.id}`, { method: 'DELETE' }), `${e.name} archived`)) exams.reload();
  }
  return (
    <>
      <PageHead title="Exams & marks" sub="Create exams, then enter or correct marks subject by subject">
        {canWrite && tab === 'exams' ? <Button kind="primary" icon="plus" onClick={() => setEdit('new')}>Add exam</Button> : null}
      </PageHead>
      <ReadOnlyNote />
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'exams', label: 'Exams' }, { id: 'marks', label: 'Enter marks' }]} />
      {exams.error ? <ErrorBox message={exams.error} onRetry={exams.reload} /> : !exams.data ? <Loading /> : tab === 'exams' ? (
        !exams.data.length ? <div className="card"><Empty title="No exams yet">Add an exam such as Unit Test 1 to start entering marks.</Empty></div> : (
          <section className="card flush"><div className="tablewrap"><table className="t">
            <thead><tr><th>Exam</th><th>Date</th><th className="right">Max marks</th><th className="right">Marks entered</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>{exams.data.map((e) => (
              <tr key={e.id}><td className="primary-cell"><b>{e.name}</b></td><td data-label="Date">{fmtDate(e.date)}</td><td data-label="Max marks" className="right num">{e.max_marks}</td><td data-label="Marks entered" className="right num">{e.mark_count}</td>
                <td className="plain"><RowActions><Button kind="small" onClick={() => { setMarksFor(String(e.id)); setTab('marks'); }}>{canWrite ? 'Enter marks' : 'See marks'}</Button>
                  {canWrite ? <><IconButton icon="edit" label={`Edit ${e.name}`} onClick={() => setEdit(e)} /><IconButton icon="trash" danger label={`Archive ${e.name}`} onClick={() => remove(e)} /></> : null}</RowActions></td></tr>
            ))}</tbody></table></div></section>
        )
      ) : <Marks exams={exams.data} examId={marksFor} setExamId={setMarksFor} canWrite={canWrite} onSaved={exams.reload} />}
      {edit ? <ExamForm exam={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); exams.reload(); }} /> : null}
    </>
  );
}

function ExamForm({ exam, onClose, onSaved }: { exam: Exam | null; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [name, setName] = useState(exam?.name ?? '');
  const [date, setDate] = useState(exam?.date ?? today());
  const [max, setMax] = useState(String(exam?.max_marks ?? 100));
  const [err, setErr] = useState<Record<string, string>>({});
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (!name.trim()) bad.name = 'Give the exam a name';
    if (!date) bad.date = 'Pick the exam date';
    if (!(Number(max) > 0 && Number(max) <= 1000)) bad.max = 'Between 1 and 1000';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const body = { name: name.trim(), date, max_marks: Number(max) };
    if (await act('save', () => (exam ? api(`/exams/${exam.id}`, { method: 'PUT', body }) : api('/exams', { body })), exam ? 'Exam saved' : `${body.name} added`)) onSaved();
  }
  return (
    <Drawer title={exam ? `Edit ${exam.name}` : 'Add exam'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="exam-form" busy={busy === 'save'}>{exam ? 'Save changes' : 'Add exam'}</Button></>}>
      <form id="exam-form" className="stack" onSubmit={save} noValidate>
        <Text label="Exam name" value={name} onChange={setName} error={err.name} maxLength={80} placeholder="Unit Test 1" />
        <div className="cols"><Text label="Date" type="date" value={date} onChange={setDate} error={err.date} />
          <Text label="Max marks per subject" value={max} onChange={(v) => setMax(v.replace(/[^\d.]/g, ''))} inputMode="decimal" error={err.max} hint={exam?.mark_count ? 'Lowering this is refused if a mark already entered is higher.' : undefined} /></div>
      </form>
    </Drawer>
  );
}

function Marks({ exams, examId, setExamId, canWrite, onSaved }: { exams: Exam[]; examId: string; setExamId: (v: string) => void; canWrite: boolean; onSaved: () => void }) {
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  useEffect(() => { if (!examId && exams[0]) setExamId(String(exams[0].id)); }, [examId, exams, setExamId]);
  useEffect(() => { if (!classId && classes.data?.[0]) setClassId(String(classes.data[0].id)); }, [classId, classes.data]);
  useEffect(() => { if (!subjectId && subjects.data?.[0]) setSubjectId(String(subjects.data[0].id)); }, [subjectId, subjects.data]);
  const ready = examId && classId && subjectId;
  const rows = useLoad(() => (ready ? api<MarkRow[]>('/marks', { query: { exam_id: examId, class_id: classId, subject_id: subjectId } }) : Promise.resolve(null)), [examId, classId, subjectId]);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState(false);
  const { act, busy } = useAct();
  useEffect(() => { setScores(Object.fromEntries((rows.data ?? []).map((r) => [r.student_id, r.score === null ? '' : String(r.score)]))); setDirty(false); }, [rows.data]);
  const exam = exams.find((e) => String(e.id) === examId);
  const max = exam?.max_marks ?? 100;
  const bad = (v: string) => v !== '' && (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) > max);
  const invalid = useMemo(() => Object.values(scores).filter(bad).length, [scores, max]);   // eslint-disable-line react-hooks/exhaustive-deps
  const entered = Object.values(scores).filter((v) => v !== '').length;
  const avg = useMemo(() => { const n = Object.values(scores).filter((v) => v !== '' && !bad(v)).map(Number); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; }, [scores, max]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const records = Object.entries(scores).filter(([, v]) => v !== '').map(([id, v]) => ({ student_id: Number(id), score: Number(v) }));
    if (!records.length) return;
    if (await act('save', () => api('/marks', { body: { exam_id: Number(examId), class_id: Number(classId), subject_id: Number(subjectId), records } }), `Marks saved for ${records.length} students`)) { rows.reload(); onSaved(); }
  }
  const pick = (l: { id: number; name: string }[]) => l.map((x): [string, string] => [String(x.id), x.name]);
  if (!exams.length) return <div className="card"><Empty title="Add an exam first">Marks are entered against an exam.</Empty></div>;
  return (
    <>
      <div className="toolbar"><Select label="Exam" value={examId} onChange={setExamId} options={pick(exams)} /><Select label="Class" value={classId} onChange={setClassId} options={pick(classes.data ?? [])} /><Select label="Subject" value={subjectId} onChange={setSubjectId} options={pick(subjects.data ?? [])} /></div>
      {rows.error ? <ErrorBox message={rows.error} onRetry={rows.reload} /> : !rows.data ? <Loading rows={6} /> : !rows.data.length ? <div className="card"><Empty title="No students in this class" /></div> : (
        <section className="card flush">
          <div className="tablewrap"><table className="t"><thead><tr><th style={{ width: 80 }}>Roll no.</th><th>Student</th><th className="right">Marks out of {max}</th></tr></thead>
            <tbody>{rows.data.map((r) => (
              <tr key={r.student_id}><td data-label="Roll no." className="num">{r.roll_no ?? '—'}</td><td className="primary-cell"><b>{r.name}</b></td>
                <td className="right plain"><input className="input score num" inputMode="decimal" value={scores[r.student_id] ?? ''} disabled={!canWrite} aria-label={`Marks for ${r.name}`} aria-invalid={bad(scores[r.student_id] ?? '') || undefined}
                  onChange={(e) => { setScores((s) => ({ ...s, [r.student_id]: e.target.value.trim() })); setDirty(true); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { const all = Array.from(document.querySelectorAll<HTMLInputElement>('input.score')); all[all.indexOf(e.currentTarget) + 1]?.focus(); } }} /></td></tr>
            ))}</tbody></table></div>
          <div className="savebar">
            <span className="small muted">{entered} of {rows.data.length} entered{avg !== null ? ` · class average ${avg.toFixed(1)}` : ''}{invalid ? <b style={{ color: 'var(--bad)' }}> · {invalid} not valid (0 to {max})</b> : null}</span>
            {canWrite ? <Button kind="primary" busy={busy === 'save'} disabled={!dirty || !!invalid || !entered} onClick={save}>Save marks</Button> : null}
          </div>
        </section>
      )}
    </>
  );
}
