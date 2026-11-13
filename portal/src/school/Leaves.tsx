import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar, Tabs, useAct } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtDateTime, Loading, Modal, PageHead, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool } from './ctx';

type Leave = { id: number; kind: string; user_name: string; class_name: string | null; applied_by_name: string; leave_type: string; start_date: string; end_date: string; half_day: boolean; days: number;
  reason: string; status: string; decided_by_name: string | null; decided_at: string | null; comment: string; created_at: string; can_decide: boolean };
type Today = { staff: { name: string; leave_type: string }[]; students: { name: string; class_name?: string; leave_type: string }[] };
type Tab = 'pending' | 'all' | 'quotas';
const TONE: Record<string, string> = { pending: 'trial', approved: 'active', rejected: 'expired', cancelled: 'suspended' };

export function Leaves() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<Tab>('pending');
  const pending = useLoad(() => api<Leave[]>('/leaves', { query: { scope: 'inbox', status: 'pending' } }), []);
  const all = useLoad(() => (tab === 'all' ? api<Leave[]>('/leaves', { query: { scope: 'inbox' } }) : Promise.resolve(null)), [tab]);
  const now = useLoad(() => api<Today>('/leaves/today'), []);
  const [decide, setDecide] = useState<{ leave: Leave; approve: boolean } | null>(null);
  const [comment, setComment] = useState('');
  const { act, busy } = useAct();
  async function submit() {
    if (!decide) return;
    const ok = await act('decide', () => api(`/leaves/${decide.leave.id}/decide`, { body: { approve: decide.approve, comment: comment.trim() } }), decide.approve ? `Leave approved for ${decide.leave.user_name}` : `Leave rejected for ${decide.leave.user_name}`);
    if (ok) { setDecide(null); setComment(''); pending.reload(); all.reload(); now.reload(); }
  }
  const card = (l: Leave) => (
    <div key={l.id} className="tile">
      <div className="spread"><div className="person"><Avatar name={l.user_name} /><div><b>{l.user_name}</b><small>{l.kind === 'student' ? `Student · ${l.class_name ?? ''}` : 'Staff'}{l.applied_by_name && l.applied_by_name !== l.user_name ? ` · asked by ${l.applied_by_name}` : ''}</small></div></div><Badge status={TONE[l.status]}>{l.status}</Badge></div>
      <p><b>{l.leave_type[0].toUpperCase() + l.leave_type.slice(1)} leave</b> · {fmtDate(l.start_date)}{l.end_date !== l.start_date ? ` to ${fmtDate(l.end_date)}` : ''} · {l.half_day ? 'half day' : `${l.days} ${l.days === 1 ? 'day' : 'days'}`}</p>
      {l.reason ? <p className="muted">{l.reason}</p> : null}
      {l.status !== 'pending' && l.decided_by_name ? <p className="small muted">{l.status === 'approved' ? 'Approved' : 'Decided'} by {l.decided_by_name} on {fmtDateTime(l.decided_at)}{l.comment ? ` · "${l.comment}"` : ''}</p> : null}
      {l.status === 'pending' && l.can_decide && canWrite ? <div className="row"><Button kind="primary small" onClick={() => setDecide({ leave: l, approve: true })}>Approve</Button><Button kind="small" onClick={() => setDecide({ leave: l, approve: false })}>Reject</Button></div> : null}
    </div>
  );
  const view = (x: typeof pending | typeof all, empty: string) => (x.error ? <ErrorBox message={x.error} onRetry={x.reload} /> : !x.data ? <Loading /> : !x.data.length ? <div className="card"><Empty title={empty} /></div> : <div className="grid g2">{x.data.map(card)}</div>);
  const away = (now.data?.staff.length ?? 0) + (now.data?.students.length ?? 0);
  return (
    <>
      <PageHead title="Leaves" sub="Approve leave requests from staff and parents, and set the yearly staff leave allowance" />
      <ReadOnlyNote />
      {now.data && away ? <div className="alert" style={{ marginBottom: 14 }}>On leave today: {[...now.data.staff.map((s) => s.name), ...now.data.students.map((s) => `${s.name}${s.class_name ? ` (${s.class_name})` : ''}`)].join(', ')}</div> : null}
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'pending', label: 'Waiting for you', count: pending.data?.length }, { id: 'all', label: 'All requests' }, { id: 'quotas', label: 'Staff leave allowance' }]} />
      {tab === 'pending' ? view(pending, 'No leave requests are waiting') : tab === 'all' ? view(all, 'No leave requests yet') : <Quotas canWrite={canWrite} />}
      {decide ? (
        <Modal title={`${decide.approve ? 'Approve' : 'Reject'} leave for ${decide.leave.user_name}?`} onClose={() => setDecide(null)}
          actions={<><Button onClick={() => setDecide(null)}>Back</Button><Button kind={decide.approve ? 'primary' : 'danger'} busy={busy === 'decide'} disabled={!decide.approve && comment.trim().length < 3} onClick={submit}>{decide.approve ? 'Approve leave' : 'Reject leave'}</Button></>}>
          <div className="stack" style={{ marginTop: 10 }}>
            {decide.approve && decide.leave.kind === 'student' ? <p className="muted">The student is shown as "on leave" in the attendance register for these days.</p> : null}
            <Text label={decide.approve ? 'Note (optional)' : 'Reason for rejecting'} value={comment} onChange={setComment} maxLength={500} />
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Quotas({ canWrite }: { canWrite: boolean }) {
  const q = useLoad(() => api<Record<string, number>>('/school/leave-quotas'), []);
  const [f, setF] = useState<Record<string, string>>({});
  const { act, busy } = useAct();
  useEffect(() => { if (q.data) setF(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, String(v)]))); }, [q.data]);
  if (q.error) return <ErrorBox message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Loading />;
  const bad = ['casual', 'sick', 'earned'].some((k) => f[k] === '' || Number(f[k]) > 365);
  const save = async (e: React.FormEvent) => { e.preventDefault(); const r = await act('save', () => api<Record<string, number>>('/school/leave-quotas', { method: 'PUT', body: { casual: Number(f.casual), sick: Number(f.sick), earned: Number(f.earned) } }), 'Leave allowance saved'); if (r) q.setData(r); };
  return (
    <form className="card stack" style={{ maxWidth: 560 }} onSubmit={save}>
      <h2>Days each staff member can take in a year</h2>
      <p className="muted small">The year runs from 1 April to 31 March. Staff see their balance in the app when they ask for leave.</p>
      <div className="cols">{(['casual', 'sick', 'earned'] as const).map((k) => (
        <Text key={k} label={`${k[0].toUpperCase() + k.slice(1)} leave`} value={f[k] ?? ''} onChange={(v) => setF({ ...f, [k]: v.replace(/\D/g, '').slice(0, 3) })} inputMode="numeric" disabled={!canWrite} error={Number(f[k]) > 365 ? 'At most 365' : null} />
      ))}</div>
      {canWrite ? <div><Button kind="primary" type="submit" busy={busy === 'save'} disabled={bad}>Save allowance</Button></div> : null}
    </form>
  );
}
