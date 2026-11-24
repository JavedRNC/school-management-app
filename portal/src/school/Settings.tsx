import { useEffect, useState } from 'react';
import { api, type AuditRow } from '../api';
import { Banners } from '../Banners';
import { Chips, DAYS, Switch, Tabs, useAct, useConfirm } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtDateTime, fmtInt, fmtMoney, Loading, PageHead, parseTime, Select, Text, useDebounced, useLoad, words } from '../ui';
import { ReadOnlyNote, useSchool, type Klass, type SchoolMe } from './ctx';

type Tab = 'profile' | 'privacy' | 'listing' | 'plan' | 'archive';
type Archived = { kind: string; id: number; label: string; archived_at: string | null };
type Showcase = { show: boolean; city: string; name: string; board: string };

export function Settings() {
  const { school, error, reload } = useSchool();
  const [tab, setTab] = useState<Tab>('profile');
  if (error) return <><PageHead title="Settings" /><ErrorBox message={error} onRetry={reload} /></>;
  if (!school) return <><PageHead title="Settings" /><Loading rows={6} /></>;
  return (
    <>
      <PageHead title="Settings" sub={`${school.name} · school code ${school.code}`} />
      <ReadOnlyNote />
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'profile', label: 'School profile' }, { id: 'privacy', label: 'Privacy & support' }, { id: 'listing', label: 'Website listing' }, { id: 'plan', label: 'Plan' }, { id: 'archive', label: 'Archive' }]} />
      {tab === 'profile' ? <Profile school={school} /> : tab === 'privacy' ? <Privacy school={school} /> : tab === 'listing' ? <Listing canWrite={school.can_write} /> : tab === 'plan' ? <Plan school={school} /> : <Archive canWrite={school.can_write} />}
    </>
  );
}

function Profile({ school }: { school: SchoolMe }) {
  const { setSchool } = useSchool();
  const { act, busy } = useAct();
  const [f, setF] = useState({ name: school.name, address: school.address, phone: school.phone, board: school.board, working_days: school.working_days });
  const [err, setErr] = useState<Record<string, string>>({});
  const ro = !school.can_write;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (f.name.trim().length < 2) bad.name = "Enter the school's name";
    if (!f.working_days.length) bad.days = 'Pick at least one working day';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const s = await act('save', () => api<SchoolMe>('/school/settings', { method: 'PUT', body: { ...f, name: f.name.trim(), working_days: [...f.working_days].sort() } }), 'School profile saved');
    if (s) setSchool(s);
  }
  return (
    <form className="card stack" style={{ maxWidth: 720 }} onSubmit={save} noValidate>
      <div className="cols">
        <div className="wide"><Text label="School name" value={f.name} onChange={(v) => setF({ ...f, name: v })} error={err.name} maxLength={160} disabled={ro} /></div>
        <div className="wide"><Text label="Address" value={f.address} onChange={(v) => setF({ ...f, address: v })} maxLength={300} disabled={ro} /></div>
        <Text label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} maxLength={20} inputMode="tel" disabled={ro} />
        <Text label="Board" value={f.board} onChange={(v) => setF({ ...f, board: v })} maxLength={40} placeholder="CBSE" disabled={ro} />
      </div>
      <div><Chips label="Working days" options={DAYS.map((d, i) => ({ id: i, label: d }))} value={f.working_days} onChange={(v) => !ro && setF({ ...f, working_days: v })} />
        {err.days ? <span className="field"><span className="err" role="alert">{err.days}</span></span> : <p className="small muted" style={{ marginTop: 6 }}>Attendance and the timetable follow these days.</p>}</div>
      {!ro ? <div><Button kind="primary" type="submit" busy={busy === 'save'}>Save profile</Button></div> : null}
    </form>
  );
}

