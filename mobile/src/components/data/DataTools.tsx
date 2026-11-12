import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { ApiError, api, authHeaders, getBaseUrl } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { ImportReport, NewLogin } from '@/lib/types';

import { FadeIn, Icon, IconBadge, Panel, PressScale, ToneChip, TopLayer } from '../ui';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type Mode = 'merge' | 'replace';
type Picked = { uri: string; name: string; size?: number; file?: Blob };

const TABS = ['School details', 'Classes', 'Subjects', 'Staff', 'Students & parents', 'Teaching', 'Period timings',
  'Timetable', 'Holidays', 'Fees', 'Transport'];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Download an authenticated file and open the share sheet (save to Files/Drive, WhatsApp…). */
async function downloadAndShare(url: string, name: string, title: string) {
  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(await errText(res));
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return;
  }
  const dest = new File(Paths.cache, name);
  if (dest.exists) dest.delete();
  const f = await File.downloadFileAsync(url, dest, { headers: authHeaders(), idempotent: true });
  // A failed request may still be saved as a small JSON error body.
  if ((f.size ?? 0) < 4000) {
    const txt = f.textSync();
    if (txt.trim().startsWith('{')) {
      let msg = 'Download failed';
      try { msg = JSON.parse(txt).detail ?? msg; } catch { /* keep default */ }
      f.delete();
      throw new Error(typeof msg === 'string' ? msg : 'Download failed');
    }
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone');
  await Sharing.shareAsync(f.uri, { mimeType: XLSX, dialogTitle: title, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
}

async function errText(res: Response) {
  try {
    const d = await res.json();
    return typeof d.detail === 'string' ? d.detail : `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function friendlyUploadError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 413) return 'The file is too big (over 20 MB). Split it into smaller files.';
    return e.message;
  }
  return (e as Error).message || 'Something went wrong';
}

function csvOf(rows: NewLogin[], code: string) {
  const esc = (v: string) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Name', 'Role', 'Class', 'School code', 'Login ID', 'Temporary password'];
  return [head.join(','), ...rows.map((r) => [r.name, r.role.replace('_', ' '), r.class ?? '', code, r.login_id, r.password].map(esc).join(','))].join('\n');
}

export function DataTools({ base, schoolCode, schoolName }: { base: string; schoolCode: string; schoolName: string }) {
  const t = useAppTheme();
  const toast = useToast();
  const [busy, setBusy] = useState<'template' | 'backup' | 'undo' | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [askMode, setAskMode] = useState(false);
  const [mode, setMode] = useState<Mode>('merge');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [undo, setUndo] = useState<{ exists: boolean; created_at: string | null; created_by: string } | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);

  async function download(kind: 'template' | 'backup') {
    haptic.tap();
    setBusy(kind);
    try {
      const name = `Prangan-${kind === 'backup' ? 'Backup' : 'Template'}-${schoolCode}-${stamp()}.xlsx`;
      await downloadAndShare(`${getBaseUrl()}${base}/${kind}`, name, kind === 'backup' ? 'Save the backup' : 'Save the template');
      haptic.success();
      toast(kind === 'backup' ? 'Backup ready — keep it somewhere safe' : 'Template ready — fill it in and import it here');
    } catch (e) {
      haptic.error();
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (base !== '/data') return;      // admins just get the button
    api<{ exists: boolean; created_at: string | null; created_by: string }>('/data/snapshot').then(setUndo).catch(() => setUndo(null));
  }, [base, done]);

  async function downloadUndo() {
    haptic.tap();
    setBusy('undo');
    try {
      await downloadAndShare(`${getBaseUrl()}${base}/snapshot/file`, `Prangan-Before-Replace-${schoolCode}-${stamp()}.xlsx`, 'Save the undo backup');
      haptic.success();
      toast('Undo backup ready');
    } catch (e) {
      haptic.error();
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  async function pick() {
    haptic.tap();
    const res = await DocumentPicker.getDocumentAsync({
      type: [XLSX, 'application/vnd.ms-excel', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!/\.xlsx$/i.test(a.name)) {
      haptic.error();
      toast('Pick an Excel .xlsx file (from the template or a backup)', { error: true });
      return;
    }
    setPicked({ uri: a.uri, name: a.name, size: a.size, file: a.file });
    setReport(null);
    setDone(null);
    setCode('');
    setPassword('');
    setAskMode(true);
  }

  function form(confirm: boolean, m: Mode = mode) {
    const fd = new FormData();
    if (!picked) return fd;
    if (Platform.OS === 'web' && picked.file) fd.append('file', picked.file, picked.name);
    else fd.append('file', { uri: picked.uri, name: picked.name, type: XLSX } as unknown as Blob);
    fd.append('mode', m);
    fd.append('confirm', confirm ? 'true' : 'false');
    fd.append('confirm_code', confirm ? code.trim() : '');
    fd.append('password', confirm && m === 'replace' ? password : '');
    return fd;
  }

  async function check(m: Mode) {
    setMode(m);
    setAskMode(false);
    setChecking(true);
    setReport(null);
    try {
      const r = await api<ImportReport>(`${base}/import`, { method: 'POST', body: form(false, m) });
      setReport(r);
      if (r.ok) { haptic.success(); toast('File checked — nothing saved yet'); } else { haptic.error(); toast(`${r.error_count} problem${r.error_count === 1 ? '' : 's'} to fix`, { error: true }); }
    } catch (e) {
      haptic.error();
      toast(friendlyUploadError(e), { error: true });
    } finally {
      setChecking(false);
    }
  }

  async function save() {
    if (!report?.ok) return;
    if (mode === 'replace' && code.trim().toUpperCase() !== schoolCode.toUpperCase()) {
      haptic.error();
      toast(`Type the school code ${schoolCode} to confirm Replace`, { error: true });
      return;
    }
    setSaving(true);
    try {
      const r = await api<ImportReport>(`${base}/import`, { method: 'POST', body: form(true) });
      if (!r.saved) {
        setReport(r);
        haptic.error();
        toast('Nothing was saved — the file has problems', { error: true });
        return;
      }
      haptic.success();
      toast(mode === 'replace' ? 'School data restored from the file' : 'Import saved');
      setDone(r);
      setReport(null);
      setPicked(null);
    } catch (e) {
      haptic.error();
      toast(friendlyUploadError(e), { error: true });
    } finally {
      setSaving(false);
    }
  }

  async function shareLogins(list: NewLogin[], asFile: boolean) {
    haptic.tap();
    try {
      if (!asFile) {
        const text = `${schoolName} · School code ${schoolCode}\nNew logins (change password at first sign-in):\n\n`
          + list.map((l) => `${l.name} (${l.role.replace('_', ' ')}${l.class ? ` · ${l.class}` : ''}) — ID ${l.login_id} · password ${l.password}`).join('\n');
        await Share.share({ message: text });
        return;
      }
      const csv = csvOf(list, schoolCode);
      const name = `Prangan-new-logins-${schoolCode}-${stamp()}.csv`;
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = name;
        a.click();
        return;
      }
      const f = new File(Paths.cache, name);
      f.create({ overwrite: true });
      await f.write(csv);
      await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: 'Save the login list', UTI: 'public.comma-separated-values-text' });
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  const replaceReady = mode !== 'replace' || (code.trim().toUpperCase() === schoolCode.toUpperCase() && password.length >= 6);

  return (
    <>
      <FadeIn>
        <Panel title="Excel template" subtitle="Set up the whole school from one file" icon="file-excel-outline">
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
            One tab per topic. It already contains what's in the app, so you can edit and re-import it.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
            {TABS.map((x) => <ToneChip key={x} text={x} tone="primary" />)}
          </View>
          <Button mode="contained-tonal" icon="download" onPress={() => download('template')} loading={busy === 'template'}
            disabled={!!busy} contentStyle={{ paddingVertical: 4 }}>Get the template</Button>
        </Panel>
      </FadeIn>

      <FadeIn index={1}>
        <Panel title="Full backup" subtitle="Everything: people, timetable, attendance, marks, fees, receipts…" icon="cloud-download-outline">
          <View style={{ flexDirection: 'row', gap: space.sm, backgroundColor: t.colors.errorContainer, borderRadius: radius.lg, padding: space.md, marginBottom: space.md }}>
            <Icon name="shield-alert-outline" size={20} color={t.colors.onErrorContainer} />
            <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onErrorContainer }}>
              The backup has personal data of students, parents and staff. Keep it private (e.g. your Google Drive), never post it in groups.
              People keep their passwords on restore only if the file is unchanged.
            </Text>
          </View>
          <Button mode="contained" icon="database-export-outline" onPress={() => download('backup')} loading={busy === 'backup'}
            disabled={!!busy} contentStyle={{ paddingVertical: 4 }}>Download backup</Button>
        </Panel>
      </FadeIn>

      {undo === null || undo.exists ? (
        <FadeIn index={1}>
          <Panel title="Undo the last Replace" icon="history"
            subtitle={undo?.created_at ? `Saved automatically ${new Date(undo.created_at + 'Z').toLocaleString('en-IN')}${undo.created_by ? ` · before ${undo.created_by}'s Replace` : ''}`
              : 'A copy of the school data is saved automatically before every Replace'}>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
              Download it, then import it here with Replace to go back to how things were.
            </Text>
            <Button mode="outlined" icon="file-restore-outline" onPress={downloadUndo} disabled={!!busy} loading={busy === 'undo'}>
              Download the undo backup
            </Button>
          </Panel>
        </FadeIn>
      ) : null}

      <FadeIn index={2}>
        <Panel title="Import a file" subtitle="Filled template or a backup (.xlsx)" icon="database-import-outline">
          <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
            Every row is checked first. Nothing is saved until you confirm — and if any row has a problem, nothing is saved at all.
          </Text>
          <Button mode="contained" icon="file-upload-outline" onPress={pick} disabled={checking || saving} contentStyle={{ paddingVertical: 4 }}>
            {picked ? 'Pick another file' : 'Pick Excel file'}
          </Button>
          {picked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
              <Icon name="file-excel" size={22} color={t.custom.success} />
              <Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1, color: t.colors.onSurface }}>{picked.name}</Text>
              <ToneChip text={mode === 'replace' ? 'Replace' : 'Merge'} tone={mode === 'replace' ? 'danger' : 'primary'} />
            </View>
          ) : null}
          {checking ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg }}>
              <ActivityIndicator />
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, flex: 1 }}>Checking every row… big files can take a minute.</Text>
            </View>
          ) : null}
        </Panel>
      </FadeIn>

      {report ? <ReportCard r={report} /> : null}

      {report?.ok ? (
        <FadeIn>
          <Panel tone={mode === 'replace' ? 'danger' : 'success'} title={mode === 'replace' ? 'Replace school data?' : 'Ready to save'}
            icon={mode === 'replace' ? 'alert-octagon-outline' : 'check-decagram-outline'}
            subtitle={mode === 'replace' ? 'All current data of this school is replaced by the file. Principal accounts are kept.' : 'New rows are added and changed rows updated. Nothing is deleted.'}>
            {mode === 'replace' ? (
              <>
                <TextInput mode="outlined" label={`Type the school code (${schoolCode}) to confirm`} value={code} onChangeText={setCode}
                  autoCapitalize="characters" style={{ marginBottom: space.sm }} />
                <TextInput mode="outlined" label="Your password" value={password} onChangeText={setPassword} secureTextEntry
                  style={{ marginBottom: space.sm }} />
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
                  The app keeps a copy of the current data first, so you can undo this from "Undo the last Replace" below.
                </Text>
              </>
            ) : null}
            <Button mode="contained" icon="content-save-check-outline" onPress={save} loading={saving} disabled={saving || !replaceReady}
              buttonColor={mode === 'replace' ? t.colors.error : undefined} contentStyle={{ paddingVertical: 6 }}>
              {mode === 'replace' ? 'Replace and restore' : 'Save import'}
            </Button>
            {saving ? <Text variant="bodySmall" style={{ marginTop: space.sm, color: t.colors.onSurfaceVariant }}>Saving… don't close the app.</Text> : null}
          </Panel>
        </FadeIn>
      ) : null}

      {done ? <DoneCard r={done} onShare={(f) => shareLogins(done.credentials ?? [], f)} /> : null}

      <TopLayer visible={askMode} onDismiss={() => setAskMode(false)}>
        <Dialog visible={askMode} onDismiss={() => setAskMode(false)}>
          <Dialog.Icon icon="help-circle-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>What should be done?</Dialog.Title>
          <Dialog.Content>
            <ModeOption icon="call-merge" title="Merge" tone="primary"
              text="Add new rows and update changed ones. Nothing already in the app is deleted." onPress={() => check('merge')} />
            <ModeOption icon="backup-restore" title="Replace (restore)" tone="danger"
              text="The school's data becomes exactly this file — anything not in the file is removed. Principal accounts are kept."
              onPress={() => check('replace')} />
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>Next you'll see a check of the file. Nothing is saved yet.</Text>
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setAskMode(false)}>Cancel</Button></Dialog.Actions>
        </Dialog>
      </TopLayer>
    </>
  );
}

function ModeOption({ icon, title, text, tone, onPress }: { icon: 'call-merge' | 'backup-restore'; title: string; text: string; tone: 'primary' | 'danger'; onPress: () => void }) {
  const t = useAppTheme();
  return (
    <PressScale onPress={() => { haptic.tap(); onPress(); }} style={{ marginBottom: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1,
        borderColor: tone === 'danger' ? t.colors.error : t.colors.primary, backgroundColor: t.colors.elevation.level1 }}>
        <IconBadge icon={icon} tone={tone} />
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{title}</Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{text}</Text>
        </View>
      </View>
    </PressScale>
  );
}

function ReportCard({ r }: { r: ImportReport }) {
  const t = useAppTheme();
  const groups = new Map<string, ImportReport['errors']>();
  for (const e of r.errors) {
    const k = e.sheet || 'File';
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const totals = r.sheets.reduce((a, s) => ({ add: a.add + s.add, update: a.update + s.update }), { add: 0, update: 0 });
  return (
    <FadeIn>
      <Panel title={r.ok ? 'File looks good' : `${r.error_count} problem${r.error_count === 1 ? '' : 's'} found`}
        subtitle={`${r.kind === 'backup' ? 'Backup file' : 'Template'} · ${r.mode === 'replace' ? 'Replace' : 'Merge'} · ${totals.add} to add, ${totals.update} to update`}
        icon={r.ok ? 'check-circle-outline' : 'alert-circle-outline'} tone={r.ok ? undefined : 'danger'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
          {r.kind === 'backup' ? (
            <ToneChip text={r.verified ? 'Verified backup' : 'Edited / unverified file'} tone={r.verified ? 'success' : 'warning'}
              icon={r.verified ? 'shield-check-outline' : 'shield-alert-outline'} />
          ) : null}
          {r.kind === 'backup' ? (
            <ToneChip text={r.passwords_kept ? 'Passwords kept' : 'New temporary passwords'} tone={r.passwords_kept ? 'success' : 'warning'}
              icon={r.passwords_kept ? 'lock-check-outline' : 'lock-reset'} />
          ) : null}
          {r.new_logins ? <ToneChip text={`${r.new_logins} new logins`} tone="primary" icon="account-key-outline" /> : null}
        </View>
        {r.sheets.length ? (
          <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: t.colors.outlineVariant, marginBottom: space.md }}>
            <View style={{ flexDirection: 'row', backgroundColor: t.colors.surfaceVariant, paddingVertical: 6, paddingHorizontal: space.md }}>
              {['Sheet', 'Add', 'Update', 'Same'].map((h, i) => (
                <Text key={h} variant="labelMedium" style={{ flex: i ? 1 : 2.4, textAlign: i ? 'right' : 'left', fontWeight: '700', color: t.colors.onSurfaceVariant }}>{h}</Text>
              ))}
            </View>
            {r.sheets.map((s) => (
              <View key={s.sheet} style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: space.md, borderTopWidth: 0.5, borderTopColor: t.colors.outlineVariant }}>
                <Text variant="bodyMedium" style={{ flex: 2.4, color: t.colors.onSurface }} numberOfLines={1}>{s.sheet}</Text>
                <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right', color: s.add ? t.custom.success : t.colors.outline, fontWeight: s.add ? '700' : '400' }}>{s.add}</Text>
                <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right', color: s.update ? t.colors.primary : t.colors.outline }}>{s.update}</Text>
                <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right', color: t.colors.outline }}>{s.skip}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {r.warnings.map((w, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm, marginBottom: 6 }}>
            <Icon name="information-outline" size={18} color={t.custom.warning} />
            <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onSurfaceVariant }}>{w}</Text>
          </View>
        ))}
        {[...groups.entries()].map(([sheet, list]) => (
          <View key={sheet} style={{ marginTop: space.sm }}>
            <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.error, marginBottom: 4 }}>{sheet} · {list.length}</Text>
            {list.map((e, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.sm, paddingVertical: 3 }}>
                <View style={{ minWidth: 54, alignItems: 'flex-start' }}>
                  <ToneChip text={e.row ? `Row ${e.row}` : 'Sheet'} tone="danger" />
                </View>
                <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onSurface }}>
                  {e.field ? <Text style={{ fontWeight: '700' }}>{e.field}: </Text> : null}{e.message}
                </Text>
              </View>
            ))}
          </View>
        ))}
        {r.error_count > r.errors.length ? (
          <Text variant="bodySmall" style={{ marginTop: space.sm, color: t.colors.onSurfaceVariant }}>
            …and {r.error_count - r.errors.length} more. Fix these and check again.
          </Text>
        ) : null}
        {!r.ok ? (
          <Text variant="bodySmall" style={{ marginTop: space.md, color: t.colors.onSurfaceVariant }}>
            Fix the rows in the Excel file, then pick it again. Nothing has been saved.
          </Text>
        ) : null}
      </Panel>
    </FadeIn>
  );
}

function DoneCard({ r, onShare }: { r: ImportReport; onShare: (asFile: boolean) => void }) {
  const t = useAppTheme();
  const creds = r.credentials ?? [];
  const added = r.sheets.reduce((a, s) => a + s.add, 0);
  const updated = r.sheets.reduce((a, s) => a + s.update, 0);
  return (
    <FadeIn>
      <View style={{ borderRadius: radius.xl, marginBottom: space.md, shadowColor: t.custom.success, shadowOpacity: 0.45, shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 }, elevation: 8 }}>
        <Panel tone="success" title={r.mode === 'replace' ? 'Restore complete 🎉' : 'Import saved 🎉'} icon="party-popper"
          subtitle={`${added} added · ${updated} updated${r.passwords_kept ? ' · passwords kept' : ''}`} style={{ marginBottom: 0 }}>
          {creds.length ? (
            <>
              <View style={{ flexDirection: 'row', gap: space.sm, backgroundColor: t.colors.errorContainer, borderRadius: radius.lg, padding: space.md, marginBottom: space.md }}>
                <Icon name="eye-off-outline" size={20} color={t.colors.onErrorContainer} />
                <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onErrorContainer }}>
                  These {creds.length} temporary passwords are shown only now. Download or share the list before leaving this screen.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
                <Button mode="contained" icon="file-delimited-outline" onPress={() => onShare(true)} style={{ flex: 1 }}>Download list</Button>
                <Button mode="contained-tonal" icon="share-variant" onPress={() => onShare(false)} style={{ flex: 1 }}>Share</Button>
              </View>
              {creds.slice(0, 200).map((c) => (
                <View key={c.login_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: t.colors.outlineVariant }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600', color: t.colors.onSurface }} numberOfLines={1}>{c.name}</Text>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{c.role.replace('_', ' ')}{c.class ? ` · ${c.class}` : ''} · ID {c.login_id}</Text>
                  </View>
                  <Text variant="titleSmall" selectable style={{ fontFamily: 'monospace', fontWeight: '700', color: t.colors.primary }}>{c.password}</Text>
                </View>
              ))}
              {creds.length > 200 ? <Text variant="bodySmall" style={{ marginTop: space.sm, color: t.colors.onSurfaceVariant }}>+ {creds.length - 200} more in the downloaded list</Text> : null}
            </>
          ) : (
            <Text variant="bodyMedium" style={{ color: t.colors.onSurface }}>No new logins were needed.</Text>
          )}
        </Panel>
      </View>
    </FadeIn>
  );
}
