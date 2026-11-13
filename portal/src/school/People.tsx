import { useCallback, useMemo, useState } from 'react';
import { api } from '../api';
import { Avatar, Chips, Drawer, IconButton, RowActions, Tabs, useAct, useConfirm, useFilter } from '../kit';
import { Badge, Button, Empty, ErrorBox, Loading, PageHead, Select, Text, useLoad, useToast } from '../ui';
import { ReadOnlyNote, ROLE_LABEL, useSchool, type Klass, type Person } from './ctx';

type RoleTab = 'student' | 'teacher' | 'parent' | 'vice_principal' | 'coordinator';
const PLURAL: Record<RoleTab, string> = { student: 'Students', teacher: 'Teachers', parent: 'Parents', vice_principal: 'Vice principals', coordinator: 'Coordinators' };
export const AREAS: [string, string][] = [['insights', 'Dashboard & reports'], ['people', 'People'], ['classes', 'Classes & timetable'], ['attendance', 'Attendance'], ['exams', 'Exams & marks'],
  ['notices', 'Notices & homework'], ['calendar', 'Calendar'], ['leaves', 'Leaves'], ['staff_attendance', 'Staff attendance'], ['transport', 'Transport'], ['fees', 'Fees'], ['settings', 'Settings']];
// the same starting rights the server and the app give a new Vice Principal or Coordinator
const DEFAULT_RIGHTS: Record<string, Record<string, string>> = {
  vice_principal: { insights: 'view', people: 'edit', classes: 'edit', attendance: 'edit', exams: 'edit', notices: 'edit', calendar: 'edit', settings: 'view', leaves: 'edit', staff_attendance: 'view', transport: 'edit', fees: 'view' },
  coordinator: { insights: 'view', people: 'view', classes: 'view', attendance: 'edit', exams: 'edit', notices: 'edit', calendar: 'view', settings: 'none', leaves: 'view', staff_attendance: 'none', transport: 'view', fees: 'none' },
};
const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

export function newPassword(len = 10) {
  const set = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => set[n % set.length]).join('');
}

