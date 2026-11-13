import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { LineChart } from '../charts';
import { Chips, CountUp, Drawer, IconButton, Switch, Tabs, TextArea, today, useAct, useConfirm } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, fmtInt, fmtMoney, Loading, Modal, PageHead, Select, Text, useDebounced, useLoad } from '../ui';
import { ReadOnlyNote, useSchool, type Klass } from './ctx';

type Pay = { id: number; receipt_no: string | null; student_id: number; student_name: string; admission_no: string; class_name: string; amount: number; mode: string; reference: string;
  paid_on: string; status: string; note: string; cancel_reason: string; received_by_name: string; submitted_by_name: string; created_at: string; outstanding?: number };
type Summary = { period: string; period_label: string; collected_today: number; receipts_today: number; collected_month: number; by_mode: Record<string, number>; expected_month: number; collection_pct: number;
  outstanding: number; overdue: number; defaulters: number; students_with_dues: number; pending_claims: number; trend: { date: string; amount: number }[];
  by_class: { class_id: number; class_name: string; students: number; outstanding: number; overdue: number; defaulters: number; collected_month: number }[]; recent: Pay[]; configured: boolean; billed_this_month: boolean };
type StudentRow = { id: number; name: string; admission_no: string; class_name: string; roll_no: number | null; status: string; charged: number; paid: number; outstanding: number; overdue: number; parent_name: string; parent_phone: string };
type Item = { id: number; kind: string; title: string; amount: number; paid: number; balance: number; due_date: string; status: string };
type Detail = { student: { id: number; name: string; admission_no: string; class_name: string; roll_no: number | null; active: boolean }; totals: { charged: number; paid: number; outstanding: number; overdue: number; next_due: string | null };
  items: Item[]; payments: Pay[]; parent: { name: string; phone: string } | null };
type Config = { monthly_amount: number; class_amounts: Record<string, number>; route_amounts: Record<string, number>; due_day: number; start_month: string | null; auto_generate: boolean; upi_id: string; upi_name: string;
  receipt_prefix: string; receipt_note: string; classes: { id: number; name: string; students: number; amount: number; custom: boolean }[]; routes: { id: number; name: string; riders: number; amount: number }[];
  transport_enabled: boolean; expected_monthly: number; current_period: string; generated_months: string[] };
type Batch = { id: number; title: string; amount: number; due_date: string | null; note: string; target_label: string; count: number; paid_count: number; expected: number; collected: number; outstanding: number };
type Receipt = { id: number; receipt_no: string; status: string; cancel_reason: string; amount: number; amount_words: string; mode: string; reference: string; paid_on: string; note: string; received_by_name: string; academic_year: string;
  school: { name: string; code: string; address: string; phone: string }; student: { name: string; admission_no: string; class_name: string; roll_no: number | null }; parent_name: string;
  lines: { title: string; charge: number; amount: number }[]; balance_after: number; footer: string };
type Tab = 'overview' | 'students' | 'receipts' | 'claims' | 'charges' | 'setup';
const MODES: [string, string][] = [['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['bank', 'Bank transfer'], ['online', 'Online']];
const modeLabel = (m: string) => MODES.find((x) => x[0] === m)?.[1] ?? m;
const TONE: Record<string, string> = { paid: 'active', clear: 'active', due: 'trial', partial: 'trial', overdue: 'expired', confirmed: 'active', pending: 'trial', cancelled: 'expired', rejected: 'expired' };
const dayShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function Fees() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<Tab>('overview');
  const [student, setStudent] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<number | null>(null);
  const sum = useLoad(() => api<Summary>('/fees/summary'), []);
  const [tick, setTick] = useState(0);
  const changed = () => { sum.reload(); setTick((t) => t + 1); };
  return (
    <>
      <PageHead title="Fees" sub={sum.data ? `${sum.data.period_label} · ${sum.data.collection_pct}% of this month's fees collected` : 'Collect fees, give receipts and follow up on dues'} />
      <ReadOnlyNote />
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'students', label: 'Students & dues' }, { id: 'receipts', label: 'Receipts' },
        { id: 'claims', label: 'UPI payments to check', count: sum.data?.pending_claims }, { id: 'charges', label: 'One-time charges' }, { id: 'setup', label: 'Fee setup' }]} />
      {tab === 'overview' ? <Overview sum={sum} canWrite={canWrite} onChanged={changed} onReceipt={setReceipt} goSetup={() => setTab('setup')} /> : null}
      {tab === 'students' ? <Students tick={tick} onOpen={setStudent} /> : null}
      {tab === 'receipts' ? <Receipts tick={tick} onReceipt={setReceipt} /> : null}
      {tab === 'claims' ? <Claims canWrite={canWrite} onChanged={changed} /> : null}
      {tab === 'charges' ? <Charges canWrite={canWrite} onChanged={changed} /> : null}
      {tab === 'setup' ? <Setup canWrite={canWrite} onSaved={changed} /> : null}
      {student ? <StudentFees id={student} canWrite={canWrite} onClose={() => setStudent(null)} onChanged={changed} onReceipt={setReceipt} /> : null}
      {receipt ? <ReceiptView id={receipt} canWrite={canWrite} onClose={() => setReceipt(null)} onChanged={changed} /> : null}
    </>
  );
}

