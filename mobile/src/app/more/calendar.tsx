import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AnimatedFAB, Button, Dialog, HelperText, IconButton, Portal, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';

import { ErrorState, FadeIn, FilterChips, Hero, Icon, IconName, LoadingCards, Panel, Screen, SectionTitle, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { AppTheme, DAYS, isoDate, radius, space, useAppTheme, weekdayIdx } from '@/lib/theme';
import type { Holiday } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Kind = Holiday['kind'];
const KINDS: { value: Kind; label: string; icon: IconName }[] = [
  { value: 'national', label: 'National', icon: 'flag-outline' },
  { value: 'festival', label: 'Festival', icon: 'party-popper' },
  { value: 'vacation', label: 'Vacation', icon: 'beach' },
  { value: 'exam', label: 'Exam', icon: 'file-document-edit-outline' },
  { value: 'event', label: 'Event', icon: 'calendar-star' },
  { value: 'other', label: 'Other', icon: 'calendar-blank-outline' },
];

function kindColor(t: AppTheme, k: Kind): string {
  switch (k) {
    case 'national': return t.colors.primary;
    case 'festival': return t.custom.amber;
    case 'vacation': return t.colors.tertiary;
    case 'exam': return t.custom.danger;
    case 'event': return t.custom.success;
    default: return t.colors.outline;
  }
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', opts);

function rangeText(h: Holiday) {
  return h.start_date === h.end_date ? fmt(h.start_date, { weekday: 'short', day: 'numeric', month: 'short' })
    : `${fmt(h.start_date)} – ${fmt(h.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function CalendarScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canEdit = useCan('calendar', 'edit') && school?.can_write !== false;
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<Holiday[]>('/holidays'));
  const today = isoDate(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState<string>(today);
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [natOpen, setNatOpen] = useState(false);
  const working = school?.working_days?.length ? school.working_days : [0, 1, 2, 3, 4, 5];

  const byDay = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of data ?? []) {
      const d = new Date(h.start_date + 'T00:00:00');
      const end = new Date(h.end_date + 'T00:00:00');
      for (let i = 0; d <= end && i < 200; i++) {
        const k = isoDate(d);
        m.set(k, [...(m.get(k) ?? []), h]);
        d.setDate(d.getDate() + 1);
      }
    }
    return m;
  }, [data]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const lead = weekdayIdx(first); // Monday-first grid
    const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= daysIn; d++) out.push(isoDate(new Date(month.getFullYear(), month.getMonth(), d)));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const upcoming = (data ?? []).filter((h) => h.end_date >= today).slice(0, 12);
  const dayItems = byDay.get(selected) ?? [];
  const selWeekday = weekdayIdx(new Date(selected + 'T00:00:00'));
  const shift = (n: number) => { haptic.tap(); setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); };

  async function addNational(year: number) {
    setNatOpen(false);
    try {
      const added = await api<Holiday[]>('/holidays/national', { method: 'POST', params: { year } });
      toast(added.length ? `Added ${added.length} national holiday${added.length === 1 ? '' : 's'} for ${year}` : `National holidays for ${year} are already on the calendar`);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={refresh} refreshing={refreshing} footerSpace={canEdit ? 140 : 96}
        header={<Hero title="School calendar" subtitle={school?.name ?? 'Holidays, vacations & events'} compact />}>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!data ? <LoadingCards /> : (
          <>
            <FadeIn>
              <Panel>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
                  <IconButton icon="chevron-left" onPress={() => shift(-1)} />
                  <Text variant="titleMedium" style={{ flex: 1, textAlign: 'center', fontWeight: '800', color: t.colors.onSurface }}>
                    {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                  </Text>
                  <IconButton icon="chevron-right" onPress={() => shift(1)} />
                </View>
                <View style={{ flexDirection: 'row' }}>
                  {DAYS.map((d, i) => (
                    <Text key={d} variant="labelSmall" style={{ flex: 1, textAlign: 'center', fontWeight: '700',
                      color: working.includes(i) ? t.colors.onSurfaceVariant : t.colors.outline }}>{d[0]}{d[1]}</Text>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                  {cells.map((iso, i) => {
                    if (!iso) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                    const items = byDay.get(iso) ?? [];
                    const off = items.some((h) => h.is_off);
                    const weeklyOff = !working.includes(weekdayIdx(new Date(iso + 'T00:00:00')));
                    const isSel = iso === selected;
                    const isToday = iso === today;
                    return (
                      <Pressable key={iso} onPress={() => { haptic.tap(); setSelected(iso); }} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                        <View style={{ flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isSel ? t.colors.primary : off ? t.colors.secondaryContainer : weeklyOff ? t.colors.surfaceVariant : 'transparent',
                          borderWidth: isToday && !isSel ? 2 : 0, borderColor: t.colors.primary }}>
                          <Text variant="labelLarge" style={{ fontWeight: isToday || off ? '800' : '500',
                            color: isSel ? t.colors.onPrimary : weeklyOff && !off ? t.colors.outline : t.colors.onSurface }}>
                            {Number(iso.slice(8))}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 2, height: 5, marginTop: 1 }}>
                            {[...new Set(items.map((h) => h.kind))].slice(0, 3).map((k) => (
                              <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: isSel ? t.colors.onPrimary : kindColor(t, k) }} />
                            ))}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md }}>
                  {KINDS.map((k) => (
                    <View key={k.value} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: kindColor(t, k.value) }} />
                      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{k.label}</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: t.colors.surfaceVariant }} />
                    <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>Weekly off</Text>
                  </View>
                </View>
              </Panel>
            </FadeIn>

            <SectionTitle title={fmt(selected, { weekday: 'long', day: 'numeric', month: 'long' })} />
            {dayItems.length ? dayItems.map((h) => <EntryCard key={h.id} h={h} onPress={canEdit ? () => setEditing(h) : undefined} />) : (
              <Panel>
                <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>
                  {working.includes(selWeekday) ? 'Regular school day.' : `${DAYS[selWeekday]} is a weekly off.`}
                </Text>
                {canEdit ? <Button compact icon="plus" style={{ alignSelf: 'flex-start', marginTop: space.sm }} onPress={() => setEditing('new')}>Add on this day</Button> : null}
              </Panel>
            )}

            <SectionTitle title="Coming up" action={canEdit ? 'National holidays' : undefined} onAction={() => setNatOpen(true)} />
            {upcoming.length ? upcoming.map((h) => <EntryCard key={`u${h.id}`} h={h} onPress={canEdit ? () => setEditing(h) : undefined} />) : (
              <Panel><Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Nothing planned yet.</Text></Panel>
            )}
          </>
        )}
      </Screen>
      {canEdit ? (
        <AnimatedFAB icon="calendar-plus" label="Add" extended onPress={() => { haptic.tap(); setEditing('new'); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}
      <Editor entry={editing} defaultDate={selected} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      <Portal>
        <Dialog visible={natOpen} onDismiss={() => setNatOpen(false)}>
          <Dialog.Icon icon="flag-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Add national holidays</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Adds Republic Day (26 Jan), Independence Day (15 Aug) and Gandhi Jayanti (2 Oct). Festivals change every year — add them yourself.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => addNational(new Date().getFullYear())}>{new Date().getFullYear()}</Button>
            <Button onPress={() => addNational(new Date().getFullYear() + 1)}>{new Date().getFullYear() + 1}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function EntryCard({ h, onPress }: { h: Holiday; onPress?: () => void }) {
  const t = useAppTheme();
  const k = KINDS.find((x) => x.value === h.kind) ?? KINDS[5];
  return (
    <FadeIn>
      <Panel onPress={onPress} style={{ paddingVertical: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: kindColor(t, h.kind) + '22' }}>
            <Icon name={k.icon} size={22} color={kindColor(t, h.kind)} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ fontWeight: '800', color: t.colors.onSurface }}>{h.name}</Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
              {rangeText(h)} · {k.label}{h.is_off ? ' · School closed' : ' · School open'}
            </Text>
            {h.note ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }} numberOfLines={2}>{h.note}</Text> : null}
          </View>
          {onPress ? <Icon name="pencil-outline" size={18} color={t.colors.outline} /> : null}
        </View>
      </Panel>
    </FadeIn>
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function Editor({ entry, defaultDate, onClose, onSaved }: { entry: Holiday | 'new' | null; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const existing = entry && entry !== 'new' ? entry : null;
  const [key, setKey] = useState<string>('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('festival');
  const [mode, setMode] = useState<'day' | 'range'>('day');
  const [start, setStart] = useState(defaultDate);
  const [end, setEnd] = useState(defaultDate);
  const [isOff, setIsOff] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // reset form whenever a different entry is opened
  const k = entry === null ? '' : existing ? `e${existing.id}` : `n${defaultDate}`;
  if (k !== key) {
    setKey(k);
    if (existing) {
      setName(existing.name); setKind(existing.kind === 'holiday' ? 'other' : existing.kind); setStart(existing.start_date); setEnd(existing.end_date);
      setMode(existing.start_date === existing.end_date ? 'day' : 'range'); setIsOff(existing.is_off); setNote(existing.note);
    } else if (entry === 'new') {
      setName(''); setKind('festival'); setStart(defaultDate); setEnd(defaultDate); setMode('day'); setIsOff(true); setNote('');
    }
  }

  const endVal = mode === 'day' ? start : end;
  const datesOk = DATE_RE.test(start) && DATE_RE.test(endVal) && endVal >= start;
  const valid = name.trim() && datesOk;
  const quick = [0, 1, 7].map((n) => { const d = new Date(); d.setDate(d.getDate() + n); return { label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'Next week', value: isoDate(d) }; });

  async function save() {
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      const body = { name: name.trim(), kind, start_date: start, end_date: endVal, is_off: kind === 'event' ? false : isOff, note: note.trim() };
      await api(existing ? `/holidays/${existing.id}` : '/holidays', { method: existing ? 'PUT' : 'POST', body });
      toast(existing ? 'Calendar updated' : `${name.trim()} added to the calendar`);
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!existing) return;
    setConfirm(false);
    try {
      await api(`/holidays/${existing.id}`, { method: 'DELETE' });
      toast(`${existing.name} archived`);
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <>
      <Sheet visible={!!entry} onDismiss={onClose} title={existing ? 'Edit calendar entry' : 'Add to calendar'}>
        <TextInput mode="outlined" label="Name" value={name} onChangeText={setName} placeholder="e.g. Diwali, Summer vacation" style={{ marginBottom: space.md }} />
        <FilterChips label="Type" options={KINDS} value={kind} onChange={(v) => { setKind(v); if (v === 'event') setIsOff(false); else if (kind === 'event') setIsOff(true); }} />
        <SegmentedButtons value={mode} onValueChange={(v) => setMode(v as 'day' | 'range')} density="small" style={{ marginBottom: space.md }}
          buttons={[{ value: 'day', label: 'Single day', icon: 'calendar-today' }, { value: 'range', label: 'Date range', icon: 'calendar-range' }]} />
        <FilterChips options={quick} value={start} onChange={(v) => { setStart(v); if (end < v) setEnd(v); }} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <TextInput mode="outlined" label={mode === 'day' ? 'Date (YYYY-MM-DD)' : 'From (YYYY-MM-DD)'} value={start} onChangeText={setStart}
            style={{ flex: 1 }} error={!DATE_RE.test(start)} />
          {mode === 'range' ? (
            <TextInput mode="outlined" label="To (YYYY-MM-DD)" value={end} onChangeText={setEnd} style={{ flex: 1 }} error={!DATE_RE.test(end) || end < start} />
          ) : null}
        </View>
        <HelperText type="error" visible={!datesOk}>Use YYYY-MM-DD; the end can't be before the start.</HelperText>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>School closed</Text>
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
              {kind === 'event' ? 'Events keep school open' : 'No attendance needed on these days'}
            </Text>
          </View>
          <Switch value={kind === 'event' ? false : isOff} disabled={kind === 'event'} onValueChange={setIsOff} />
        </View>
        <TextInput mode="outlined" label="Note (optional)" value={note} onChangeText={setNote} multiline style={{ marginBottom: space.md }} />
        <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} disabled={!valid} contentStyle={{ paddingVertical: 6 }}>
          {existing ? 'Save changes' : 'Add to calendar'}
        </Button>
        {existing ? (
          <Button mode="outlined" icon="archive-arrow-down-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error, marginTop: space.sm }}
            onPress={() => setConfirm(true)}>Archive entry</Button>
        ) : null}
      </Sheet>
      <Portal>
        <Dialog visible={confirm} onDismiss={() => setConfirm(false)}>
          <Dialog.Icon icon="archive-arrow-down-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Archive {existing?.name}?</Dialog.Title>
          <Dialog.Content><Text variant="bodyMedium">It disappears from the calendar. Restore it any time from Me → Archive.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(false)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={archive}>Archive</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