export function People() {
  const { has, school } = useSchool();
  const [tab, setTab] = useState<RoleTab>('student');
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);
  const [pw, setPw] = useState<Person | null>(null);
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const list = useLoad(() => api<Person[]>('/users', { query: { role: tab, class_id: tab === 'student' ? classId : undefined } }), [tab, classId]);
  const students = useLoad(() => (tab === 'parent' ? api<Person[]>('/users', { query: { role: 'student' } }) : Promise.resolve([] as Person[])), [tab === 'parent']);
  const confirm = useConfirm();
  const { act } = useAct();
  const text = useCallback((u: Person) => `${u.name} ${u.login_id} ${u.phone} ${u.roll_no ?? ''}`, []);
  const rows = useFilter(list.data, q, text);
  const className = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);
  const studentName = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);
  const tabs = (['student', 'teacher', 'parent', ...(has('extra_roles') ? ['vice_principal', 'coordinator'] : [])] as RoleTab[]).map((id) => ({ id, label: PLURAL[id] }));
  const canWrite = school?.can_write !== false;

  async function archive(u: Person) {
    if (!(await confirm({ title: `Remove ${u.name}?`, body: 'They will no longer be able to sign in. Their attendance, marks and fee history are kept, and you can restore them from Settings → Archive.', confirm: 'Remove', danger: true }))) return;
    if (await act(`rm${u.id}`, () => api(`/users/${u.id}`, { method: 'DELETE' }), `${u.name} removed`)) list.reload();
  }

  return (
    <>
      <PageHead title="People" sub="Everyone who can sign in to your school's Prangan">
        {canWrite ? <><Button icon="upload" onClick={() => setBulk(true)}>Add many</Button><Button kind="primary" icon="plus" onClick={() => setEdit('new')}>Add {ROLE_LABEL[tab].toLowerCase()}</Button></> : null}
      </PageHead>
      <ReadOnlyNote />
      <Tabs label="Type of person" value={tab} onChange={(t) => { setTab(t); setQ(''); }} tabs={tabs} />
      <div className="toolbar">
        <div className="search"><Text label="Search" value={q} onChange={setQ} placeholder="Name, login ID or phone" type="search" /></div>
        {tab === 'student' ? <Select label="Class" value={classId} onChange={setClassId} options={[['', 'All classes'], ...(classes.data ?? []).map((c): [string, string] => [String(c.id), c.name])]} /> : null}
      </div>
      <section className="card flush">
        {list.error ? <div style={{ padding: 18 }}><ErrorBox message={list.error} onRetry={list.reload} /></div>
          : list.loading && !list.data ? <div style={{ padding: 18 }}><Loading rows={6} /></div>
          : !rows.length ? <Empty title={q ? `No ${PLURAL[tab].toLowerCase()} match "${q}"` : `No ${PLURAL[tab].toLowerCase()} yet`}>{q ? 'Check the spelling or clear the search.' : 'Add one now, or use Add many to paste a whole list.'}</Empty>
          : (
            <div className="tablewrap"><table className="t">
              <thead><tr><th>Name</th><th>Login ID</th>{tab === 'student' ? <><th>Class</th><th>Roll no.</th></> : null}{tab === 'parent' ? <th>Children</th> : null}<th>Phone</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>{rows.slice(0, 300).map((u) => (
                <tr key={u.id}>
                  <td className="primary-cell"><div className="person"><Avatar name={u.name} /><div><b>{u.name}</b>{u.must_change_password ? <small>Has not signed in yet</small> : null}</div></div></td>
                  <td data-label="Login ID" className="num">{u.login_id}</td>
                  {tab === 'student' ? <><td data-label="Class">{u.class_id ? className.get(u.class_id) ?? '—' : '—'}</td><td data-label="Roll no." className="num">{u.roll_no ?? '—'}</td></> : null}
                  {tab === 'parent' ? <td data-label="Children">{u.children_ids.length ? u.children_ids.map((id) => studentName.get(id)?.name ?? '…').join(', ') : <Badge status="grace">Not linked</Badge>}</td> : null}
                  <td data-label="Phone" className="num">{u.phone || '—'}</td>
                  <td className="plain">{canWrite ? <RowActions>
                    <IconButton icon="edit" label={`Edit ${u.name}`} onClick={() => setEdit(u)} />
                    <IconButton icon="key" label={`Reset password of ${u.name}`} onClick={() => setPw(u)} />
                    <IconButton icon="trash" label={`Remove ${u.name}`} danger onClick={() => archive(u)} />
                  </RowActions> : null}</td>
                </tr>
              ))}</tbody>
            </table>
            {rows.length > 300 ? <p className="small muted" style={{ padding: 14 }}>Showing the first 300 of {rows.length}. Search to narrow the list.</p> : null}
            </div>
          )}
      </section>
      {edit ? <PersonForm role={tab} person={edit === 'new' ? null : edit} classes={classes.data ?? []} students={students.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); classes.reload(); }} /> : null}
      {pw ? <ResetPassword person={pw} onClose={() => setPw(null)} /> : null}
      {bulk ? <AddMany role={tab} classes={classes.data ?? []} onClose={() => setBulk(false)} onSaved={() => { list.reload(); classes.reload(); }} /> : null}
    </>
  );
}