function Overview({ sum, canWrite, onChanged, onReceipt, goSetup }: { sum: ReturnType<typeof useLoad<Summary>>; canWrite: boolean; onChanged: () => void; onReceipt: (id: number) => void; goSetup: () => void }) {
  const { act, busy } = useAct();
  const [gen, setGen] = useState<{ period: string; label: string; new_items: number; new_amount: number; students: number; due_date: string } | null>(null);
  const s = sum.data;
  if (sum.error) return <ErrorBox message={sum.error} onRetry={sum.reload} />;
  if (!s) return <Loading rows={6} />;
  if (!s.configured) return <div className="card"><Empty title="Set up your fees first">Enter the monthly fee and when it is due. Then Prangan bills every student each month.<div style={{ marginTop: 14 }}><Button kind="primary" onClick={goSetup}>Open fee setup</Button></div></Empty></div>;
  const preview = async () => { const r = await act('gen', () => api<NonNullable<typeof gen>>('/fees/generate', { body: { period: s.period, preview: true } })); if (r) setGen(r); };
  const generate = async () => { if (gen && await act('gen2', () => api('/fees/generate', { body: { period: gen.period } }), `${gen.label} fees billed to ${gen.students} students`)) { setGen(null); onChanged(); } };
  return (
    <div className="stack">
      {!s.billed_this_month && canWrite ? <div className="alert warn"><span className="grow">{s.period_label} fees are not billed yet.</span><Button kind="small" busy={busy === 'gen'} onClick={preview}>Bill {s.period_label}</Button></div> : null}
      <div className="grid g4 keep2">
        <div className="card stat accent"><span className="label">Collected in {s.period_label}</span><span className="value"><CountUp value={s.collected_month} format={fmtMoney} /></span><span className="hint">of {fmtMoney(s.expected_month)} billed</span></div>
        <div className="card stat"><span className="label">Collected today</span><span className="value"><CountUp value={s.collected_today} format={fmtMoney} /></span><span className="hint">{s.receipts_today} receipts</span></div>
        <div className="card stat"><span className="label">Outstanding</span><span className="value"><CountUp value={s.outstanding} format={fmtMoney} /></span><span className="hint">{s.students_with_dues} students</span></div>
        <div className="card stat"><span className="label">Overdue</span><span className="value" style={{ color: s.overdue ? 'var(--bad)' : undefined }}><CountUp value={s.overdue} format={fmtMoney} /></span><span className="hint">{s.defaulters} students past the due date</span></div>
      </div>
      <div className="grid g21">
        <section className="card"><h2>Collection, last {s.trend.length} days</h2>
          {s.trend.some((t) => t.amount > 0) ? <LineChart summary={`Fees collected each day for the last ${s.trend.length} days`} points={s.trend.map((t) => ({ label: dayShort(t.date), value: t.amount }))} /> : <Empty title="No collection in this period" />}
        </section>
        <section className="card"><h2>How it was paid</h2>
          {Object.keys(s.by_mode).length ? <div className="stack">{Object.entries(s.by_mode).sort((a, b) => b[1] - a[1]).map(([m, v]) => (
            <div key={m}><div className="spread small"><span>{modeLabel(m)}</span><b className="num">{fmtMoney(v)}</b></div><div className="meter"><i style={{ width: `${s.collected_month ? (100 * v) / s.collected_month : 0}%` }} /></div></div>
          ))}</div> : <p className="muted">Nothing collected this month yet.</p>}
        </section>
      </div>
      <section className="card flush"><h2 style={{ padding: '16px 18px 8px' }}>Class by class</h2>
        <div className="tablewrap"><table className="t"><thead><tr><th>Class</th><th className="right">Students</th><th className="right">Collected this month</th><th className="right">Outstanding</th><th className="right">Overdue</th><th className="right">Past due date</th></tr></thead>
          <tbody>{s.by_class.map((c) => <tr key={c.class_id}><td className="primary-cell"><b>{c.class_name}</b></td><td data-label="Students" className="right num">{c.students}</td><td data-label="Collected" className="right num">{fmtMoney(c.collected_month)}</td>
            <td data-label="Outstanding" className="right num">{fmtMoney(c.outstanding)}</td><td data-label="Overdue" className="right num">{fmtMoney(c.overdue)}</td><td data-label="Past due date" className="right num">{c.defaulters}</td></tr>)}</tbody></table></div>
      </section>
      <section className="card flush"><h2 style={{ padding: '16px 18px 8px' }}>Latest receipts</h2>
        {s.recent.length ? <div className="list">{s.recent.map((p) => (
          <button key={p.id} type="button" className="item" onClick={() => onReceipt(p.id)}><div className="grow"><b>{p.student_name}</b><div className="small muted">{p.receipt_no} · {p.class_name} · {fmtDate(p.paid_on)} · {modeLabel(p.mode)}</div></div><b className="num">{fmtMoney(p.amount)}</b></button>
        ))}</div> : <Empty title="No receipts yet">Open Students & dues to collect a fee.</Empty>}
      </section>
      {gen ? (
        <Modal title={`Bill ${gen.label} fees?`} onClose={() => setGen(null)} actions={<><Button onClick={() => setGen(null)}>Cancel</Button><Button kind="primary" busy={busy === 'gen2'} disabled={!gen.new_items} onClick={generate}>Bill {gen.students} students</Button></>}>
          <p className="muted">{gen.new_items ? `${gen.new_items} charges totalling ${fmtMoney(gen.new_amount)} will be added, due on ${fmtDate(gen.due_date)}. Students already billed for ${gen.label} are skipped.` : `Everyone is already billed for ${gen.label}.`}</p>
        </Modal>
      ) : null}
    </div>
  );
}

