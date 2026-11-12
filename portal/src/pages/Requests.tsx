import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Paged, type RequestDetail, type RequestRow } from '../api';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtDateTime, fmtInt, Loading, Modal, PageHead, Pager, Select, STATUS_LABEL, Text, useDebounced, useLoad, useToast } from '../ui';

const FLOW = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'ONBOARDED'];
const OPTIONS: [string, string][] = [['', 'Any status'], ...Object.entries(STATUS_LABEL)];

export function Requests() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounced(q);
  const status = sp.get('status') ?? '';
  const from = sp.get('from') ?? '';
  const to = sp.get('to') ?? '';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };
  useEffect(() => { if ((sp.get('q') ?? '') !== dq) set({ q: dq, page: '' }); /* eslint-disable-next-line */ }, [dq]);
  const { data, error, loading, reload } = useLoad(
    () => api<Paged<RequestRow>>('/admin/onboarding', { query: { q: dq, status, date_from: from, date_to: to, page, size: 20 } }), [dq, status, from, to, page]);
  const filtered = !!(dq || status || from || to);

  return (
    <>
      <PageHead title="School onboarding requests" sub="Requests sent from the website and from the Prangan app arrive here together." />
      <div className="toolbar">
        <div className="search"><Text label="Search" value={q} onChange={setQ} type="search" placeholder="School name, registration no., contact number or reference" /></div>
        <Select label="Status" value={status} onChange={(v) => set({ status: v, page: '' })} options={OPTIONS} />
        <Text label="Received from" type="date" value={from} onChange={(v) => set({ from: v, page: '' })} max={to || undefined} />
        <Text label="Received to" type="date" value={to} onChange={(v) => set({ to: v, page: '' })} min={from || undefined} />
      </div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      <section className="card flush">
        {loading && !data ? <div style={{ padding: 18 }}><Loading rows={6} /></div> : data?.items.length ? (
          <>
            <div className="tablewrap"><table className="t">
              <thead><tr><th>School</th><th>Reference</th><th>Contact</th><th>Received</th><th>From</th><th>Status</th></tr></thead>
              <tbody>{data.items.map((r) => (
                <tr key={r.id} className="click" onClick={() => nav(`/admin/requests/${r.id}`)}>
                  <td className="primary-cell"><Link to={`/admin/requests/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.school_name}</Link>
                    <small>{[r.city, r.district, r.state].filter(Boolean).join(', ')}{r.reg_no ? ` · Reg. ${r.reg_no}` : ''}</small></td>
                  <td data-label="Reference" className="num">{r.reference}</td>
                  <td data-label="Contact">{r.contact_name}<span className="muted small"> · {r.mobile}</span></td>
                  <td data-label="Received">{fmtDate(r.created_at)}</td>
                  <td data-label="From">{r.source === 'app' ? 'App' : 'Website'}</td>
                  <td data-label="Status"><Badge status={r.status} /></td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => set({ page: String(p) })} />
          </>
        ) : <Empty title={filtered ? 'No request matches' : 'No requests yet'}>{filtered ? 'Clear a filter or try a shorter search.' : 'When a school registers on the website or in the app, it appears here at once.'}</Empty>}
      </section>
    </>
  );
}

type Action = { status: string; label: string; kind?: string; needs?: string };
const ACTIONS: Record<string, Action> = {
  UNDER_REVIEW: { status: 'UNDER_REVIEW', label: 'Mark under review' },
  ADDITIONAL_INFORMATION_REQUIRED: { status: 'ADDITIONAL_INFORMATION_REQUIRED', label: 'Ask for more information', needs: 'What do you need from the school? (They can see this.)' },
  APPROVED: { status: 'APPROVED', label: 'Approve', kind: 'primary' },
  REJECTED: { status: 'REJECTED', label: 'Reject', kind: 'danger', needs: 'Reason for rejecting (the school can see this)' },
};

export function RequestDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data: r, error, reload, setData } = useLoad(() => api<RequestDetail>(`/admin/onboarding/${id}`), [id]);
  const [act, setAct] = useState<Action | null>(null);
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [onboard, setOnboard] = useState(false);
  const [code, setCode] = useState('');
  const [loginId, setLoginId] = useState('principal');
  const [cred, setCred] = useState<{ school_code: string; login_id: string; password: string } | null>(null);

  async function call(key: string, fn: () => Promise<RequestDetail>, ok: string) {
    setBusy(key);
    try { setData(await fn()); toast(ok); return true; }
    catch (e) { toast((e as Error).message, true); return false; }
    finally { setBusy(null); }
  }
  async function changeStatus() {
    if (!act) return;
    if (await call('status', () => api<RequestDetail>(`/admin/onboarding/${id}/status`, { body: { status: act.status, remarks } }), `Marked ${STATUS_LABEL[act.status].toLowerCase()}`)) {
      setAct(null); setRemarks('');
    }
  }
  async function createSchool() {
    setBusy('onboard');
    try {
      const res = await api<{ request: RequestDetail; credentials: { school_code: string; login_id: string; password: string } }>(
        `/admin/onboarding/${id}/onboard`, { body: { code: code.trim(), principal_login_id: loginId.trim() || 'principal' } });
      setData(res.request); setCred(res.credentials); setOnboard(false);
    } catch (e) { toast((e as Error).message, true); }
    finally { setBusy(null); }
  }

  if (error) return <><PageHead title="Request" /><ErrorBox message={error} onRetry={reload} /></>;
  if (!r) return <><PageHead title="Request" /><Loading rows={6} /></>;
  const at = FLOW.indexOf(r.status);
  return (
    <>
      <p className="small"><Link to="/admin/requests">← All requests</Link></p>
      <PageHead title={r.school_name} sub={`${r.reference} · received ${fmtDateTime(r.created_at)} from the ${r.source === 'app' ? 'app' : 'website'}`}><Badge status={r.status} /></PageHead>

      {at >= 0 ? <div className="steps" aria-label="Progress" style={{ marginBottom: 14 }}>
        {FLOW.map((s, i) => <span key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>{STATUS_LABEL[s]}</span>)}</div> : null}

      {cred ? (
        <section className="card stack" style={{ marginBottom: 14 }} aria-live="polite">
          <h2>School created. Give these sign-in details to the principal.</h2>
          <div className="cred"><span>School code: {cred.school_code}</span><span>Login ID: {cred.login_id}</span><span>Temporary password: {cred.password}</span></div>
          <p className="muted small">This password is shown only now and is not stored in readable form. The principal must choose a new one at first sign-in.</p>
          <div className="row"><Button onClick={() => navigator.clipboard?.writeText(`Prangan sign-in\nSchool code: ${cred.school_code}\nLogin ID: ${cred.login_id}\nTemporary password: ${cred.password}`).then(() => toast('Copied'))}>Copy</Button>
            <Button onClick={() => setCred(null)}>I've noted it — hide</Button></div>
        </section>
      ) : null}
      {r.possible_duplicate ? (
        <div className="alert warn" style={{ marginBottom: 14 }}><span>A school that looks the same is already on Prangan: <Link to={`/admin/schools/${r.possible_duplicate.id}`}>{r.possible_duplicate.name} ({r.possible_duplicate.code})</Link>.
          A second one will not be created from this request.</span></div>
      ) : null}

      <div className="grid g21">
        <div className="stack">
          <section className="card">
            <h2>School</h2>
            <dl className="dl">
              <div><dt>Registration no.</dt><dd>{r.reg_no || '—'}</dd></div><div><dt>Category</dt><dd>{r.category || '—'}</dd></div>
              <div><dt>Board</dt><dd>{r.board || '—'}</dd></div><div><dt>Students / teachers</dt><dd className="num">{fmtInt(r.students)} / {fmtInt(r.teachers)}</dd></div>
              <div className="wide"><dt>Address</dt><dd>{r.address}, {r.city}, {r.district}, {r.state} {r.pin}</dd></div>
              <div className="wide"><dt>Current software</dt><dd>{r.current_software || '—'}</dd></div>
              {r.message ? <div className="wide"><dt>Message from the school</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{r.message}</dd></div> : null}
            </dl>
          </section>
          <section className="card">
            <h2>Contact</h2>
            <dl className="dl">
              <div><dt>Contact person</dt><dd>{r.contact_name}{r.designation ? `, ${r.designation}` : ''}</dd></div><div><dt>Principal</dt><dd>{r.principal_name || '—'}</dd></div>
              <div><dt>Mobile</dt><dd><a href={`tel:${r.mobile}`}>{r.mobile}</a></dd></div><div><dt>Alternate</dt><dd>{r.alt_phone || '—'}</dd></div>
              <div><dt>Email</dt><dd><a href={`mailto:${r.email}`}>{r.email}</a></dd></div><div><dt>Prefers</dt><dd>{r.contact_method || '—'}</dd></div>
            </dl>
          </section>
          <section className="card stack">
            <h2>History</h2>
            <ol className="timeline">
              {r.events.map((e) => (
                <li key={e.id} className={e.kind === 'note' ? 'note' : ''}>
                  <div>
                    <b>{e.kind === 'status' ? `${e.from_status ? `${STATUS_LABEL[e.from_status]} → ` : ''}${STATUS_LABEL[e.to_status] ?? e.to_status}` : e.kind === 'note' ? 'Internal note' : e.kind === 'created' ? 'Request received' : 'Assignment'}</b>
                    {e.remarks ? <p style={{ whiteSpace: 'pre-wrap' }}>{e.remarks}</p> : null}
                    <p className="when">{e.actor_name} · {fmtDateTime(e.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (note.trim() && await call('note', () => api<RequestDetail>(`/admin/onboarding/${id}/notes`, { body: { note } }), 'Note added')) setNote(''); }}>
              <div className="field"><label htmlFor="note"><span>Add an internal note</span></label>
                <textarea id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Only admins see notes." /></div>
              <div><Button type="submit" busy={busy === 'note'} disabled={!note.trim()}>Add note</Button></div>
            </form>
          </section>
        </div>

        <aside className="stack">
          <section className="card stack">
            <h2>Next step</h2>
            {r.status === 'ONBOARDED' && r.school ? <p>This school is on Prangan as <Link to={`/admin/schools/${r.school.id}`}>{r.school.name} ({r.school.code})</Link>.</p> : null}
            {r.status === 'APPROVED' ? (
              <>
                <p className="muted">The request is approved. Create the school to give the principal a login.</p>
                <Button kind="gold" disabled={!r.can_onboard} onClick={() => { setCode(''); setOnboard(true); }}>Create the school…</Button>
              </>
            ) : null}
            {r.allowed_next.filter((s) => ACTIONS[s]).map((s) => (
              <Button key={s} kind={ACTIONS[s].kind} onClick={() => { setRemarks(''); setAct(ACTIONS[s]); }} disabled={!!busy}>{ACTIONS[s].label}</Button>
            ))}
            {!r.allowed_next.length && r.status !== 'APPROVED' ? <p className="muted">Nothing more to do on this request.</p> : null}
          </section>
          <section className="card stack">
            <h2>Handled by</h2>
            <p>{r.assigned_name || 'Nobody yet'}</p>
            <div><Button kind="small" busy={busy === 'assign'} onClick={() => call('assign', () => api<RequestDetail>(`/admin/onboarding/${id}/assign`, { method: 'POST' }), 'Updated')}>
              {r.assigned_name ? 'Release or take over' : 'Assign to me'}</Button></div>
          </section>
        </aside>
      </div>

      {act ? (
        <Modal title={act.label} onClose={() => setAct(null)} actions={<><Button onClick={() => setAct(null)}>Cancel</Button>
          <Button kind={act.kind ?? 'primary'} busy={busy === 'status'} disabled={!!act.needs && remarks.trim().length < 5} onClick={changeStatus}>{act.label}</Button></>}>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="remarks"><span>{act.needs ?? 'Remarks (optional)'}</span></label>
            <textarea id="remarks" className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
          </div>
        </Modal>
      ) : null}
      {onboard ? (
        <Modal title="Create the school" onClose={() => setOnboard(false)} actions={<><Button onClick={() => setOnboard(false)}>Cancel</Button>
          <Button kind="gold" busy={busy === 'onboard'} disabled={!/^[A-Za-z0-9-]{3,20}$/.test(code.trim())} onClick={createSchool}>Create school</Button></>}>
          <p className="muted">This creates {r.school_name} with a 30-day trial and a principal login for {r.principal_name || r.contact_name}.</p>
          <div className="stack" style={{ marginTop: 14 }}>
            <Text label="School code" value={code} onChange={(v) => setCode(v.toUpperCase())} hint="3 to 20 letters, digits or hyphens. Everyone at the school types this to sign in." autoCapitalize="characters" spellCheck={false} />
            <Text label="Principal's login ID" value={loginId} onChange={setLoginId} spellCheck={false} autoCapitalize="none" />
          </div>
        </Modal>
      ) : null}
    </>
  );
}
