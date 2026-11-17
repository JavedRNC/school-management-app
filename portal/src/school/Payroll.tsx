// Staff payroll: salaries, the month's payroll (prepare → check → lock → mark paid), payslips and settings.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Avatar, CountUp, Drawer, IconButton, num, printNode, Switch, Tabs, today, useAct, useConfirm, useFilter } from '../kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, Loading, Modal, PageHead, Select, Text, useLoad } from '../ui';
import { ReadOnlyNote, ROLE_LABEL, useSchool } from './ctx';

type Line = { name: string; amount: number };
type Salary = { basic: number; allowances: Line[]; deductions: Line[]; note: string; gross: number; total_deductions: number; net: number };
type StaffRow = { user_id: number; name: string; role: string; login_id: string; salary: Salary | null };
type StaffList = { rows: StaffRow[]; people: number; with_salary: number; monthly_gross: number; monthly_net: number };
type Run = {
  id: number; month: string; month_label: string; status: 'draft' | 'final'; days_in_month: number; working_days: number; counted_until: string | null;
  lop_enabled: boolean; lop_basis: string; people: number; gross: number; total_deductions: number; net: number;
  paid_count: number; paid_amount: number; unpaid_count: number; unpaid_amount: number;
};
type Slip = {
  id: number; run_id: number; month: string; month_label: string; run_status: string; user_id: number; slip_no: string | null; name: string; role: string; login_id: string;
  basic: number; allowances: Line[]; deductions: Line[]; extra_earnings: Line[]; extra_deductions: Line[];
  absent_days: number; lop_days: number; lop_manual: boolean; lop_amount: number; gross: number; total_deductions: number; net: number; note: string;
  status: 'paid' | 'unpaid'; paid_on: string | null; mode: string; reference: string; days_in_month: number; working_days: number;
};
type RunDetail = { run: Run; payslips: Slip[] };
type Config = { lop_enabled: boolean; lop_basis: string; slip_prefix: string; attendance_available: boolean };
type Draft = { name: string; amount: string };

const MODES: [string, string][] = [['bank', 'Bank transfer'], ['upi', 'UPI'], ['cash', 'Cash'], ['cheque', 'Cheque']];
const modeLabel = (m: string) => MODES.find((x) => x[0] === m)?.[1] ?? m;
const money2 = (n: number) => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;
const toDraft = (l: Line[]): Draft[] => l.map((x) => ({ name: x.name, amount: String(x.amount) }));
const sum = (l: Draft[]) => l.reduce((a, x) => a + (num(x.amount) ?? 0), 0);
/** The first problem in a list of typed lines, or null. Empty rows are ignored. */
function linesError(l: Draft[], what: string): string | null {
  const seen = new Set<string>();
  for (const x of l) {
    const name = x.name.trim(); const blank = !name && !x.amount.trim();
    if (blank) continue;
    if (!name) return `Name every ${what}`;
    const a = num(x.amount);
    if (a === null || a <= 0) return `Enter an amount above 0 for “${name}”`;
    if (seen.has(name.toLowerCase())) return `“${name}” is listed twice`;
    seen.add(name.toLowerCase());
  }
  return null;
}
const clean = (l: Draft[]): Line[] => l.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), amount: num(x.amount) ?? 0 }));

export function Payroll() {
  const { school } = useSchool();
  const canWrite = school?.can_write !== false;
  const [tab, setTab] = useState<'months' | 'salaries' | 'settings'>('months');
  const [open, setOpen] = useState<number | null>(null);
  if (open !== null) return <RunView id={open} canWrite={canWrite} onBack={() => setOpen(null)} />;
  return (
    <>
      <PageHead title="Payroll" sub="Set each person's salary once. Every month, prepare the payroll, check it, lock it and record how each salary was paid." />
      <ReadOnlyNote />
      <Tabs label="Section" value={tab} onChange={setTab} tabs={[{ id: 'months', label: 'Monthly payroll' }, { id: 'salaries', label: 'Salaries' }, { id: 'settings', label: 'Settings' }]} />
      {tab === 'months' ? <Months canWrite={canWrite} onOpen={setOpen} onSalaries={() => setTab('salaries')} /> : tab === 'salaries' ? <Salaries canWrite={canWrite} /> : <Settings canWrite={canWrite} />}
    </>
  );
}

