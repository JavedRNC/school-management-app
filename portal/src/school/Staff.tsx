import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar, dayLabel, Tabs, today, useAct } from '../kit';
import { Badge, Button, Empty, ErrorBox, Loading, PageHead, parseTime, Text, useLoad, useToast } from '../ui';
import { ReadOnlyNote, ROLE_LABEL, useSchool } from './ctx';

type DayRow = { user_id: number; name: string; role: string; login_id: string; status: string; check_in_at?: string | null; check_out_at?: string | null; manual?: boolean };
type Day = { date: string; is_school_day: boolean; reason: string; rows: DayRow[]; summary: { present: number; late: number; leave: number; absent: number } };
type Report = { month: string; school_days: number; rows: { user_id: number; name: string; role: string; present: number; late: number; leave: number; absent: number; percent: number }[] };
type Geo = { lat: number | null; lng: number | null; radius_m: number; late_after: string; configured: boolean };
const clock = (s: string) => parseTime(s)?.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) ?? '';
const TONE: Record<string, string> = { present: 'active', late: 'trial', leave: 'free', absent: 'expired' };

export function Staff() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<'day' | 'month' | 'setup'>('day');
  return (
    <>
      <PageHead title="Staff attendance" sub="Staff check in from the app when they are inside the school. You can also mark someone by hand." />
      <ReadOnlyNote />
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'day', label: 'Day' }, { id: 'month', label: 'Monthly report' }, { id: 'setup', label: 'School location' }]} />
      {tab === 'day' ? <DayView canWrite={canWrite} /> : tab === 'month' ? <Month /> : <Setup canWrite={canWrite} />}
    </>
  );
}

function DayView({ canWrite }: { canWrite: boolean }) {
  const [day, setDay] = useState(today());
  const d = useLoad(() => api<Day>('/staff-attendance/day', { query: { day } }), [day], true);
  const { act, busy } = useAct();
  const mark = async (r: DayRow, present: boolean) => {
    if (!d.data || d.data.date !== day) return;
    if (await act(`m${r.user_id}`, () => api('/staff-attendance/manual', { body: { user_id: r.user_id, date: day, present, note: 'Marked from the portal' } }), `${r.name} marked ${present ? 'present' : 'absent'}`)) d.reload();
  };
  const x = d.data;
  return (
    <>
      <div className="toolbar"><Text label="Day" type="date" value={day} onChange={(v) => v && setDay(v)} max={today()} /></div>
      {d.error ? <ErrorBox message={d.error} onRetry={d.reload} /> : !x ? <Loading rows={6} /> : (
        <section className="card flush">
          <div className="spread" style={{ padding: '14px 18px' }}><h2>{dayLabel(x.date)}</h2>
            <div className="row"><Badge status="active">{x.summary.present} present</Badge><Badge status="trial">{x.summary.late} late</Badge><Badge status="free">{x.summary.leave} on leave</Badge><Badge status="expired">{x.summary.absent} absent</Badge></div></div>
          {!x.is_school_day ? <div className="alert warn" style={{ margin: '0 18px 14px' }}>Not a school day{x.reason ? ` (${x.reason})` : ''}.</div> : null}
          {!x.rows.length ? <Empty title="No staff accounts yet" /> : <div className="list">{x.rows.map((r) => (
            <div key={r.user_id} className="item"><div className="person grow"><Avatar name={r.name} /><div><b>{r.name}</b><small>{ROLE_LABEL[r.role] ?? r.role} · {r.login_id}{r.check_in_at ? ` · in ${clock(r.check_in_at)}` : ''}{r.check_out_at ? ` · out ${clock(r.check_out_at)}` : ''}{r.manual ? ' · marked by hand' : ''}</small></div></div>
              <Badge status={TONE[r.status]}>{r.status}</Badge>
              {canWrite && r.status !== 'leave' ? (r.status === 'absent'
                ? <Button kind="small" busy={busy === `m${r.user_id}`} onClick={() => mark(r, true)} aria-label={`Mark ${r.name} present`}>Mark present</Button>
                : <Button kind="small" busy={busy === `m${r.user_id}`} onClick={() => mark(r, false)} aria-label={`Mark ${r.name} absent`}>Mark absent</Button>) : null}
            </div>
          ))}</div>}
        </section>
      )}
    </>
  );
}

