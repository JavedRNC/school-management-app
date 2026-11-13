import { useMemo, useState } from 'react';
import { api } from '../api';
import { Chips, Drawer, IconButton, RowActions, Tabs, useAct, useConfirm } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, Loading, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass, type Person } from './ctx';

type Vehicle = { id: number; number: string; kind: string; capacity: number; insurance_until: string | null; fitness_until: string | null; driver_name: string; driver_phone: string; driver_licence: string;
  licence_until: string | null; attendant_name: string; attendant_phone: string; expiring: string[]; seats_used: number };
type Stop = { id?: number; name: string; pickup_time: string; drop_time: string; riders?: number };
type Route = { id: number; name: string; vehicle_id: number | null; vehicle_number: string | null; capacity: number | null; riders: number; stops: (Stop & { id: number })[] };
type Overview = { vehicles: Vehicle[]; routes: Route[]; riders: number; students: number; alerts: { vehicle: string; items: string[] }[] };
type Rider = { student_id: number; name: string; class_name: string; route_id: number; stop_id: number | null; stop_name: string | null };

export function Transport() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<'routes' | 'vehicles' | 'students'>('routes');
  const o = useLoad(() => api<Overview>('/transport/overview'), []);
  const [vehicle, setVehicle] = useState<Vehicle | 'new' | null>(null);
  const [route, setRoute] = useState<Route | 'new' | null>(null);
  const confirm = useConfirm();
  const { act } = useAct();
  const x = o.data;
  async function rmVehicle(v: Vehicle) {
    if (!(await confirm({ title: `Remove vehicle ${v.number}?`, body: 'Routes that use it are left without a vehicle. You can restore it from Settings → Archive.', confirm: 'Remove', danger: true }))) return;
    if (await act('rm', () => api(`/transport/vehicles/${v.id}`, { method: 'DELETE' }), `${v.number} removed`)) o.reload();
  }
  async function rmRoute(r: Route) {
    if (!(await confirm({ title: `Remove ${r.name}?`, body: r.riders ? `${r.riders} students use this route. Move them to another route first.` : 'This route has no students.', confirm: 'Remove', danger: true }))) return;
    if (await act('rm', () => api(`/transport/routes/${r.id}`, { method: 'DELETE' }), 'Route removed')) o.reload();
  }
  return (
    <>
      <PageHead title="Transport" sub={x ? `${x.riders} of ${x.students} students use school transport` : 'Vehicles, routes and who rides which bus'}>
        {canWrite && tab === 'routes' ? <Button kind="primary" icon="plus" onClick={() => setRoute('new')}>Add route</Button> : null}
        {canWrite && tab === 'vehicles' ? <Button kind="primary" icon="plus" onClick={() => setVehicle('new')}>Add vehicle</Button> : null}
      </PageHead>
      <ReadOnlyNote />
      {x?.alerts.length ? <div className="alert warn" style={{ marginBottom: 14 }}>Papers expiring within 30 days: {x.alerts.map((a) => `${a.vehicle} (${a.items.join(', ')})`).join('; ')}</div> : null}
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'routes', label: 'Routes & stops' }, { id: 'vehicles', label: 'Vehicles & drivers' }, { id: 'students', label: 'Students' }]} />
      {o.error ? <ErrorBox message={o.error} onRetry={o.reload} /> : !x ? <Loading rows={5} /> : tab === 'routes' ? (
        !x.routes.length ? <div className="card"><Empty title="No routes yet">Add a route with its stops, then put students on it.</Empty></div> : (
          <div className="grid g2">{x.routes.map((r) => (
            <section key={r.id} className="card">
              <div className="spread"><h2>{r.name}</h2>{canWrite ? <RowActions><IconButton icon="edit" label={`Edit ${r.name}`} onClick={() => setRoute(r)} /><IconButton icon="trash" danger label={`Remove ${r.name}`} onClick={() => rmRoute(r)} /></RowActions> : null}</div>
              <p className="small muted">{r.vehicle_number ?? 'No vehicle yet'} · {r.riders}{r.capacity ? ` of ${r.capacity} seats` : ' riders'}</p>
              {r.capacity ? <div className={`meter ${r.riders > r.capacity ? 'low' : 'high'}`} style={{ margin: '8px 0' }}><i style={{ width: `${Math.min(100, (100 * r.riders) / r.capacity)}%` }} /></div> : null}
              {r.stops.length ? <ol className="timeline" style={{ marginTop: 10 }}>{r.stops.map((s) => <li key={s.id}><div><b>{s.name}</b><div className="when">{s.pickup_time ? `pick-up ${s.pickup_time}` : 'no pick-up time'}{s.drop_time ? ` · drop ${s.drop_time}` : ''} · {s.riders ?? 0} students</div></div></li>)}</ol> : <p className="muted small">No stops yet.</p>}
            </section>
          ))}</div>
        )
      ) : tab === 'vehicles' ? (
        !x.vehicles.length ? <div className="card"><Empty title="No vehicles yet">Add your buses and vans with their driver and paper expiry dates.</Empty></div> : (
          <div className="grid g2">{x.vehicles.map((v) => (
            <section key={v.id} className="card">
              <div className="spread"><h2>{v.number}</h2>{canWrite ? <RowActions><IconButton icon="edit" label={`Edit ${v.number}`} onClick={() => setVehicle(v)} /><IconButton icon="trash" danger label={`Remove ${v.number}`} onClick={() => rmVehicle(v)} /></RowActions> : null}</div>
              <p className="small muted">{v.kind[0].toUpperCase() + v.kind.slice(1)} · {v.seats_used} of {v.capacity} seats used</p>
              <dl className="dl" style={{ marginTop: 10 }}>
                <div><dt>Driver</dt><dd>{v.driver_name || '—'}{v.driver_phone ? ` · ${v.driver_phone}` : ''}</dd></div><div><dt>Attendant</dt><dd>{v.attendant_name || '—'}{v.attendant_phone ? ` · ${v.attendant_phone}` : ''}</dd></div>
                <div><dt>Insurance until</dt><dd>{fmtDate(v.insurance_until)} {v.expiring.includes('Insurance') ? <Badge status="grace">Renew soon</Badge> : null}</dd></div>
                <div><dt>Fitness until</dt><dd>{fmtDate(v.fitness_until)} {v.expiring.includes('Fitness') ? <Badge status="grace">Renew soon</Badge> : null}</dd></div>
                <div><dt>Driver licence until</dt><dd>{fmtDate(v.licence_until)} {v.expiring.includes('Driver licence') ? <Badge status="grace">Renew soon</Badge> : null}</dd></div>
              </dl>
            </section>
          ))}</div>
        )
      ) : <Riders routes={x.routes} canWrite={canWrite} onChanged={o.reload} />}
      {vehicle ? <VehicleForm v={vehicle === 'new' ? null : vehicle} onClose={() => setVehicle(null)} onSaved={() => { setVehicle(null); o.reload(); }} /> : null}
      {route ? <RouteForm r={route === 'new' ? null : route} vehicles={x?.vehicles ?? []} onClose={() => setRoute(null)} onSaved={() => { setRoute(null); o.reload(); }} /> : null}
    </>
  );
}