// ---------------------------------------------------------------- months
function Months({ canWrite, onOpen, onSalaries }: { canWrite: boolean; onOpen: (id: number) => void; onSalaries: () => void }) {
  const list = useLoad(() => api<{ runs: Run[]; this_month: string }>('/payroll/runs'), []);
  const { act, busy } = useAct();
  const [month, setMonth] = useState('');
  useEffect(() => { if (list.data && !month) setMonth(list.data.this_month); }, [list.data, month]);
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading rows={5} />;
  const runs = list.data.runs;
  const exists = runs.some((r) => r.month === month);
  const prepare = async () => {
    const r = await act('new', () => api<RunDetail>('/payroll/runs', { body: { month } }), (x) => `Payroll for ${x.run.month_label} is ready to check`);
    if (r) onOpen(r.run.id);
  };
  return (
    <>
      {canWrite ? (
        <section className="card">
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Text label="Month" type="month" value={month} onChange={(v) => v && setMonth(v)} max={list.data.this_month} />
            <Button kind="primary" icon="plus" busy={busy === 'new'} disabled={!month || exists} onClick={prepare}>Prepare payroll</Button>
            {exists ? <span className="muted small">This month's payroll already exists. Open it below.</span> : null}
          </div>
        </section>
      ) : null}
      <section className="card flush" style={{ marginTop: 14 }}>
        {!runs.length ? <Empty title="No payroll yet">Set salaries first, then prepare the first month. <a href="#" onClick={(e) => { e.preventDefault(); onSalaries(); }}>Go to salaries</a></Empty> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>Month</th><th>Status</th><th className="right">People</th><th className="right">Net pay</th><th className="right">Paid</th><th className="right">Still to pay</th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id} className="click" onClick={() => onOpen(r.id)}>
                <td className="primary-cell"><a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(r.id); }}>{r.month_label}</a></td>
                <td data-label="Status">{r.status === 'draft' ? <Badge status="trial">Being prepared</Badge> : r.unpaid_count ? <Badge status="grace">Locked · {r.unpaid_count} unpaid</Badge> : <Badge status="active">All paid</Badge>}</td>
                <td data-label="People" className="right num">{r.people}</td><td data-label="Net pay" className="right num"><b>{money2(r.net)}</b></td>
                <td data-label="Paid" className="right num">{money2(r.paid_amount)}</td><td data-label="Still to pay" className="right num">{r.status === 'final' ? money2(r.unpaid_amount) : '—'}</td>
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- one month
function RunView({ id, canWrite, onBack }: { id: number; canWrite: boolean; onBack: () => void }) {
  const d = useLoad(() => api<RunDetail>(`/payroll/runs/${id}`), [id]);
  const { act, busy } = useAct();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [slip, setSlip] = useState<number | null>(null);
  const [pay, setPay] = useState<Slip | 'all' | null>(null);
  const rows = useFilter(d.data?.payslips, q, (p) => `${p.name} ${p.login_id} ${ROLE_LABEL[p.role] ?? p.role}`);
  if (d.error) return <><BackLink onBack={onBack} /><ErrorBox message={d.error} onRetry={d.reload} /></>;
  if (!d.data) return <><BackLink onBack={onBack} /><Loading rows={6} /></>;
  const { run } = d.data;
  const draft = run.status === 'draft';
  const set = (x: RunDetail | undefined) => { if (x) d.setData(x); };
  const recalc = async () => set(await act('recalc', () => api<RunDetail>(`/payroll/runs/${id}/recalculate`, { body: {} }), 'Worked out again from today\'s salaries and attendance'));
  const lock = async () => {
    if (!(await confirm({ title: `Lock payroll for ${run.month_label}?`, confirm: 'Lock payroll', body: <p>Payslips get their numbers and staff can see them in the app. You can reopen it only while no salary is marked paid.</p> }))) return;
    set(await act('lock', () => api<RunDetail>(`/payroll/runs/${id}/finalize`, { body: {} }), 'Payroll locked. Staff can now see their payslips.'));
  };
  const reopen = async () => {
    if (!(await confirm({ title: 'Reopen this payroll?', confirm: 'Reopen', body: <p>Staff stop seeing these payslips until you lock it again. Payslip numbers stay the same.</p> }))) return;
    set(await act('reopen', () => api<RunDetail>(`/payroll/runs/${id}/reopen`, { body: {} }), 'Payroll reopened'));
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete payroll for ${run.month_label}?`, confirm: 'Delete payroll', danger: true, body: <p>The payslips prepared for this month are removed. Salaries are not changed.</p> }))) return;
    if (await act('delete', () => api(`/payroll/runs/${id}`, { method: 'DELETE' }), 'Payroll deleted')) onBack();
  };
  return (
    <>
      <BackLink onBack={onBack} />
      <PageHead title={`Payroll · ${run.month_label}`} sub={draft ? 'Being prepared. Check each person, then lock it.' : run.unpaid_count ? 'Locked. Record each salary as you pay it.' : 'Locked and fully paid.'}>
        {canWrite && draft ? <><Button icon="refresh" busy={busy === 'recalc'} onClick={recalc}>Work out again</Button><Button kind="danger" busy={busy === 'delete'} onClick={remove}>Delete</Button><Button kind="primary" icon="check" busy={busy === 'lock'} onClick={lock}>Lock payroll</Button></> : null}
        {canWrite && !draft ? <>{run.paid_count === 0 ? <Button busy={busy === 'reopen'} onClick={reopen}>Reopen</Button> : null}{run.unpaid_count ? <Button kind="primary" icon="rupee" onClick={() => setPay('all')}>{run.unpaid_count === 1 ? 'Mark 1 salary as paid' : `Mark all ${run.unpaid_count} as paid`}</Button> : null}</> : null}
      </PageHead>
      <ReadOnlyNote />
      <section className="card"><div className="kpi">
        <div><span>People</span><b><CountUp value={run.people} /></b></div>
        <div><span>Total pay</span><b><CountUp value={run.gross} format={money2} /></b></div>
        <div><span>Deductions</span><b><CountUp value={run.total_deductions} format={money2} /></b></div>
        <div><span>Net pay</span><b><CountUp value={run.net} format={money2} /></b></div>
        {!draft ? <div><span>Paid</span><b><CountUp value={run.paid_amount} format={money2} /></b></div> : null}
        {!draft ? <div><span>Still to pay</span><b><CountUp value={run.unpaid_amount} format={money2} /></b></div> : null}
      </div>
        {run.lop_enabled ? <p className="muted small" style={{ marginTop: 10 }}>Pay is cut for absent days without approved leave, {run.counted_until ? `counted from staff attendance up to ${fmtDate(run.counted_until)}` : 'but no day of this month has been counted yet'}{draft ? '. Today is counted only after it ends: use "Work out again" before you lock.' : '.'}</p> : null}
      </section>
      <div className="toolbar" style={{ marginTop: 14 }}><Text label="Find a person" value={q} onChange={setQ} type="search" placeholder="Name or employee code" /></div>
      <section className="card flush">
        {!rows.length ? <Empty title="Nobody matches" /> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>Staff member</th><th className="right">Pay</th><th className="right">Deductions</th>{run.lop_enabled || d.data.payslips.some((p) => p.lop_days > 0) ? <th className="right">Unpaid days</th> : null}<th className="right">Net pay</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className="click" onClick={() => setSlip(p.id)}>
                <td className="primary-cell"><div className="person"><Avatar name={p.name} /><div><b>{p.name}</b><small>{ROLE_LABEL[p.role] ?? p.role} · {p.login_id}{p.slip_no ? ` · ${p.slip_no}` : ''}</small></div></div></td>
                <td data-label="Pay" className="right num">{money2(p.gross)}</td><td data-label="Deductions" className="right num">{money2(p.total_deductions)}</td>
                {run.lop_enabled || d.data!.payslips.some((x) => x.lop_days > 0) ? <td data-label="Unpaid days" className="right num">{p.lop_days || '—'}{p.lop_manual ? <small className="muted"> · set by you</small> : null}</td> : null}
                <td data-label="Net pay" className="right num"><b>{money2(p.net)}</b></td>
                <td data-label="Status">{draft ? <Badge status="trial">Draft</Badge> : p.status === 'paid' ? <Badge status="active">Paid {fmtDate(p.paid_on)}</Badge> : <Badge status="grace">Not paid</Badge>}</td>
                <td className="right" onClick={(e) => e.stopPropagation()}>{canWrite && !draft && p.status !== 'paid' ? <Button kind="small" onClick={() => setPay(p)} aria-label={`Mark ${p.name} as paid`}>Mark paid</Button> : <IconButton icon={draft && canWrite ? 'edit' : 'print'} label={draft && canWrite ? `Edit ${p.name}'s payslip` : `Open ${p.name}'s payslip`} onClick={() => setSlip(p.id)} />}</td>
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
      {slip !== null ? <SlipDrawer slip={d.data.payslips.find((p) => p.id === slip)!} run={run} canWrite={canWrite} onClose={() => setSlip(null)} onChanged={d.reload} onPay={(p) => { setSlip(null); setPay(p); }} /> : null}
      {pay ? <PayModal target={pay} run={run} onClose={() => setPay(null)} onDone={() => { setPay(null); d.reload(); }} /> : null}
    </>
  );
}
function BackLink({ onBack }: { onBack: () => void }) {
  return <p style={{ marginBottom: 6 }}><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>← All months</a></p>;
}

function PayModal({ target, run, onClose, onDone }: { target: Slip | 'all'; run: Run; onClose: () => void; onDone: () => void }) {
  const { act, busy } = useAct();
  const [on, setOn] = useState(today()); const [mode, setMode] = useState('bank'); const [ref, setRef] = useState('');
  const all = target === 'all';
  const first = `${run.month}-01`;
  const bad = !on ? 'Choose the payment date' : on > today() ? 'The date can\'t be in the future' : on < first ? `The date can't be before ${run.month_label}` : null;
  const save = async () => {
    const body = { paid_on: on, mode, reference: ref.trim() };
    const ok = all ? await act('pay', () => api<{ paid: number }>(`/payroll/runs/${run.id}/pay`, { body }), (r) => `${r.paid} ${r.paid === 1 ? 'salary' : 'salaries'} marked as paid`)
      : await act('pay', () => api(`/payroll/payslips/${(target as Slip).id}/pay`, { body }), `${(target as Slip).name}'s salary marked as paid`);
    if (ok) onDone();
  };
  return (
    <Modal title={all ? `Mark ${run.unpaid_count} ${run.unpaid_count === 1 ? 'salary' : 'salaries'} as paid` : `Mark ${(target as Slip).name}'s salary as paid`} onClose={onClose}
      actions={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'pay'} disabled={!!bad} onClick={save}>Mark as paid</Button></>}>
      <div className="stack" style={{ marginTop: 10 }}>
        <p className="muted">{all ? `Total ${money2(run.unpaid_amount)}. ` : `Net pay ${money2((target as Slip).net)}. `}Prangan only records the payment. Pay the money yourself, then save it here.</p>
        <div className="cols"><Text label="Paid on" type="date" value={on} onChange={setOn} min={first} max={today()} error={bad} /><Select label="Paid by" value={mode} onChange={setMode} options={MODES} /></div>
        <Text label={all ? 'Reference for all (optional)' : 'Reference (optional)'} value={ref} onChange={setRef} maxLength={80} placeholder="Bank reference, UPI ID or cheque number" />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- one payslip
function LinesEditor({ title, rows, onChange, disabled, addLabel }: { title: string; rows: Draft[]; onChange: (r: Draft[]) => void; disabled?: boolean; addLabel: string }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <b>{title}</b>
      {rows.map((r, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'end' }}>
          <div className="grow"><Text label={`${title} ${i + 1} name`} value={r.name} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, name: v } : x)))} maxLength={40} disabled={disabled} placeholder="House rent" /></div>
          <div style={{ width: 130 }}><Text label="Amount (₹)" value={r.amount} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, amount: v.replace(/[^\d.]/g, '').slice(0, 11) } : x)))} inputMode="decimal" disabled={disabled} /></div>
          {!disabled ? <IconButton icon="trash" label={`Remove ${r.name || `${title} ${i + 1}`}`} onClick={() => onChange(rows.filter((_, j) => j !== i))} /> : null}
        </div>
      ))}
      {!disabled && rows.length < 12 ? <div><Button kind="small" icon="plus" onClick={() => onChange([...rows, { name: '', amount: '' }])}>{addLabel}</Button></div> : null}
    </div>
  );
}

