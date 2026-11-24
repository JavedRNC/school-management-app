// F40 · Which teachers can update student and parent details.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar, Chips, Drawer, Switch, useAct, useConfirm } from '../kit';
import { Button, Empty, ErrorBox, Loading, PageHead, Select, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass, type Person } from './ctx';

type Grant = { teacher_id: number; name: string; login_id: string; classes: 'all' | number[]; parents: boolean };
type Access = { class_teachers: boolean; class_teachers_parents: boolean; grants: Grant[] };

export function StudentAccess() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const access = useLoad(() => api<Access>('/student-access'), []);
  const teachers = useLoad(() => api<Person[]>('/users', { query: { role: 'teacher' } }), []);
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const [edit, setEdit] = useState<Grant | 'new' | null>(null);
  const { act, busy } = useAct();
  const confirm = useConfirm();

  const err = access.error || teachers.error || classes.error;
  if (err) return <><PageHead title="Student data access" /><ErrorBox message={err} onRetry={() => { access.reload(); teachers.reload(); classes.reload(); }} /></>;
  if (!access.data || !teachers.data || !classes.data) return <><PageHead title="Student data access" /><Loading /></>;
  const a = access.data;
  const cname = (id: number) => classes.data!.find((c) => c.id === id)?.name ?? '';
  const tname = (id: number | null) => teachers.data!.find((t) => t.id === id)?.name ?? '';
  const free = teachers.data.filter((t) => !a.grants.some((g) => g.teacher_id === t.id));

  const policy = async (body: { class_teachers: boolean; class_teachers_parents: boolean }, msg: string) => {
    const r = await act('policy', () => api<Access>('/student-access/policy', { method: 'PUT', body }), msg);
    if (r) access.setData(r);
  };
  const remove = async (g: Grant) => {
    if (!(await confirm({ title: `Remove access for ${g.name}?`, body: 'They will no longer be able to edit these students. A class teacher keeps their own class.', confirm: 'Remove access', danger: true }))) return;
    const r = await act(`rm${g.teacher_id}`, () => api<Access>(`/student-access/teachers/${g.teacher_id}`, { method: 'DELETE' }), `Access removed for ${g.name}`);
    if (r) access.setData(r);
  };

  return (
    <>
      <PageHead title="Student data access" sub="Let teachers update student and parent details from the app. Login IDs, passwords and classes always stay with you.">
        {canWrite && free.length ? <Button kind="primary" icon="plus" onClick={() => setEdit('new')}>Give a teacher access</Button> : null}
      </PageHead>
      <ReadOnlyNote />
      <div className="grid g2">
        <section className="card stack">
          <h2>Class teachers</h2>
          <Switch label="Class teachers can edit their own class" hint="Contact and profile details of the students in the class they lead" checked={a.class_teachers} disabled={!canWrite || busy === 'policy'}
            onChange={(v) => policy({ class_teachers: v, class_teachers_parents: v && a.class_teachers_parents }, v ? 'Class teachers can edit their class' : 'Class teachers can no longer edit students')} />
          <Switch label="… and their parents" hint="Parent name, mobile, email and address" checked={a.class_teachers && a.class_teachers_parents} disabled={!canWrite || !a.class_teachers || busy === 'policy'}
            onChange={(v) => policy({ class_teachers: true, class_teachers_parents: v }, v ? 'Class teachers can edit parent details' : 'Parent details: principal only')} />
          <div className="list">{classes.data.map((c) => (
            <div key={c.id} className="item"><div className="grow"><b>{c.name}</b><div className="small muted">{c.class_teacher_id ? tname(c.class_teacher_id) : 'No class teacher'}</div></div></div>
          ))}</div>
          <p className="small muted">When you change a class teacher in Classes, the old teacher loses access at once.</p>
        </section>
        <section className="card stack">
          <h2>Other teachers</h2>
          {!a.grants.length ? <Empty title="No extra access given">Give any teacher access to chosen classes, with or without parent details.</Empty> : (
            <div className="list">{a.grants.map((g) => (
              <div key={g.teacher_id} className="item">
                <Avatar name={g.name} />
                <div className="grow"><b>{g.name}</b><div className="small muted">{g.classes === 'all' ? 'All classes' : g.classes.map(cname).join(', ')}{g.parents ? ' · parent details too' : ''}</div></div>
                {canWrite ? <div className="row"><Button kind="small" onClick={() => setEdit(g)} aria-label={`Change access for ${g.name}`}>Change</Button>
                  <Button kind="small danger" busy={busy === `rm${g.teacher_id}`} onClick={() => remove(g)} aria-label={`Remove access for ${g.name}`}>Remove</Button></div> : null}
              </div>
            ))}</div>
          )}
          <p className="small muted">Every change a teacher makes is in Activity, with the old and new value.</p>
        </section>
      </div>
      {edit ? <GrantDrawer grant={edit === 'new' ? null : edit} teachers={edit === 'new' ? free : teachers.data} classes={classes.data}
        onClose={() => setEdit(null)} onSaved={(r) => { access.setData(r); setEdit(null); }} /> : null}
    </>
  );
}

function GrantDrawer({ grant, teachers, classes, onClose, onSaved }: { grant: Grant | null; teachers: Person[]; classes: Klass[]; onClose: () => void; onSaved: (a: Access) => void }) {
  const [tid, setTid] = useState(String(grant?.teacher_id ?? ''));
  const [all, setAll] = useState(grant?.classes === 'all');
  const [picked, setPicked] = useState<number[]>(grant && grant.classes !== 'all' ? grant.classes : []);
  const [parents, setParents] = useState(grant?.parents ?? false);
  const { act, busy } = useAct();
  useEffect(() => { if (!grant && !tid && teachers[0]) setTid(String(teachers[0].id)); }, [grant, tid, teachers]);
  const name = teachers.find((t) => String(t.id) === tid)?.name ?? 'teacher';
  const ok = tid && (all || picked.length);
  const save = async () => {
    const r = await act('save', () => api<Access>(`/student-access/teachers/${tid}`, { method: 'PUT', body: { classes: all ? 'all' : picked, parents } }), `Access saved for ${name}`);
    if (r) onSaved(r);
  };
  return (
    <Drawer title={grant ? `Access for ${grant.name}` : 'Give a teacher access'} sub="They will see these students in the app under My students" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'save'} disabled={!ok} onClick={save}>Save access</Button></>}>
      <div className="stack">
        {!grant ? <Select label="Teacher" value={tid} onChange={setTid} options={teachers.map((t) => [String(t.id), `${t.name} (${t.login_id})`] as [string, string])} /> : null}
        <Switch label="All classes" hint="Including classes added later" checked={all} onChange={setAll} />
        {!all ? <Chips label="Classes they can edit" options={classes.map((c) => ({ id: c.id, label: c.name }))} value={picked} onChange={setPicked} /> : null}
        <Switch label="Parent details too" hint="Name, mobile, email and address of these students' parents" checked={parents} onChange={setParents} />
      </div>
    </Drawer>
  );
}
