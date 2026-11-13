import { useState } from 'react';
import { api } from '../api';
import { Chips, Drawer, IconButton, Switch, Tabs, TextArea, useAct, useConfirm } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtDateTime, fmtMoney, Loading, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass } from './ctx';

type Poll = { id: number; kind: 'poll' | 'consent'; title: string; description: string; options: string[]; multi: boolean; audience: string[]; class_ids: number[]; deadline: string | null; amount: number | null;
  closed: boolean; open: boolean; created_by_name: string; created_at: string; eligible: number; responded: number; counts: number[] };
type Results = Poll & { answered: { user_id: number; name: string; student_name: string | null; class_name: string | null; answer: string; comment: string; at: string }[]; pending: { user_id: number; name: string; student_name: string | null; class_name: string | null }[] };
const AUD: { id: string; label: string }[] = [{ id: 'parent', label: 'Parents' }, { id: 'student', label: 'Students' }, { id: 'teacher', label: 'Teachers' }];

export function Polls() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const list = useLoad(() => api<Poll[]>('/polls'), []);
  const [add, setAdd] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <PageHead title="Polls & consent forms" sub="Ask parents, students or teachers a question and see who has answered">
        {canWrite ? <Button kind="primary" icon="plus" onClick={() => setAdd(true)}>New poll or form</Button> : null}
      </PageHead>
      <ReadOnlyNote />
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !list.data.length ? <div className="card"><Empty title="Nothing asked yet">Use a consent form for trips and events (Yes or No), or a poll to choose between options.</Empty></div> : (
        <div className="grid g2">{list.data.map((p) => {
          const top = Math.max(1, ...p.counts);
          return (
            <section key={p.id} className="card stack">
              <div className="spread"><h2>{p.title}</h2><Badge status={p.open ? 'active' : 'suspended'}>{p.open ? 'Open' : 'Closed'}</Badge></div>
              <p className="small muted">{p.kind === 'consent' ? 'Consent form' : 'Poll'} · {p.audience.map((a) => AUD.find((x) => x.id === a)?.label ?? a).join(', ')}{p.deadline ? ` · answer by ${fmtDate(p.deadline)}` : ''}{p.amount ? ` · ${fmtMoney(p.amount)}` : ''}</p>
              <div className="stack" style={{ gap: 6 }}>{p.options.map((o, i) => (
                <div key={i} className="pollbar"><div className="track"><div className="fill" style={{ width: `${(100 * (p.counts[i] ?? 0)) / top}%` }} /><div className="lbl"><span>{o}</span><span className="num">{p.counts[i] ?? 0}</span></div></div></div>
              ))}</div>
              <div className="spread"><span className="small muted">{p.responded} of {p.eligible} answered</span><Button kind="small" onClick={() => setOpen(p.id)} aria-label={`See answers to ${p.title}`}>See answers</Button></div>
            </section>
          );
        })}</div>
      )}
      {add ? <PollForm onClose={() => setAdd(false)} onSaved={() => { setAdd(false); list.reload(); }} /> : null}
      {open ? <ResultsView id={open} canWrite={canWrite} onClose={() => setOpen(null)} onChanged={() => list.reload()} /> : null}
    </>
  );
}