function SlipDrawer({ slip, run, canWrite, onClose, onChanged, onPay }: { slip: Slip; run: Run; canWrite: boolean; onClose: () => void; onChanged: () => void; onPay: (p: Slip) => void }) {
  const { school } = useSchool();
  const { act, busy } = useAct();
  const draft = run.status === 'draft' && canWrite;
  const [earn, setEarn] = useState<Draft[]>(toDraft(slip.extra_earnings)); const [ded, setDed] = useState<Draft[]>(toDraft(slip.extra_deductions));
  const [lop, setLop] = useState(String(slip.lop_days)); const [note, setNote] = useState(slip.note);
  const [undo, setUndo] = useState(false); const [reason, setReason] = useState('');
  const basis = run.lop_basis === 'calendar' ? run.days_in_month : run.working_days;
  const lopN = num(lop);
  const bad = linesError(earn, 'extra payment') ?? linesError(ded, 'deduction') ?? (lopN === null ? 'Enter the unpaid days as a number' : lopN > basis ? `Unpaid days can't be more than ${basis}` : (lopN * 2) % 1 !== 0 ? 'Use whole or half days' : null);
  const fixed = slip.basic + slip.allowances.reduce((a, x) => a + x.amount, 0);
  const before = fixed + sum(earn) - slip.deductions.reduce((a, x) => a + x.amount, 0) - sum(ded);
  const cut = basis && lopN ? Math.min(Math.round((fixed * lopN) / basis), Math.max(before, 0)) : 0;      // the cut never takes pay below zero
  const net = before - cut;
  const save = async () => {
    if (bad || net < 0) return;
    if (await act('save', () => api(`/payroll/payslips/${slip.id}`, { method: 'PUT', body: { lop_days: lopN, extra_earnings: clean(earn), extra_deductions: clean(ded), note: note.trim() } }), 'Payslip saved')) { onChanged(); onClose(); }
  };
  const doUndo = async () => { if (await act('undo', () => api(`/payroll/payslips/${slip.id}/undo-payment`, { body: { reason: reason.trim() } }), 'Payment undone. The salary is unpaid again.')) { setUndo(false); onChanged(); onClose(); } };
  return (
    <Drawer wide title={draft ? `${slip.name} · ${run.month_label}` : `Payslip ${slip.slip_no ?? ''}`} sub={`${ROLE_LABEL[slip.role] ?? slip.role} · ${slip.login_id}`} onClose={onClose}
      footer={draft ? <><Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'save'} disabled={!!bad || net < 0} onClick={save}>Save payslip</Button></>
        : <>{canWrite && slip.status === 'paid' ? <Button kind="danger" onClick={() => setUndo(true)}>Undo payment</Button> : null}{canWrite && run.status === 'final' && slip.status !== 'paid' ? <Button onClick={() => onPay(slip)}>Mark paid</Button> : null}<Button kind="primary" icon="print" onClick={() => printNode(document.getElementById('payslip'))}>Print or save as PDF</Button></>}>
      {draft ? (
        <div className="stack">
          <div className="kpi"><div><span>Monthly pay</span><b>{money2(fixed)}</b></div><div><span>Regular deductions</span><b>{money2(slip.deductions.reduce((a, x) => a + x.amount, 0))}</b></div><div><span>Net pay this month</span><b>{money2(Math.max(net, 0))}</b></div></div>
          <p className="muted small">Basic pay, allowances and regular deductions come from this person's salary. Change those under Salaries, then use "Work out again". Add anything for this month only below.</p>
          <LinesEditor title="Extra payment" rows={earn} onChange={setEarn} addLabel="Add an extra payment" />
          <LinesEditor title="Extra deduction" rows={ded} onChange={setDed} addLabel="Add a deduction" />
          <Text label="Unpaid days" value={lop} onChange={(v) => setLop(v.replace(/[^\d.]/g, '').slice(0, 4))} inputMode="decimal"
            hint={`${run.lop_enabled ? `Staff attendance shows ${slip.absent_days} absent day${slip.absent_days === 1 ? '' : 's'} without leave. ` : ''}One day cuts ${money2(basis ? Math.round(fixed / basis) : 0)} (monthly pay ÷ ${basis} ${run.lop_basis === 'calendar' ? 'days in the month' : 'school days'}).${cut ? ` Cut now: ${money2(cut)}.` : ''}`} />
          <Text label="Note on the payslip (optional)" value={note} onChange={setNote} maxLength={300} />
          {bad ? <div className="alert bad" role="alert">{bad}</div> : net < 0 ? <div className="alert bad" role="alert">Deductions can't be more than the pay.</div> : null}
        </div>
      ) : <PayslipPaper slip={slip} schoolName={school?.name ?? ''} schoolAddress={school?.address ?? ''} draft={run.status === 'draft'} />}
      {undo ? (
        <Modal title="Undo this payment?" onClose={() => setUndo(false)} actions={<><Button onClick={() => setUndo(false)}>Keep it</Button><Button kind="danger" busy={busy === 'undo'} disabled={reason.trim().length < 3} onClick={doUndo}>Undo payment</Button></>}>
          <div className="stack" style={{ marginTop: 10 }}><p className="muted">The salary goes back to "Not paid". The reason is kept in the activity log.</p>
            <Text label="Reason" value={reason} onChange={setReason} maxLength={300} placeholder="Marked on the wrong person" /></div>
        </Modal>
      ) : null}
    </Drawer>
  );
}

