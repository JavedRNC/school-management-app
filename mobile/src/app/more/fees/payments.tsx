import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, IconButton, Switch, Text, TextInput } from 'react-native-paper';

import { ISO_RE, iso, isoToday, ModeSplit, PaymentRow, useFeeGate } from '@/components/fees/staff/common';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Screen, SectionTitle, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, inr, MODE_ICON, MODE_LABEL } from '@/lib/fees';
import { useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { FeePayment, PaymentReport, PayMode } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Range = 'today' | 'week' | 'month' | 'last' | 'custom';

function rangeDates(r: Range, from: string, to: string): [string, string] {
  const d = new Date();
  if (r === 'today') return [isoToday(), isoToday()];
  if (r === 'week') {
    const s = new Date(d);
    s.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return [iso(s), isoToday()];
  }
  if (r === 'month') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), isoToday()];
  if (r === 'last') return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
  return [from, to];
}

export default function Collections() {
  const gate = useFeeGate('Collections');
  if (gate.block) return gate.block;
  return <Report canEdit={gate.canEdit} />;
}

function Report({ canEdit }: { canEdit: boolean }) {
  const t = useAppTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ range?: string }>();
  const [range, setRange] = useState<Range>((['today', 'week', 'month', 'last'].includes(params.range ?? '') ? params.range : 'month') as Range);
  const [from, setFrom] = useState(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(isoToday());
  const [mode, setMode] = useState<PayMode | ''>('');
  const [all, setAll] = useState(false);
  const [cancel, setCancel] = useState<FeePayment | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const [df, dt] = rangeDates(range, from, to);
  const valid = ISO_RE.test(df) && ISO_RE.test(dt) && df <= dt;
  const rep = useLoad(() => (valid
    ? api<PaymentReport>('/fees/payments', { params: { date_from: df, date_to: dt, mode: mode || undefined, status: all ? 'all' : 'confirmed' } })
    : Promise.resolve(null)), [df, dt, mode, all, valid]);
  const d = rep.data;

  // group rows by day
  const groups = useMemo(() => {
    const m = new Map<string, FeePayment[]>();
    for (const r of d?.rows ?? []) m.set(r.paid_on, [...(m.get(r.paid_on) ?? []), r]);
    return [...m.entries()];
  }, [d]);

  async function doCancel() {
    if (!cancel) return;
    if (reason.trim().length < 3) return toast('Give a reason (kept in the audit log)', { error: true });
    setBusy(true);
    try {
      await api(`/fees/payments/${cancel.id}/cancel`, { body: { reason: reason.trim() } });
      toast(`Receipt ${cancel.receipt_no} cancelled — dues restored`);
      setCancel(null);
      rep.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen onRefresh={rep.refresh} refreshing={rep.refreshing}
      header={
        <Hero title="Collections" subtitle={valid ? `${fmtDate(df)}${df !== dt ? ` – ${fmtDate(dt)}` : ''}` : 'Pick a valid date range'} compact>
          {d ? (
            <FadeIn>
              <Panel style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Total collected</Text>
                    <Text variant="headlineMedium" style={{ fontWeight: '800', color: t.custom.success }}>{inr(d.total)}</Text>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{d.rows.filter((r) => r.status === 'confirmed').length} receipts</Text>
                  </View>
                </View>
                <View style={{ marginTop: space.md }}><ModeSplit byMode={d.by_mode} /></View>
              </Panel>
            </FadeIn>
          ) : null}
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      <FilterChips value={range} onChange={setRange} options={[
        { label: 'Today', value: 'today' }, { label: 'This week', value: 'week' }, { label: 'This month', value: 'month' },
        { label: 'Last month', value: 'last' }, { label: 'Custom', value: 'custom', icon: 'calendar-range' },
      ]} />
      {range === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          <TextInput mode="outlined" dense label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} style={{ flex: 1 }} error={!ISO_RE.test(from)} />
          <TextInput mode="outlined" dense label="To" value={to} onChangeText={setTo} style={{ flex: 1 }} error={!ISO_RE.test(to) || from > to} />
        </View>
      ) : null}
      <FilterChips value={mode} onChange={setMode} options={[{ label: 'All modes', value: '' as const },
        ...(['cash', 'upi', 'cheque', 'bank', 'online'] as PayMode[]).map((m) => ({ label: MODE_LABEL[m], value: m, icon: MODE_ICON[m] }))]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
        <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Show cancelled & rejected too</Text>
        <Switch value={all} onValueChange={setAll} />
      </View>
      {rep.error ? <ErrorState message={rep.error} onRetry={rep.reload} /> : null}
      {!valid ? <EmptyState icon="calendar-alert" title="Check the dates" text="Use YYYY-MM-DD and keep From before To." /> : !d ? (rep.error ? null : <LoadingCards count={3} />)
        : groups.length === 0 ? <EmptyState icon="cash-remove" title="No payments in this period" /> : groups.map(([day, rows], gi) => {
          const sum = rows.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.amount, 0);
          return (
            <FadeIn key={day} index={gi}>
              <SectionTitle title={`${fmtDate(day)} · ${inr(sum)}`} />
              <Panel style={{ paddingVertical: 0 }}>
                {rows.map((p, i) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <PaymentRow p={p} divider={i < rows.length - 1}
                        onPress={p.receipt_no ? () => router.push(`/more/fees/receipt/${p.id}` as never) : undefined} />
                    </View>
                    {canEdit && p.status === 'confirmed' ? (
                      <IconButton icon="cancel" size={18} iconColor={t.colors.outline} style={{ marginRight: -space.md }}
                        onPress={() => { setReason(''); setCancel(p); }} accessibilityLabel="Cancel receipt" />
                    ) : null}
                  </View>
                ))}
              </Panel>
            </FadeIn>
          );
        })}

      <TopLayer visible={!!cancel} onDismiss={() => setCancel(null)}>
        <Dialog visible={!!cancel} onDismiss={() => setCancel(null)}>
          <Dialog.Icon icon="receipt-text-remove-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Cancel receipt {cancel?.receipt_no}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: space.md }}>
              {cancel ? `${inr(cancel.amount)} from ${cancel.student_name} goes back to their dues. The receipt number stays in records as cancelled.` : ''}
            </Text>
            <TextInput mode="outlined" label="Reason" value={reason} onChangeText={setReason} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancel(null)}>Keep</Button>
            <Button textColor={t.custom.danger} onPress={doCancel} loading={busy} disabled={busy}>Cancel receipt</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </Screen>
  );
}