function Month() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const r = useLoad(() => api<Report>('/staff-attendance/report', { query: { month } }), [month]);
  return (
    <>
      <div className="toolbar"><Text label="Month" type="month" value={month} onChange={(v) => v && setMonth(v)} max={today().slice(0, 7)} /></div>
      {r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : !r.data ? <Loading rows={6} /> : !r.data.rows.length ? <div className="card"><Empty title="No staff accounts yet" /></div> : (
        <section className="card flush"><p className="muted small" style={{ padding: '14px 18px 4px' }}>{r.data.school_days} school days so far this month</p>
          <div className="tablewrap"><table className="t"><thead><tr><th>Staff member</th><th className="right">Present</th><th className="right">Late</th><th className="right">Leave</th><th className="right">Absent</th><th style={{ width: 180 }}>Attendance</th></tr></thead>
            <tbody>{r.data.rows.map((x) => (
              <tr key={x.user_id}><td className="primary-cell"><b>{x.name}</b><small>{ROLE_LABEL[x.role] ?? x.role}</small></td><td data-label="Present" className="right num">{x.present}</td><td data-label="Late" className="right num">{x.late}</td>
                <td data-label="Leave" className="right num">{x.leave}</td><td data-label="Absent" className="right num">{x.absent}</td>
                <td data-label="Attendance"><div className="row" style={{ flexWrap: 'nowrap' }}><div className={`meter grow ${x.percent < 60 ? 'low' : x.percent < 80 ? 'mid' : 'high'}`}><i style={{ width: `${x.percent}%` }} /></div><span className="num small">{x.percent}%</span></div></td></tr>
            ))}</tbody></table></div></section>
      )}
    </>
  );
}

function Setup({ canWrite }: { canWrite: boolean }) {
  const g = useLoad(() => api<Geo>('/staff-attendance/settings'), []);
  const toast = useToast();
  const { act, busy } = useAct();
  const [lat, setLat] = useState(''); const [lng, setLng] = useState(''); const [radius, setRadius] = useState('150'); const [late, setLate] = useState('08:45'); const [finding, setFinding] = useState(false);
  useEffect(() => { if (g.data) { setLat(g.data.lat === null ? '' : String(g.data.lat)); setLng(g.data.lng === null ? '' : String(g.data.lng)); setRadius(String(g.data.radius_m)); setLate(g.data.late_after); } }, [g.data]);
  if (g.error) return <ErrorBox message={g.error} onRetry={g.reload} />;
  if (!g.data) return <Loading />;
  const here = () => {
    if (!navigator.geolocation) { toast('This browser cannot find your location. Type the numbers instead.', true); return; }
    setFinding(true);
    navigator.geolocation.getCurrentPosition((p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setFinding(false); toast(`Location found, accurate to about ${Math.round(p.coords.accuracy)} m`); },
      () => { setFinding(false); toast('Location was not allowed. Type the numbers instead.', true); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  const la = Number(lat), lo = Number(lng), ra = Number(radius);
  const bad = lat === '' || lng === '' || Number.isNaN(la) || Number.isNaN(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180 ? 'Enter a valid latitude (−90 to 90) and longitude (−180 to 180)' : !(ra >= 50 && ra <= 1000) ? 'Distance must be 50 to 1000 metres' : !/^\d\d:\d\d$/.test(late) ? 'Set the late time' : null;
  const save = async (e: React.FormEvent) => { e.preventDefault(); if (bad) return; const r = await act('save', () => api<Geo>('/staff-attendance/settings', { method: 'PUT', body: { lat: la, lng: lo, radius_m: ra, late_after: late } }), 'School location saved'); if (r) g.setData(r); };
  return (
    <form className="card stack" style={{ maxWidth: 620 }} onSubmit={save} noValidate>
      <h2>Where is the school?</h2>
      <p className="muted small">Staff can check in only when their phone is within this distance of the school. Open this page on a device that is at the school and use "Use my location", or copy the numbers from a maps app.</p>
      {!g.data.configured ? <div className="alert warn">The location is not set yet, so staff cannot check in from the app.</div> : null}
      <div className="cols"><Text label="Latitude" value={lat} onChange={setLat} inputMode="decimal" disabled={!canWrite} placeholder="23.344100" /><Text label="Longitude" value={lng} onChange={setLng} inputMode="decimal" disabled={!canWrite} placeholder="85.309600" />
        <Text label="Allowed distance (metres)" value={radius} onChange={(v) => setRadius(v.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" disabled={!canWrite} /><Text label="Late after" type="time" value={late} onChange={setLate} disabled={!canWrite} /></div>
      {bad && (lat || lng) ? <div className="alert bad" role="alert">{bad}</div> : null}
      {canWrite ? <div className="row"><Button icon="pin" busy={finding} onClick={here}>Use my location</Button><Button kind="primary" type="submit" busy={busy === 'save'} disabled={!!bad}>Save location</Button>
        {lat && lng && !bad ? <a className="btn" href={`https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`} target="_blank" rel="noreferrer noopener">Check on a map</a> : null}</div> : null}
    </form>
  );
}
