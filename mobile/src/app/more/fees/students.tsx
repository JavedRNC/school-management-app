import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { IconButton, Searchbar, Text } from 'react-native-paper';

import { useFeeGate } from '@/components/fees/staff/common';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, PressScale, Screen, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, inr, inrShort, statusColor } from '@/lib/fees';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { FeeStudentRow, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Status = 'all' | 'overdue' | 'due' | 'clear';
const STATUS_LABEL: Record<FeeStudentRow['status'], string> = { clear: 'Clear', due: 'Due', overdue: 'Overdue' };

export default function FeeStudents() {
  const gate = useFeeGate('Students & dues');
  if (gate.block) return gate.block;
  return <List />;
}

function List() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const params = useLocalSearchParams<{ status?: string; class_id?: string }>();
  const [status, setStatus] = useState<Status>((['all', 'overdue', 'due', 'clear'].includes(params.status ?? '') ? params.status : 'all') as Status);
  const [classId, setClassId] = useState<number>(Number(params.class_id) || 0);
  const [q, setQ] = useState('');

  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const rows = useLoad(() => api<FeeStudentRow[]>('/fees/students', { params: { status, class_id: classId || undefined } }), [status, classId]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const r = rows.data ?? [];
    return ql ? r.filter((x) => x.name.toLowerCase().includes(ql) || x.admission_no.toLowerCase().includes(ql)) : r;
  }, [rows.data, q]);
  const totalDue = list.reduce((s, r) => s + r.outstanding, 0);
  const totalOver = list.reduce((s, r) => s + r.overdue, 0);

  function call(r: FeeStudentRow) {
    if (!r.parent_phone) return toast('No parent phone number on record', { error: true });
    haptic.tap();
    Linking.openURL(`tel:${r.parent_phone}`).catch(() => toast("Couldn't open the dialer", { error: true }));
  }
  function remind(r: FeeStudentRow) {
    if (!r.parent_phone) return toast('No parent phone number on record', { error: true });
    haptic.tap();
    const digits = r.parent_phone.replace(/\D/g, '').slice(-10);
    const amt = r.overdue > 0 ? r.overdue : r.outstanding;
    const msg = `Dear ${r.parent_name || 'Parent'}, this is a gentle reminder from ${school?.name ?? 'the school'} that fees of ${inr(amt)} `
      + `for ${r.name}${r.class_name ? ` (${r.class_name})` : ''} ${r.overdue > 0 ? `are overdue${r.oldest_due ? ` since ${fmtDate(r.oldest_due)}` : ''}` : 'are due'}. `
      + 'You can pay at the school office or by UPI in the School Hub app. Please ignore if already paid. Thank you.';
    Linking.openURL(`https://wa.me/91${digits}?text=${encodeURIComponent(msg)}`).catch(() => toast("Couldn't open WhatsApp", { error: true }));
  }

  return (
    <Screen onRefresh={rows.refresh} refreshing={rows.refreshing}
      header={
        <Hero title="Students & dues" subtitle={rows.data ? `${list.length} students · ${inrShort(totalDue)} due${totalOver ? ` · ${inrShort(totalOver)} overdue` : ''}` : 'Fee status of every student'} compact>
          <Searchbar placeholder="Search name or admission no." value={q} onChangeText={setQ} style={{ borderRadius: 20, elevation: 3 }} />
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      <FilterChips value={status} onChange={setStatus} options={[
        { label: 'All', value: 'all', icon: 'account-group-outline' },
        { label: 'Overdue', value: 'overdue', icon: 'alert-circle-outline' },
        { label: 'Due', value: 'due', icon: 'clock-outline' },
        { label: 'Clear', value: 'clear', icon: 'check-circle-outline' },
      ]} />
      {classes.data?.length ? (
        <FilterChips value={classId} onChange={setClassId}
          options={[{ label: 'All classes', value: 0 }, ...classes.data.map((c) => ({ label: c.name, value: c.id }))]} />
      ) : null}
      {rows.error ? <ErrorState message={rows.error} onRetry={rows.reload} /> : null}
      {!rows.data ? (rows.error ? null : <LoadingCards count={4} />) : list.length === 0 ? (
        <EmptyState icon={status === 'overdue' ? 'party-popper' : 'account-search-outline'}
          title={status === 'overdue' ? 'No overdue fees 🎉' : 'No students found'}
          text={status === 'overdue' ? 'Everyone in this view is up to date.' : 'Try another filter or search.'} />
      ) : list.map((r, i) => (
        <FadeIn key={r.id} index={Math.min(i, 8)}>
          <PressScale onPress={() => router.push(`/more/fees/student/${r.id}` as never)}>
            <Panel style={{ marginBottom: space.sm }}>
              <View style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, backgroundColor: statusColor(t, r.status), borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <UserAvatar name={r.name} size={42} />
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }} numberOfLines={1}>{r.name}</Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }} numberOfLines={1}>
                    {r.class_name || 'No class'}{r.roll_no ? ` · Roll ${r.roll_no}` : ''} · {r.admission_no}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '700', color: r.outstanding ? t.colors.onSurface : t.custom.success }}>
                    {r.outstanding ? inr(r.outstanding) : 'Paid up'}
                  </Text>
                  <ToneChip text={STATUS_LABEL[r.status]} tone={r.status === 'overdue' ? 'danger' : r.status === 'due' ? 'warning' : 'success'} />
                </View>
              </View>
              {r.overdue > 0 || r.parent_phone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.sm, paddingTop: space.xs, borderTopWidth: 0.5, borderTopColor: t.colors.outlineVariant }}>
                  <Text variant="labelMedium" style={{ flex: 1, color: r.overdue ? t.custom.danger : t.colors.onSurfaceVariant }} numberOfLines={2}>
                    {r.overdue > 0 ? `${inr(r.overdue)} overdue · ${r.overdue_items} item${r.overdue_items === 1 ? '' : 's'} · since ${fmtDate(r.oldest_due)}` : r.parent_name}
                  </Text>
                  {r.parent_phone ? (
                    <>
                      <IconButton icon="phone-outline" size={20} mode="contained-tonal" onPress={() => call(r)} accessibilityLabel="Call parent" />
                      {r.outstanding > 0 ? (
                        <IconButton icon="whatsapp" size={20} mode="contained-tonal" iconColor="#1FAF38" onPress={() => remind(r)} accessibilityLabel="WhatsApp reminder" />
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}
            </Panel>
          </PressScale>
        </FadeIn>
      ))}
    </Screen>
  );
}
