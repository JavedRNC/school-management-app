import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, IconButton, SegmentedButtons, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { bellSummary, fromMin, setBellCache, toMin, useBell } from '@/components/BellTimes';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, LoadingCards, Panel, Screen, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { DAY_NAMES, DAYS, radius, space, useAppTheme } from '@/lib/theme';
import type { BellSchedule, BellSlot } from '@/lib/types';

type Row = { key: string; kind: 'period' | 'break'; label: string; start: string; end: string };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
let seq = 0;
const k = () => `r${++seq}`;

function toRows(slots: BellSlot[]): Row[] {
  return slots.map((s) => ({ key: k(), kind: s.kind, label: s.kind === 'break' ? s.label : (/^Period \d+$/.test(s.label) ? '' : s.label), start: s.start, end: s.end }));
}

function typicalDay(): Row[] {
  const rows: Row[] = [];
  let m = 8 * 60;
  for (let p = 1; p <= 8; p++) {
    rows.push({ key: k(), kind: 'period', label: '', start: fromMin(m), end: fromMin(m + 40) });
    m += 40;
    if (p === 2) { rows.push({ key: k(), kind: 'break', label: 'Short break', start: fromMin(m), end: fromMin(m + 15) }); m += 15; }
    if (p === 4) { rows.push({ key: k(), kind: 'break', label: 'Lunch', start: fromMin(m), end: fromMin(m + 30) }); m += 30; }
  }
  return rows;
}

/** Problems in the rows (same rules as the server) — null when fine. */
function problem(rows: Row[]): string | null {
  if (!rows.some((r) => r.kind === 'period')) return 'Add at least one period';
  if (rows.filter((r) => r.kind === 'period').length > 12) return 'At most 12 periods a day';
  let prev: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!HHMM.test(r.start) || !HHMM.test(r.end)) return `Row ${i + 1}: use 24-hour times like 08:00`;
    if (r.end <= r.start) return `Row ${i + 1}: ends before it starts`;
    if (prev && r.start < prev) return `Row ${i + 1}: starts before the previous one ends (${prev})`;
    prev = r.end;
  }
  return null;
}

