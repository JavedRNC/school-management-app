import { useEffect, useState } from 'react';
import { api } from '../api';
import { Switch, TextArea, useAct } from '../kit';
import { Button, ErrorBox, fmtDateTime, Loading, PageHead, Text, useLoad } from '../ui';

type Version = { auto_latest: boolean; latest_build: number; min_build: number; message: string; url: string; default_url: string; github_build: number | null;
  effective: { latest_build: number; min_build: number; message: string; url: string; source: string }; updated_at: string | null; updated_by: string };

export function AppUpdates() {
  const v = useLoad(() => api<Version>('/admin/app-version'), []);
  const { act, busy } = useAct();
  const [f, setF] = useState({ auto: true, latest: '0', min: '0', message: '', url: '' });
  useEffect(() => { if (v.data) setF({ auto: v.data.auto_latest, latest: String(v.data.latest_build), min: String(v.data.min_build), message: v.data.message, url: v.data.url }); }, [v.data]);
  if (v.error) return <><PageHead title="App updates" /><ErrorBox message={v.error} onRetry={v.reload} /></>;
  if (!v.data) return <><PageHead title="App updates" /><Loading rows={5} /></>;
  const x = v.data;
  const newest = f.auto ? Math.max(Number(f.latest) || 0, x.github_build ?? 0) : Number(f.latest) || 0;
  const bad = f.url && !f.url.trim().startsWith('https://') ? 'The download link must start with https://' : Number(f.min) > newest ? `The oldest build allowed can't be above the newest build (${newest})` : null;
  const digits = (s: string) => s.replace(/\D/g, '').slice(0, 7);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bad) return;
    const r = await act('save', () => api<Version>('/admin/app-version', { method: 'PUT', body: { auto_latest: f.auto, latest_build: Number(f.latest) || 0, min_build: Number(f.min) || 0, message: f.message.trim(), url: f.url.trim() } }), 'Update settings saved');
    if (r) v.reload();
  }
  return (
    <>
      <PageHead title="App updates" sub="Decide when people are asked to update the Android app, and when they must" />
      <div className="grid g21">
        <form className="card stack" onSubmit={save} noValidate>
          <Switch label="Follow the newest build published on GitHub" hint={x.github_build ? `The newest published build is ${x.github_build}.` : 'The published build number could not be read just now.'} checked={f.auto} onChange={(c) => setF({ ...f, auto: c })} />
          <div className="cols">
            <Text label={f.auto ? 'Newest build, at least' : 'Newest build'} value={f.latest} onChange={(s) => setF({ ...f, latest: digits(s) })} inputMode="numeric" hint="People on an older build are offered the update." />
            <Text label="Oldest build still allowed" value={f.min} onChange={(s) => setF({ ...f, min: digits(s) })} inputMode="numeric" hint="Anything older must update before it can be used. 0 means no one is forced." />
          </div>
          <TextArea label="Message shown with the update (optional)" value={f.message} onChange={(s) => setF({ ...f, message: s })} maxLength={500} placeholder="Faster attendance and a new fees screen." />
          <Text label="Download link (empty = the usual link)" value={f.url} onChange={(s) => setF({ ...f, url: s })} maxLength={500} placeholder={x.default_url} />
          {bad ? <div className="alert bad" role="alert">{bad}</div> : null}
          <div><Button kind="primary" type="submit" busy={busy === 'save'} disabled={!!bad}>Save update settings</Button></div>
        </form>
        <section className="card stack"><h2>What the app sees now</h2>
          <dl className="dl">
            <div><dt>Newest build</dt><dd>{x.effective.latest_build}</dd></div><div><dt>Oldest allowed</dt><dd>{x.effective.min_build || 'No limit'}</dd></div>
            <div className="wide"><dt>Download link</dt><dd>{x.effective.url}</dd></div>
            <div className="wide"><dt>Last changed</dt><dd>{x.updated_by ? `${fmtDateTime(x.updated_at)} by ${x.updated_by}` : 'Never'}</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}