function Students({ tick, onOpen }: { tick: number; onOpen: (id: number) => void }) {
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const [classId, setClassId] = useState(''); const [status, setStatus] = useState('all'); const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const list = useLoad(() => api<StudentRow[]>('/fees/students', { query: { class_id: classId, status, q: dq } }), [classId, status, dq, tick]);
  return (
    <>
      <div className="toolbar">
        <div className="search"><Text label="Search" type="search" value={q} onChange={setQ} placeholder="Student name or admission no." /></div>
        <Select label="Class" value={classId} onChange={setClassId} options={[['', 'All classes'], ...(classes.data ?? []).map((c): [string, string] => [String(c.id), c.name])]} />
        <Select label="Show" value={status} onChange={setStatus} options={[['all', 'Everyone'], ['due', 'With dues'], ['overdue', 'Overdue only'], ['clear', 'Fully paid']]} />
      </div>
      <section className="card flush">
        {list.error ? <div style={{ padding: 18 }}><ErrorBox message={list.error} onRetry={list.reload} /></div> : !list.data ? <div style={{ padding: 18 }}><Loading rows={6} /></div>
          : !list.data.length ? <Empty title="No students match">Change the filters above.</Empty> : (
            <div className="tablewrap"><table className="t"><thead><tr><th>Student</th><th>Class</th><th>Parent</th><th className="right">Paid</th><th className="right">Outstanding</th><th>Status</th></tr></thead>
              <tbody>{list.data.slice(0, 300).map((r) => (
                <tr key={r.id} className="click" onClick={() => onOpen(r.id)}>
                  <td className="primary-cell"><a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(r.id); }}>{r.name}</a><small>{r.admission_no}</small></td>
                  <td data-label="Class">{r.class_name}</td><td data-label="Parent">{r.parent_name || '—'}{r.parent_phone ? <small className="muted"> · {r.parent_phone}</small> : null}</td>
                  <td data-label="Paid" className="right num">{fmtMoney(r.paid)}</td><td data-label="Outstanding" className="right num"><b>{fmtMoney(r.outstanding)}</b></td>
                  <td data-label="Status"><Badge status={TONE[r.status]}>{r.status === 'clear' ? 'Paid up' : r.status === 'overdue' ? `Overdue ${fmtMoney(r.overdue)}` : 'Due'}</Badge></td>
                </tr>
              ))}</tbody></table></div>
          )}
      </section>
    </>
  );
}