function PersonForm({ role, person, classes, students, onClose, onSaved }: { role: RoleTab; person: Person | null; classes: Klass[]; students: Person[]; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [f, setF] = useState(() => ({
    name: person?.name ?? '', login_id: person?.login_id ?? '', password: person ? '' : newPassword(), phone: person?.phone ?? '', email: person?.email ?? '', address: person?.address ?? '',
    dob: person?.dob ?? '', blood_group: person?.blood_group ?? '', class_id: person?.class_id ? String(person.class_id) : '', roll_no: person?.roll_no ? String(person.roll_no) : '',
    children_ids: person?.children_ids ?? [], scope_class_ids: person?.scope_class_ids ?? [],
    permissions: { ...(DEFAULT_RIGHTS[role] ?? {}), ...(person?.permissions ?? {}) } as Record<string, string>, relation: 'Parent',
  }));
  const [err, setErr] = useState<Record<string, string>>({});
  const [kidQ, setKidQ] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const idLabel = role === 'student' ? 'Admission no. (login ID)' : role === 'parent' ? 'Mobile number (login ID)' : role === 'teacher' ? 'Employee code (login ID)' : 'Login ID';
  const staffRole = role === 'vice_principal' || role === 'coordinator';
  const kids = useMemo(() => {
    const s = kidQ.trim().toLowerCase();
    return students.filter((k) => f.children_ids.includes(k.id) || (s && `${k.name} ${k.login_id}`.toLowerCase().includes(s))).slice(0, 30);
  }, [students, kidQ, f.children_ids]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (f.name.trim().length < 2) bad.name = 'Enter the full name';
    if (!f.login_id.trim()) bad.login_id = 'This is what they type to sign in';
    if (!person && f.password.length < 8) bad.password = 'At least 8 characters';
    if (role === 'student' && !f.class_id) bad.class_id = 'Pick a class';
    if (f.phone && !/^[0-9+\- ]{7,15}$/.test(f.phone.trim())) bad.phone = 'Digits only, 7 to 15 long';
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) bad.email = "This doesn't look like an email address";
    setErr(bad);
    if (Object.keys(bad).length) return;
    const body: Record<string, unknown> = {
      name: f.name, login_id: f.login_id, phone: f.phone, email: f.email, address: f.address, dob: f.dob || null, blood_group: f.blood_group,
      ...(role === 'student' ? { class_id: Number(f.class_id), roll_no: f.roll_no ? Number(f.roll_no) : null } : {}),
      ...(role === 'parent' ? { children_ids: f.children_ids, ...(person ? {} : { relation: f.relation }) } : {}),
      ...(staffRole ? { permissions: f.permissions } : {}),
      ...(role === 'coordinator' ? { scope_class_ids: f.scope_class_ids } : {}),
    };
    const done = person
      ? await act('save', () => api(`/users/${person.id}`, { method: 'PUT', body }), `${f.name.trim()} saved`)
      : await act('save', () => api('/users', { body: { ...body, role, password: f.password } }), `${f.name.trim()} added`);
    if (done) onSaved();
  }

  return (
    <Drawer title={person ? `Edit ${person.name}` : `Add ${ROLE_LABEL[role].toLowerCase()}`} sub={person ? ROLE_LABEL[role] : 'They set their own password the first time they sign in.'} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="person-form" busy={busy === 'save'}>{person ? 'Save changes' : `Add ${ROLE_LABEL[role].toLowerCase()}`}</Button></>}>
      <form id="person-form" className="stack" onSubmit={save} noValidate>
        <Text label="Full name" value={f.name} onChange={(v) => set('name', v)} error={err.name} maxLength={120} autoComplete="off" />
        <div className="cols">
          <Text label={idLabel} value={f.login_id} onChange={(v) => set('login_id', v)} error={err.login_id} maxLength={60} autoComplete="off" />
          {!person ? <Text label="Temporary password" value={f.password} onChange={(v) => set('password', v)} error={err.password} hint="Share this with them once." maxLength={72} autoComplete="off" /> : null}
        </div>
        {role === 'student' ? (
          <div className="cols">
            <Select label="Class" value={f.class_id} onChange={(v) => set('class_id', v)} error={err.class_id} options={[['', 'Pick a class'], ...classes.map((c): [string, string] => [String(c.id), c.name])]} />
            <Text label="Roll no." value={f.roll_no} onChange={(v) => set('roll_no', v.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" />
          </div>
        ) : null}
        <div className="cols">
          <Text label="Phone" value={f.phone} onChange={(v) => set('phone', v)} error={err.phone} inputMode="tel" maxLength={15} />
          <Text label="Email" value={f.email} onChange={(v) => set('email', v)} error={err.email} type="email" maxLength={160} />
          {role === 'student' ? <><Text label="Date of birth" value={f.dob} onChange={(v) => set('dob', v)} type="date" max="2099-12-31" /><Select label="Blood group" value={f.blood_group} onChange={(v) => set('blood_group', v)} options={BLOOD} /></> : null}
          <div className="wide"><Text label="Address" value={f.address} onChange={(v) => set('address', v)} maxLength={300} /></div>
        </div>
        {role === 'parent' ? (
          <div className="stack">
            <Text label="Children" value={kidQ} onChange={setKidQ} placeholder="Type a student's name or admission no." hint="A parent sees attendance, marks and fees only for linked children." type="search" />
            {kids.length ? <Chips label="Tap to link or unlink" options={kids.map((k) => ({ id: k.id, label: `${k.name} · ${k.login_id}` }))} value={f.children_ids} onChange={(v) => set('children_ids', v)} /> : null}
            {!person ? <Select label="Relation to the child" value={f.relation} onChange={(v) => set('relation', v)} options={['Parent', 'Father', 'Mother', 'Guardian']} /> : null}
          </div>
        ) : null}
        {role === 'coordinator' ? <Chips label="Classes they look after (none selected = all classes)" options={classes.map((c) => ({ id: c.id, label: c.name }))} value={f.scope_class_ids} onChange={(v) => set('scope_class_ids', v)} /> : null}
        {staffRole ? (
          <fieldset><legend>What they can do</legend>
            <div><Button kind="small" icon="restore" onClick={() => set('permissions', { ...DEFAULT_RIGHTS[role] })}>Reset to the usual rights</Button></div>
            <div className="permgrid">
              {AREAS.map(([k, label]) => (
                <PermRow key={k} label={label} value={f.permissions[k] ?? 'none'} onChange={(v) => set('permissions', { ...f.permissions, [k]: v })} />
              ))}
            </div>
          </fieldset>
        ) : null}
      </form>
    </Drawer>
  );
}

function PermRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <span>{label}</span>
      <div className="seg small" role="group" aria-label={label}>
        {(['none', 'view', 'edit'] as const).map((l) => <button key={l} type="button" aria-pressed={value === l} onClick={() => onChange(l)}>{l === 'none' ? 'No access' : l === 'view' ? 'View' : 'Edit'}</button>)}
      </div>
    </>
  );
}

