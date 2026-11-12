import { Link } from 'react-router-dom';
import { api, type AuditRow, type OnboardingSummary, type Overview, type Trends } from '../api';
import { BarChart } from '../charts';
import { Badge, Empty, ErrorBox, fmtDate, fmtDateTime, fmtInt, Loading, PageHead, STATUS_LABEL, useLoad, words } from '../ui';

const monthLabel = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

export function AdminDashboard() {
  const ov = useLoad(() => api<Overview>('/admin/overview'), []);
  const ob = useLoad(() => api<OnboardingSummary>('/admin/onboarding/summary'), []);
  const tr = useLoad(() => api<Trends>('/admin/trends', { query: { months: 12 } }), []);
  const au = useLoad(() => api<AuditRow[]>('/admin/audit'), []);
  const o = ov.data;
  const active = o ? Object.entries(o.by_status).filter(([k]) => ['active', 'free', 'trial', 'grace'].includes(k)).reduce((n, [, v]) => n + v, 0) : 0;

  return (
    <>
      <PageHead title="Platform dashboard" sub="Every number here is counted live from the Prangan database." />
      {ov.error ? <ErrorBox message={ov.error} onRetry={ov.reload} /> : null}
      <div className="grid g4 keep2">
        <Link className="card stat accent" to="/admin/schools"><span className="label">Registered schools</span><span className="value">{o ? fmtInt(o.schools) : '…'}</span>
          <span className="hint">{o ? `${fmtInt(active)} in use · ${fmtInt(o.schools - active)} expired or suspended` : ' '}</span></Link>
        <Link className="card stat" to="/admin/requests?status=PENDING"><span className="label">Pending requests</span><span className="value">{ob.data ? fmtInt(ob.data.pending) : '…'}</span>
          <span className="hint">{ob.data ? `${fmtInt(ob.data.total)} received in all` : ' '}</span></Link>
        <div className="card stat"><span className="label">Students</span><span className="value">{o ? fmtInt(o.students) : '…'}</span><span className="hint">across all schools</span></div>
        <div className="card stat"><span className="label">Teachers</span><span className="value">{o ? fmtInt(o.teachers) : '…'}</span><span className="hint">{o ? `${fmtInt(o.parents)} parents` : ' '}</span></div>
      </div>

      <div className="grid g21" style={{ marginTop: 14 }}>
        <section className="card">
          <h2>Schools joined and requests received, last 12 months</h2>
          {tr.loading ? <Loading rows={3} /> : tr.error ? <ErrorBox message={tr.error} onRetry={tr.reload} /> : tr.data ? (
            <BarChart labels={tr.data.months.map(monthLabel)} a={tr.data.schools_joined} b={tr.data.requests} nameA="Schools joined" nameB="Requests"
              summary={`Schools joined per month: ${tr.data.schools_joined.join(', ')}. Requests per month: ${tr.data.requests.join(', ')}.`} />
          ) : null}
        </section>
        <section className="card">
          <h2>Onboarding requests by status</h2>
          {ob.loading ? <Loading rows={4} /> : ob.error ? <ErrorBox message={ob.error} onRetry={ob.reload} /> : ob.data && ob.data.total ? (
            <table className="t"><tbody>
              {Object.entries(ob.data.by_status).map(([k, v]) => (
                <tr key={k}><td className="plain"><Link to={`/admin/requests?status=${k}`}>{STATUS_LABEL[k]}</Link></td><td className="right num plain"><b>{fmtInt(v)}</b></td></tr>
              ))}
            </tbody></table>
          ) : <Empty title="No requests yet">Requests from the website and the app appear here.</Empty>}
        </section>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <section className="card flush">
          <div className="spread" style={{ padding: '16px 18px 8px' }}><h2>Latest onboarding requests</h2><Link to="/admin/requests" className="small">See all</Link></div>
          {ob.data?.latest.length ? (
            <table className="t"><thead><tr><th>School</th><th>Received</th><th>Status</th></tr></thead><tbody>
              {ob.data.latest.map((r) => (
                <tr key={r.id}><td className="primary-cell"><Link to={`/admin/requests/${r.id}`}>{r.school_name}</Link><small>{r.city} · {r.reference}</small></td>
                  <td data-label="Received">{fmtDate(r.created_at)}</td><td data-label="Status"><Badge status={r.status} /></td></tr>
              ))}
            </tbody></table>
          ) : <Empty title="Nothing waiting" />}
        </section>
        <section className="card flush">
          <div className="spread" style={{ padding: '16px 18px 8px' }}><h2>Recent activity</h2><Link to="/admin/audit" className="small">See all</Link></div>
          {au.loading ? <div style={{ padding: 18 }}><Loading /></div> : au.data?.length ? (
            <table className="t"><thead><tr><th>What</th><th>Who</th><th>When</th></tr></thead><tbody>
              {au.data.slice(0, 6).map((a) => (
                <tr key={a.id}><td className="primary-cell"><span>{words(a.action)}</span><small>{a.detail}</small></td>
                  <td data-label="Who">{a.actor_name}</td><td data-label="When">{fmtDateTime(a.at)}</td></tr>
              ))}
            </tbody></table>
          ) : <Empty title="No activity recorded yet" />}
        </section>
      </div>

      {o?.expiring_soon.length ? (
        <section className="card flush" style={{ marginTop: 14 }}>
          <div style={{ padding: '16px 18px 8px' }}><h2>Subscriptions ending in the next 15 days</h2></div>
          <table className="t"><thead><tr><th>School</th><th>Valid until</th><th>Students</th></tr></thead><tbody>
            {o.expiring_soon.map((s) => (
              <tr key={s.id}><td className="primary-cell"><Link to={`/admin/schools/${s.id}`}>{s.name}</Link><small>{s.code}</small></td>
                <td data-label="Valid until">{fmtDate(s.valid_until)}</td><td data-label="Students" className="num">{fmtInt(s.students)}</td></tr>
            ))}
          </tbody></table>
        </section>
      ) : null}
    </>
  );
}