function StudentFees({ id, canWrite, onClose, onChanged, onReceipt }: { id: number; canWrite: boolean; onClose: () => void; onChanged: () => void; onReceipt: (id: number) => void }) {
  const d = useLoad(() => api<Detail>(`/fees/students/${id}`), [id]);
  const { act, busy } = useAct();
  const [mode, setMode] = useState<'view' | 'collect' | 'charge'>('view');
  const [editItem, setEditItem] = useState<Item | null>(null);
  const x = d.data;
  const open = useMemo(() => (x?.items ?? []).filter((i) => i.balance > 0), [x]);
  const [pick, setPick] = useState<number[]>([]);
  const [amount, setAmount] = useState(''); const [pm, setPm] = useState('cash'); const [ref, setRef] = useState(''); const [paidOn, setPaidOn] = useState(today()); const [note, setNote] = useState('');
  const [cTitle, setCTitle] = useState(''); const [cAmt, setCAmt] = useState(''); const [cDue, setCDue] = useState(today());
  const pickedDue = open.filter((i) => pick.includes(i.id)).reduce((a, i) => a + i.balance, 0);
  const startCollect = () => { setPick(open.map((i) => i.id)); setAmount(String(open.reduce((a, i) => a + i.balance, 0))); setPm('cash'); setRef(''); setNote(''); setPaidOn(today()); setMode('collect'); };
  const togglePick = (ids: number[]) => { setPick(ids); setAmount(String(open.filter((i) => ids.includes(i.id)).reduce((a, i) => a + i.balance, 0))); };
  const needRef = pm === 'cheque' || pm === 'bank' || pm === 'upi' || pm === 'online';
  const payErr = !(Number(amount) > 0) ? 'Enter the amount received' : Number(amount) > pickedDue + 0.009 ? `More than the dues selected (${fmtMoney(pickedDue)})` : needRef && !ref.trim() ? 'Enter the reference number' : null;
  async function collect(e: React.FormEvent) {
    e.preventDefault();
    if (payErr) return;
    const r = await act('pay', () => api<{ id: number; receipt_no: string }>('/fees/payments', { body: { student_id: id, amount: Number(amount), mode: pm, reference: ref.trim(), paid_on: paidOn, item_ids: pick, note } }), (p) => `Receipt ${p.receipt_no} issued`);
    if (r) { setMode('view'); d.reload(); onChanged(); onReceipt(r.id); }
  }
  async function addCharge(e: React.FormEvent) {
    e.preventDefault();
    if (await act('charge', () => api('/fees/items', { body: { student_id: id, title: cTitle.trim(), amount: Number(cAmt), due_date: cDue || null } }), 'Charge added')) { setMode('view'); setCTitle(''); setCAmt(''); d.reload(); onChanged(); }
  }
  return (
    <Drawer wide title={x ? x.student.name : 'Student fees'} sub={x ? `${x.student.class_name} · ${x.student.admission_no}${x.parent ? ` · ${x.parent.name} ${x.parent.phone}` : ''}` : undefined} onClose={onClose}
      footer={x && canWrite && mode === 'view' ? <><Button icon="plus" onClick={() => setMode('charge')}>Add a charge</Button><Button kind="primary" icon="rupee" disabled={!open.length} onClick={startCollect}>Collect fee</Button></> : undefined}>
      {d.error ? <ErrorBox message={d.error} onRetry={d.reload} /> : !x ? <Loading rows={6} /> : mode === 'collect' ? (
        <form className="stack" onSubmit={collect} noValidate>
          <Chips label="Paying for" options={open.map((i) => ({ id: i.id, label: `${i.title} · ${fmtMoney(i.balance)}` }))} value={pick} onChange={togglePick} />
          <div className="cols">
            <Text label="Amount received (₹)" value={amount} onChange={(v) => setAmount(v.replace(/[^\d.]/g, ''))} inputMode="decimal" hint={`Dues selected: ${fmtMoney(pickedDue)}. A smaller amount is saved as part payment.`} />
            <Select label="Paid by" value={pm} onChange={setPm} options={MODES} />
            <Text label={pm === 'cheque' ? 'Cheque number' : 'Reference / UTR number'} value={ref} onChange={setRef} maxLength={80} hint={needRef ? undefined : 'Optional for cash'} />
            <Text label="Paid on" type="date" value={paidOn} onChange={setPaidOn} max={today()} />
            <div className="wide"><Text label="Note (optional)" value={note} onChange={setNote} maxLength={300} /></div>
          </div>
          {payErr && amount ? <div className="alert bad" role="alert">{payErr}</div> : null}
          <div className="row"><Button kind="primary" type="submit" busy={busy === 'pay'} disabled={!!payErr || !pick.length}>Save and issue receipt</Button><Button onClick={() => setMode('view')}>Back</Button></div>
        </form>
      ) : mode === 'charge' ? (
        <form className="stack" onSubmit={addCharge}>
          <Text label="What is it for?" value={cTitle} onChange={setCTitle} maxLength={160} placeholder="Late fee, lost ID card, uniform" />
          <div className="cols"><Text label="Amount (₹)" value={cAmt} onChange={(v) => setCAmt(v.replace(/[^\d.]/g, ''))} inputMode="decimal" /><Text label="Due on" type="date" value={cDue} onChange={setCDue} /></div>
          <div className="row"><Button kind="primary" type="submit" busy={busy === 'charge'} disabled={cTitle.trim().length < 2 || !(Number(cAmt) > 0)}>Add charge</Button><Button onClick={() => setMode('view')}>Back</Button></div>
        </form>
      ) : (
        <>
          <div className="kpi"><div><span>Charged</span><b>{fmtMoney(x.totals.charged)}</b></div><div><span>Paid</span><b>{fmtMoney(x.totals.paid)}</b></div><div><span>Outstanding</span><b>{fmtMoney(x.totals.outstanding)}</b></div>
            <div><span>Overdue</span><b style={{ color: x.totals.overdue ? 'var(--bad)' : undefined }}>{fmtMoney(x.totals.overdue)}</b></div></div>
          <h3>Charges</h3>
          {x.items.length ? <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>{x.items.map((i) => (
            <div key={i.id} className="item"><div className="grow"><b>{i.title}</b><div className="small muted">Due {fmtDate(i.due_date)}{i.paid ? ` · paid ${fmtMoney(i.paid)}` : ''}</div></div>
              <div className="right"><b className="num">{fmtMoney(i.amount)}</b><div><Badge status={TONE[i.status]}>{i.status}</Badge></div></div>
              {canWrite ? <IconButton icon="edit" label={`Change amount of ${i.title}`} onClick={() => setEditItem(i)} /> : null}</div>
          ))}</div> : <p className="muted">No charges yet.</p>}
          <h3>Payments</h3>
          {x.payments.length ? <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 12 }}>{x.payments.map((p) => (
            <button key={p.id} type="button" className="item" disabled={!p.receipt_no} onClick={() => onReceipt(p.id)}><div className="grow"><b>{p.receipt_no ?? 'UPI payment waiting to be checked'}</b><div className="small muted">{fmtDate(p.paid_on)} · {modeLabel(p.mode)}{p.reference ? ` · ${p.reference}` : ''}</div></div>
              <div className="right"><b className="num">{fmtMoney(p.amount)}</b><div><Badge status={TONE[p.status]}>{p.status}</Badge></div></div></button>
          ))}</div> : <p className="muted">No payments yet.</p>}
        </>
      )}
      {editItem ? <ItemEdit item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); d.reload(); onChanged(); }} /> : null}
    </Drawer>
  );
}

