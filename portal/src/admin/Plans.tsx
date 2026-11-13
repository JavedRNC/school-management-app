import { useState } from 'react';
import { api } from '../api';
import { Chips, Drawer, IconButton, Switch, useAct } from '../kit';
import { Button, Empty, ErrorBox, fmtMoney, Loading, PageHead, Text, useLoad } from '../ui';
import type { PlanRow } from './SchoolDetail';

export function Plans() {
  const plans = useLoad(() => api<PlanRow[]>('/admin/plans'), []);
  const modules = useLoad(() => api<Record<string, string>>('/admin/modules'), []);
  const [edit, setEdit] = useState<PlanRow | 'new' | null>(null);
  const err = plans.error ?? modules.error;
  return (
    <>
      <PageHead title="Plans & pricing" sub="What each plan includes and what it costs per student each month">
        <Button kind="primary" icon="plus" onClick={() => setEdit('new')}>New plan</Button>
      </PageHead>
      {err ? <ErrorBox message={err} onRetry={() => { plans.reload(); modules.reload(); }} /> : !plans.data || !modules.data ? <Loading rows={5} /> : !plans.data.length ? <div className="card"><Empty title="No plans yet" /></div> : (
        <div className="grid g3">{plans.data.map((p) => (
          <section key={p.id} className="card stack">
            <div className="spread"><h2>{p.name}</h2><IconButton icon="edit" label={`Edit the ${p.name} plan`} onClick={() => setEdit(p)} /></div>
            <div className="kpi"><div><span>Per student a month</span><b>{p.price_per_student ? fmtMoney(p.price_per_student) : 'Free'}</b></div>{p.min_monthly ? <div><span>Smallest bill</span><b>{fmtMoney(p.min_monthly)}</b></div> : null}</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{Object.entries(modules.data!).map(([k, label]) => <li key={k} style={{ opacity: p.modules.includes(k) ? 1 : 0.4, textDecoration: p.modules.includes(k) ? undefined : 'line-through' }}>{label.split(' (')[0]}</li>)}</ul>
          </section>
        ))}</div>
      )}
      {edit && modules.data ? <PlanForm plan={edit === 'new' ? null : edit} modules={modules.data} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); plans.reload(); }} /> : null}
    </>
  );
}

function PlanForm({ plan, modules, onClose, onSaved }: { plan: PlanRow | null; modules: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [name, setName] = useState(plan?.name ?? ''); const [mods, setMods] = useState<string[]>(plan?.modules ?? ['core']);
  const [price, setPrice] = useState(String(plan?.price_per_student ?? 0)); const [min, setMin] = useState(String(plan?.min_monthly ?? 0)); const [free, setFree] = useState(plan ? plan.price_per_student === 0 : false);
  const bad = !name.trim() ? 'Give the plan a name' : !free && !(Number(price) > 0) ? 'Enter the price per student, or mark the plan as free' : null;
  const money = (v: string) => v.replace(/[^\d.]/g, '');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad) return;
    const body = { name: name.trim(), modules: mods.includes('core') ? mods : ['core', ...mods], price_per_student: free ? 0 : Number(price), min_monthly: free ? 0 : Number(min) || 0 };
    if (await act('save', () => (plan ? api(`/admin/plans/${plan.id}`, { method: 'PUT', body }) : api('/admin/plans', { body })), plan ? 'Plan saved' : `${body.name} plan added`)) onSaved();
  }
  return (
    <Drawer title={plan ? `Edit the ${plan.name} plan` : 'New plan'} sub={plan ? 'Schools on this plan get the change straight away, unless their features or price were set by hand.' : undefined} onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="plan-form" busy={busy === 'save'} disabled={!!bad}>{plan ? 'Save changes' : 'Add plan'}</Button></>}>
      <form id="plan-form" className="stack" onSubmit={save} noValidate>
        <Text label="Plan name" value={name} onChange={setName} maxLength={40} placeholder="Standard" />
        <Switch label="Free plan" checked={free} onChange={setFree} />
        {!free ? <div className="cols"><Text label="Price per student a month (₹)" value={price} onChange={(v) => setPrice(money(v))} inputMode="decimal" /><Text label="Smallest monthly bill (₹)" value={min} onChange={(v) => setMin(money(v))} inputMode="decimal" hint="Charged when the school is small." /></div> : null}
        <Chips label="Features included (Core is always on)" options={Object.entries(modules).map(([id, label]) => ({ id, label: label.split(' (')[0] }))} value={mods} onChange={(v) => setMods(v.includes('core') ? v : ['core', ...v])} />
        {bad && name ? <div className="alert bad" role="alert">{bad}</div> : null}
      </form>
    </Drawer>
  );
}
