import { useState } from 'react';
import { api } from '../api';
import { Drawer, IconButton, RowActions, Tabs, TextArea, useAct, useConfirm } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtDateTime, Loading, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass, type Subject } from './ctx';

type Post = { id: number; kind: 'notice' | 'homework'; title: string; body: string; class_id: number | null; subject_id: number | null; due_date: string | null; created_at: string; author_name: string; class_name: string | null; subject_name: string | null };

export function Notices() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [kind, setKind] = useState<'notice' | 'homework'>('notice');
  const [classId, setClassId] = useState('');
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const subjects = useLoad(() => api<Subject[]>('/subjects'), []);
  const posts = useLoad(() => api<Post[]>('/posts', { query: { kind, class_id: classId } }), [kind, classId]);
  const [edit, setEdit] = useState<Post | 'new' | null>(null);
  const confirm = useConfirm();
  const { act } = useAct();
  async function remove(p: Post) {
    if (!(await confirm({ title: `Remove "${p.title}"?`, body: 'It disappears from the app for everyone. You can restore it from Settings → Archive.', confirm: 'Remove', danger: true }))) return;
    if (await act('rm', () => api(`/posts/${p.id}`, { method: 'DELETE' }), 'Removed')) posts.reload();
  }
  return (
    <>
      <PageHead title="Notices & homework" sub="What you post here appears in the app for students, parents and teachers">
        {canWrite ? <Button kind="primary" icon="plus" onClick={() => setEdit('new')}>{kind === 'notice' ? 'New notice' : 'New homework'}</Button> : null}
      </PageHead>
      <ReadOnlyNote />
      <Tabs label="Type" value={kind} onChange={setKind} tabs={[{ id: 'notice', label: 'Notices' }, { id: 'homework', label: 'Homework' }]} />
      <div className="toolbar"><Select label="Class" value={classId} onChange={setClassId} options={[['', 'All classes'], ...(classes.data ?? []).map((c): [string, string] => [String(c.id), c.name])]} /></div>
      {posts.error ? <ErrorBox message={posts.error} onRetry={posts.reload} /> : !posts.data ? <Loading /> : !posts.data.length ? <div className="card"><Empty title={kind === 'notice' ? 'No notices yet' : 'No homework yet'}>{kind === 'notice' ? 'Post a notice to the whole school or to one class.' : 'Teachers post homework from the app. You can add it here too.'}</Empty></div> : (
        <div className="stack">{posts.data.map((p) => (
          <article key={p.id} className="card">
            <div className="spread"><h2>{p.title}</h2>{canWrite ? <RowActions><IconButton icon="edit" label={`Edit ${p.title}`} onClick={() => setEdit(p)} /><IconButton icon="trash" danger label={`Remove ${p.title}`} onClick={() => remove(p)} /></RowActions> : null}</div>
            <div className="row small muted" style={{ margin: '4px 0 8px' }}><Badge>{p.class_name ?? 'Whole school'}</Badge>{p.subject_name ? <Badge>{p.subject_name}</Badge> : null}{p.due_date ? <Badge status="trial">Due {fmtDate(p.due_date)}</Badge> : null}<span>{p.author_name} · {fmtDateTime(p.created_at)}</span></div>
            {p.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p> : null}
          </article>
        ))}</div>
      )}
      {edit ? <PostForm kind={kind} post={edit === 'new' ? null : edit} classes={classes.data ?? []} subjects={subjects.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); posts.reload(); }} /> : null}
    </>
  );
}

function PostForm({ kind, post, classes, subjects, onClose, onSaved }: { kind: 'notice' | 'homework'; post: Post | null; classes: Klass[]; subjects: Subject[]; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [title, setTitle] = useState(post?.title ?? ''); const [body, setBody] = useState(post?.body ?? '');
  const [classId, setClassId] = useState(post?.class_id ? String(post.class_id) : ''); const [subjectId, setSubjectId] = useState(post?.subject_id ? String(post.subject_id) : ''); const [due, setDue] = useState(post?.due_date ?? '');
  const [err, setErr] = useState<Record<string, string>>({});
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (!title.trim()) bad.title = 'Add a title';
    if (kind === 'homework' && !classId) bad.class = 'Homework is for one class';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const data = { kind, title: title.trim(), body: body.trim(), class_id: classId ? Number(classId) : null, subject_id: kind === 'homework' && subjectId ? Number(subjectId) : null, due_date: kind === 'homework' && due ? due : null };
    if (await act('save', () => (post ? api(`/posts/${post.id}`, { method: 'PUT', body: data }) : api('/posts', { body: data })), post ? 'Saved' : kind === 'notice' ? 'Notice posted' : 'Homework posted')) onSaved();
  }
  const word = kind === 'notice' ? 'notice' : 'homework';
  return (
    <Drawer title={post ? `Edit ${word}` : `New ${word}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="post-form" busy={busy === 'save'}>{post ? 'Save changes' : `Post ${word}`}</Button></>}>
      <form id="post-form" className="stack" onSubmit={save} noValidate>
        <Text label="Title" value={title} onChange={setTitle} error={err.title} maxLength={160} />
        <TextArea label="Details" value={body} onChange={setBody} maxLength={4000} rows={6} />
        <Select label={kind === 'notice' ? 'Who sees it' : 'Class'} value={classId} onChange={setClassId} error={err.class} options={[['', kind === 'notice' ? 'Whole school' : 'Pick a class'], ...classes.map((c): [string, string] => [String(c.id), c.name])]} />
        {kind === 'homework' ? <div className="cols"><Select label="Subject" value={subjectId} onChange={setSubjectId} options={[['', 'No subject'], ...subjects.map((s): [string, string] => [String(s.id), s.name])]} /><Text label="Due on" type="date" value={due} onChange={setDue} /></div> : null}
      </form>
    </Drawer>
  );
}