function ItemEdit({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [amt, setAmt] = useState(String(item.amount)); const [reason, setReason] = useState('');
  const bad = amt === '' || Number(amt) < item.paid;
  const save = async () => { if (await act('save', () => api(`/fees/items/${item.id}`, { method: 'PUT', body: { amount: Number(amt), reason } }), 'Charge updated')) onSaved(); };
  return (
    <Modal title={`Change ${item.title}`} onClose={onClose} actions={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'save'} disabled={bad} onClick={save}>Save</Button></>}>
      <div className="stack" style={{ marginTop: 10 }}>
        <Text label="New amount (₹)" value={amt} onChange={(v) => setAmt(v.replace(/[^\d.]/g, ''))} inputMode="decimal" error={bad && amt !== '' ? `${fmtMoney(item.paid)} is already paid against this charge` : null} hint="Use 0 to waive a charge that has not been paid." />
        <Text label="Reason" value={reason} onChange={setReason} maxLength={200} placeholder="Sibling concession" />
      </div>
    </Modal>
  );
}

function Receipts({ tick, onReceipt }: { tick: number; onReceipt: (id: number) => void }) {
  const first = `${today().slice(0, 8)}01`;
  const [from, setFrom] = useState(first); const [to, setTo] = useState(today()); const [mode, setMode] = useState(''); const [status, setStatus] = useState('confirmed');
  const list = useLoad(() => api<{ count: number; total: number; rows: Pay[] }>('/fees/payments', { query: { date_from: from, date_to: to, mode, status } }), [from, to, mode, status, tick]);
  return (
    <>
      <div className="toolbar"><Text label="From" type="date" value={from} onChange={setFrom} max={to} /><Text label="To" type="date" value={to} onChange={setTo} min={from} max={today()} />
        <Select label="Paid by" value={mode} onChange={setMode} options={[['', 'Any'], ...MODES]} /><Select label="Show" value={status} onChange={setStatus} options={[['confirmed', 'Issued receipts'], ['cancelled', 'Cancelled receipts']]} /></div>
      <section className="card flush">
        {list.error ? <div style={{ padding: 18 }}><ErrorBox message={list.error} onRetry={list.reload} /></div> : !list.data ? <div style={{ padding: 18 }}><Loading rows={5} /></div> : !list.data.rows.length ? <Empty title="No receipts in these dates" /> : (
          <><div className="spread" style={{ padding: '12px 18px' }}><span className="muted">{fmtInt(list.data.rows.length)} receipts</span>{status === 'confirmed' ? <b className="num">Total {fmtMoney(list.data.total)}</b> : null}</div>
            <div className="tablewrap"><table className="t"><thead><tr><th>Receipt</th><th>Student</th><th>Date</th><th>Paid by</th><th className="right">Amount</th></tr></thead>
              <tbody>{list.data.rows.map((p) => (
                <tr key={p.id} className="click" onClick={() => onReceipt(p.id)}><td className="primary-cell"><a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReceipt(p.id); }}>{p.receipt_no}</a></td>
                  <td data-label="Student">{p.student_name}<small className="muted"> · {p.class_name}</small></td><td data-label="Date">{fmtDate(p.paid_on)}</td><td data-label="Paid by">{modeLabel(p.mode)}</td><td data-label="Amount" className="right num"><b>{fmtMoney(p.amount)}</b></td></tr>
              ))}</tbody></table></div></>
        )}
      </section>
    </>
  );
}

