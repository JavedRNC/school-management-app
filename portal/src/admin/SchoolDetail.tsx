import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type AuditRow, type SchoolRow } from '../api';
import { DataTools } from '../DataTools';
import { Avatar, Chips, Drawer, IconButton, RowActions, Switch, Tabs, TextArea, today, useAct, useConfirm } from '../kit';
import { newPassword } from '../school/People';
import { ROLE_LABEL, type Klass, type Person } from '../school/ctx';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtDateTime, fmtInt, fmtMoney, Loading, PageHead, parseTime, Select, Text, useLoad, useToast, words } from '../ui';

type Sub = { status: string; plan: string | null; plan_id: number | null; modules: string[]; estimate: { students: number; price_per_student: number; min_monthly: number; discount_pct: number; gross: number; amount: number; free: boolean } };
export type Detail = SchoolRow & { address: string; phone: string; board: string; admin_notes: string; classes: number; subscription: Sub; custom_price: boolean; price_override: number | null; min_override: number | null;
  discount_pct: number; free_until: string | null; grace_days: number; max_students: number | null; billing_cycle: string; custom_modules: string[] | null;
  privacy: { full_access: boolean; share_contact_with_admin: boolean; support_access_until: string | null } };
type Extra = { reg_no: string; category: string; state: string; district: string; city: string; pin: string; email: string; contact_name: string };
export type PlanRow = { id: number; name: string; modules: string[]; price_per_student: number; min_monthly: number };
type Payment = { id: number; amount: number; paid_on: string; period_from: string | null; period_to: string | null; method: string; reference: string; note: string };
type Tab = 'info' | 'plan' | 'users' | 'payments' | 'data' | 'log';

export function SchoolDetail() {
  const { id } = useParams();
  const d = useLoad(() => api<Detail>(`/admin/schools/${id}`), [id]);
  const [tab, setTab] = useState<Tab>('info');
  const s = d.data;
  const until = parseTime(s?.privacy.support_access_until);
  const support = !!until && until.getTime() > Date.now();
  if (d.error) return <><PageHead title="School" /><ErrorBox message={d.error} onRetry={d.reload} /></>;
  if (!s) return <><PageHead title="School" /><Loading rows={6} /></>;
  return (
    <>
      <p className="small"><Link to="/admin/schools">← All schools</Link></p>
      <PageHead title={s.name} sub={`School code ${s.code}${s.plan ? ` · ${s.plan} plan` : ''}`}><Badge status={s.status} /></PageHead>
      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <div className="card stat"><span className="label">Students</span><span className="value">{fmtInt(s.students)}</span></div>
        <div className="card stat"><span className="label">Teachers</span><span className="value">{fmtInt(s.teachers)}</span></div>
        <div className="card stat"><span className="label">Classes</span><span className="value">{fmtInt(s.classes)}</span></div>
        <div className="card stat"><span className="label">Monthly bill</span><span className="value">{s.subscription.estimate.free ? 'Free' : fmtMoney(s.subscription.estimate.amount)}</span></div>
      </div>
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'info', label: 'Details' }, { id: 'plan', label: 'Plan & subscription' }, { id: 'users', label: 'Users' }, { id: 'payments', label: 'Payments' }, { id: 'data', label: 'Import & export' }, { id: 'log', label: 'Activity' }]} />
      {tab === 'info' ? <Info s={s} support={support} onSaved={d.reload} /> : null}
      {tab === 'plan' ? <PlanTab s={s} onSaved={d.reload} /> : null}
      {tab === 'users' ? <Users s={s} support={support} /> : null}
      {tab === 'payments' ? <Payments s={s} onSaved={d.reload} /> : null}
      {tab === 'data' ? (support ? <DataTools base={`/admin/schools/${id}/data`} schoolCode={s.code} admin /> : <div className="card"><Empty title="The school has not allowed support access">Import, backup and templates for this school open only while its principal has switched on support access (Settings → Privacy & support, for 24 hours).</Empty></div>) : null}
      {tab === 'log' ? <Log sid={s.id} /> : null}
    </>
  );
}