function fixTime(v: string): string {
  const d = v.replace(/[^\d]/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, d.length - 2).padStart(2, '0')}:${d.slice(-2)}`;
}

export default function PeriodsScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canEdit = useCan('classes', 'edit') && school?.can_write !== false;
  const { bell, error, refresh } = useBell();
  const [day, setDay] = useState<number>(-1);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [extraDays, setExtraDays] = useState<number[]>([]);
  const working = school?.working_days?.length ? [...school.working_days].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5];

  useEffect(() => { refresh(); }, [refresh]);
  // load the editor rows whenever the selected day or the schedule changes (unless the user is mid-edit)
  useEffect(() => {
    if (!bell || dirty) return;
    const src = day < 0 ? bell.default : bell.overrides[String(day)] ?? null;
    setRows(src?.length ? toRows(src) : day >= 0 ? toRows(bell.default) : []);
  }, [bell, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const overrideDays = useMemo(() => {
    const own = bell ? Object.keys(bell.overrides).map(Number) : [];
    return [...new Set([...own, ...extraDays])].sort((a, b) => a - b);
  }, [bell, extraDays]);
  const isOverride = day >= 0 && !!bell?.overrides[String(day)];
  const err = rows ? problem(rows) : null;
  const periodsN = rows?.filter((r) => r.kind === 'period').length ?? 0;

  function edit(next: Row[]) { setRows(next); setDirty(true); }
  function change(i: number, patch: Partial<Row>) {
    if (!rows) return;
    edit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function add(kind: 'period' | 'break') {
    haptic.tap();
    const list = rows ?? [];
    const last = list[list.length - 1];
    const start = last && HHMM.test(last.end) ? last.end : '08:00';
    const end = fromMin(toMin(start) + (kind === 'period' ? 40 : 15));
    edit([...list, { key: k(), kind, label: kind === 'break' ? 'Break' : '', start, end }]);
  }
  function nudge(i: number, field: 'start' | 'end', by: number) {
    if (!rows || !HHMM.test(rows[i][field])) return;
    haptic.tap();
    change(i, { [field]: fromMin(toMin(rows[i][field]) + by) });
  }
  function pickDay(d: number) {
    if (dirty) { toast('Save or undo your changes first', { error: true }); return; }
    haptic.tap();
    setDay(d);
  }

  async function save() {
    if (!rows || err) { haptic.error(); if (err) toast(err, { error: true }); return; }
    setBusy(true);
    try {
      const b = await api<BellSchedule>('/school/bell', { method: 'PUT', body: { day, slots: rows.map(({ kind, label, start, end }) => ({ kind, label, start, end })) } });
      setBellCache(b);
      setDirty(false);
      haptic.success();
      toast(`${day < 0 ? 'Timings saved for all days' : `${DAY_NAMES[day]} timings saved`} · ${bellSummary(rows)}`);
    } catch (e) {
      haptic.error();
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function resetDay() {
    setConfirmReset(false);
    if (day < 0) return;
    if (!isOverride) {           // never saved — just drop the local tab
      setExtraDays((x) => x.filter((d) => d !== day));
      setDirty(false);
      setDay(-1);
      return;
    }
    setBusy(true);
    try {
      const b = await api<BellSchedule>(`/school/bell/${day}`, { method: 'DELETE' });
      setBellCache(b);
      setExtraDays((x) => x.filter((d) => d !== day));
      setDirty(false);
      toast(`${DAY_NAMES[day]} now uses the normal timings`);
      setDay(-1);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  function undo() {
    setDirty(false);
    if (!bell) return;
    const src = day < 0 ? bell.default : bell.overrides[String(day)] ?? bell.default;
    setRows(toRows(src ?? []));
  }

  const header = (
    <Hero title="Period timings" subtitle={bell?.configured ? bellSummary(bell.default) : 'Bell schedule for the timetable'} compact />
  );
  if (error && !bell) return <Screen header={header}><ErrorState message={error} onRetry={refresh} /></Screen>;
  if (!bell || rows === null) return <Screen header={header}><LoadingCards /></Screen>;

  const dayOptions = [{ label: 'All days', value: -1 }, ...overrideDays.map((d) => ({ label: DAYS[d], value: d }))];
  const canAddDay = canEdit && bell.configured && working.some((d) => !overrideDays.includes(d));

  return (
    <Screen header={header}>
      <View style={{ height: space.lg }} />
      {!bell.configured && day < 0 && !rows.length ? (
        <FadeIn>
          <Panel>
            <EmptyState icon="bell-ring-outline" title="No period timings yet"
              text={canEdit ? 'Set when each period starts and ends. The timetable, teachers and students will see the times.' : 'The school hasn\'t set period timings yet.'}
              action={canEdit ? 'Start with a typical day' : undefined}
              onAction={canEdit ? () => { haptic.tap(); edit(typicalDay()); } : undefined} />
          </Panel>
        </FadeIn>
      ) : (
        <>
          <FadeIn>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1 }}><FilterChips options={dayOptions} value={day} onChange={pickDay} /></View>
              {canAddDay ? <Button compact icon="plus" onPress={() => { if (dirty) return toast('Save or undo your changes first', { error: true }); setAdding(true); }}>Different day</Button> : null}
            </View>
          </FadeIn>
          <FadeIn index={1}>
            <Panel icon={day < 0 ? 'calendar-week' : 'calendar-star'} title={day < 0 ? 'Normal timings' : `${DAY_NAMES[day]} only`}
              subtitle={`${periodsN} period${periodsN === 1 ? '' : 's'}${rows.length ? ` · ${rows[0].start}–${rows[rows.length - 1].end}` : ''}${day >= 0 && !isOverride ? ' · not saved yet' : ''}`}
              tone={err && dirty ? 'danger' : dirty ? 'warning' : undefined}>
              {day < 0 && overrideDays.length ? (
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>
                  Used every working day except {overrideDays.map((d) => DAYS[d]).join(', ')}.
                </Text>
              ) : null}
              {rows.map((r, i) => {
                const n = rows.slice(0, i + 1).filter((x) => x.kind === 'period').length;
                const brk = r.kind === 'break';
                return (
                  <View key={r.key} style={{ borderRadius: radius.lg, padding: space.sm, marginBottom: space.sm,
                    backgroundColor: brk ? t.colors.tertiaryContainer : t.custom.inset }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: brk ? t.colors.tertiary : t.colors.primary }}>
                        {brk ? <Icon name={/lunch/i.test(r.label) ? 'food-outline' : 'coffee-outline'} size={18} color={t.colors.onTertiary} />
                          : <Text variant="labelLarge" style={{ color: t.colors.onPrimary, fontWeight: '700' }}>{n}</Text>}
                      </View>
                      <TextInput dense mode="outlined" editable={canEdit} value={r.label} onChangeText={(v) => change(i, { label: v.slice(0, 30) })}
                        placeholder={brk ? 'Break' : `Period ${n}`} style={{ flex: 1, backgroundColor: 'transparent' }} />
                      {canEdit ? <IconButton icon="delete-outline" size={20} onPress={() => { haptic.tap(); edit(rows.filter((_, j) => j !== i)); }} /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.xs }}>
                      {(['start', 'end'] as const).map((f) => (
                        <View key={f} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                          {canEdit ? <IconButton icon="minus" size={16} style={{ margin: 0 }} onPress={() => nudge(i, f, -5)} /> : null}
                          <TextInput dense mode="outlined" editable={canEdit} label={f === 'start' ? 'Starts' : 'Ends'} value={r[f]} keyboardType="number-pad"
                            error={!HHMM.test(r[f]) || (f === 'end' && HHMM.test(r.start) && r.end <= r.start)}
                            onChangeText={(v) => change(i, { [f]: fixTime(v) })} style={{ flex: 1, backgroundColor: 'transparent', textAlign: 'center' }} />
                          {canEdit ? <IconButton icon="plus" size={16} style={{ margin: 0 }} onPress={() => nudge(i, f, 5)} /> : null}
                        </View>
                      ))}
                    </View>
                    {canEdit ? (
                      <SegmentedButtons density="small" value={r.kind} onValueChange={(v) => change(i, { kind: v as Row['kind'], label: v === 'break' && !r.label ? 'Break' : r.label })}
                        style={{ marginTop: space.xs }}
                        buttons={[{ value: 'period', label: 'Period', icon: 'book-open-variant' }, { value: 'break', label: 'Break', icon: 'coffee-outline' }]} />
                    ) : null}
                  </View>
                );
              })}
              {canEdit ? (
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
                  <Button mode="contained-tonal" icon="plus" style={{ flex: 1 }} onPress={() => add('period')}>Period</Button>
                  <Button mode="outlined" icon="coffee-outline" style={{ flex: 1 }} onPress={() => add('break')}>Break</Button>
                </View>
              ) : null}
              {err && dirty ? <Text variant="bodySmall" style={{ color: t.colors.error, marginTop: space.sm }}>{err}</Text> : null}
            </Panel>
          </FadeIn>
          {canEdit ? (
            <FadeIn index={2}>
              <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={busy || (!dirty && (day < 0 || isOverride)) || !!err}
                contentStyle={{ paddingVertical: 6 }}>
                {day < 0 ? 'Save timings' : `Save ${DAY_NAMES[day]} timings`}
              </Button>
              {dirty ? <Button icon="undo" onPress={undo} style={{ marginTop: space.xs }}>Undo changes</Button> : null}
              {day >= 0 ? (
                <Button icon="calendar-sync-outline" textColor={t.colors.error} onPress={() => setConfirmReset(true)} style={{ marginTop: space.xs }}>
                  Use normal timings on {DAY_NAMES[day]}
                </Button>
              ) : null}
            </FadeIn>
          ) : null}
          <Text variant="labelSmall" style={{ color: t.colors.outline, textAlign: 'center', marginTop: space.md }}>
            Fewer periods than the timetable uses? Clear those periods in the timetable first — nothing is removed silently.
          </Text>
        </>
      )}

      <TopLayer visible={adding} onDismiss={() => setAdding(false)}>
        <Dialog visible={adding} onDismiss={() => setAdding(false)}>
          <Dialog.Icon icon="calendar-star" />
          <Dialog.Title style={{ textAlign: 'center' }}>Different timings on…</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: space.md }}>E.g. a Saturday half day. It starts as a copy of the normal timings.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {working.filter((d) => !overrideDays.includes(d)).map((d) => (
                <Button key={d} mode="contained-tonal" onPress={() => {
                  haptic.tap();
                  setAdding(false);
                  setExtraDays((x) => [...x, d]);
                  setDay(d);
                  setRows(toRows(bell.default));
                  setDirty(true);
                }}>{DAY_NAMES[d]}</Button>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setAdding(false)}>Cancel</Button></Dialog.Actions>
        </Dialog>
      </TopLayer>
      <TopLayer visible={confirmReset} onDismiss={() => setConfirmReset(false)}>
        <Dialog visible={confirmReset} onDismiss={() => setConfirmReset(false)}>
          <Dialog.Icon icon="calendar-sync-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Use normal timings on {day >= 0 ? DAY_NAMES[day] : ''}?</Dialog.Title>
          <Dialog.Content><Text variant="bodyMedium">{day >= 0 ? DAY_NAMES[day] : 'This day'} will follow the same periods as the other days.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmReset(false)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={resetDay}>Use normal</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </Screen>
  );
}
