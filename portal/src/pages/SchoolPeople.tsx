import { useMemo, useState } from 'react';
import { api, type User } from '../api';
import { Empty, ErrorBox, fmtInt, Loading, PageHead, Pager, Select, Text, useLoad, words } from '../ui';

type Cls = { id: number; name: string; student_count: number };
const ROLES: [string, string][] = [['student', 'Students'], ['teacher', 'Teachers'], ['parent', 'Parents'], ['vice_principal', 'Vice principals'], ['coordinator', 'Coordinators']];
const SIZE = 25;

export function SchoolPeople() {
  const [role, setRole] = useState('student');
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const classes = useLoad(() => api<Cls[]>('/classes'), []);
  const people = useLoad(() => api<User[]>('/users', { query: { role, class_id: role === 'student' ? cls : '' } }), [role, cls]);
  const name = (id?: number | null) => classes.data?.find((c) => c.id === id)?.name ?? '—';
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (people.data ?? []).filter((u) => !s || `${u.name} ${u.login_id} ${u.phone ?? ''}`.toLowerCase().includes(s));
  }, [people.data, q]);
  const shown = rows.slice((page - 1) * SIZE, page * SIZE);

  return (
    <>
      <PageHead title="People" sub="Read-only here. Add, edit or archive people in the Prangan app, or use Import & export for many at once." />
      <div className="toolbar">
        <Select label="Show" value={role} onChange={(v) => { setRole(v); setPage(1); }} options={ROLES} />
        {role === 'student' ? <Select label="Class" value={cls} onChange={(v) => { setCls(v); setPage(1); }} options={[['', 'All classes'], ...(classes.data ?? []).map((c): [string, string] => [String(c.id), c.name])]} /> : null}
        <div className="search"><Text label="Search" value={q} onChange={(v) => { setQ(v); setPage(1); }} type="search" placeholder="Name, login ID or phone" /></div>
      </div>
      {people.error ? <ErrorBox message={people.error} onRetry={people.reload} /> : null}
      <section className="card flush">
        {people.loading ? <div style={{ padding: 18 }}><Loading rows={6} /></div> : shown.length ? (
          <>
            <div className="tablewrap"><table className="t">
              <thead><tr><th>Name</th><th>Login ID</th>{role === 'student' ? <th>Class</th> : null}<th>Phone</th></tr></thead>
              <tbody>{shown.map((u) => (
                <tr key={u.id}><td className="primary-cell"><span>{u.name}</span><small>{words(u.role)}</small></td><td data-label="Login ID">{u.login_id}</td>
                  {role === 'student' ? <td data-label="Class">{name(u.class_id)}</td> : null}<td data-label="Phone">{u.phone || '—'}</td></tr>
              ))}</tbody>
            </table></div>
            <Pager page={page} size={SIZE} total={rows.length} onPage={setPage} />
          </>
        ) : <Empty title={q ? 'Nobody matches that search' : `No ${ROLES.find((r) => r[0] === role)?.[1].toLowerCase()} yet`}>{q ? 'Try fewer letters.' : 'Add them in the app or import a filled template.'}</Empty>}
      </section>
      {people.data ? <p className="small muted" style={{ marginTop: 10 }}>{fmtInt(people.data.length)} in this list.</p> : null}
    </>
  );
}