function Info({ s, support, onSaved }: { s: Detail; support: boolean; onSaved: () => void }) {
  const x = useLoad(() => api<Extra>(`/admin/schools/${s.id}/details`), [s.id]);
  const { act, busy } = useAct();
  const confirm = useConfirm();
  const [f, setF] = useState({ name: s.name, address: s.address, phone: s.phone, board: s.board, admin_notes: s.admin_notes ?? '' });
  const [e, setE] = useState<Extra | null>(null);
  const [listing, setListing] = useState<{ show: boolean; city: string } | null>(null);
  useEffect(() => { if (x.data) setE(x.data); }, [x.data]);
  useEffect(() => { setF({ name: s.name, address: s.address, phone: s.phone, board: s.board, admin_notes: s.admin_notes ?? '' }); }, [s]);
  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (f.name.trim().length < 2) return;
    const a = await act('save', () => api(`/admin/schools/${s.id}`, { method: 'PUT', body: { ...f, name: f.name.trim() } }));
    const b = e ? await act('save', () => api<Extra>(`/admin/schools/${s.id}/details`, { method: 'PUT', body: e }), 'School details saved') : true;
    if (a && b) onSaved();
  }
  async function suspend() {
    const to = !s.suspended;
    if (!(await confirm({ title: to ? `Suspend ${s.name}?` : `Lift the suspension of ${s.name}?`, body: to ? 'Nobody from this school can sign in until you lift the suspension. No data is deleted.' : 'Everyone can sign in again.', confirm: to ? 'Suspend school' : 'Lift suspension', danger: to }))) return;
    if (await act('susp', () => api(`/admin/schools/${s.id}`, { method: 'PUT', body: { suspended: to } }), to ? 'School suspended' : 'Suspension lifted')) onSaved();
  }
  const saveListing = async () => { if (listing && await act('list', () => api(`/admin/schools/${s.id}/showcase`, { method: 'PUT', body: listing }), listing.show ? 'Listed on the website' : 'Removed from the website')) setListing(null); };
  return (
    <div className="grid g21">
      <form className="card stack" onSubmit={save} noValidate>
        <h2>School details</h2>
        <div className="cols">
          <div className="wide"><Text label="School name" value={f.name} onChange={(v) => setF({ ...f, name: v })} maxLength={160} error={f.name.trim().length < 2 ? 'Enter the school name' : null} /></div>
          <div className="wide"><Text label="Address" value={f.address} onChange={(v) => setF({ ...f, address: v })} maxLength={300} /></div>
          <Text label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} maxLength={20} /><Text label="Board" value={f.board} onChange={(v) => setF({ ...f, board: v })} maxLength={40} />
          {e ? <>
            <Text label="Registration no." value={e.reg_no} onChange={(v) => setE({ ...e, reg_no: v })} maxLength={60} /><Text label="Category" value={e.category} onChange={(v) => setE({ ...e, category: v })} maxLength={40} />
            <Text label="City / town" value={e.city} onChange={(v) => setE({ ...e, city: v })} maxLength={80} /><Text label="District" value={e.district} onChange={(v) => setE({ ...e, district: v })} maxLength={60} />
            <Text label="State" value={e.state} onChange={(v) => setE({ ...e, state: v })} maxLength={60} /><Text label="PIN code" value={e.pin} onChange={(v) => setE({ ...e, pin: v.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" />
            <Text label="Email" value={e.email} onChange={(v) => setE({ ...e, email: v })} type="email" maxLength={160} /><Text label="Contact person" value={e.contact_name} onChange={(v) => setE({ ...e, contact_name: v })} maxLength={120} />
          </> : x.error ? <div className="wide"><ErrorBox message={x.error} onRetry={x.reload} /></div> : null}
          <div className="wide"><TextArea label="Private notes (only admins see these)" value={f.admin_notes} onChange={(v) => setF({ ...f, admin_notes: v })} maxLength={2000} /></div>
        </div>
        <div><Button kind="primary" type="submit" busy={busy === 'save'}>Save details</Button></div>
      </form>
      <div className="stack">
        <section className="card stack"><h2>Privacy</h2>
          <div className={`alert ${support ? 'ok' : ''}`}>{support ? `Support access is on until ${fmtDateTime(s.privacy.support_access_until)}. You can see full contact details, manage users and use import and export.`
            : 'Support access is off. You see counts and masked contact details only. The principal can allow it for 24 hours from Settings → Privacy & support.'}</div>
        </section>
        <section className="card stack"><h2>Website listing</h2>
          {listing ? <><Switch label="Show on the Prangan website" checked={listing.show} onChange={(v) => setListing({ ...listing, show: v })} /><Text label="City shown" value={listing.city} onChange={(v) => setListing({ ...listing, city: v })} maxLength={80} />
            <div className="row"><Button kind="primary small" busy={busy === 'list'} onClick={saveListing}>Save listing</Button><Button kind="small" onClick={() => setListing(null)}>Cancel</Button></div></>
            : <><p className="muted small">Only the name, board and city appear in the public list of schools.</p><div><Button kind="small" onClick={() => setListing({ show: true, city: e?.city ?? '' })}>Change listing</Button></div></>}
        </section>
        <section className="card stack"><h2>{s.suspended ? 'This school is suspended' : 'Suspend school'}</h2>
          <p className="muted small">{s.suspended ? 'Nobody from this school can sign in.' : 'Stops every sign-in for this school without deleting anything.'}</p>
          <div><Button kind={s.suspended ? 'primary' : 'danger'} busy={busy === 'susp'} onClick={suspend}>{s.suspended ? 'Lift suspension' : 'Suspend school'}</Button></div>
        </section>
      </div>
    </div>
  );
}

function PlanTab({ s, onSaved }: { s: Detail; onSaved: () => void }) {
  const plans = useLoad(() => api<PlanRow[]>('/admin/plans'), []);
  const modules = useLoad(() => api<Record<string, string>>('/admin/modules'), []);
  const { act, busy } = useAct();
  const init = () => ({ planId: String(s.subscription.plan_id ?? ''), custom: s.custom_modules !== null, mods: s.custom_modules ?? s.subscription.modules, customPrice: s.custom_price, price: s.price_override != null ? String(s.price_override) : '',
    min: s.min_override != null ? String(s.min_override) : '', discount: String(s.discount_pct ?? 0), isFree: s.is_free, freeUntil: s.free_until ?? '', trialUntil: s.trial_until ?? '', validUntil: s.valid_until ?? '',
    grace: String(s.grace_days ?? 7), maxStudents: s.max_students != null ? String(s.max_students) : '', cycle: s.billing_cycle ?? 'monthly' });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [s]);   // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const plan = plans.data?.find((p) => String(p.id) === f.planId);
  const shown = f.custom ? f.mods : plan?.modules ?? [];
  const bad = !(Number(f.discount) >= 0 && Number(f.discount) <= 100) ? 'Discount must be 0 to 100' : f.customPrice && f.price === '' ? 'Enter the price per student' : null;
  const num = (v: string) => (v === '' ? null : Number(v));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad) return;
    const body: Record<string, unknown> = { plan_id: f.planId ? Number(f.planId) : null, discount_pct: Number(f.discount) || 0, is_free: f.isFree, free_until: f.freeUntil || null, trial_until: f.trialUntil || null,
      valid_until: f.validUntil || null, grace_days: Number(f.grace) || 0, max_students: num(f.maxStudents), billing_cycle: f.cycle };
    if (f.custom) body.custom_modules = f.mods.includes('core') ? f.mods : ['core', ...f.mods]; else body.use_plan_modules = true;
    if (f.customPrice) { body.price_per_student = num(f.price) ?? 0; body.min_monthly = num(f.min) ?? 0; } else body.clear_custom_price = true;
    if (await act('save', () => api(`/admin/schools/${s.id}`, { method: 'PUT', body }), 'Subscription saved')) onSaved();
  }
  const est = s.subscription.estimate;
  const money = (v: string) => v.replace(/[^\d.]/g, '');
  if (plans.error || modules.error) return <ErrorBox message={(plans.error ?? modules.error)!} onRetry={() => { plans.reload(); modules.reload(); }} />;
  if (!plans.data || !modules.data) return <Loading rows={6} />;
  return (
    <form className="grid g2" onSubmit={save} noValidate>
      <fieldset><legend>Plan and features</legend>
        <Select label="Plan" value={f.planId} onChange={(v) => set('planId', v)} options={[['', 'No plan'], ...plans.data.map((p): [string, string] => [String(p.id), `${p.name} · ${fmtMoney(p.price_per_student)} per student`])]} />
        <Switch label="Choose features by hand for this school" hint="Otherwise the school gets exactly what its plan includes." checked={f.custom} onChange={(v) => { set('custom', v); if (v) set('mods', plan?.modules ?? s.subscription.modules); }} />
        {f.custom ? <Chips label="Features" options={Object.entries(modules.data).map(([id, label]) => ({ id, label: label.split(' (')[0] }))} value={f.mods} onChange={(v) => set('mods', v.includes('core') ? v : ['core', ...v])} />
          : <p className="small muted">Includes: {shown.map((m) => modules.data![m]?.split(' (')[0] ?? m).join(', ') || 'nothing yet'}</p>}
        <Text label="Most students allowed (empty = no limit)" value={f.maxStudents} onChange={(v) => set('maxStudents', v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
      </fieldset>
      <fieldset><legend>Price</legend>
        <Switch label="Free school" hint="No bill and no expiry, for example a sponsored or demo school." checked={f.isFree} onChange={(v) => set('isFree', v)} />
        {f.isFree ? <Text label="Free until (empty = always)" type="date" value={f.freeUntil} onChange={(v) => set('freeUntil', v)} /> : null}
        <Switch label="Special price for this school" checked={f.customPrice} onChange={(v) => set('customPrice', v)} />
        {f.customPrice ? <div className="cols"><Text label="Price per student a month (₹)" value={f.price} onChange={(v) => set('price', money(v))} inputMode="decimal" /><Text label="Smallest monthly bill (₹)" value={f.min} onChange={(v) => set('min', money(v))} inputMode="decimal" /></div> : null}
        <div className="cols"><Text label="Discount (%)" value={f.discount} onChange={(v) => set('discount', money(v))} inputMode="decimal" />
          <Select label="Billed" value={f.cycle} onChange={(v) => set('cycle', v)} options={[['monthly', 'Every month'], ['yearly', 'Every year']]} /></div>
        <div className="alert">Now: {est.free ? 'free' : `${fmtInt(est.students)} students × ${fmtMoney(est.price_per_student)} = ${fmtMoney(est.gross)}${est.discount_pct ? `, less ${est.discount_pct}%` : ''} → ${fmtMoney(est.amount)} a month`}</div>
      </fieldset>
      <fieldset><legend>Dates</legend>
        <div className="cols"><Text label="Trial until" type="date" value={f.trialUntil} onChange={(v) => set('trialUntil', v)} /><Text label="Paid until" type="date" value={f.validUntil} onChange={(v) => set('validUntil', v)} />
          <Text label="Days of grace after expiry" value={f.grace} onChange={(v) => set('grace', v.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" hint="The school keeps working, with a reminder, for this long." /></div>
      </fieldset>
      <div className="stack">{bad ? <div className="alert bad" role="alert">{bad}</div> : null}<div><Button kind="primary" type="submit" busy={busy === 'save'} disabled={!!bad}>Save subscription</Button></div></div>
    </form>
  );
}

function Users({ s, support }: { s: Detail; support: boolean }) {
  const [role, setRole] = useState('principal');
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState('true');
  const users = useLoad(() => (shown ? api<Person[]>(`/admin/schools/${s.id}/users`, { query: { role, active } }) : Promise.resolve(null)), [shown, role, active, s.id]);
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const { act, busy } = useAct();
  const toggle = async (u: Person) => { if (await act(`a${u.id}`, () => api(`/admin/schools/${s.id}/users/${u.id}`, { method: 'PUT', body: { active: !u.active } }), `${u.name} ${u.active ? 'switched off' : 'switched on'}`)) users.reload(); };
  const canAdd = support || (role === 'principal' && active === 'true' && users.data !== null && users.data.length === 0);
  return (
    <>
      <div className={`alert ${support ? 'ok' : ''}`} style={{ marginBottom: 14 }}>{support ? 'Support access is on: you can add and change any account in this school.' : "Without support access you can only reset or change the principal's account. Phone-number login IDs are hidden."} Opening this list is recorded in the school's activity log.</div>
      {!shown ? <Button icon="people" onClick={() => setShown(true)}>Show users</Button> : (
        <>
          <div className="toolbar"><Select label="Role" value={role} onChange={setRole} options={['principal', 'vice_principal', 'coordinator', 'teacher', 'student', 'parent'].map((r): [string, string] => [r, ROLE_LABEL[r]])} />
            <Select label="Show" value={active} onChange={setActive} options={[['true', 'Can sign in'], ['false', 'Switched off']]} />
            {canAdd && active === 'true' ? <Button kind="primary" icon="plus" onClick={() => setEdit('new')}>Add {ROLE_LABEL[role].toLowerCase()}</Button> : null}</div>
          <section className="card flush">
            {users.error ? <div style={{ padding: 18 }}><ErrorBox message={users.error} onRetry={users.reload} /></div> : !users.data ? <div style={{ padding: 18 }}><Loading /></div> : !users.data.length ? <Empty title={active === 'true' ? `No ${ROLE_LABEL[role].toLowerCase()} accounts` : `No ${ROLE_LABEL[role].toLowerCase()} account is switched off`} /> : (
              <div className="tablewrap"><table className="t"><thead><tr><th>Name</th><th>Login ID</th><th>Phone</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
                <tbody>{users.data.slice(0, 300).map((u) => (
                  <tr key={u.id}><td className="primary-cell"><div className="person"><Avatar name={u.name} /><b>{u.name}</b></div></td><td data-label="Login ID" className="num">{u.login_id}</td><td data-label="Phone" className="num">{u.phone || '—'}</td>
                    <td data-label="Status"><Badge status={u.active ? 'active' : 'suspended'}>{u.active ? 'Can sign in' : 'Switched off'}</Badge></td>
                    <td className="plain">{support || u.role === 'principal' ? <RowActions><IconButton icon="edit" label={`Edit ${u.name}`} onClick={() => setEdit(u)} />
                      {support ? <Button kind="small" busy={busy === `a${u.id}`} onClick={() => toggle(u)} aria-label={`${u.active ? 'Switch off' : 'Switch on'} ${u.name}`}>{u.active ? 'Switch off' : 'Switch on'}</Button> : null}</RowActions> : null}</td></tr>
                ))}</tbody></table></div>
            )}
          </section>
        </>
      )}
      {edit ? <UserForm sid={s.id} role={role} user={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { users.reload(); }} /> : null}
    </>
  );
}

function UserForm({ sid, role, user, onClose, onSaved }: { sid: number; role: string; user: Person | null; onClose: () => void; onSaved: () => void }) {
  const classes = useLoad(() => (role === 'student' ? api<Klass[]>(`/admin/schools/${sid}/classes`) : Promise.resolve([] as Klass[])), [role, sid]);
  const { act, busy } = useAct();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? ''); const [login, setLogin] = useState(user?.login_id ?? (role === 'principal' ? 'principal' : '')); const [phone, setPhone] = useState(user?.phone ?? '');
  const [classId, setClassId] = useState(user?.class_id ? String(user.class_id) : ''); const [pw, setPw] = useState(user ? '' : newPassword()); const [sent, setSent] = useState<string | null>(null);
  const masked = !!user && /[•*x]{3,}/i.test(user.login_id);
  const bad = name.trim().length < 2 ? 'Enter the name' : !login.trim() ? 'Enter the login ID' : !user && pw.length < 8 ? 'The password needs at least 8 characters' : user && pw && pw.length < 8 ? 'The password needs at least 8 characters' : role === 'student' && !classId ? 'Pick a class' : null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad) return;
    const body: Record<string, unknown> = { name: name.trim(), ...(phone.trim() !== (user?.phone ?? '') ? { phone: phone.trim() } : {}), ...(masked ? {} : { login_id: login.trim() }), ...(role === 'student' ? { class_id: Number(classId) } : {}), ...(pw ? { password: pw } : {}) };
    const ok = user ? await act('save', () => api(`/admin/schools/${sid}/users/${user.id}`, { method: 'PUT', body }), `${name.trim()} saved`) : await act('save', () => api(`/admin/schools/${sid}/users`, { body: { ...body, role } }), `${name.trim()} added`);
    if (!ok) return;
    onSaved();
    if (pw) setSent(pw); else onClose();
  }
  const copy = async () => { try { await navigator.clipboard.writeText(`Login ID: ${login}\nPassword: ${sent}`); toast('Copied'); } catch { toast('Copy it by hand — the browser blocked copying', true); } };
  if (sent) return (
    <Drawer title="Share these sign-in details" sub="The password is temporary. They must choose their own after signing in." onClose={onClose} footer={<><Button icon="copy" onClick={copy}>Copy</Button><Button kind="primary" onClick={onClose}>Done</Button></>}>
      <div className="alert ok" role="status">Saved. This password is not shown again.</div><div className="cred"><span>Login ID: {login}</span><span>Password: {sent}</span></div>
    </Drawer>
  );
  return (
    <Drawer title={user ? `Edit ${user.name}` : `Add ${ROLE_LABEL[role].toLowerCase()}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="auser-form" busy={busy === 'save'} disabled={!!bad}>{user ? 'Save changes' : 'Add account'}</Button></>}>
      <form id="auser-form" className="stack" onSubmit={save} noValidate>
        <Text label="Full name" value={name} onChange={setName} maxLength={120} />
        <Text label="Login ID" value={login} onChange={setLogin} maxLength={60} disabled={masked} hint={masked ? 'Hidden because the school has not shared contact details.' : undefined} />
        <Text label="Phone" value={phone} onChange={setPhone} maxLength={15} inputMode="tel" />
        {role === 'student' ? <Select label="Class" value={classId} onChange={setClassId} options={[['', 'Pick a class'], ...(classes.data ?? []).map((c): [string, string] => [String(c.id), c.name])]} /> : null}
        <Text label={user ? 'New temporary password (leave empty to keep the current one)' : 'Temporary password'} value={pw} onChange={setPw} maxLength={72} autoComplete="off" />
        {user ? <div><Button kind="small" icon="refresh" onClick={() => setPw(newPassword())}>Make a new password</Button></div> : null}
        {bad && (name || pw) ? <div className="alert bad" role="alert">{bad}</div> : null}
      </form>
    </Drawer>
  );
}

function Payments({ s, onSaved }: { s: Detail; onSaved: () => void }) {
  const list = useLoad(() => api<Payment[]>(`/admin/schools/${s.id}/payments`), [s.id]);
  const [add, setAdd] = useState(false);
  const total = useMemo(() => (list.data ?? []).reduce((a, p) => a + p.amount, 0), [list.data]);
  return (
    <>
      <div className="spread" style={{ marginBottom: 14 }}><p className="muted">Paid until <b>{fmtDate(s.valid_until)}</b> · {fmtMoney(total)} received in all</p><Button kind="primary" icon="plus" onClick={() => setAdd(true)}>Record a payment</Button></div>
      <section className="card flush">
        {list.error ? <div style={{ padding: 18 }}><ErrorBox message={list.error} onRetry={list.reload} /></div> : !list.data ? <div style={{ padding: 18 }}><Loading /></div> : !list.data.length ? <Empty title="No payments recorded yet" /> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>Paid on</th><th>For</th><th>How</th><th>Reference</th><th className="right">Amount</th></tr></thead>
            <tbody>{list.data.map((p) => <tr key={p.id}><td className="primary-cell"><b>{fmtDate(p.paid_on)}</b>{p.note ? <small>{p.note}</small> : null}</td><td data-label="For">{p.period_from || p.period_to ? `${fmtDate(p.period_from)} to ${fmtDate(p.period_to)}` : '—'}</td>
              <td data-label="How">{words(p.method)}</td><td data-label="Reference">{p.reference || '—'}</td><td data-label="Amount" className="right num"><b>{fmtMoney(p.amount)}</b></td></tr>)}</tbody></table></div>
        )}
      </section>
      {add ? <PaymentForm s={s} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); list.reload(); onSaved(); }} /> : null}
    </>
  );
}

function PaymentForm({ s, onClose, onSaved }: { s: Detail; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [amount, setAmount] = useState(s.subscription.estimate.amount ? String(s.subscription.estimate.amount) : ''); const [paidOn, setPaidOn] = useState(today()); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [method, setMethod] = useState('upi'); const [reference, setReference] = useState(''); const [note, setNote] = useState(''); const [extend, setExtend] = useState(true);
  const bad = !(Number(amount) > 0) ? 'Enter the amount' : !paidOn ? 'Pick the date' : from && to && to < from ? 'The period ends before it starts' : null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad) return;
    if (await act('save', () => api(`/admin/schools/${s.id}/payments`, { body: { amount: Number(amount), paid_on: paidOn, period_from: from || null, period_to: to || null, method, reference: reference.trim(), note: note.trim(), extend_valid_until: extend } }), 'Payment recorded')) onSaved();
  }
  return (
    <Drawer title="Record a payment" sub={s.name} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="pay-form" busy={busy === 'save'} disabled={!!bad}>Record payment</Button></>}>
      <form id="pay-form" className="stack" onSubmit={save} noValidate>
        <div className="cols"><Text label="Amount (₹)" value={amount} onChange={(v) => setAmount(v.replace(/[^\d.]/g, ''))} inputMode="decimal" /><Text label="Paid on" type="date" value={paidOn} onChange={setPaidOn} max={today()} />
          <Text label="Period from (optional)" type="date" value={from} onChange={setFrom} /><Text label="Period to (optional)" type="date" value={to} onChange={setTo} min={from} />
          <Select label="How it was paid" value={method} onChange={setMethod} options={[['upi', 'UPI'], ['bank', 'Bank transfer'], ['cash', 'Cash'], ['cheque', 'Cheque'], ['other', 'Other']]} /><Text label="Reference" value={reference} onChange={setReference} maxLength={80} /></div>
        <Text label="Note (optional)" value={note} onChange={setNote} maxLength={300} />
        <Switch label="Extend the paid-until date" hint={to ? `Paid until becomes ${fmtDate(to)} if that is later.` : `Adds one ${s.billing_cycle === 'yearly' ? 'year' : 'month'} to the paid-until date.`} checked={extend} onChange={setExtend} />
        {bad && amount ? <div className="alert bad" role="alert">{bad}</div> : null}
      </form>
    </Drawer>
  );
}

function Log({ sid }: { sid: number }) {
  const log = useLoad(() => api<AuditRow[]>('/admin/audit', { query: { school_id: sid } }), [sid]);
  if (log.error) return <ErrorBox message={log.error} onRetry={log.reload} />;
  if (!log.data) return <Loading rows={6} />;
  if (!log.data.length) return <div className="card"><Empty title="No activity recorded for this school" /></div>;
  return (
    <section className="card flush"><div className="tablewrap"><table className="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
      <tbody>{log.data.map((a) => <tr key={a.id}><td data-label="When" className="num">{fmtDateTime(a.at)}</td><td className="primary-cell"><b>{a.actor_name}</b><small>{words(a.actor_role)}</small></td><td data-label="What">{words(a.action)}</td><td data-label="Details">{a.detail || '—'}</td></tr>)}</tbody></table></div></section>
  );
}