function VehicleForm({ v, onClose, onSaved }: { v: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [f, setF] = useState({ number: v?.number ?? '', kind: v?.kind ?? 'bus', capacity: String(v?.capacity ?? 40), insurance_until: v?.insurance_until ?? '', fitness_until: v?.fitness_until ?? '', driver_name: v?.driver_name ?? '',
    driver_phone: v?.driver_phone ?? '', driver_licence: v?.driver_licence ?? '', licence_until: v?.licence_until ?? '', attendant_name: v?.attendant_name ?? '', attendant_phone: v?.attendant_phone ?? '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f, val: string) => setF((x) => ({ ...x, [k]: val }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (!f.number.trim()) bad.number = 'Enter the registration number';
    if (!(Number(f.capacity) >= 1 && Number(f.capacity) <= 120)) bad.capacity = '1 to 120 seats';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const body = { ...f, number: f.number.trim(), capacity: Number(f.capacity), insurance_until: f.insurance_until || null, fitness_until: f.fitness_until || null, licence_until: f.licence_until || null };
    if (await act('save', () => (v ? api(`/transport/vehicles/${v.id}`, { method: 'PUT', body }) : api('/transport/vehicles', { body })), v ? 'Vehicle saved' : `${body.number} added`)) onSaved();
  }
  return (
    <Drawer title={v ? `Edit ${v.number}` : 'Add vehicle'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="vehicle-form" busy={busy === 'save'}>{v ? 'Save changes' : 'Add vehicle'}</Button></>}>
      <form id="vehicle-form" className="stack" onSubmit={save} noValidate>
        <div className="cols"><Text label="Registration number" value={f.number} onChange={(x) => set('number', x)} error={err.number} maxLength={30} placeholder="JH01 AB 1234" />
          <Select label="Type" value={f.kind} onChange={(x) => set('kind', x)} options={[['bus', 'Bus'], ['van', 'Van'], ['auto', 'Auto'], ['other', 'Other']]} />
          <Text label="Seats" value={f.capacity} onChange={(x) => set('capacity', x.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" error={err.capacity} /></div>
        <fieldset><legend>Driver and attendant</legend><div className="cols">
          <Text label="Driver name" value={f.driver_name} onChange={(x) => set('driver_name', x)} maxLength={120} /><Text label="Driver phone" value={f.driver_phone} onChange={(x) => set('driver_phone', x)} inputMode="tel" maxLength={15} />
          <Text label="Driver licence no." value={f.driver_licence} onChange={(x) => set('driver_licence', x)} maxLength={40} /><Text label="Licence valid until" type="date" value={f.licence_until} onChange={(x) => set('licence_until', x)} />
          <Text label="Attendant name" value={f.attendant_name} onChange={(x) => set('attendant_name', x)} maxLength={120} /><Text label="Attendant phone" value={f.attendant_phone} onChange={(x) => set('attendant_phone', x)} inputMode="tel" maxLength={15} />
        </div></fieldset>
        <fieldset><legend>Papers</legend><div className="cols"><Text label="Insurance valid until" type="date" value={f.insurance_until} onChange={(x) => set('insurance_until', x)} /><Text label="Fitness valid until" type="date" value={f.fitness_until} onChange={(x) => set('fitness_until', x)} /></div></fieldset>
      </form>
    </Drawer>
  );
}

function RouteForm({ r, vehicles, onClose, onSaved }: { r: Route | null; vehicles: Vehicle[]; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [name, setName] = useState(r?.name ?? ''); const [vid, setVid] = useState(r?.vehicle_id ? String(r.vehicle_id) : '');
  const [stops, setStops] = useState<Stop[]>(r?.stops.map((s) => ({ id: s.id, name: s.name, pickup_time: s.pickup_time, drop_time: s.drop_time, riders: s.riders })) ?? [{ name: '', pickup_time: '', drop_time: '' }]);
  const [err, setErr] = useState<string | null>(null);
  const change = (i: number, p: Partial<Stop>) => setStops((x) => x.map((s, n) => (n === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) => setStops((x) => { const y = [...x]; const j = i + d; if (j < 0 || j >= y.length) return x; [y[i], y[j]] = [y[j], y[i]]; return y; });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr('Give the route a name'); return; }
    const clean = stops.filter((s) => s.name.trim()).map((s) => ({ id: s.id ?? null, name: s.name.trim(), pickup_time: s.pickup_time, drop_time: s.drop_time }));
    const body = { name: name.trim(), vehicle_id: vid ? Number(vid) : null, stops: clean };
    if (await act('save', () => (r ? api(`/transport/routes/${r.id}`, { method: 'PUT', body }) : api('/transport/routes', { body })), r ? 'Route saved' : `${body.name} added`)) onSaved();
  }
  return (
    <Drawer wide title={r ? `Edit ${r.name}` : 'Add route'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="route-form" busy={busy === 'save'}>{r ? 'Save changes' : 'Add route'}</Button></>}>
      <form id="route-form" className="stack" onSubmit={save} noValidate>
        <div className="cols"><Text label="Route name" value={name} onChange={(v) => { setName(v); setErr(null); }} error={err} maxLength={80} placeholder="Route 1 · Lalpur – Kanke Road" />
          <Select label="Vehicle" value={vid} onChange={setVid} options={[['', 'No vehicle yet'], ...vehicles.map((v): [string, string] => [String(v.id), `${v.number} · ${v.capacity} seats`])]} /></div>
        <h3>Stops, in the order of the morning pick-up</h3>
        <div className="stack">{stops.map((s, i) => (
          <div key={i} className="row" style={{ alignItems: 'end' }}>
            <div className="grow" style={{ minWidth: 160 }}><Text label={`Stop ${i + 1}`} value={s.name} onChange={(v) => change(i, { name: v })} maxLength={120} /></div>
            <div style={{ width: 128 }}><Text label="Pick-up" type="time" value={s.pickup_time} onChange={(v) => change(i, { pickup_time: v })} /></div>
            <div style={{ width: 128 }}><Text label="Drop" type="time" value={s.drop_time} onChange={(v) => change(i, { drop_time: v })} /></div>
            <RowActions><IconButton icon="back" label={`Move stop ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon="trash" danger label={`Remove stop ${i + 1}`} disabled={!!s.riders} onClick={() => setStops(stops.filter((_, n) => n !== i))} /></RowActions>
          </div>
        ))}</div>
        <div><Button kind="small" icon="plus" disabled={stops.length >= 40} onClick={() => setStops([...stops, { name: '', pickup_time: '', drop_time: '' }])}>Add stop</Button></div>
        {stops.some((s) => s.riders) ? <p className="small muted">A stop with students on it can't be removed. Move the students to another stop first.</p> : null}
      </form>
    </Drawer>
  );
}

function Riders({ routes, canWrite, onChanged }: { routes: Route[]; canWrite: boolean; onChanged: () => void }) {
  const [routeId, setRouteId] = useState('');
  const riders = useLoad(() => api<Rider[]>('/transport/students', { query: { route_id: routeId } }), [routeId]);
  const [add, setAdd] = useState(false);
  const { act, busy } = useAct();
  const remove = async (r: Rider) => { if (await act(`rm${r.student_id}`, () => api('/transport/students', { method: 'PUT', body: { student_ids: [r.student_id], route_id: null } }), `${r.name} taken off transport`)) { riders.reload(); onChanged(); } };
  const routeName = useMemo(() => new Map(routes.map((r) => [r.id, r.name])), [routes]);
  return (
    <>
      <div className="toolbar"><Select label="Route" value={routeId} onChange={setRouteId} options={[['', 'All routes'], ...routes.map((r): [string, string] => [String(r.id), r.name])]} />
        {canWrite && routes.length ? <Button kind="primary" icon="plus" onClick={() => setAdd(true)}>Put students on a route</Button> : null}</div>
      <section className="card flush">
        {riders.error ? <div style={{ padding: 18 }}><ErrorBox message={riders.error} onRetry={riders.reload} /></div> : !riders.data ? <div style={{ padding: 18 }}><Loading /></div> : !riders.data.length ? <Empty title="No students on transport here">{routes.length ? 'Use the button above to add them.' : 'Add a route first.'}</Empty> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>Student</th><th>Class</th><th>Route</th><th>Stop</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>{riders.data.map((r) => <tr key={r.student_id}><td className="primary-cell"><b>{r.name}</b></td><td data-label="Class">{r.class_name}</td><td data-label="Route">{routeName.get(r.route_id) ?? '—'}</td><td data-label="Stop">{r.stop_name ?? '—'}</td>
              <td className="plain">{canWrite ? <RowActions><Button kind="small" busy={busy === `rm${r.student_id}`} onClick={() => remove(r)} aria-label={`Take ${r.name} off transport`}>Take off</Button></RowActions> : null}</td></tr>)}</tbody></table></div>
        )}
      </section>
      {add ? <AssignRiders routes={routes} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); riders.reload(); onChanged(); }} /> : null}
    </>
  );
}

function AssignRiders({ routes, onClose, onSaved }: { routes: Route[]; onClose: () => void; onSaved: () => void }) {
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const [classId, setClassId] = useState(''); const [routeId, setRouteId] = useState(routes[0] ? String(routes[0].id) : ''); const [stopId, setStopId] = useState(''); const [ids, setIds] = useState<number[]>([]);
  const students = useLoad(() => (classId ? api<Person[]>('/users', { query: { role: 'student', class_id: classId } }) : Promise.resolve([] as Person[])), [classId]);
  const { act, busy } = useAct();
  const route = routes.find((r) => String(r.id) === routeId);
  const save = async () => { if (await act('save', () => api('/transport/students', { method: 'PUT', body: { student_ids: ids, route_id: Number(routeId), stop_id: stopId ? Number(stopId) : null } }), `${ids.length} students put on ${route?.name}`)) onSaved(); };
  return (
    <Drawer title="Put students on a route" sub="A student already on another route is moved to this one." onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'save'} disabled={!ids.length || !routeId} onClick={save}>Save {ids.length || ''} students</Button></>}>
      <Select label="Route" value={routeId} onChange={(v) => { setRouteId(v); setStopId(''); }} options={routes.map((r): [string, string] => [String(r.id), r.name])} />
      <Select label="Stop" value={stopId} onChange={setStopId} options={[['', 'Not decided'], ...(route?.stops ?? []).map((s): [string, string] => [String(s.id), s.name])]} />
      <Select label="Pick students from class" value={classId} onChange={(v) => { setClassId(v); setIds([]); }} options={[['', 'Pick a class'], ...(classes.data ?? []).map((c): [string, string] => [String(c.id), c.name])]} />
      {classId ? (students.data?.length ? <Chips label="Students" options={students.data.map((s) => ({ id: s.id, label: s.name }))} value={ids} onChange={setIds} /> : students.loading ? <Loading rows={2} /> : <p className="muted">No students in this class.</p>) : null}
    </Drawer>
  );
}