function ReceiptView({ id, canWrite, onClose, onChanged }: { id: number; canWrite: boolean; onClose: () => void; onChanged: () => void }) {
  const r = useLoad(() => api<Receipt>(`/fees/receipts/${id}`), [id]);
  const { act, busy } = useAct();
  const [cancel, setCancel] = useState(false); const [reason, setReason] = useState('');
  const x = r.data;
  const doCancel = async () => { if (await act('cancel', () => api(`/fees/payments/${id}/cancel`, { body: { reason: reason.trim() } }), 'Receipt cancelled. The dues are open again.')) { setCancel(false); r.reload(); onChanged(); } };
  return (
    <Drawer wide title={x ? `Receipt ${x.receipt_no}` : 'Receipt'} onClose={onClose}
      footer={x ? <>{canWrite && x.status === 'confirmed' ? <Button kind="danger" onClick={() => setCancel(true)}>Cancel receipt</Button> : null}<Button kind="primary" icon="print" onClick={() => window.print()}>Print</Button></> : undefined}>
      {r.error ? <ErrorBox message={r.error} onRetry={r.reload} /> : !x ? <Loading rows={6} /> : (
        <div className="receipt" id="receipt">
          <div className="spread"><div><h3>{x.school.name}</h3><div className="small">{x.school.address}{x.school.phone ? ` · ${x.school.phone}` : ''}</div></div>{x.status !== 'confirmed' ? <span className="void">CANCELLED</span> : null}</div>
          <table><tbody>
            <tr><th>Receipt no.</th><td>{x.receipt_no}</td><th>Date</th><td>{fmtDate(x.paid_on)}</td></tr>
            <tr><th>Student</th><td>{x.student.name}</td><th>Class</th><td>{x.student.class_name}{x.student.roll_no ? ` · roll ${x.student.roll_no}` : ''}</td></tr>
            <tr><th>Admission no.</th><td>{x.student.admission_no}</td><th>Parent</th><td>{x.parent_name || '—'}</td></tr>
          </tbody></table>
          <table><thead><tr><th>Particulars</th><th style={{ textAlign: 'right' }}>Paid</th></tr></thead>
            <tbody>{x.lines.map((l, i) => <tr key={i}><td>{l.title}</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.amount)}</td></tr>)}
              <tr className="tot"><td>Total received ({modeLabel(x.mode)}{x.reference ? ` · ${x.reference}` : ''})</td><td style={{ textAlign: 'right' }}>{fmtMoney(x.amount)}</td></tr></tbody></table>
          <p><b>{x.amount_words}</b></p>
          <p className="small">Balance after this payment: {fmtMoney(x.balance_after)} · Received by {x.received_by_name || '—'}</p>
          {x.status !== 'confirmed' && x.cancel_reason ? <p className="small"><b>Cancelled:</b> {x.cancel_reason}</p> : null}
          {x.footer ? <p className="small" style={{ marginTop: 10, color: '#5b6480' }}>{x.footer}</p> : null}
        </div>
      )}
      {cancel ? (
        <Modal title="Cancel this receipt?" onClose={() => setCancel(false)} actions={<><Button onClick={() => setCancel(false)}>Keep receipt</Button><Button kind="danger" busy={busy === 'cancel'} disabled={reason.trim().length < 3} onClick={doCancel}>Cancel receipt</Button></>}>
          <div className="stack" style={{ marginTop: 10 }}><p className="muted">The amount goes back to the student's dues. The receipt number stays in your records, marked cancelled.</p>
            <Text label="Reason" value={reason} onChange={setReason} maxLength={300} placeholder="Cheque bounced" /></div>
        </Modal>
      ) : null}
    </Drawer>
  );
}

function Claims({ canWrite, onChanged }: { canWrite: boolean; onChanged: () => void }) {
  const list = useLoad(() => api<Pay[]>('/fees/claims', { query: { status: 'pending' } }), []);
  const { act, busy } = useAct();
  const [reject, setReject] = useState<Pay | null>(null); const [reason, setReason] = useState('');
  const ok = async (p: Pay) => { if (await act(`ok${p.id}`, () => api<{ receipt_no?: string }>(`/fees/claims/${p.id}/confirm`, { body: {} }), 'Payment confirmed and receipt issued')) { list.reload(); onChanged(); } };
  const no = async () => { if (reject && await act('no', () => api(`/fees/claims/${reject.id}/reject`, { body: { reason: reason.trim() } }), 'Payment rejected. The parent is told why.')) { setReject(null); setReason(''); list.reload(); onChanged(); } };
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  if (!list.data.length) return <div className="card"><Empty title="Nothing to check">When a parent pays by UPI and enters the UTR number in the app, it appears here for you to match with your bank statement.</Empty></div>;
  return (
    <>
      <div className="grid g2">{list.data.map((p) => (
        <div key={p.id} className="tile"><div className="spread"><b>{p.student_name}</b><b className="num">{fmtMoney(p.amount)}</b></div>
          <p className="small muted">{p.class_name} · {p.admission_no} · sent by {p.submitted_by_name || 'parent'} on {fmtDate(p.paid_on)}</p>
          <div className="cred" style={{ fontSize: '.95rem' }}>UTR {p.reference}</div>
          {canWrite ? <div className="row"><Button kind="primary small" busy={busy === `ok${p.id}`} onClick={() => ok(p)}>Money received — confirm</Button><Button kind="small" onClick={() => setReject(p)}>Not received</Button></div> : null}
        </div>
      ))}</div>
      {reject ? (
        <Modal title={`Reject payment from ${reject.student_name}?`} onClose={() => setReject(null)} actions={<><Button onClick={() => setReject(null)}>Back</Button><Button kind="danger" busy={busy === 'no'} disabled={reason.trim().length < 3} onClick={no}>Reject payment</Button></>}>
          <div style={{ marginTop: 10 }}><Text label="Reason shown to the parent" value={reason} onChange={setReason} maxLength={300} placeholder="This UTR is not in our bank statement" /></div>
        </Modal>
      ) : null}
    </>
  );
}