export function PayslipPaper({ slip, schoolName, schoolAddress, draft }: { slip: Slip; schoolName: string; schoolAddress: string; draft?: boolean }) {
  const earnings: Line[] = [{ name: 'Basic pay', amount: slip.basic }, ...slip.allowances, ...slip.extra_earnings];
  const deductions: Line[] = [...slip.deductions, ...slip.extra_deductions, ...(slip.lop_amount ? [{ name: `Unpaid days (${slip.lop_days})`, amount: slip.lop_amount }] : [])];
  const n = Math.max(earnings.length, deductions.length);
  return (
    <div className="receipt" id="payslip">
      <div className="spread"><div><h3>{schoolName}</h3><div className="small">{schoolAddress}</div></div>{draft ? <span className="void">DRAFT</span> : null}</div>
      <p style={{ marginTop: 8 }}><b>Payslip for {slip.month_label}</b></p>
      <table><tbody>
        <tr><th>Name</th><td>{slip.name}</td><th>Employee code</th><td>{slip.login_id}</td></tr>
        <tr><th>Role</th><td>{ROLE_LABEL[slip.role] ?? slip.role}</td><th>Payslip no.</th><td>{slip.slip_no ?? '—'}</td></tr>
      </tbody></table>
      <table><thead><tr><th>Earnings</th><th style={{ textAlign: 'right' }}>Amount</th><th>Deductions</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>{Array.from({ length: n }, (_, i) => (
          <tr key={i}><td>{earnings[i]?.name ?? ''}</td><td style={{ textAlign: 'right' }}>{earnings[i] ? money2(earnings[i].amount) : ''}</td><td>{deductions[i]?.name ?? ''}</td><td style={{ textAlign: 'right' }}>{deductions[i] ? money2(deductions[i].amount) : ''}</td></tr>
        ))}
          <tr className="tot"><td>Total pay</td><td style={{ textAlign: 'right' }}>{money2(slip.gross)}</td><td>Total deductions</td><td style={{ textAlign: 'right' }}>{money2(slip.total_deductions)}</td></tr></tbody></table>
      <p><b>Net pay: {money2(slip.net)}</b></p>
      <p className="small">{slip.status === 'paid' ? `Paid on ${fmtDate(slip.paid_on)} by ${modeLabel(slip.mode).toLowerCase()}${slip.reference ? ` · ${slip.reference}` : ''}` : draft ? 'Not final yet' : 'Not paid yet'}</p>
      {slip.note ? <p className="small">{slip.note}</p> : null}
      <p className="small" style={{ marginTop: 10, color: '#5b6480' }}>This payslip is made by the school in Prangan and needs no signature.</p>
    </div>
  );
}

