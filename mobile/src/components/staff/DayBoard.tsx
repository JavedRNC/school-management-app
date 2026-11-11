import { useState } from 'react';
import { View } from 'react-native';
import { Button, SegmentedButtons, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { EmptyState, ErrorState, FadeIn, FilterChips, LoadingCards, Panel, Row, Sheet, StatTile, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABEL, useAuth, useCan } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { StaffDayBoard } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { fmtTime, isoDay, STATUS_LABEL, STATUS_TONE } from './util';

type Row_ = StaffDayBoard['rows'][number];

function lastDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return { value: isoDay(d), label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }) };
  });
}

/** Managers: who checked in on a day; mark present/absent by hand (logged). */
export function DayBoard() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canEdit = useCan('staff_attendance', 'edit') && school?.can_write !== false;
  const days = lastDays(7);
  const [day, setDay] = useState(days[0].value);
  const [filter, setFilter] = useState<'all' | Row_['status']>('all');
  const [sel, setSel] = useState<Row_ | null>(null);
  const { data, error, reload, loading } = useLoad(() => api<StaffDayBoard>('/staff-attendance/day', { params: { day } }), [day]);

  const rows = (data?.rows ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <View>
      <FilterChips options={days} value={day} onChange={setDay} />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data || (loading && data.date !== day) ? <LoadingCards count={3} /> : (
        <FadeIn>
          {!data.is_school_day ? (
            <Panel tone="primary" icon="beach" title="Not a school day" subtitle={data.reason || 'Weekly off'} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            <StatTile icon="check-circle-outline" label="Present" value={data.summary.present} tone="success" onPress={() => setFilter('present')} />
            <StatTile icon="clock-alert-outline" label="Late" value={data.summary.late} tone="warning" onPress={() => setFilter('late')} />
            <StatTile icon="airplane-takeoff" label="Leave" value={data.summary.leave} tone="primary" onPress={() => setFilter('leave')} />
            <StatTile icon="close-circle-outline" label="Absent" value={data.summary.absent} tone="danger" onPress={() => setFilter('absent')} />
          </View>
          <FilterChips value={filter} onChange={setFilter}
            options={[{ label: 'All staff', value: 'all' as const }, ...(['present', 'late', 'leave', 'absent'] as const).map((s) => ({ label: STATUS_LABEL[s], value: s }))]} />
          <Panel>
            {rows.length ? rows.map((r, i) => (
              <Row key={r.user_id} title={r.name} divider={i < rows.length - 1}
                subtitle={r.check_in_at
                  ? `${fmtTime(r.check_in_at)}${r.check_out_at ? ` – ${fmtTime(r.check_out_at)}` : ' · not checked out'}${r.in_distance_m != null ? ` · ${Math.round(r.in_distance_m)} m` : ''}${r.manual ? ' · marked by office' : ''}`
                  : `${ROLE_LABEL[r.role]} · ${r.login_id}`}
                left={<UserAvatar name={r.name} size={40} />}
                right={<ToneChip text={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />}
                onPress={canEdit && r.status !== 'leave' ? () => setSel(r) : undefined} />
            )) : <EmptyState icon="account-search-outline" title="No staff in this list" />}
          </Panel>
        </FadeIn>
      )}
      <ManualSheet row={sel} day={day} onDismiss={() => setSel(null)} onSaved={(msg) => { setSel(null); toast(msg); reload(); }} />
      {!canEdit ? null : (
        <Text variant="labelSmall" style={{ color: t.colors.outline, textAlign: 'center' }}>Tap a person to correct their attendance (logged).</Text>
      )}
    </View>
  );
}

function ManualSheet({ row, day, onDismiss, onSaved }: { row: Row_ | null; day: string; onDismiss: () => void; onSaved: (msg: string) => void }) {
  const toast = useToast();
  const [present, setPresent] = useState<'yes' | 'no'>('yes');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!row) return;
    setBusy(true);
    try {
      await api('/staff-attendance/manual', { body: { user_id: row.user_id, date: day, present: present === 'yes', note: note.trim() } });
      onSaved(`${row.name} marked ${present === 'yes' ? 'present' : 'absent'}`);
      setNote('');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={!!row} onDismiss={onDismiss} title={row ? `Correct · ${row.name}` : ''}>
      <SegmentedButtons value={present} onValueChange={(v) => setPresent(v as 'yes' | 'no')} style={{ marginBottom: space.md }}
        buttons={[{ value: 'yes', label: 'Mark present', icon: 'check' }, { value: 'no', label: 'Mark absent', icon: 'close' }]} />
      <TextInput mode="outlined" label="Note (e.g. phone problem)" value={note} onChangeText={setNote} style={{ marginBottom: space.md }} />
      <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy} contentStyle={{ paddingVertical: 6 }}>Save</Button>
    </Sheet>
  );
}