function Privacy({ school }: { school: SchoolMe }) {
  const { setSchool } = useSchool();
  const { act, busy } = useAct();
  const confirm = useConfirm();
  const until = parseTime(school.support_access_until);
  const open = !!until && until.getTime() > Date.now();
  const share = async (v: boolean) => { const s = await act('share', () => api<SchoolMe>('/school/settings', { method: 'PUT', body: { share_contact_with_admin: v } }), v ? 'Contact details are shared with Prangan support' : 'Contact details are hidden from Prangan support'); if (s) setSchool(s); };
  async function allow() {
    if (!(await confirm({ title: 'Allow Prangan support for 24 hours?', body: 'Support staff will be able to see your people list with contact details, and import or export your data to help you. It switches off by itself after 24 hours, and everything they do is listed under Activity.', confirm: 'Allow for 24 hours' }))) return;
    const s = await act('sup', () => api<SchoolMe>('/school/support-access', { method: 'POST', query: { hours: 24 } }), 'Support access is on for 24 hours');
    if (s) setSchool(s);
  }
  const stop = async () => { const s = await act('sup', () => api<SchoolMe>('/school/support-access', { method: 'DELETE' }), 'Support access is off'); if (s) setSchool(s); };
  return (
    <div className="grid g2">
      <section className="card stack"><h2>Support access</h2>
        <p className="muted">Prangan's team cannot see your students' or parents' details unless you allow it.</p>
        <div className={`alert ${open ? 'warn' : 'ok'}`} role="status">{open ? `Support access is on until ${fmtDateTime(school.support_access_until)}.` : 'Support access is off.'}</div>
        {school.can_write ? <div>{open ? <Button busy={busy === 'sup'} onClick={stop}>Turn off now</Button> : <Button kind="primary" icon="shield" busy={busy === 'sup'} onClick={allow}>Allow for 24 hours</Button>}</div> : null}
      </section>
      <section className="card stack"><h2>Contact details</h2>
        <Switch label="Let Prangan support see phone numbers" hint="When off, support staff see names with phone numbers hidden, even in the activity log." checked={school.share_contact_with_admin} onChange={share} disabled={busy === 'share' || !school.can_write} />
      </section>
    </div>
  );
}

function Listing({ canWrite }: { canWrite: boolean }) {
  const s = useLoad(() => api<Showcase>('/school/showcase'), []);
  const { act, busy } = useAct();
  const [show, setShow] = useState(false); const [city, setCity] = useState('');
  useEffect(() => { if (s.data) { setShow(s.data.show); setCity(s.data.city); } }, [s.data]);
  if (s.error) return <ErrorBox message={s.error} onRetry={s.reload} />;
  if (!s.data) return <Loading />;
  const save = async (e: React.FormEvent) => { e.preventDefault(); const r = await act('save', () => api<Showcase>('/school/showcase', { method: 'PUT', body: { show, city: city.trim() } }), show ? 'Your school is listed on the Prangan website' : 'Your school is not listed'); if (r) s.setData(r); };
  return (
    <form className="card stack" style={{ maxWidth: 620 }} onSubmit={save}>
      <h2>Show your school on the Prangan website</h2>
      <p className="muted">Only the school's name, board and city are shown, in the list of schools that use Prangan. No student or staff details are ever shown.</p>
      <Switch label="List my school" checked={show} onChange={setShow} disabled={!canWrite} />
      <Text label="City or town shown" value={city} onChange={setCity} maxLength={60} disabled={!canWrite} />
      {canWrite ? <div><Button kind="primary" type="submit" busy={busy === 'save'}>Save listing</Button></div> : null}
    </form>
  );
}

function Plan({ school }: { school: SchoolMe }) {
  const sub = school.subscription;
  const e = sub.estimate;
  return (
    <div className="grid g2">
      <section className="card stack"><div className="spread"><h2>{sub.plan ?? 'No plan'} plan</h2><Badge status={sub.status} /></div>
        <dl className="dl">
          <div><dt>Students</dt><dd>{fmtInt(e.students)}{sub.max_students ? ` of ${fmtInt(sub.max_students)} allowed` : ''}</dd></div>
          <div><dt>{sub.billing_cycle === 'yearly' ? 'Billed yearly' : 'Billed monthly'}</dt><dd>{e.free ? 'Free' : `${fmtMoney(e.amount)} a month`}</dd></div>
          {!e.free ? <div><dt>Rate</dt><dd>{fmtMoney(e.price_per_student)} per student{e.min_monthly ? `, at least ${fmtMoney(e.min_monthly)}` : ''}{e.discount_pct ? ` · ${e.discount_pct}% off` : ''}</dd></div> : null}
          {sub.trial_until ? <div><dt>Trial until</dt><dd>{fmtDate(sub.trial_until)}</dd></div> : null}
          {sub.valid_until ? <div><dt>Paid until</dt><dd>{fmtDate(sub.valid_until)}</dd></div> : null}
          {sub.free_until ? <div><dt>Free until</dt><dd>{fmtDate(sub.free_until)}</dd></div> : null}
        </dl>
        <p className="small muted">To change your plan or add a feature, contact Prangan support.</p>
      </section>
      <section className="card"><h2>Features in your plan</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>{Object.entries(school.module_names).map(([k, name]) => (
          <li key={k} style={{ opacity: school.modules.includes(k) ? 1 : 0.5 }}>{name} {school.modules.includes(k) ? null : <Badge>Not in your plan</Badge>}</li>
        ))}</ul>
      </section>
    </div>
  );
}