function ResetPassword({ person, onClose }: { person: Person; onClose: () => void }) {
  const { act, busy } = useAct();
  const toast = useToast();
  const [pw, setPw] = useState(() => newPassword());
  const [done, setDone] = useState(false);
  const save = async () => { if (await act('pw', () => api(`/users/${person.id}`, { method: 'PUT', body: { password: pw } }))) setDone(true); };
  const copy = async () => { try { await navigator.clipboard.writeText(`Login ID: ${person.login_id}\nPassword: ${pw}`); toast('Copied'); } catch { toast('Copy it by hand — the browser blocked copying', true); } };
  return (
    <Drawer title={`Reset password · ${person.name}`} sub="They are signed out everywhere and must choose a new password after signing in with this one." onClose={onClose}
      footer={done ? <><Button icon="copy" onClick={copy}>Copy</Button><Button kind="primary" onClick={onClose}>Done</Button></> : <><Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'pw'} onClick={save} disabled={pw.length < 8}>Reset password</Button></>}>
      {done ? (
        <><div className="alert ok" role="status">Password reset. Share these details with {person.name} now — they are not shown again.</div>
          <div className="cred"><span>Login ID: {person.login_id}</span><span>Password: {pw}</span></div></>
      ) : (
        <><Text label="New temporary password" value={pw} onChange={setPw} maxLength={72} autoComplete="off" error={pw.length < 8 ? 'At least 8 characters' : null} />
          <Button icon="refresh" kind="small" onClick={() => setPw(newPassword())}>Make another</Button></>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------- add many (paste from Excel)
type BulkField = { key: string; label: string; required?: boolean; hint?: string };
function fieldsFor(role: RoleTab): BulkField[] {
  if (role === 'student') return [{ key: 'name', label: 'Name', required: true }, { key: 'login_id', label: 'Admission no.', required: true }, { key: 'class', label: 'Class', required: true },
    { key: 'roll_no', label: 'Roll no.' }, { key: 'dob', label: 'Date of birth', hint: '31/05/2013' }, { key: 'parent_name', label: 'Parent name' }, { key: 'parent_mobile', label: 'Parent mobile' }];
  if (role === 'parent') return [{ key: 'name', label: 'Name', required: true }, { key: 'login_id', label: 'Mobile', required: true }, { key: 'email', label: 'Email' }];
  return [{ key: 'name', label: 'Name', required: true }, { key: 'login_id', label: role === 'teacher' ? 'Employee code' : 'Login ID', required: true }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }];
}
type Cred = { name: string; role: string; class?: string | null; login_id: string; password: string };
type BulkResult = { ok: boolean; errors: { row: number | null; field?: string | null; message: string }[]; count: number; links: number; by_role: Record<string, number>; credentials?: Cred[] };
const MAX_ROWS = 300;
const blankRows = (n: number) => Array.from({ length: n }, () => ({} as Record<string, string>));
const csvCell = (v: string) => { let s = v ?? ''; if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function AddMany({ role, classes, onClose, onSaved }: { role: RoleTab; classes: Klass[]; onClose: () => void; onSaved: () => void }) {
  const fields = useMemo(() => fieldsFor(role), [role]);
  const { act, busy } = useAct();
  const toast = useToast();
  const [rows, setRows] = useState(() => blankRows(5));
  const [errs, setErrs] = useState<Record<number, Record<string, string>>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [checked, setChecked] = useState<BulkResult | null>(null);
  const [creds, setCreds] = useState<Cred[] | null>(null);
  const filled = rows.filter((r) => Object.values(r).some((v) => (v ?? '').trim()));

  const setCell = (i: number, k: string, v: string) => { setRows((rs) => rs.map((r, n) => (n === i ? { ...r, [k]: v } : r))); setChecked(null); };
  function onPaste(e: React.ClipboardEvent, i: number, col: number) {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text)) return;                 // a single value: let the browser paste it normally
    e.preventDefault();
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split('\t'));
    setRows((rs) => {
      const next = rs.map((r) => ({ ...r }));
      lines.forEach((cells, li) => {
        const at = i + li;
        if (at >= MAX_ROWS) return;
        while (next.length <= at) next.push({});
        cells.forEach((c, ci) => { const f = fields[col + ci]; if (f) next[at][f.key] = c.trim(); });
      });
      return next;
    });
    setChecked(null);
    if (i + lines.length > MAX_ROWS) toast(`Only the first ${MAX_ROWS} rows were kept`, true);
  }
  async function send(dry: boolean) {
    const map: number[] = [];
    const payload = rows.flatMap((r, i) => (Object.values(r).some((v) => (v ?? '').trim()) ? (map.push(i), [r]) : []));
    const res = await act(dry ? 'check' : 'save', () => api<BulkResult>('/users/bulk', { body: { role, rows: payload, dry_run: dry } }));
    if (!res) return;
    const e: Record<number, Record<string, string>> = {};
    const whole: string[] = [];
    const cols = new Set(fields.map((f) => f.key));
    for (const x of res.errors) {
      const at = x.row ? map[x.row - 1] : undefined;
      if (at === undefined) whole.push(x.message);                               // about the whole list (for example the plan's student limit)
      else (e[at] ??= {})[x.field && cols.has(x.field) ? x.field : '_row'] = x.message;
    }
    setErrs(e); setGeneral(whole);
    if (!res.ok) { setChecked(null); toast(`${res.errors.length} ${res.errors.length === 1 ? 'problem' : 'problems'} to fix — nothing was saved`, true); return; }
    if (dry) { setChecked(res); return; }
    setCreds(res.credentials ?? []);
    onSaved();
  }
  function downloadCreds() {
    if (!creds) return;
    const csv = ['Name,Role,Class,Login ID,Temporary password', ...creds.map((c) => [c.name, c.role, c.class ?? '', c.login_id, c.password].map(csvCell).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'new-logins.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  if (creds) return (
    <Drawer wide title={`${creds.length} ${creds.length === 1 ? 'login' : 'logins'} created`} sub="Download this list now. Passwords are not shown again." onClose={onClose}
      footer={<><Button icon="download" onClick={downloadCreds}>Download list (CSV)</Button><Button kind="primary" onClick={onClose}>Done</Button></>}>
      <div className="alert warn">Everyone must choose their own password the first time they sign in. Keep this list private.</div>
      <div className="tablewrap"><table className="t"><thead><tr><th>Name</th><th>Role</th><th>Login ID</th><th>Temporary password</th></tr></thead>
        <tbody>{creds.map((c) => <tr key={`${c.role}-${c.login_id}`}><td className="primary-cell"><b>{c.name}</b>{c.class ? <small>{c.class}</small> : null}</td><td data-label="Role">{ROLE_LABEL[c.role] ?? c.role}</td><td data-label="Login ID" className="num">{c.login_id}</td><td data-label="Password"><code>{c.password}</code></td></tr>)}</tbody></table></div>
    </Drawer>
  );

  return (
    <Drawer wide title={`Add many ${PLURAL[role].toLowerCase()}`} sub="Type, or copy rows from Excel and paste into the first cell. Nothing is saved unless every row is correct." onClose={onClose}
      footer={<>
        <span className="muted small grow">{filled.length} of {MAX_ROWS} rows{checked ? ` · checked: ${checked.count} new ${checked.count === 1 ? 'login' : 'logins'}${checked.links ? `, ${checked.links} parent links` : ''}` : ''}</span>
        <Button onClick={onClose}>Cancel</Button>
        {checked ? <Button kind="primary" busy={busy === 'save'} onClick={() => send(false)}>Create {checked.count} {checked.count === 1 ? 'login' : 'logins'}</Button>
          : <Button kind="primary" busy={busy === 'check'} disabled={!filled.length} onClick={() => send(true)}>Check rows</Button>}
      </>}>
      {role === 'student' && classes.length ? <p className="small muted">Classes: {classes.map((c) => c.name).join(', ')}. A parent login is made for each new parent mobile and linked to the child.</p> : null}
      {general.map((m) => <div key={m} className="alert bad" role="alert">{m}</div>)}
      <div className="tablewrap"><table className="bulk">
        <thead><tr><th>#</th>{fields.map((f) => <th key={f.key}>{f.label}{f.required ? ' *' : ''}</th>)}<th /></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td className="rowno">{i + 1}</td>
            {fields.map((f, ci) => (
              <td key={f.key}>
                <input className={`input ${errs[i]?.[f.key] ? 'bad' : ''}`} value={r[f.key] ?? ''} onChange={(e) => setCell(i, f.key, e.target.value)} onPaste={(e) => onPaste(e, i, ci)}
                  aria-label={`${f.label}, row ${i + 1}`} aria-invalid={errs[i]?.[f.key] ? true : undefined} placeholder={f.hint} maxLength={160} />
                {errs[i]?.[f.key] ? <div className="msg" role="alert">{errs[i][f.key]}</div> : null}
                {ci === 0 && errs[i]?._row ? <div className="msg" role="alert">{errs[i]._row}</div> : null}
              </td>
            ))}
            <td><IconButton icon="close" label={`Clear row ${i + 1}`} onClick={() => { setRows((rs) => (rs.length > 1 ? rs.filter((_, n) => n !== i) : [{}])); setErrs({}); setChecked(null); }} /></td>
          </tr>
        ))}</tbody>
      </table></div>
      <div><Button kind="small" icon="plus" disabled={rows.length >= MAX_ROWS} onClick={() => setRows((rs) => [...rs, ...blankRows(Math.min(5, MAX_ROWS - rs.length))])}>Add 5 rows</Button></div>
    </Drawer>
  );
}
