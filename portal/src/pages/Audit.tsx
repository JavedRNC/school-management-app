import { useMemo, useState } from 'react';
import { api, type AuditRow } from '../api';
import { Empty, ErrorBox, fmtDateTime, Loading, PageHead, Text, useLoad, words } from '../ui';

export function Audit() {
  const { data, error, loading, reload } = useLoad(() => api<AuditRow[]>('/admin/audit'), []);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((a) => !s || `${a.action} ${a.detail} ${a.actor_name}`.toLowerCase().includes(s));
  }, [data, q]);
  return (
    <>
      <PageHead title="Activity log" sub="The latest 300 recorded actions across the platform: sign-ins that matter, data downloads, imports, changes." />
      <div className="toolbar"><div className="search"><Text label="Filter" value={q} onChange={setQ} placeholder="Action, person or detail" type="search" /></div></div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      <section className="card flush">
        {loading ? <div style={{ padding: 18 }}><Loading rows={6} /></div> : rows.length ? (
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Action</th><th>Detail</th><th>By</th><th>When</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}><td className="primary-cell"><span>{words(a.action)}</span></td><td data-label="Detail">{a.detail || '—'}</td>
                <td data-label="By">{a.actor_name}{a.actor_role ? <span className="muted small"> · {words(a.actor_role)}</span> : null}</td>
                <td data-label="When">{fmtDateTime(a.at)}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title={q ? 'Nothing matches that filter' : 'No activity recorded yet'} />}
      </section>
    </>
  );
}