function Charges({ canWrite, onChanged }: { canWrite: boolean; onChanged: () => void }) {
  const list = useLoad(() => api<Batch[]>('/fees/batches'), []);
  const [add, setAdd] = useState(false);
  const confirm = useConfirm();
  const { act } = useAct();
  async function remove(b: Batch) {
    if (!(await confirm({ title: `Remove "${b.title}"?`, body: b.paid_count ? `${b.paid_count} students have already paid; their charge and receipt stay. The unpaid charges are removed.` : `The charge is removed for all ${b.count} students.`, confirm: 'Remove', danger: true }))) return;
    if (await act('rm', () => api(`/fees/batches/${b.id}`, { method: 'DELETE' }), 'Charge removed')) { list.reload(); onChanged(); }
  }
  return (
    <>
      <div className="spread" style={{ marginBottom: 14 }}><p className="muted">Trips, annual day, exam fees: charge the whole school, some classes or chosen students in one go.</p>{canWrite ? <Button kind="primary" icon="plus" onClick={() => setAdd(true)}>New charge</Button> : null}</div>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !list.data.length ? <div className="card"><Empty title="No one-time charges yet" /></div> : (
        <div className="grid g2">{list.data.map((b) => (
          <div key={b.id} className="tile"><div className="spread"><h2>{b.title}</h2>{canWrite ? <IconButton icon="trash" danger label={`Remove ${b.title}`} onClick={() => remove(b)} /> : null}</div>
            <p className="small muted">{fmtMoney(b.amount)} each · {b.target_label} · {b.count} students{b.due_date ? ` · due ${fmtDate(b.due_date)}` : ''}</p>
            <div className="meter high"><i style={{ width: `${b.expected ? (100 * b.collected) / b.expected : 0}%` }} /></div>
            <div className="spread small"><span>{b.paid_count} of {b.count} paid</span><b className="num">{fmtMoney(b.collected)} of {fmtMoney(b.expected)}</b></div>
          </div>
        ))}</div>
      )}
      {add ? <BatchForm onClose={() => setAdd(false)} onSaved={() => { setAdd(false); list.reload(); onChanged(); }} /> : null}
    </>
  );
}

function BatchForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const classes = useLoad(() => api<Klass[]>('/classes'), []);
  const { act, busy } = useAct();
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [due, setDue] = useState(''); const [note, setNote] = useState('');
  const [target, setTarget] = useState('school'); const [classIds, setClassIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<{ count: number; total: number; by_class: { class_name: string; students: number }[] } | null>(null);
  const body = () => ({ title: title.trim(), amount: Number(amount), due_date: due || null, note, target, class_ids: target === 'classes' ? classIds : [] });
  useEffect(() => setPreview(null), [title, amount, due, target, classIds]);
  const valid = title.trim().length >= 2 && Number(amount) > 0 && (target === 'school' || classIds.length > 0);
  const check = async () => { const p = await act('check', () => api<NonNullable<typeof preview>>('/fees/batches', { body: { ...body(), preview: true } })); if (p) setPreview(p); };
  const save = async () => { if (await act('save', () => api('/fees/batches', { body: body() }), `Charged ${preview?.count ?? ''} students`)) onSaved(); };
  return (
    <Drawer title="New one-time charge" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button>{preview ? <Button kind="primary" busy={busy === 'save'} onClick={save}>Charge {preview.count} students</Button> : <Button kind="primary" busy={busy === 'check'} disabled={!valid} onClick={check}>Check who is charged</Button>}</>}>
      <Text label="What is it for?" value={title} onChange={setTitle} maxLength={120} placeholder="Annual day fee" />
      <div className="cols"><Text label="Amount per student (₹)" value={amount} onChange={(v) => setAmount(v.replace(/[^\d.]/g, ''))} inputMode="decimal" /><Text label="Due on (optional)" type="date" value={due} onChange={setDue} /></div>
      <Select label="Who pays" value={target} onChange={setTarget} options={[['school', 'Whole school'], ['classes', 'Chosen classes']]} hint="For one student, open the student in Students & dues and use Add a charge." />
      {target === 'classes' ? <Chips label="Classes" options={(classes.data ?? []).map((c) => ({ id: c.id, label: c.name }))} value={classIds} onChange={setClassIds} /> : null}
      <TextArea label="Note for parents (optional)" value={note} onChange={setNote} maxLength={500} />
      {preview ? <div className="alert ok" role="status">{preview.count} students will be charged, {fmtMoney(preview.total)} in all ({preview.by_class.map((c) => `${c.class_name}: ${c.students}`).join(', ')}).</div> : null}
    </Drawer>
  );
}

