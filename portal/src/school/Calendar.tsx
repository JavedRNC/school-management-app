import { useMemo, useState } from 'react';
import { api } from '../api';
import { Drawer, IconButton, RowActions, Switch, today, useAct, useConfirm } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, Loading, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, useSchool } from './ctx';

type Holiday = { id: number; name: string; start_date: string; end_date: string; kind: string; is_off: boolean; note: string };
const KINDS: [string, string][] = [['holiday', 'Holiday'], ['national', 'National holiday'], ['festival', 'Festival'], ['vacation', 'Vacation'], ['exam', 'Exam'], ['event', 'Event'], ['other', 'Other']];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Calendar() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const year = month.getFullYear();
  const list = useLoad(() => api<Holiday[]>('/holidays', { query: { start: `${year - 1}-12-01`, end: `${year + 1}-01-31` } }), [year]);
  const [edit, setEdit] = useState<Holiday | { start: string } | null>(null);
  const confirm = useConfirm();
  const { act, busy } = useAct();
  const working = school?.working_days ?? [0, 1, 2, 3, 4, 5];
  const cells = useMemo(() => {
    const first = new Date(month); const lead = (first.getDay() + 6) % 7;      // Monday first
    return Array.from({ length: 42 }, (_, i) => new Date(year, month.getMonth(), 1 - lead + i));
  }, [month, year]);
  const on = (d: string) => (list.data ?? []).filter((h) => h.start_date <= d && d <= h.end_date);
  const inMonth = (list.data ?? []).filter((h) => h.start_date <= iso(new Date(year, month.getMonth() + 1, 0)) && h.end_date >= iso(month)).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const shift = (n: number) => setMonth(new Date(year, month.getMonth() + n, 1));
  async function remove(h: Holiday) {
    if (!(await confirm({ title: `Remove ${h.name}?`, body: h.is_off ? 'These days become normal school days again and attendance can be marked.' : undefined, confirm: 'Remove', danger: true }))) return;
    if (await act('rm', () => api(`/holidays/${h.id}`, { method: 'DELETE' }), `${h.name} removed`)) list.reload();
  }
  async function national() {
    if (!(await confirm({ title: `Add national holidays for ${year}?`, body: 'Republic Day, Independence Day and Gandhi Jayanti are added if they are not already there.', confirm: 'Add holidays' }))) return;
    const r = await act('nat', () => api<Holiday[]>('/holidays/national', { method: 'POST', query: { year } }), (x) => (x.length ? `${x.length} national holidays added` : 'They were already in your calendar'));
    if (r) list.reload();
  }
  return (
    <>
      <PageHead title="Calendar" sub="Holidays, vacations and events. Days marked as closed are skipped in attendance.">
        {canWrite ? <><Button busy={busy === 'nat'} onClick={national}>Add national holidays</Button><Button kind="primary" icon="plus" onClick={() => setEdit({ start: today() })}>Add holiday or event</Button></> : null}
      </PageHead>
      <ReadOnlyNote />
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : null}
      <div className="grid g21">
        <section className="card">
          <div className="spread" style={{ marginBottom: 10 }}><h2 aria-live="polite">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
            <div className="row"><Button kind="small" onClick={() => shift(-1)} aria-label="Previous month">←</Button><Button kind="small" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>This month</Button><Button kind="small" onClick={() => shift(1)} aria-label="Next month">→</Button></div></div>
          <div className="cal">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
            {cells.map((d) => {
              const k = iso(d); const ev = on(k); const off = ev.some((h) => h.is_off); const weekly = !working.includes((d.getDay() + 6) % 7);
              return (
                <button key={k} type="button" className={`d ${d.getMonth() !== month.getMonth() ? 'out' : ''} ${k === today() ? 'today' : ''} ${off ? 'off' : weekly ? 'wk' : ''}`} disabled={!canWrite && !ev.length}
                  onClick={() => (ev.length ? setEdit(ev[0]) : canWrite ? setEdit({ start: k }) : undefined)} aria-label={`${fmtDate(k)}${ev.length ? `: ${ev.map((h) => h.name).join(', ')}` : weekly ? ': weekly off' : ''}`}>
                  <span className="n">{d.getDate()}</span>{ev.slice(0, 2).map((h) => <span key={h.id} className={`ev ${h.is_off ? 'off' : ''}`}>{h.name}</span>)}
                </button>
              );
            })}
          </div>
          <div className="legend"><span><i style={{ background: 'var(--bad)' }} />School closed</span><span><i style={{ background: 'var(--ink-soft)', border: '1px solid var(--line)' }} />Event, school open</span><span><i style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} />Weekly off</span></div>
        </section>
        <section className="card flush"><h2 style={{ padding: '16px 18px 8px' }}>This month</h2>
          {!list.data ? <div style={{ padding: 18 }}><Loading rows={3} /></div> : !inMonth.length ? <Empty title="Nothing this month">Click a day to add a holiday or event.</Empty> : (
            <div className="list">{inMonth.map((h) => (
              <div key={h.id} className="item"><div className="grow"><b>{h.name}</b><div className="small muted">{fmtDate(h.start_date)}{h.end_date !== h.start_date ? ` to ${fmtDate(h.end_date)}` : ''}</div>
                <Badge status={h.is_off ? 'expired' : 'free'}>{h.is_off ? 'School closed' : 'School open'}</Badge></div>
                {canWrite ? <RowActions><IconButton icon="edit" label={`Edit ${h.name}`} onClick={() => setEdit(h)} /><IconButton icon="trash" danger label={`Remove ${h.name}`} onClick={() => remove(h)} /></RowActions> : null}</div>
            ))}</div>
          )}
        </section>
      </div>
      {edit ? <HolidayForm h={'id' in edit ? edit : null} start={'id' in edit ? edit.start_date : edit.start} canWrite={canWrite} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} /> : null}
    </>
  );
}