// ---------------------------------------------------------------- salaries
function Salaries({ canWrite }: { canWrite: boolean }) {
  const list = useLoad(() => api<StaffList>('/payroll/staff'), []);
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<StaffRow | null>(null);
  const rows = useFilter(list.data?.rows, q, (r) => `${r.name} ${r.login_id} ${ROLE_LABEL[r.role] ?? r.role}`);
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading rows={6} />;
  const x = list.data;
  return (
    <>
      <section className="card"><div className="kpi">
        <div><span>Staff</span><b>{x.people}</b></div><div><span>With a salary</span><b>{x.with_salary}</b></div>
        <div><span>Monthly pay</span><b>{money2(x.monthly_gross)}</b></div><div><span>Monthly net pay</span><b>{money2(x.monthly_net)}</b></div>
      </div></section>
      <div className="toolbar" style={{ marginTop: 14 }}><Text label="Find a person" value={q} onChange={setQ} type="search" placeholder="Name or employee code" /></div>
      <section className="card flush">
        {!x.rows.length ? <Empty title="No staff accounts yet">Add teachers under People first.</Empty> : !rows.length ? <Empty title="Nobody matches" /> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>Staff member</th><th className="right">Basic pay</th><th className="right">Allowances</th><th className="right">Deductions</th><th className="right">Net pay a month</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.user_id} className="click" onClick={() => setEdit(r)}>
                <td className="primary-cell"><div className="person"><Avatar name={r.name} /><div><b>{r.name}</b><small>{ROLE_LABEL[r.role] ?? r.role} · {r.login_id}</small></div></div></td>
                {r.salary && r.salary.gross > 0 ? <><td data-label="Basic pay" className="right num">{money2(r.salary.basic)}</td><td data-label="Allowances" className="right num">{money2(r.salary.gross - r.salary.basic)}</td>
                  <td data-label="Deductions" className="right num">{money2(r.salary.total_deductions)}</td><td data-label="Net pay a month" className="right num"><b>{money2(r.salary.net)}</b></td></>
                  : <td colSpan={4} className="muted">No salary set. This person is left out of payroll.</td>}
                <td className="right" onClick={(e) => e.stopPropagation()}><IconButton icon="edit" label={`${r.salary ? 'Edit' : 'Set'} salary for ${r.name}`} onClick={() => setEdit(r)} /></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
      {edit ? <SalaryDrawer row={edit} canWrite={canWrite} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} /> : null}
    </>
  );
}

