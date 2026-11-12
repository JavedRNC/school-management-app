// Import and export of ONE school's data, on the same API the Android app uses (template, signed backup,
// check-then-confirm import, Merge or Replace, undo copy). Used by the principal and, during support access, by Admin.
import { useRef, useState } from 'react';
import { api, download, type AuditRow, type ImportReport } from './api';
import { Button, Empty, ErrorBox, fmtDateTime, fmtInt, Loading, Modal, Text, useLoad, useToast, words } from './ui';

const MAX_MB = 20;

function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;          // never let a spreadsheet run a cell as a formula
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
function saveText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function DataTools({ base, schoolCode, admin }: { base: string; schoolCode: string; admin?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [over, setOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hist = useLoad(() => api<AuditRow[]>(`${base}/history`), [base]);
  const undo = useLoad(() => (admin ? Promise.resolve(null) : api<{ exists: boolean; created_at: string | null; created_by: string }>('/data/snapshot')), [admin]);

  async function get(kind: 'template' | 'backup' | 'snapshot/file') {
    setBusy(kind);
    try {
      toast(`Saved ${await download(`${base}/${kind}`, `Prangan-${schoolCode}.xlsx`)}`);
      hist.reload();
    } catch (e) { toast((e as Error).message, true); }
    finally { setBusy(null); }
  }

  function pick(f: File | null | undefined) {
    setReport(null); setDone(null); setFileError(null);
    if (!f) return setFile(null);
    if (!/\.xlsx$/i.test(f.name)) { setFile(null); return setFileError('Choose an Excel .xlsx file (the Prangan template or a backup).'); }
    if (f.size > MAX_MB * 1024 * 1024) { setFile(null); return setFileError(`That file is bigger than ${MAX_MB} MB.`); }
    setFile(f);
  }

  async function run(final: boolean) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    form.append('confirm', final ? 'true' : 'false');
    if (final && mode === 'replace') { form.append('confirm_code', code.trim()); form.append('password', pw); }
    setBusy(final ? 'import' : 'check');
    try {
      const r = await api<ImportReport>(`${base}/import`, { form });
      if (final && r.saved) {
        setDone(r); setReport(null); setFile(null); setConfirm(false); setCode(''); setPw('');
        if (input.current) input.current.value = '';
        toast('Import finished');
        hist.reload(); undo.reload();
      } else {
        setReport(r); setConfirm(false);
        if (final) toast('Nothing was saved — fix the errors and check the file again.', true);
      }
    } catch (e) { toast((e as Error).message, true); }
    finally { setBusy(null); setPw(''); }
  }

  const adds = report?.sheets.reduce((n, s) => n + s.add, 0) ?? 0;
  const updates = report?.sheets.reduce((n, s) => n + s.update, 0) ?? 0;
  const errorReport = () => report && saveText(`Prangan-import-errors-${schoolCode}.csv`,
    csv([['Sheet', 'Row', 'Column', 'Problem'], ...report.errors.map((e) => [e.sheet, e.row ?? '', e.column ?? '', e.message])]));
  const creds = done?.credentials ?? [];

  return (
    <div className="stack">
      <div className="grid g2">
        <section className="card stack">
          <h2>Excel template</h2>
          <p className="muted">One workbook with a tab per topic, already filled with what is in Prangan for this school. Edit it and import it back.</p>
          <div><Button icon="download" onClick={() => get('template')} busy={busy === 'template'} disabled={!!busy}>Get the template</Button></div>
        </section>
        <section className="card stack">
          <h2>Full backup</h2>
          <p className="muted">Everything for this school in one file: people, timetable, attendance, marks, fees and receipts.</p>
          <div className="alert warn"><span>The backup contains personal data of students, parents and staff. Keep it private and never post it in groups.</span></div>
          <div className="row">
            <Button icon="download" onClick={() => get('backup')} busy={busy === 'backup'} disabled={!!busy}>Download backup</Button>
            {undo.data?.exists ? <Button onClick={() => get('snapshot/file')} busy={busy === 'snapshot/file'} disabled={!!busy}>Undo copy from {fmtDateTime(undo.data.created_at)}</Button> : null}
          </div>
        </section>
      </div>

      <section className="card stack">
        <h2>Import a file</h2>
        <div className={`drop ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
          <p><b>{file ? file.name : 'Choose the filled template or a backup (.xlsx)'}</b></p>
          <p className="muted small">{file ? `${(file.size / 1024).toFixed(0)} KB` : `Up to ${MAX_MB} MB. On a computer you can also drop the file here.`}</p>
          <input ref={input} id="import-file" className="sr" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => pick(e.target.files?.[0])} />
          <label htmlFor="import-file" className="btn" style={{ marginTop: 10 }}>{file ? 'Choose another file' : 'Choose file'}</label>
        </div>
        {fileError ? <div className="alert bad" role="alert">{fileError}</div> : null}
        <div className="row">
          <div className="seg" role="group" aria-label="How to import">
            <button type="button" aria-pressed={mode === 'merge'} onClick={() => { setMode('merge'); setReport(null); }}>Merge</button>
            <button type="button" aria-pressed={mode === 'replace'} onClick={() => { setMode('replace'); setReport(null); }}>Replace</button>
          </div>
          <span className="muted small grow">{mode === 'merge' ? 'Adds new records and updates matching ones. Never deletes.' : "Wipes this school's data and loads the file instead. An undo copy is saved first."}</span>
        </div>
        <div><Button kind="primary" icon="search" onClick={() => run(false)} busy={busy === 'check'} disabled={!file || !!busy}>Check the file</Button></div>

        {report ? (
          <div className="stack" aria-live="polite">
            <div className={`alert ${report.ok ? 'ok' : 'bad'}`} role="status">
              {report.ok ? `The file is fine. It will add ${fmtInt(adds)} and update ${fmtInt(updates)} records${report.new_logins ? `, and create ${fmtInt(report.new_logins)} new logins` : ''}. Nothing is saved yet.`
                : `${fmtInt(report.error_count)} ${report.error_count === 1 ? 'problem' : 'problems'} found. Nothing was saved. Fix them in the file and check it again.`}
            </div>
            <div className="tablewrap"><table className="t">
              <thead><tr><th>Sheet</th><th className="right">Will add</th><th className="right">Will update</th><th className="right">Unchanged</th></tr></thead>
              <tbody>{report.sheets.map((s) => (
                <tr key={s.sheet}><td className="primary-cell"><span>{s.sheet}</span></td><td data-label="Will add" className="right num">{fmtInt(s.add)}</td>
                  <td data-label="Will update" className="right num">{fmtInt(s.update)}</td><td data-label="Unchanged" className="right num">{fmtInt(s.skip)}</td></tr>
              ))}</tbody>
            </table></div>
            {report.warnings.length ? <div className="alert warn"><ul style={{ margin: 0, paddingLeft: 18 }}>{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div> : null}
            {report.errors.length ? (
              <>
                <div className="spread"><h3>Problems, row by row</h3><Button kind="small" icon="download" onClick={errorReport}>Download error report</Button></div>
                <div className="tablewrap"><table className="t">
                  <thead><tr><th>Sheet</th><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
                  <tbody>{report.errors.slice(0, 100).map((e, i) => (
                    <tr key={i}><td data-label="Sheet">{e.sheet}</td><td data-label="Row" className="num">{e.row ?? '—'}</td><td data-label="Column">{e.column ?? '—'}</td><td className="plain">{e.message}</td></tr>
                  ))}</tbody>
                </table></div>
                {report.error_count > 100 ? <p className="small muted">Showing the first 100 of {fmtInt(report.error_count)}. The error report has them all that the server returned.</p> : null}
              </>
            ) : null}
            {report.ok ? <div><Button kind={mode === 'replace' ? 'danger' : 'gold'} icon="upload" onClick={() => setConfirm(true)} disabled={!!busy}>
              {mode === 'replace' ? 'Replace school data…' : 'Import now…'}</Button></div> : null}
          </div>
        ) : null}

        {done ? (
          <div className="stack" aria-live="polite">
            <div className="alert ok" role="status">Import finished: {fmtInt(done.sheets.reduce((n, s) => n + s.add, 0))} added, {fmtInt(done.sheets.reduce((n, s) => n + s.update, 0))} updated.
              {done.undo_saved ? ' An undo copy of the earlier data was saved.' : ''}</div>
            {creds.length ? (
              <div className="card stack">
                <h3>{fmtInt(creds.length)} new logins — shown only now</h3>
                <p className="muted small">Each person must set their own password at first sign-in. Download the list before leaving this page; it cannot be shown again.</p>
                <div><Button icon="download" onClick={() => saveText(`Prangan-new-logins-${schoolCode}.csv`,
                  csv([['Name', 'Role', 'Class', 'School code', 'Login ID', 'Temporary password'], ...creds.map((c) => [c.name, words(c.role), c.class ?? '', schoolCode, c.login_id, c.password])]))}>Download the login list</Button></div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card flush">
        <div style={{ padding: '16px 18px 8px' }}><h2>Import and export history</h2></div>
        {hist.loading ? <div style={{ padding: 18 }}><Loading /></div> : hist.error ? <div style={{ padding: 18 }}><ErrorBox message={hist.error} onRetry={hist.reload} /></div> : hist.data?.length ? (
          <div className="tablewrap"><table className="t"><thead><tr><th>What</th><th>Detail</th><th>By</th><th>When</th></tr></thead>
            <tbody>{hist.data.map((a) => (
              <tr key={a.id}><td className="primary-cell"><span>{words(a.action.replace(/^data\./, ''))}</span></td><td data-label="Detail">{a.detail || '—'}</td>
                <td data-label="By">{a.actor_name}</td><td data-label="When">{fmtDateTime(a.at)}</td></tr>
            ))}</tbody></table></div>
        ) : <Empty title="No imports or exports yet">Downloads and imports for this school will be listed here.</Empty>}
      </section>

      {confirm && report ? (
        <Modal title={mode === 'replace' ? 'Replace all data of this school?' : 'Import this file?'} onClose={() => setConfirm(false)}
          actions={<><Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button kind={mode === 'replace' ? 'danger' : 'primary'} busy={busy === 'import'} disabled={mode === 'replace' && (code.trim().toUpperCase() !== schoolCode.toUpperCase() || pw.length < 6)}
              onClick={() => run(true)}>{mode === 'replace' ? 'Replace data' : 'Import'}</Button></>}>
          <p className="muted">{mode === 'replace'
            ? "Everything this school has in Prangan is removed and the file's contents are loaded instead. A copy of the current data is saved first so it can be undone."
            : `This adds ${fmtInt(adds)} and updates ${fmtInt(updates)} records. Nothing is deleted.`}</p>
          {mode === 'replace' ? (
            <div className="stack" style={{ marginTop: 14 }}>
              <Text label={`Type the school code (${schoolCode}) to confirm`} value={code} onChange={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" spellCheck={false} />
              <Text label="Your password" value={pw} onChange={setPw} type="password" autoComplete="current-password" />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
