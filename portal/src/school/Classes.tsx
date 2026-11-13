import { useMemo, useState } from 'react';
import { api } from '../api';
import { Drawer, IconButton, RowActions, Tabs, useAct, useConfirm } from '../kit';
import { Button, Empty, ErrorBox, Loading, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass, type Person, type Subject } from './ctx';

type Assignment = { id: number; teacher_id: number; class_id: number; subject_id: number; teacher_name: string; class_name: string; subject_name: string };
type Tab = 'classes' | 'subjects' | 'teachers';

export function Classes() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<Tab>('classes');
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const teachers = useLoad(() => api<Person[]>('/users', { query: { role: 'teacher' } }), []);
  const asg = useLoad(() => api<Assignment[]>('/assignments'), []);
  const [editClass, setEditClass] = useState<Klass | 'new' | null>(null);
  const [editSubject, setEditSubject] = useState<Subject | 'new' | null>(null);
  const [addAsg, setAddAsg] = useState(false);
  const confirm = useConfirm();
  const { act } = useAct();
  const tName = useMemo(() => new Map((teachers.data ?? []).map((t) => [t.id, t.name])), [teachers.data]);
  const byClass = useMemo(() => {
    const m = new Map<number, Assignment[]>();
    for (const a of asg.data ?? []) m.set(a.class_id, [...(m.get(a.class_id) ?? []), a]);
    return m;
  }, [asg.data]);

  async function removeClass(c: Klass) {
    if (!(await confirm({ title: `Archive class ${c.name}?`, body: 'Its timetable and subject teachers are hidden. Attendance and marks history are kept, and you can restore the class from Settings → Archive.', confirm: 'Archive', danger: true }))) return;
    if (await act('rm', () => api(`/classes/${c.id}`, { method: 'DELETE' }), `Class ${c.name} archived`)) { classes.reload(); asg.reload(); }
  }
  async function removeSubject(s: Subject) {
    const u = await act('use', () => api<{ assignments: number; timetable: number; marks: number; posts: number }>(`/subjects/${s.id}/usage`));
    if (!u) return;
    const used = [u.assignments && `${u.assignments} subject teachers`, u.timetable && `${u.timetable} timetable periods`, u.marks && `${u.marks} marks`, u.posts && `${u.posts} homework posts`].filter(Boolean).join(', ');
    if (!(await confirm({ title: `Archive ${s.name}?`, body: used ? `${s.name} is used in ${used}. They are hidden, not deleted, and come back if you restore the subject.` : 'This subject is not used anywhere yet.', confirm: 'Archive', danger: true }))) return;
    if (await act('rm', () => api(`/subjects/${s.id}`, { method: 'DELETE' }), `${s.name} archived`)) { subjects.reload(); asg.reload(); }
  }
  async function removeAsg(a: Assignment) {
    if (await act('rm', () => api(`/assignments/${a.id}`, { method: 'DELETE' }), `${a.teacher_name} no longer teaches ${a.subject_name} in ${a.class_name}`)) asg.reload();
  }

  const err = classes.error ?? subjects.error ?? asg.error;
  return (
    <>
      <PageHead title="Classes & subjects" sub="Sections, the subjects you teach, and who teaches what">
        {canWrite && tab === 'classes' ? <Button kind="primary" icon="plus" onClick={() => setEditClass('new')}>Add class</Button> : null}
        {canWrite && tab === 'subjects' ? <Button kind="primary" icon="plus" onClick={() => setEditSubject('new')}>Add subject</Button> : null}
        {canWrite && tab === 'teachers' ? <Button kind="primary" icon="plus" onClick={() => setAddAsg(true)}>Assign a teacher</Button> : null}
      </PageHead>
      <ReadOnlyNote />
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'classes', label: 'Classes' }, { id: 'subjects', label: 'Subjects' }, { id: 'teachers', label: 'Subject teachers' }]} />
      {err ? <ErrorBox message={err} onRetry={() => { classes.reload(); subjects.reload(); asg.reload(); }} /> : null}

      {tab === 'classes' ? (!classes.data ? <Loading /> : !classes.data.length ? <div className="card"><Empty title="No classes yet">Add your first class, for example 6-A.</Empty></div> : (
        <div className="grid g3">{classes.data.map((c) => (
          <div key={c.id} className="tile">
            <div className="spread"><h2>{c.name}</h2>{canWrite ? <RowActions><IconButton icon="edit" label={`Edit class ${c.name}`} onClick={() => setEditClass(c)} /><IconButton icon="trash" danger label={`Archive class ${c.name}`} onClick={() => removeClass(c)} /></RowActions> : null}</div>
            <div className="kpi"><div><span>Students</span><b>{c.student_count}</b></div><div><span>Subjects</span><b>{byClass.get(c.id)?.length ?? 0}</b></div></div>
            <p className="small muted">Class teacher: {c.class_teacher_id ? tName.get(c.class_teacher_id) ?? '…' : 'not set'}</p>
          </div>
        ))}</div>
      )) : null}

      {tab === 'subjects' ? (!subjects.data ? <Loading /> : !subjects.data.length ? <div className="card"><Empty title="No subjects yet">Add the subjects your school teaches.</Empty></div> : (
        <section className="card flush"><div className="list">{subjects.data.map((s) => (
          <div key={s.id} className="item"><b className="grow">{s.name}</b><span className="muted small">{(asg.data ?? []).filter((a) => a.subject_id === s.id).length} classes</span>
            {canWrite ? <RowActions><IconButton icon="edit" label={`Rename ${s.name}`} onClick={() => setEditSubject(s)} /><IconButton icon="trash" danger label={`Archive ${s.name}`} onClick={() => removeSubject(s)} /></RowActions> : null}</div>
        ))}</div></section>
      )) : null}

      {tab === 'teachers' ? (!asg.data || !classes.data ? <Loading /> : !asg.data.length ? <div className="card"><Empty title="No subject teachers yet">Assign a teacher to a subject in a class. Teachers can then mark attendance, enter marks and post homework for it.</Empty></div> : (
        <div className="grid g2">{classes.data.filter((c) => byClass.has(c.id)).map((c) => (
          <section key={c.id} className="card flush"><h2 style={{ padding: '14px 18px 6px' }}>{c.name}</h2>
            <div className="list">{byClass.get(c.id)!.map((a) => (
              <div key={a.id} className="item"><div className="grow"><b>{a.subject_name}</b><div className="small muted">{a.teacher_name}</div></div>
                {canWrite ? <IconButton icon="trash" danger label={`Remove ${a.teacher_name} from ${a.subject_name} in ${a.class_name}`} onClick={() => removeAsg(a)} /> : null}</div>
            ))}</div>
          </section>
        ))}</div>
      )) : null}

      {editClass ? <ClassForm klass={editClass === 'new' ? null : editClass} teachers={teachers.data ?? []} onClose={() => setEditClass(null)} onSaved={() => { setEditClass(null); classes.reload(); }} /> : null}
      {editSubject ? <SubjectForm subject={editSubject === 'new' ? null : editSubject} onClose={() => setEditSubject(null)} onSaved={() => { setEditSubject(null); subjects.reload(); asg.reload(); }} /> : null}
      {addAsg ? <AssignForm classes={classes.data ?? []} subjects={subjects.data ?? []} teachers={teachers.data ?? []} onClose={() => setAddAsg(false)} onSaved={() => asg.reload()} /> : null}
    </>
  );
}

