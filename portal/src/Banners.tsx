// Banners shown at the top of the app. The same screen serves a school (its own banners) and the platform admin (banners for every school).
import { useState } from 'react';
import { api } from './api';
import { Chips, Drawer, IconButton, RowActions, Switch, TextArea, today, useAct, useConfirm } from './kit';
import { Badge, Button, Empty, ErrorBox, fmtDate, Loading, PageHead, Select, Text, useLoad } from './ui';

type Banner = { id: number; title: string; text: string; image_url: string; color: string; roles: string[]; class_ids: number[]; start_date: string | null; end_date: string | null; popup: boolean; sort: number; platform?: boolean };
const COLORS: [string, string][] = [['primary', 'Blue'], ['amber', 'Amber'], ['green', 'Green'], ['red', 'Red'], ['purple', 'Purple']];
const ROLES = [{ id: 'principal', label: 'Principals' }, { id: 'vice_principal', label: 'Vice principals' }, { id: 'coordinator', label: 'Coordinators' }, { id: 'teacher', label: 'Teachers' }, { id: 'student', label: 'Students' }, { id: 'parent', label: 'Parents' }];

export function Banners({ base, admin, classes, canWrite = true, images = true }: { base: string; admin?: boolean; classes?: { id: number; name: string }[]; canWrite?: boolean; images?: boolean }) {
  const list = useLoad(() => api<Banner[]>(base), [base]);
  const [edit, setEdit] = useState<Banner | 'new' | null>(null);
  const confirm = useConfirm();
  const { act } = useAct();
  const own = (list.data ?? []).filter((b) => admin || !b.platform);
  const state = (b: Banner) => (b.end_date && b.end_date < today() ? ['suspended', 'Ended'] : b.start_date && b.start_date > today() ? ['trial', `Starts ${fmtDate(b.start_date)}`] : ['active', 'Showing now']);
  async function remove(b: Banner) {
    if (!(await confirm({ title: `Remove "${b.title}"?`, body: 'It stops showing in the app straight away.', confirm: 'Remove', danger: true }))) return;
    if (await act('rm', () => api(`${base}/${b.id}`, { method: 'DELETE' }), 'Banner removed')) list.reload();
  }
  return (
    <>
      <PageHead title={admin ? 'Announcements' : 'Banners'} sub={admin ? 'Shown at the top of the app in every school, for example about a new version or planned maintenance' : 'A coloured strip at the top of the app, or a pop-up people see once'}>
        {canWrite ? <Button kind="primary" icon="plus" onClick={() => setEdit('new')}>New banner</Button> : null}
      </PageHead>
      {list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : !own.length ? <div className="card"><Empty title="No banners yet">Use a banner for things everyone should notice, like Sports Day or a fee reminder.</Empty></div> : (
        <div className="grid g2">{own.map((b) => { const [tone, label] = state(b); return (
          <div key={b.id} className={`tile bar c-${b.color}`}>
            <div className="spread"><h2>{b.title}</h2>{canWrite ? <RowActions><IconButton icon="edit" label={`Edit ${b.title}`} onClick={() => setEdit(b)} /><IconButton icon="trash" danger label={`Remove ${b.title}`} onClick={() => remove(b)} /></RowActions> : null}</div>
            {b.text ? <p>{b.text}</p> : null}
            <div className="row small"><Badge status={tone}>{label}</Badge>{b.popup ? <Badge>Pop-up</Badge> : null}<span className="muted">{b.roles.length ? b.roles.map((r) => ROLES.find((x) => x.id === r)?.label ?? r).join(', ') : 'Everyone'}{b.end_date ? ` · until ${fmtDate(b.end_date)}` : ''}</span></div>
          </div>
        ); })}</div>
      )}
      {edit ? <BannerForm base={base} b={edit === 'new' ? null : edit} classes={classes} images={images} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} /> : null}
    </>
  );
}

function BannerForm({ base, b, classes, images, onClose, onSaved }: { base: string; b: Banner | null; classes?: { id: number; name: string }[]; images: boolean; onClose: () => void; onSaved: () => void }) {
  const { act, busy } = useAct();
  const [f, setF] = useState({ title: b?.title ?? '', text: b?.text ?? '', image_url: b?.image_url ?? '', color: b?.color ?? 'primary', roles: b?.roles ?? [], class_ids: b?.class_ids ?? [], start_date: b?.start_date ?? '', end_date: b?.end_date ?? '', popup: b?.popup ?? false });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad: Record<string, string> = {};
    if (!f.title.trim()) bad.title = 'Add a title';
    if (images && f.image_url && !f.image_url.trim().startsWith('https://')) bad.image = 'The picture link must start with https://';
    if (f.start_date && f.end_date && f.end_date < f.start_date) bad.end = 'The last day is before the first day';
    setErr(bad);
    if (Object.keys(bad).length) return;
    const body = { ...f, title: f.title.trim(), text: f.text.trim(), image_url: images ? f.image_url.trim() : '', start_date: f.start_date || null, end_date: f.end_date || null, sort: b?.sort ?? 0 };
    if (await act('save', () => (b ? api(`${base}/${b.id}`, { method: 'PUT', body }) : api(base, { body })), b ? 'Banner saved' : 'Banner is live')) onSaved();
  }
  return (
    <Drawer title={b ? 'Edit banner' : 'New banner'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" type="submit" form="banner-form" busy={busy === 'save'}>{b ? 'Save changes' : 'Show banner'}</Button></>}>
      <form id="banner-form" className="stack" onSubmit={save} noValidate>
        <div className={`tile bar c-${f.color}`} aria-label="Preview"><b>{f.title || 'Banner title'}</b>{f.text ? <span className="small">{f.text}</span> : null}</div>
        <Text label="Title" value={f.title} onChange={(v) => set('title', v)} error={err.title} maxLength={120} />
        <TextArea label="Message (optional)" value={f.text} onChange={(v) => set('text', v)} maxLength={600} />
        <div className="cols"><Select label="Colour" value={f.color} onChange={(v) => set('color', v)} options={COLORS} />
          {!images && b?.image_url ? <p className="small muted wide">This banner has a picture, but pictures are not part of your plan now. Saving removes the picture.</p> : null}
          {images ? <Text label="Picture link (optional)" value={f.image_url} onChange={(v) => set('image_url', v)} error={err.image} maxLength={500} placeholder="https://…" /> : null}
          <Text label="Show from (optional)" type="date" value={f.start_date} onChange={(v) => set('start_date', v)} /><Text label="Show until (optional)" type="date" value={f.end_date} onChange={(v) => set('end_date', v)} error={err.end} /></div>
        <Chips label="Who sees it (none selected = everyone)" options={ROLES} value={f.roles} onChange={(v) => set('roles', v)} />
        {classes?.length ? <Chips label="Only these classes (none selected = all)" options={classes.map((c) => ({ id: c.id, label: c.name }))} value={f.class_ids} onChange={(v) => set('class_ids', v)} /> : null}
        <Switch label="Also show as a pop-up" hint="Each person sees the pop-up once when they open the app." checked={f.popup} onChange={(v) => set('popup', v)} />
      </form>
    </Drawer>
  );
}