function SalaryDrawer({ row, canWrite, onClose, onSaved }: { row: StaffRow; canWrite: boolean; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const s = row.salary;
  const [basic, setBasic] = useState(s ? String(s.basic) : ''); const [allow, setAllow] = useState<Draft[]>(toDraft(s?.allowances ?? [])); const [ded, setDed] = useState<Draft[]>(toDraft(s?.deductions ?? []));
  const [note, setNote] = useState(s?.note ?? '');
  const b = basic.trim() === '' ? 0 : num(basic);
  const gross = (b ?? 0) + sum(allow); const dd = sum(ded);
  const bad = useMemo(() => (b === null ? 'Enter the basic pay as a number' : b > 10000000 ? 'That basic pay is too large' : linesError(allow, 'allowance') ?? linesError(ded, 'deduction') ?? (dd > gross ? 'Deductions can\'t be more than the pay' : null)), [b, allow, ded, dd, gross]);
  const save = async () => {
    if (bad) return;
    if (await act('save', () => api(`/payroll/staff/${row.user_id}`, { method: 'PUT', body: { basic: b ?? 0, allowances: clean(allow), deductions: clean(ded), note: note.trim() } }), `Salary saved for ${row.name}`)) onSaved();
  };
  return (
    <Drawer wide title={`Salary · ${row.name}`} sub={`${ROLE_LABEL[row.role] ?? row.role} · ${row.login_id}`} onClose={onClose}
      footer={canWrite ? <><Button onClick={onClose}>Cancel</Button><Button kind="primary" busy={busy === 'save'} disabled={!!bad} onClick={save}>Save salary</Button></> : undefined}>
      <div className="stack">
        <div className="kpi"><div><span>Monthly pay</span><b>{money2(gross)}</b></div><div><span>Deductions</span><b>{money2(dd)}</b></div><div><span>Net pay a month</span><b>{money2(Math.max(gross - dd, 0))}</b></div></div>
        <Text label="Basic pay a month (₹)" value={basic} onChange={(v) => setBasic(v.replace(/[^\d.]/g, '').slice(0, 11))} inputMode="decimal" disabled={!canWrite} hint="Leave empty or 0 to keep this person out of payroll." />
        <LinesEditor title="Allowance" rows={allow} onChange={setAllow} disabled={!canWrite} addLabel="Add an allowance" />
        <LinesEditor title="Deduction" rows={ded} onChange={setDed} disabled={!canWrite} addLabel="Add a deduction" />
        <Text label="Note (only you see this)" value={note} onChange={setNote} maxLength={200} disabled={!canWrite} />
        {bad ? <div className="alert bad" role="alert">{bad}</div> : null}
        <p className="muted small">A change here applies from the next payroll you prepare, or when you use "Work out again" on one that is still being prepared. Locked payslips never change.</p>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------- settings
function Settings({ canWrite }: { canWrite: boolean }) {
  const c = useLoad(() => api<Config>('/payroll/config'), []);
  const { act, busy } = useAct();
  const [lop, setLop] = useState(false); const [basis, setBasis] = useState('calendar'); const [prefix, setPrefix] = useState('SAL');
  useEffect(() => { if (c.data) { setLop(c.data.lop_enabled); setBasis(c.data.lop_basis); setPrefix(c.data.slip_prefix); } }, [c.data]);
  if (c.error) return <ErrorBox message={c.error} onRetry={c.reload} />;
  if (!c.data) return <Loading />;
  const bad = !/^[A-Za-z0-9/-]{1,12}$/.test(prefix) ? 'Use up to 12 letters, numbers, - or /' : null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (bad) return;
    const r = await act('save', () => api<Config>('/payroll/config', { method: 'PUT', body: { lop_enabled: lop, lop_basis: basis, slip_prefix: prefix } }), 'Payroll settings saved');
    if (r) c.setData(r);
  };
  return (
    <form className="card stack" style={{ maxWidth: 640 }} onSubmit={save} noValidate>
      <h2>Absent days</h2>
      <Switch checked={lop} onChange={setLop} disabled={!canWrite || !c.data.attendance_available} label="Cut pay for absent days without approved leave"
        hint={c.data.attendance_available ? 'Uses staff attendance: a school day with no check-in and no approved leave counts as absent. You can still change the days on any payslip before locking.' : 'This needs Staff attendance, which is not part of your school\'s plan. You can still type unpaid days on a payslip by hand.'} />
      <Select label="One day's pay is" value={basis} onChange={setBasis} disabled={!canWrite} options={[['calendar', 'Monthly pay ÷ days in the month'], ['working', 'Monthly pay ÷ school days in the month']]} />
      <h2>Payslip numbers</h2>
      <Text label="Starts with" value={prefix} onChange={(v) => setPrefix(v.toUpperCase().slice(0, 12))} error={bad} disabled={!canWrite} hint={`Example: ${prefix || 'SAL'}/${today().slice(0, 7).replace('-', '')}/001`} />
      {canWrite ? <div><Button kind="primary" type="submit" busy={busy === 'save'} disabled={!!bad}>Save settings</Button></div> : null}
    </form>
  );
}