function HolidayForm({ h, start, canWrite, onClose, onSaved }: { h: Holiday | null; start: string; canWrite: boolean; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [name, setName] = useState(h?.name ?? ''); const [from, setFrom] = useState(start); const [to, setTo] = useState(h?.end_date ?? start);
  const [kind, setKind] = useState(h?.kind ?? 'holiday'); const [off, setOff] = useState(h?.is_off ?? true); const [note, setNote] = useState(h?.note ?? '');
  const [err, setErr] = useState<Record<string, string>>({});
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (!name.trim()) bad.name = 'Give it a name';
    if (!from) bad.from = 'Pick the first day';
    if (to && to < from) bad.to = 'The last day is before the first day';
    else if (from && to && (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 120) bad.to = 'One entry can be at most 120 days long';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const body = { name: name.trim(), start_date: from, end_date: to || from, kind, is_off: off && kind !== 'event', note: note.trim() };
    if (await act('save', () => (h ? api(`/holidays/${h.id}`, { method: 'PUT', body }) : api('/holidays', { body })), h ? 'Saved' : `${body.name} added`)) onSaved();
  }
  return (
    <Drawer title={h ? h.name : 'Add holiday or event'} onClose={onClose} footer={canWrite ? <><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="holiday-form" busy={busy === 'save'}>{h ? 'Save changes' : 'Add to calendar'}</Button></> : undefined}>
      <form id="holiday-form" className="stack" onSubmit={save} noValidate>
        <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, background: 'none' }}>
          <Text label="Name" value={name} onChange={setName} error={err.name} maxLength={120} placeholder="Diwali break" />
          <div className="cols"><Text label="First day" type="date" value={from} onChange={(v) => { setFrom(v); if (!to || to < v) setTo(v); }} error={err.from} /><Text label="Last day" type="date" value={to} onChange={setTo} min={from} error={err.to} /></div>
          <Select label="Type" value={kind} onChange={(v) => { setKind(v); if (v === 'event' || v === 'exam') setOff(false); }} options={KINDS} />
          <Switch label="School is closed on these days" hint={kind === 'event' ? 'An event never closes the school. Choose Holiday or Vacation to close it.' : 'Attendance is not needed on closed days.'} checked={off && kind !== 'event'} onChange={setOff} disabled={!canWrite || kind === 'event'} />
          <Text label="Note (optional)" value={note} onChange={setNote} maxLength={300} />
        </fieldset>
      </form>
    </Drawer>
  );
}
