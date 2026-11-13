import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, download, type Paged, type SchoolRow } from '../api';
import { Drawer, useAct } from '../kit';
import { newPassword } from '../school/People';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtInt, Icon, Loading, PageHead, Pager, Select, Text, useDebounced, useLoad, useToast } from '../ui';

const STATUSES: [string, string][] = [['', 'Any status'], ['active', 'Active'], ['free', 'Free'], ['trial', 'Trial'], ['grace', 'Grace period'], ['expired', 'Expired'], ['suspended', 'Suspended']];

export function Schools() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounced(q);
  const status = sp.get('status') ?? '';
  const sort = sp.get('sort') ?? 'name';
  const dir = sp.get('dir') ?? 'asc';
  const page = Math.max(1, Number(sp.get('page')) || 1);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };
  useEffect(() => { if ((sp.get('q') ?? '') !== dq) set({ q: dq, page: '' }); /* eslint-disable-next-line */ }, [dq]);
  const { data, error, loading, reload } = useLoad(() => api<Paged<SchoolRow>>('/admin/schools-page', { query: { q: dq, status, sort, dir, page, size: 20 } }), [dq, status, sort, dir, page]);

  const sortBy = (col: string) => set({ sort: col, dir: sort === col && dir === 'asc' ? 'desc' : 'asc', page: '' });
  const th = (col: string, label: string) => (
    <th aria-sort={sort === col ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => sortBy(col)}>{label}<Icon name="sort" /></button>
    </th>
  );
  async function exportList() {
    setBusy(true);
    try { toast(`Saved ${await download('/admin/schools-export', 'Prangan-Schools.xlsx', { q: dq, status })}`); }
    catch (e) { toast((e as Error).message, true); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Schools" sub={data ? `${fmtInt(data.total)} ${data.total === 1 ? 'school' : 'schools'}${dq || status ? ' match' : ' on Prangan'}` : 'All schools on Prangan'}>
        <Button icon="download" onClick={exportList} busy={busy}>Export this list</Button><Button kind="primary" icon="plus" onClick={() => setAdd(true)}>Add school</Button>
      </PageHead>
      <div className="toolbar">
        <div className="search"><Text label="Search" value={q} onChange={setQ} type="search" placeholder="Name, code, registration no., city or district" /></div>
        <Select label="Status" value={status} onChange={(v) => set({ status: v, page: '' })} options={STATUSES} />
      </div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      <section className="card flush">
        {loading && !data ? <div style={{ padding: 18 }}><Loading rows={6} /></div> : data?.items.length ? (
          <>
            <div className="tablewrap"><table className="t">
              <thead><tr>{th('name', 'School')}{th('code', 'Code')}<th>Place</th><th>Status</th><th className="right">Students</th><th className="right">Teachers</th>{th('newest', 'Joined')}</tr></thead>
              <tbody>{data.items.map((s) => (
                <tr key={s.id} className="click" onClick={() => nav(`/admin/schools/${s.id}`)}>
                  <td className="primary-cell"><Link to={`/admin/schools/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link><small>{s.reg_no ? `Reg. ${s.reg_no}` : s.plan ?? 'No plan'}</small></td>
                  <td data-label="Code">{s.code}</td><td data-label="Place">{[s.city, s.state].filter(Boolean).join(', ') || '—'}</td>
                  <td data-label="Status"><Badge status={s.status} /></td>
                  <td data-label="Students" className="right num">{fmtInt(s.students)}</td><td data-label="Teachers" className="right num">{fmtInt(s.teachers)}</td>
                  <td data-label="Joined">{fmtDate(s.created_at)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => set({ page: String(p) })} />
          </>
        ) : <Empty title={dq || status ? 'No school matches' : 'No schools yet'}>{dq || status ? 'Try a shorter search or clear the status filter.' : 'Approve an onboarding request to add the first one.'}</Empty>}
      </section>
      {add ? <AddSchool onClose={() => setAdd(false)} onSaved={(id) => nav(`/admin/schools/${id}`)} /> : null}
    </>
  );
}

function AddSchool({ onClose, onSaved }: { onClose: () => void; onSaved: (id: number) => void }) {
  const plans = useLoad(() => api<{ id: number; name: string }[]>('/admin/plans'), []);
  const { act, busy } = useAct();
  const toast = useToast();
  const [f, setF] = useState({ code: '', name: '', address: '', phone: '', board: '', plan_id: '', principal_name: '', principal_login_id: 'principal', principal_password: newPassword(), principal_phone: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [made, setMade] = useState<{ id: number } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (!/^[A-Za-z0-9-]{3,20}$/.test(f.code)) bad.code = '3 to 20 letters, digits or hyphens';
    if (f.name.trim().length < 2) bad.name = 'Enter the school name';
    if (f.principal_name.trim().length < 2) bad.principal_name = "Enter the principal's name";
    if (!f.principal_login_id.trim()) bad.principal_login_id = 'Enter a login ID';
    if (f.principal_password.length < 8) bad.principal_password = 'At least 8 characters';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const r = await act('save', () => api<{ id: number }>('/admin/schools', { body: { ...f, code: f.code.toUpperCase(), name: f.name.trim(), plan_id: f.plan_id ? Number(f.plan_id) : null } }), `${f.name.trim()} added`);
    if (r) setMade(r);
  }
  const copy = async () => { try { await navigator.clipboard.writeText(`School code: ${f.code.toUpperCase()}\nLogin ID: ${f.principal_login_id}\nPassword: ${f.principal_password}`); toast('Copied'); } catch { toast('Copy it by hand — the browser blocked copying', true); } };
  if (made) return (
    <Drawer title="School added" sub="Share these sign-in details with the principal. The password is not shown again." onClose={() => onSaved(made.id)} footer={<><Button icon="copy" onClick={copy}>Copy</Button><Button kind="primary" onClick={() => onSaved(made.id)}>Open the school</Button></>}>
      <div className="cred"><span>School code: {f.code.toUpperCase()}</span><span>Login ID: {f.principal_login_id}</span><span>Password: {f.principal_password}</span></div>
      <p className="muted small">The principal must choose a new password the first time they sign in.</p>
    </Drawer>
  );
  return (
    <Drawer title="Add school" sub="For a school that asked through the website, approve its request instead: the details are filled in for you." onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="school-form" busy={busy === 'save'}>Add school</Button></>}>
      <form id="school-form" className="stack" onSubmit={save} noValidate>
        <div className="cols">
          <Text label="School code" value={f.code} onChange={(v) => set('code', v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20))} error={err.code} hint="Everyone types this to sign in. It can't be changed later." placeholder="GVPS01" />
          <Select label="Plan" value={f.plan_id} onChange={(v) => set('plan_id', v)} options={[['', 'Default plan'], ...(plans.data ?? []).map((p): [string, string] => [String(p.id), p.name])]} />
          <div className="wide"><Text label="School name" value={f.name} onChange={(v) => set('name', v)} error={err.name} maxLength={160} /></div>
          <div className="wide"><Text label="Address" value={f.address} onChange={(v) => set('address', v)} maxLength={300} /></div>
          <Text label="Phone" value={f.phone} onChange={(v) => set('phone', v)} maxLength={20} /><Text label="Board" value={f.board} onChange={(v) => set('board', v)} maxLength={40} placeholder="CBSE" />
        </div>
        <fieldset><legend>Principal's account</legend><div className="cols">
          <Text label="Principal's name" value={f.principal_name} onChange={(v) => set('principal_name', v)} error={err.principal_name} maxLength={120} /><Text label="Phone" value={f.principal_phone} onChange={(v) => set('principal_phone', v)} maxLength={15} inputMode="tel" />
          <Text label="Login ID" value={f.principal_login_id} onChange={(v) => set('principal_login_id', v)} error={err.principal_login_id} maxLength={60} /><Text label="Temporary password" value={f.principal_password} onChange={(v) => set('principal_password', v)} error={err.principal_password} maxLength={72} autoComplete="off" />
        </div></fieldset>
      </form>
    </Drawer>
  );
}