function ResultsView({ id, canWrite, onClose, onChanged }: { id: number; canWrite: boolean; onClose: () => void; onChanged: () => void }) {
  const r = useLoad(() => api<Results>(`/polls/${id}/results`), [id]);
  const [tab, setTab] = useState<'answered' | 'pending'>('answered');
  const confirm = useConfirm();
  const { act, busy } = useAct();
  const x = r.data;
  async function close() {
    if (!(await confirm({ title: 'Close this now?', body: 'Nobody can answer or change their answer after it is closed.', confirm: 'Close' }))) return;
    if (await act('close', () => api(`/polls/${id}/close`, { method: 'POST' }), 'Closed')) { r.reload(); onChanged(); }
  }
  async function remove() {
    if (!(await confirm({ title: 'Remove this?', body: 'It disappears from the app. The answers are kept and come back if you restore it from Settings → Archive.', confirm: 'Remove', danger: true }))) return;
    if (await act('rm', () => api(`/polls/${id}`, { method: 'DELETE' }), 'Removed')) { onChanged(); onClose(); }
  }
  function download() {
    if (!x) return;
    const cell = (v: string) => { let s = v ?? ''; if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [['Name', 'Student', 'Class', 'Answer', 'Comment'], ...x.answered.map((a) => [a.name, a.student_name ?? '', a.class_name ?? '', a.answer, a.comment]), ...x.pending.map((a) => [a.name, a.student_name ?? '', a.class_name ?? '', 'Not answered yet', ''])];
    const url = URL.createObjectURL(new Blob(['\ufeff', lines.map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'answers.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const who = (n: { name: string; student_name: string | null; class_name: string | null }) => `${n.name}${n.student_name ? ` · for ${n.student_name}` : ''}${n.class_name ? ` (${n.class_name})` : ''}`;
  return (
    <Drawer wide title={x?.title ?? 'Answers'} sub={x ? `${x.responded} of ${x.eligible} answered` : undefined} onClose={onClose}
      footer={x ? <>{canWrite ? <><Button kind="danger" busy={busy === 'rm'} onClick={remove}>Remove</Button>{x.open ? <Button busy={busy === 'close'} onClick={close}>Close now</Button> : null}</> : null}<Button icon="download" onClick={download}>Download answers</Button></> : undefined}>
      {r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : !x ? <Loading rows={5} /> : (
        <>
          {x.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{x.description}</p> : null}
          <Tabs label="Answers" value={tab} onChange={setTab} tabs={[{ id: 'answered', label: `Answered (${x.answered.length})` }, { id: 'pending', label: `Not yet (${x.pending.length})` }]} />
          {tab === 'answered' ? (x.answered.length ? <div className="list">{x.answered.map((a, i) => (
            <div key={i} className="item" style={{ padding: '10px 0' }}><div className="grow"><b>{who(a)}</b>{a.comment ? <div className="small muted">"{a.comment}"</div> : null}<div className="small muted">{fmtDateTime(a.at)}</div></div><Badge status={a.answer === 'No' ? 'expired' : 'active'}>{a.answer}</Badge></div>
          ))}</div> : <Empty title="No answers yet" />) : (x.pending.length ? <div className="list">{x.pending.map((a, i) => <div key={i} className="item" style={{ padding: '10px 0' }}>{who(a)}</div>)}</div> : <Empty title="Everyone has answered" />)}
        </>
      )}
    </Drawer>
  );
}

function PollForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const { act, busy } = useAct();
  const [kind, setKind] = useState('consent'); const [title, setTitle] = useState(''); const [desc, setDesc] = useState(''); const [options, setOptions] = useState(['', '']); const [multi, setMulti] = useState(false);
  const [audience, setAudience] = useState<string[]>(['parent']); const [classIds, setClassIds] = useState<number[]>([]); const [deadline, setDeadline] = useState(''); const [amount, setAmount] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    const bad: Record<string, string> = {};
    if (!title.trim()) bad.title = 'Write the question';
    if (kind === 'poll' && opts.length < 2) bad.options = 'A poll needs at least 2 choices';
    if (!audience.length) bad.audience = 'Choose who should answer';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const body = { kind, title: title.trim(), description: desc.trim(), options: kind === 'poll' ? opts : [], multi: kind === 'poll' && multi, audience, class_ids: classIds, deadline: deadline || null, amount: kind === 'consent' && amount ? Number(amount) : null };
    if (await act('save', () => api('/polls', { body }), kind === 'consent' ? 'Consent form sent' : 'Poll sent')) onSaved();
  }
  return (
    <Drawer title="New poll or consent form" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="poll-form" busy={busy === 'save'}>Send</Button></>}>
      <form id="poll-form" className="stack" onSubmit={save} noValidate>
        <Select label="Type" value={kind} onChange={setKind} options={[['consent', 'Consent form (Yes or No)'], ['poll', 'Poll (choose from options)']]} />
        <Text label={kind === 'consent' ? 'What are you asking permission for?' : 'Question'} value={title} onChange={setTitle} error={err.title} maxLength={200} placeholder={kind === 'consent' ? 'Science museum trip on 12 December' : 'Which day suits you for the parent meeting?'} />
        <TextArea label="Details (optional)" value={desc} onChange={setDesc} maxLength={2000} />
        {kind === 'poll' ? (
          <fieldset><legend>Choices</legend>
            {options.map((o, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}><input className="input" value={o} onChange={(e) => setOptions(options.map((x, n) => (n === i ? e.target.value : x)))} aria-label={`Choice ${i + 1}`} maxLength={120} placeholder={`Choice ${i + 1}`} />
                <IconButton icon="trash" danger label={`Remove choice ${i + 1}`} disabled={options.length <= 2} onClick={() => setOptions(options.filter((_, n) => n !== i))} /></div>
            ))}
            {err.options ? <span className="field"><span className="err" role="alert">{err.options}</span></span> : null}
            <div><Button kind="small" icon="plus" disabled={options.length >= 10} onClick={() => setOptions([...options, ''])}>Add choice</Button></div>
            <Switch label="Allow more than one choice" checked={multi} onChange={setMulti} />
          </fieldset>
        ) : <Text label="Amount to pay, if any (₹)" value={amount} onChange={(v) => setAmount(v.replace(/[^\d.]/g, ''))} inputMode="decimal" hint="Shown on the form. Collect it from Fees." />}
        <div><Chips label="Who should answer" options={AUD} value={audience} onChange={setAudience} />{err.audience ? <span className="field"><span className="err" role="alert">{err.audience}</span></span> : null}</div>
        <Chips label="Only these classes (none selected = whole school)" options={(classes.data ?? []).map((c) => ({ id: c.id, label: c.name }))} value={classIds} onChange={setClassIds} />
        <Text label="Answer by (optional)" type="date" value={deadline} onChange={setDeadline} />
      </form>
    </Drawer>
  );
}
