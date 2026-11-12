import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, download, type Paged, type SchoolRow, type User } from '../api';
import { DataTools } from '../DataTools';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtDateTime, fmtInt, Icon, Loading, PageHead, Pager, Select, Text, useDebounced, useLoad, useToast, words } from '../ui';

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
        <Button icon="download" onClick={exportList} busy={busy}>Export this list</Button>
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
    </>
  );
}

type Detail = SchoolRow & { address: string; phone: string; board: string; classes: number; privacy: { full_access: boolean; share_contact_with_admin: boolean; support_access_until: string | null } };
type Extra = { reg_no: string; category: string; state: string; district: string; city: string; pin: string; email: string; contact_name: string };

export function SchoolDetail() {
  const { id } = useParams();
  const toast = useToast();
  const d = useLoad(() => api<Detail>(`/admin/schools/${id}`), [id]);
  const x = useLoad(() => api<Extra>(`/admin/schools/${id}/details`), [id]);
  const [people, setPeople] = useState<User[] | null>(null);
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [edit, setEdit] = useState<Extra | null>(null);
  const [saving, setSaving] = useState(false);
  const s = d.data;
  const support = !!(s?.privacy.support_access_until && new Date(`${s.privacy.support_access_until}Z`) > new Date());

  async function loadPeople() {
    setPeopleBusy(true);
    try { setPeople(await api<User[]>(`/admin/schools/${id}/users`)); }
    catch (e) { toast((e as Error).message, true); }
    finally { setPeopleBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setSaving(true);
    try { x.setData(await api<Extra>(`/admin/schools/${id}/details`, { method: 'PUT', body: edit })); setEdit(null); toast('Details saved'); }
    catch (err) { toast((err as Error).message, true); }
    finally { setSaving(false); }
  }

  if (d.error) return <><PageHead title="School" /><ErrorBox message={d.error} onRetry={d.reload} /></>;
  if (!s) return <><PageHead title="School" /><Loading rows={6} /></>;
  const ex = x.data;
  return (
    <>
      <p className="small"><Link to="/admin/schools">← All schools</Link></p>
      <PageHead title={s.name} sub={`School code ${s.code}${s.plan ? ` · ${s.plan} plan` : ''}`}><Badge status={s.status} /></PageHead>
      <div className="grid g4 keep2">
        <div className="card stat"><span className="label">Students</span><span className="value">{fmtInt(s.students)}</span></div>
        <div className="card stat"><span className="label">Teachers</span><span className="value">{fmtInt(s.teachers)}</span></div>
        <div className="card stat"><span className="label">Parents</span><span className="value">{fmtInt(s.parents)}</span></div>
        <div className="card stat"><span className="label">Classes</span><span className="value">{fmtInt(s.classes)}</span></div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="spread"><h2>School details</h2>{ex && !edit ? <Button kind="small" onClick={() => setEdit(ex)}>Edit</Button> : null}</div>
          {edit ? (
            <form className="stack" onSubmit={save} style={{ marginTop: 12 }}>
              <div className="cols">
                <Text label="Registration no." value={edit.reg_no} onChange={(v) => setEdit({ ...edit, reg_no: v })} maxLength={60} />
                <Text label="Category" value={edit.category} onChange={(v) => setEdit({ ...edit, category: v })} maxLength={40} />
                <Text label="City / town" value={edit.city} onChange={(v) => setEdit({ ...edit, city: v })} maxLength={80} />
                <Text label="District" value={edit.district} onChange={(v) => setEdit({ ...edit, district: v })} maxLength={60} />
                <Text label="State" value={edit.state} onChange={(v) => setEdit({ ...edit, state: v })} maxLength={60} />
                <Text label="PIN code" value={edit.pin} onChange={(v) => setEdit({ ...edit, pin: v.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" />
                <Text label="Email" value={edit.email} onChange={(v) => setEdit({ ...edit, email: v })} type="email" maxLength={160} />
                <Text label="Contact person" value={edit.contact_name} onChange={(v) => setEdit({ ...edit, contact_name: v })} maxLength={120} />
              </div>
              <div className="row"><Button kind="primary" type="submit" busy={saving}>Save</Button><Button onClick={() => setEdit(null)}>Cancel</Button></div>
            </form>
          ) : (
            <dl className="dl" style={{ marginTop: 12 }}>
              <div><dt>Registration no.</dt><dd>{ex?.reg_no || '—'}</dd></div><div><dt>Category</dt><dd>{ex?.category || '—'}</dd></div>
              <div><dt>Board</dt><dd>{s.board || '—'}</dd></div><div><dt>Phone</dt><dd>{s.phone || '—'}</dd></div>
              <div><dt>Email</dt><dd>{ex?.email || '—'}</dd></div><div><dt>Contact person</dt><dd>{ex?.contact_name || '—'}</dd></div>
              <div className="wide"><dt>Address</dt><dd>{s.address || '—'}</dd></div>
              <div><dt>City, district</dt><dd>{[ex?.city, ex?.district].filter(Boolean).join(', ') || '—'}</dd></div>
              <div><dt>State, PIN</dt><dd>{[ex?.state, ex?.pin].filter(Boolean).join(' ') || '—'}</dd></div>
            </dl>
          )}
        </section>
        <section className="card stack">
          <h2>Subscription and privacy</h2>
          <dl className="dl">
            <div><dt>Plan</dt><dd>{s.plan ?? '—'}{s.is_free ? ' (free)' : ''}</dd></div><div><dt>Valid until</dt><dd>{fmtDate(s.valid_until)}</dd></div>
            <div><dt>Trial until</dt><dd>{fmtDate(s.trial_until)}</dd></div><div><dt>Joined</dt><dd>{fmtDate(s.created_at)}</dd></div>
          </dl>
          <div className={`alert ${support ? 'ok' : ''}`}>
            {support ? `This school has given support access until ${fmtDateTime(s.privacy.support_access_until)}. You can see full contact details and use import and export.`
              : "This school has not given support access. You see counts and masked contact details only, and can't import or export its data. The principal can allow it for 24 hours in the app's Privacy settings."}
          </div>
          <p className="small muted">Plans, prices, modules and payments are managed in the Prangan app's Admin section.</p>
        </section>
      </div>

      <section className="card flush" style={{ marginTop: 14 }}>
        <div className="spread" style={{ padding: '16px 18px' }}>
          <div><h2>People</h2><p className="small muted">Opening this list is recorded in the school's activity log.</p></div>
          {!people ? <Button onClick={loadPeople} busy={peopleBusy} icon="people">Show people</Button> : <span className="muted small">{fmtInt(people.length)} accounts</span>}
        </div>
        {people ? people.length ? (
          <div className="tablewrap"><table className="t"><thead><tr><th>Name</th><th>Role</th><th>Login ID</th><th>Phone</th></tr></thead>
            <tbody>{people.slice(0, 200).map((u) => (
              <tr key={u.id}><td className="primary-cell"><span>{u.name}</span></td><td data-label="Role">{words(u.role)}</td><td data-label="Login ID">{u.login_id}</td><td data-label="Phone">{u.phone || '—'}</td></tr>
            ))}</tbody></table>
            {people.length > 200 ? <p className="small muted" style={{ padding: 14 }}>Showing the first 200. Use the school's export for the full list.</p> : null}
          </div>
        ) : <Empty title="No accounts in this school yet" /> : null}
      </section>

      <div style={{ marginTop: 14 }}>
        {support ? <DataTools base={`/admin/schools/${id}/data`} schoolCode={s.code} admin /> : null}
      </div>
    </>
  );
}
