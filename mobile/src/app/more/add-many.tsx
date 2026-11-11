import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddManyRow, BulkField, BulkRowData, fieldsFor, isEmptyRow } from '@/components/people/AddManyRow';
import { PersonRole } from '@/components/people/constants';
import { EmptyState, FadeIn, FilterChips, Hero, Icon, IconName, Panel, Row, Sheet, ToneChip, TopLayer, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABEL, useAuth, useCan, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { BulkResult, NewLogin, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

const MAX_ROWS = 300;
const ROLES: PersonRole[] = ['student', 'teacher', 'parent', 'vice_principal', 'coordinator'];
const ROLE_ICON: Record<PersonRole, IconName> = {
  student: 'account-school-outline', teacher: 'human-male-board', parent: 'human-male-female-child',
  vice_principal: 'account-tie-outline', coordinator: 'account-tie-voice-outline',
};
const PLURAL: Record<PersonRole, string> = {
  student: 'students', teacher: 'teachers', parent: 'parents', vice_principal: 'vice principals', coordinator: 'coordinators',
};

let seq = 0;
const blank = (): BulkRowData => ({ key: `r${++seq}` });

type RowErrors = Record<string, Partial<Record<string, string>>>;

/** Split pasted text (Excel/Sheets → tabs; WhatsApp/CSV → commas) into rows of cells. */
function parsePaste(text: string): string[][] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

function csvCell(v: string) {
  let s = v ?? '';
  if (/^[=+\-@]/.test(s)) s = `'${s}`;          // never a spreadsheet formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function AddMany() {
  const t = useAppTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { user: me } = useAuth();
  const canEdit = useCan('people', 'edit');
  const extraRoles = useModule('extra_roles');
  const canStaff = me?.role === 'principal' && extraRoles;
  const params = useLocalSearchParams<{ role?: string }>();
  const initial = (ROLES.includes(params.role as PersonRole) ? params.role : 'student') as PersonRole;

  const [role, setRole] = useState<PersonRole>(initial === 'vice_principal' || initial === 'coordinator' ? (canStaff ? initial : 'teacher') : initial);
  const [rows, setRows] = useState<BulkRowData[]>(() => [blank(), blank(), blank()]);
  const [errors, setErrors] = useState<RowErrors>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [checkedSig, setCheckedSig] = useState<string | null>(null);
  const [summary, setSummary] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [switchTo, setSwitchTo] = useState<PersonRole | null>(null);
  const [creds, setCreds] = useState<NewLogin[] | null>(null);
  const [shared, setShared] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);

  const classes = useLoad(() => (role === 'student' ? api<SchoolClass[]>('/classes') : Promise.resolve([] as SchoolClass[])), [role]);
  const fields = fieldsFor(role);
  const filled = useMemo(() => rows.filter((r) => !isEmptyRow(r)), [rows]);
  const sig = useMemo(() => JSON.stringify([role, filled.map(({ key: _k, ...rest }) => rest)]), [role, filled]);
  const checkedOk = checkedSig === sig && Object.keys(errors).length === 0 && general.length === 0 && filled.length > 0;
  const errCount = Object.values(errors).reduce((n, e) => n + Object.keys(e).length, 0) + general.length;

  const roleOptions = ROLES.filter((r) => (r === 'vice_principal' || r === 'coordinator' ? canStaff : true))
    .map((r) => ({ label: ROLE_LABEL[r], value: r, icon: ROLE_ICON[r] }));

  const onChange = useCallback((key: string, field: BulkField, value: string) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setErrors((es) => {
      if (!es[key]?.[field] && !es[key]?._row) return es;
      const { [field]: _f, _row: _r, ...rest } = es[key] ?? {};
      const next = { ...es };
      if (Object.keys(rest).length) next[key] = rest;
      else delete next[key];
      return next;
    });
  }, []);
  const onRemove = useCallback((key: string) => {
    haptic.tap();
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [blank()]));
    setErrors((es) => { const n = { ...es }; delete n[key]; return n; });
  }, []);

  function addRows(n: number) {
    haptic.tap();
    setRows((rs) => {
      const room = MAX_ROWS - rs.length;
      if (room <= 0) { toast(`At most ${MAX_ROWS} rows at a time`, { error: true }); return rs; }
      return [...rs, ...Array.from({ length: Math.min(n, room) }, blank)];
    });
  }

  function changeRole(r: PersonRole) {
    if (r === role) return;
    if (filled.length) { setSwitchTo(r); return; }
    applyRole(r);
  }
  function applyRole(r: PersonRole) {
    setRole(r); setRows([blank(), blank(), blank()]); setErrors({}); setGeneral([]); setCheckedSig(null); setSummary(null); setSwitchTo(null);
  }

  function applyPaste() {
    const lines = parsePaste(pasteText);
    if (!lines.length) return toast('Nothing to add — paste some lines first', { error: true });
    const first = lines[0].map((c) => c.toLowerCase().replace(/[^a-z]/g, ''));
    const looksHeader = fields.some((f, i) => first[i] && first[i] === f.label.toLowerCase().replace(/[^a-z]/g, ''));
    const data = looksHeader ? lines.slice(1) : lines;
    const parsed: BulkRowData[] = data.map((cells) => {
      const r: BulkRowData = blank();
      fields.forEach((f, i) => { if (cells[i]) r[f.key] = cells[i]; });
      return r;
    }).filter((r) => !isEmptyRow(r));
    setRows((rs) => {
      const kept = rs.filter((r) => !isEmptyRow(r));
      const all = [...kept, ...parsed];
      if (all.length > MAX_ROWS) toast(`Only the first ${MAX_ROWS} rows were kept`, { error: true });
      return all.slice(0, MAX_ROWS).length ? all.slice(0, MAX_ROWS) : [blank()];
    });
    setPasteText(''); setPasteOpen(false); setCheckedSig(null);
    toast(`${parsed.length} row${parsed.length === 1 ? '' : 's'} added from paste`);
  }

  function payload() {
    return filled.map((r) => {
      const o: Record<string, string> = {};
      for (const f of fields) {
        const v = (r[f.key] ?? '').trim();
        if (v) o[f.key] = v;
      }
      return o;
    });
  }

  function mapErrors(res: BulkResult) {
    const map: RowErrors = {};
    const gen: string[] = [];
    for (const e of res.errors) {
      const row = e.row >= 1 ? filled[e.row - 1] : undefined;
      if (!row) { gen.push(e.message.charAt(0).toUpperCase() + e.message.slice(1)); continue; }
      const known = fields.some((f) => f.key === e.field);
      const label = fields.find((f) => f.key === e.field)?.label ?? e.field.replace(/_/g, ' ');
      const k = known ? e.field : '_row';
      const msg = known ? e.message : `${label}: ${e.message}`;
      map[row.key] = { ...map[row.key], [k]: map[row.key]?.[k] ? `${map[row.key]![k]}; ${msg}` : msg };
    }
    setErrors(map); setGeneral(gen);
  }

  async function run(save: boolean) {
    if (!filled.length) return toast('Fill in at least one row', { error: true });
    setBusy(save ? 'save' : 'check');
    try {
      const res = await api<BulkResult>('/users/bulk', { body: { role, rows: payload(), dry_run: !save } });
      mapErrors(res);
      setSummary(res);
      if (!res.ok) {
        setCheckedSig(null);
        haptic.error();
        toast(`${res.errors.length} problem${res.errors.length === 1 ? '' : 's'} found — fix the red fields`, { error: true });
        return;
      }
      if (!save) {
        setCheckedSig(sig);
        toast(`All ${filled.length} rows look good`);
        return;
      }
      haptic.success();
      setCreds(res.credentials ?? []);
      toast(`${res.count} account${res.count === 1 ? '' : 's'} created`);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------------------------------------------ credentials
  const credText = (list: NewLogin[]) =>
    ['School Hub logins (temporary passwords — change at first sign-in)', '',
      ...list.map((c) => `${c.name} (${ROLE_LABEL[c.role as PersonRole] ?? c.role}${c.class ? ` ${c.class}` : ''}) — ID: ${c.login_id} · Password: ${c.password}`)].join('\n');

  async function shareText() {
    if (!creds) return;
    try {
      await Share.share({ message: credText(creds), title: 'New logins' });
      setShared(true);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  async function downloadCsv() {
    if (!creds) return;
    const csv = ['Name,Role,Class,Login ID,Temporary password',
      ...creds.map((c) => [c.name, ROLE_LABEL[c.role as PersonRole] ?? c.role, c.class ?? '', c.login_id, c.password].map(csvCell).join(','))].join('\n');
    const name = `new-logins-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
      } else {
        const uri = `${FileSystem.cacheDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, csv);
        if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this phone');
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Save or send the logins', UTI: 'public.comma-separated-values-text' });
      }
      setShared(true);
      toast('Login list ready');
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  function done() {
    if (creds?.length && !shared) { setLeaveAsk(true); return; }
    router.back();
  }

  if (!canEdit) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background }}>
        <Hero title="Add many" compact />
        <View style={{ padding: space.lg }}>
          <EmptyState icon="lock-outline" title="View only" text="You don't have permission to add people." />
        </View>
      </View>
    );
  }

  // ------------------------------------------------------------------ success screen
  if (creds) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          <Hero title="All set!" subtitle={`${creds.length} new login${creds.length === 1 ? '' : 's'} created`} compact />
          <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
            <FadeIn>
              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: t.custom.warningContainer,
                borderRadius: radius.xl, padding: space.lg, marginBottom: space.md,
                shadowColor: t.custom.warning, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
                <Icon name="key-alert-outline" size={28} color={t.custom.onWarningContainer} />
                <Text variant="bodyMedium" style={{ flex: 1, color: t.custom.onWarningContainer, fontWeight: '600' }}>
                  These temporary passwords are shown only once. Share or download the list now — everyone sets their own password at first sign-in.
                </Text>
              </View>
            </FadeIn>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
              <Button mode="contained" icon="share-variant" onPress={shareText} style={{ flex: 1 }} contentStyle={{ paddingVertical: 4 }}>Share</Button>
              <Button mode="contained-tonal" icon="file-download-outline" onPress={downloadCsv} style={{ flex: 1 }} contentStyle={{ paddingVertical: 4 }}>
                Download list
              </Button>
            </View>
            {creds.length ? (
              <FadeIn index={1}>
                <Panel>
                  {creds.map((c, i) => (
                    <Row key={c.login_id} title={c.name} divider={i < creds.length - 1}
                      subtitle={`${ROLE_LABEL[c.role as PersonRole] ?? c.role}${c.class ? ` · ${c.class}` : ''} · ID ${c.login_id}`}
                      left={<UserAvatar name={c.name} size={40} />}
                      right={<Text selectable variant="titleSmall" style={{ fontFamily: 'monospace', fontWeight: '700', color: t.colors.primary }}>{c.password}</Text>} />
                  ))}
                </Panel>
              </FadeIn>
            ) : <EmptyState icon="account-check-outline" title="Updated" text="No new logins were needed." />}
          </View>
        </ScrollView>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: insets.bottom + space.md,
          backgroundColor: t.colors.elevation.level2, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, elevation: 8 }}>
          <Button mode="contained" icon="check" onPress={done} contentStyle={{ paddingVertical: 6 }}>Done</Button>
        </View>
        <TopLayer visible={leaveAsk} onDismiss={() => setLeaveAsk(false)}>
          <Dialog visible={leaveAsk} onDismiss={() => setLeaveAsk(false)}>
            <Dialog.Icon icon="key-alert-outline" />
            <Dialog.Title style={{ textAlign: 'center' }}>Leave without sharing?</Dialog.Title>
            <Dialog.Content><Text variant="bodyMedium">You won't see these passwords again. You can still reset any password from People later.</Text></Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setLeaveAsk(false)}>Stay</Button>
              <Button textColor={t.colors.error} onPress={() => { setLeaveAsk(false); router.back(); }}>Leave</Button>
            </Dialog.Actions>
          </Dialog>
        </TopLayer>
      </View>
    );
  }

  // ------------------------------------------------------------------ editor
  const order = fields.map((f) => f.label).join(' · ');
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 170 }} keyboardShouldPersistTaps="handled">
        <Hero title="Add many" subtitle={`Add up to ${MAX_ROWS} ${PLURAL[role]} at once`} compact />
        <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          <FilterChips options={roleOptions} value={role} onChange={changeRole} />
          <FadeIn>
            <Panel icon="clipboard-text-outline" title="Paste from Excel or WhatsApp" subtitle={`Column order: ${order}`}
              onPress={() => { haptic.tap(); setPasteOpen(true); }} />
          </FadeIn>
          {role === 'student' ? (
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
              A parent mobile creates the parent's login too (or links to an existing parent). Brothers and sisters can share one mobile.
            </Text>
          ) : null}
          {general.length ? (
            <View style={{ backgroundColor: t.custom.dangerContainer, borderRadius: radius.lg, padding: space.md, marginBottom: space.md }}>
              {general.map((g) => <Text key={g} variant="bodyMedium" style={{ color: t.custom.onDangerContainer }}>• {g}</Text>)}
            </View>
          ) : null}
          {rows.map((r, i) => (
            <AddManyRow key={r.key} index={i} row={r} role={role} classes={classes.data ?? []} errors={errors[r.key]} onChange={onChange} onRemove={onRemove} />
          ))}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button mode="outlined" icon="plus" onPress={() => addRows(1)} style={{ flex: 1 }}>Add row</Button>
            <Button mode="outlined" icon="plus-box-multiple-outline" onPress={() => addRows(5)} style={{ flex: 1 }}>5 rows</Button>
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: space.md,
        paddingBottom: insets.bottom + space.md, backgroundColor: t.colors.elevation.level2, borderTopLeftRadius: radius.xxl,
        borderTopRightRadius: radius.xxl, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' }}>
          <ToneChip text={`${filled.length} filled · ${rows.length} rows`} tone="primary" icon="table-row" />
          {errCount ? <ToneChip text={`${errCount} to fix`} tone="danger" icon="alert-circle-outline" /> : null}
          {checkedOk ? <ToneChip text="Checked" tone="success" icon="check-circle-outline" /> : null}
          {checkedOk && summary?.by_role.parent?.add && role === 'student' ? (
            <ToneChip text={`+${summary.by_role.parent.add} parent login${summary.by_role.parent.add === 1 ? '' : 's'}`} tone="neutral" />
          ) : null}
        </View>
        {checkedOk ? (
          <Button mode="contained" icon="account-multiple-plus" onPress={() => run(true)} loading={busy === 'save'} disabled={!!busy}
            contentStyle={{ paddingVertical: 6 }}>
            Save {filled.length} {filled.length === 1 ? 'person' : 'people'}
          </Button>
        ) : (
          <Button mode="contained-tonal" icon="check-all" onPress={() => run(false)} loading={busy === 'check'} disabled={!!busy || !filled.length}
            contentStyle={{ paddingVertical: 6 }}>
            Check {filled.length || ''} row{filled.length === 1 ? '' : 's'}
          </Button>
        )}
      </View>

      <Sheet visible={pasteOpen} onDismiss={() => setPasteOpen(false)} title="Paste rows">
        <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
          One person per line. Copy cells from Excel / Google Sheets, or type with commas. Columns in this order:
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
          {fields.map((f, i) => <ToneChip key={f.key} text={`${i + 1}. ${f.label}${f.required ? ' *' : ''}`} tone={f.required ? 'primary' : 'neutral'} />)}
        </View>
        <TextInput mode="outlined" multiline value={pasteText} onChangeText={setPasteText} style={{ minHeight: 160, marginBottom: space.md }}
          placeholder={role === 'student' ? 'Riya Sen, 2026101, 8-A, 12, 31/05/2013, Amit Sen, 9811122233' : role === 'parent' ? 'Amit Sen, 9811122233' : 'Sunita Verma, T006, 9876500101'}
          autoCapitalize="none" />
        <Button mode="contained" icon="table-arrow-down" onPress={applyPaste} contentStyle={{ paddingVertical: 6 }}>Add these rows</Button>
      </Sheet>

      <TopLayer visible={!!switchTo} onDismiss={() => setSwitchTo(null)}>
        <Dialog visible={!!switchTo} onDismiss={() => setSwitchTo(null)}>
          <Dialog.Icon icon="swap-horizontal" />
          <Dialog.Title style={{ textAlign: 'center' }}>Switch to {switchTo ? PLURAL[switchTo] : ''}?</Dialog.Title>
          <Dialog.Content><Text variant="bodyMedium">The {filled.length} row{filled.length === 1 ? '' : 's'} you filled will be cleared.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSwitchTo(null)}>Keep</Button>
            <Button textColor={t.colors.error} onPress={() => switchTo && applyRole(switchTo)}>Switch</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </View>
  );
}