function Archive({ canWrite }: { canWrite: boolean }) {
  const list = useLoad(() => api<Archived[]>('/archive'), []);
  const { act, busy } = useAct();
  const restore = async (a: Archived) => { if (await act(`${a.kind}${a.id}`, () => api(`/archive/${a.kind}/${a.id}/restore`, { method: 'POST' }), `${a.label} restored`)) list.reload(); };
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  if (!list.data.length) return <div className="card"><Empty title="Nothing in the archive">People, classes, exams and notices you remove are kept here so you can bring them back.</Empty></div>;
  return (
    <section className="card flush"><div className="list">{list.data.map((a) => (
      <div key={`${a.kind}-${a.id}`} className="item"><div className="grow"><b>{a.label}</b><div className="small muted">{words(a.kind)}{a.archived_at ? ` · removed ${fmtDate(a.archived_at)}` : ''}</div></div>
        {canWrite ? <Button kind="small" icon="restore" busy={busy === `${a.kind}${a.id}`} onClick={() => restore(a)} aria-label={`Restore ${a.label}`}>Restore</Button> : null}</div>
    ))}</div></section>
  );
}

// ---------------------------------------------------------------- activity log
const GROUPS: [string, string][] = [['', 'Everything'], ['people', 'People & sign-ins'], ['attendance', 'Attendance'], ['marks', 'Marks & exams'],
  ['classes', 'Classes & timetable'], ['notices', 'Notices & calendar'], ['fees', 'Fees & payroll'], ['leaves', 'Leaves'], ['transport', 'Transport'],
  ['settings', 'Settings & data'], ['support', 'Prangan support only']];
const PAGE = 100;
export function Activity() {
  const [group, setGroup] = useState('');
  const [text, setText] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useDebounced(text.trim(), 350);
  const query = { admin_only_: group === 'support' ? 'true' : undefined, group: group && group !== 'support' ? group : undefined, q: q || undefined,
    date_from: from || undefined, date_to: to || undefined, limit: String(PAGE) };
  const log = useLoad(() => api<AuditRow[]>('/school/audit', { query }), [group, q, from, to], true);
  const [older, setOlder] = useState<AuditRow[]>([]);
  const [end, setEnd] = useState(false);
  const { act, busy } = useAct();
  useEffect(() => { setOlder([]); setEnd(false); }, [log.data]);
  const rows = [...(log.data ?? []), ...older];
  const more = async () => {
    const last = rows[rows.length - 1];
    const next = await act('more', () => api<AuditRow[]>('/school/audit', { query: { ...query, before_id: String(last.id) } }));
    if (next) { setOlder((o) => [...o, ...next]); if (next.length < PAGE) setEnd(true); }
  };
  const filtered = !!(group || q || from || to);
  return (
    <>
      <PageHead title="Activity" sub="A record of important changes in your school — who changed what, with the old and new value — including anything done by Prangan support" />
      <div className="toolbar">
        <div className="search"><Text label="Search" value={text} onChange={setText} placeholder="Person, student, class or change" type="search" /></div>
        <Select label="Show" value={group} onChange={setGroup} options={GROUPS} />
        <Text label="From" type="date" value={from} onChange={setFrom} />
        <Text label="To" type="date" value={to} onChange={setTo} />
        {filtered ? <Button kind="small" onClick={() => { setGroup(''); setText(''); setFrom(''); setTo(''); }}>Clear filters</Button> : null}
      </div>
      <section className="card flush">
        {log.error ? <div style={{ padding: 18 }}><ErrorBox message={log.error} onRetry={log.reload} /></div> : !log.data ? <div style={{ padding: 18 }}><Loading rows={6} /></div> : !rows.length ? <Empty title={group === 'support' ? 'Prangan support has not done anything in your school' : filtered ? 'Nothing matches these filters' : 'No activity yet'} /> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
            <tbody>{rows.map((a) => <tr key={a.id}><td data-label="When" className="num">{fmtDateTime(a.at)}</td><td className="primary-cell"><b>{a.actor_name}</b><small>{words(a.actor_role)}</small></td><td data-label="What">{words(a.action)}</td><td data-label="Details" className="wrap-text">{a.detail || '—'}</td></tr>)}</tbody></table></div>
        )}
      </section>
      {log.data && rows.length >= PAGE && !end ? <div className="row" style={{ marginTop: 12 }}><Button busy={busy === 'more'} onClick={more}>Show older</Button></div> : null}
    </>
  );
}

export function SchoolBanners() {
  const { school, has } = useSchool();
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  return <><ReadOnlyNote /><Banners base="/banners" classes={classes.data ?? []} canWrite={school?.can_write !== false} images={has('communication')} /></>;
}