function ClassForm({ klass, teachers, onClose, onSaved }: { klass: Klass | null; teachers: Person[]; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [name, setName] = useState(klass?.name ?? '');
  const [teacher, setTeacher] = useState(klass?.class_teacher_id ? String(klass.class_teacher_id) : '');
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr('Give the class a name, for example 6-A'); return; }
    const body = { name: name.trim(), class_teacher_id: teacher ? Number(teacher) : null };
    if (await act('save', () => (klass ? api(`/classes/${klass.id}`, { method: 'PUT', body }) : api('/classes', { body })), klass ? 'Class saved' : `Class ${body.name} added`)) onSaved();
  }
  return (
    <Drawer title={klass ? `Edit class ${klass.name}` : 'Add class'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="class-form" busy={busy === 'save'}>{klass ? 'Save changes' : 'Add class'}</Button></>}>
      <form id="class-form" className="stack" onSubmit={save} noValidate>
        <Text label="Class name" value={name} onChange={(v) => { setName(v); setErr(null); }} error={err} maxLength={40} placeholder="6-A" />
        <Select label="Class teacher" value={teacher} onChange={setTeacher} options={[['', 'Not set'], ...teachers.map((t): [string, string] => [String(t.id), t.name])]} hint="The class teacher marks daily attendance for this class." />
      </form>
    </Drawer>
  );
}

function SubjectForm({ subject, onClose, onSaved }: { subject: Subject | null; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [name, setName] = useState(subject?.name ?? '');
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr('Enter the subject name'); return; }
    const body = { name: name.trim() };
    if (await act('save', () => (subject ? api(`/subjects/${subject.id}`, { method: 'PUT', body }) : api('/subjects', { body })), subject ? 'Subject renamed' : `${body.name} added`)) onSaved();
  }
  return (
    <Drawer title={subject ? `Rename ${subject.name}` : 'Add subject'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="subject-form" busy={busy === 'save'}>{subject ? 'Save changes' : 'Add subject'}</Button></>}>
      <form id="subject-form" className="stack" onSubmit={save} noValidate><Text label="Subject name" value={name} onChange={(v) => { setName(v); setErr(null); }} error={err} maxLength={60} placeholder="Mathematics" /></form>
    </Drawer>
  );
}

function AssignForm({ classes, subjects, teachers, onClose, onSaved }: { classes: Klass[]; subjects: Subject[]; teachers: Person[]; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [c, setC] = useState(''); const [s, setS] = useState(''); const [t, setT] = useState('');
  const pick = (list: { id: number; name: string }[], first: string): [string, string][] => [['', first], ...list.map((x): [string, string] => [String(x.id), x.name])];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const done = await act('save', () => api('/assignments', { body: { class_id: Number(c), subject_id: Number(s), teacher_id: Number(t) } }), 'Teacher assigned');
    if (done) { onSaved(); setS(''); }                 // stay open: usually several subjects are assigned in a row
  }
  return (
    <Drawer title="Assign a teacher" sub="One teacher per subject in each class. Assigning again replaces the earlier teacher." onClose={onClose}
      footer={<><Button onClick={onClose}>Done</Button><Button kind="primary" type="submit" form="asg-form" busy={busy === 'save'} disabled={!c || !s || !t}>Assign</Button></>}>
      <form id="asg-form" className="stack" onSubmit={save}>
        <Select label="Class" value={c} onChange={setC} options={pick(classes, 'Pick a class')} />
        <Select label="Subject" value={s} onChange={setS} options={pick(subjects, 'Pick a subject')} />
        <Select label="Teacher" value={t} onChange={setT} options={pick(teachers, 'Pick a teacher')} />
      </form>
    </Drawer>
  );
}