function Setup({ canWrite, onSaved }: { canWrite: boolean; onSaved: () => void }) {
  const cfg = useLoad(() => api<Config>('/fees/config'), []);
  const { act, busy } = useAct();
  const [f, setF] = useState<Config | null>(null);
  const [cls, setCls] = useState<Record<string, string>>({}); const [rts, setRts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!cfg.data) return;
    setF(cfg.data);
    setCls(Object.fromEntries(cfg.data.classes.map((c) => [String(c.id), c.custom ? String(c.amount) : ''])));
    setRts(Object.fromEntries(cfg.data.routes.map((r) => [String(r.id), r.amount ? String(r.amount) : ''])));
  }, [cfg.data]);
  if (cfg.error) return <ErrorBox message={cfg.error} onRetry={cfg.reload} />;
  if (!f) return <Loading rows={6} />;
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setF({ ...f, [k]: v });
  const nums = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));
  const upiBad = f.upi_id && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(f.upi_id.trim());
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await act('save', () => api<Config>('/fees/config', { method: 'PUT', body: { monthly_amount: Number(f!.monthly_amount) || 0, class_amounts: nums(cls), route_amounts: nums(rts), due_day: Number(f!.due_day) || 10,
      start_month: f!.start_month || null, auto_generate: f!.auto_generate, upi_id: f!.upi_id.trim(), upi_name: f!.upi_name.trim(), receipt_prefix: f!.receipt_prefix.trim(), receipt_note: f!.receipt_note } }), 'Fee setup saved');
    if (r) { cfg.setData(r); onSaved(); }
  }
  const money = (v: string) => v.replace(/[^\d.]/g, '');
  return (
    <form className="grid g2" onSubmit={save} noValidate>
      <fieldset disabled={!canWrite}><legend>Monthly fee</legend>
        <div className="cols"><Text label="Monthly fee per student (₹)" value={String(f.monthly_amount ?? '')} onChange={(v) => set('monthly_amount', money(v) as unknown as number)} inputMode="decimal" />
          <Text label="Due on day of month" value={String(f.due_day)} onChange={(v) => set('due_day', v.replace(/\D/g, '').slice(0, 2) as unknown as number)} inputMode="numeric" hint="1 to 28" />
          <Text label="Bill from month" type="month" value={f.start_month ?? ''} onChange={(v) => set('start_month', v || null)} /></div>
        <Switch label="Bill every month automatically" hint="On the 1st, each student gets that month's fee. Turn off to bill by hand from the Overview tab." checked={f.auto_generate} onChange={(v) => set('auto_generate', v)} disabled={!canWrite} />
        <p className="small muted">Expected each month at these rates: <b>{fmtMoney(f.expected_monthly)}</b></p>
      </fieldset>
      <fieldset disabled={!canWrite}><legend>Different fee for some classes</legend>
        <p className="small muted">Leave a class empty to use the monthly fee above.</p>
        {f.classes.map((c) => <div key={c.id} className="spread"><label htmlFor={`cf${c.id}`}>{c.name} <span className="muted small">· {c.students} students</span></label>
          <input id={`cf${c.id}`} className="input score num" inputMode="decimal" placeholder={String(f.monthly_amount || 0)} value={cls[String(c.id)] ?? ''} onChange={(e) => setCls({ ...cls, [String(c.id)]: money(e.target.value) })} /></div>)}
      </fieldset>
      {f.transport_enabled && f.routes.length ? (
        <fieldset disabled={!canWrite}><legend>Transport fee per month</legend>
          {f.routes.map((r) => <div key={r.id} className="spread"><label htmlFor={`rf${r.id}`}>{r.name} <span className="muted small">· {r.riders} riders</span></label>
            <input id={`rf${r.id}`} className="input score num" inputMode="decimal" placeholder="0" value={rts[String(r.id)] ?? ''} onChange={(e) => setRts({ ...rts, [String(r.id)]: money(e.target.value) })} /></div>)}
        </fieldset>
      ) : null}
      <fieldset disabled={!canWrite}><legend>UPI and receipts</legend>
        <div className="cols"><Text label="School UPI ID" value={f.upi_id} onChange={(v) => set('upi_id', v)} maxLength={80} placeholder="schoolname@bank" error={upiBad ? 'It should look like schoolname@bank' : null} hint="Parents pay to this ID from the app and enter the UTR number." />
          <Text label="Name on the UPI account" value={f.upi_name} onChange={(v) => set('upi_name', v)} maxLength={120} />
          <Text label="Receipt number starts with" value={f.receipt_prefix} onChange={(v) => set('receipt_prefix', v)} maxLength={20} placeholder="GVPS" /></div>
        <TextArea label="Line printed at the bottom of receipts" value={f.receipt_note} onChange={(v) => set('receipt_note', v)} maxLength={500} />
      </fieldset>
      {canWrite ? <div><Button kind="primary" type="submit" busy={busy === 'save'} disabled={!!upiBad}>Save fee setup</Button></div> : null}
    </form>
  );
}


