import { useState } from 'react';
import { View } from 'react-native';
import { Button, Switch, Text, TextInput } from 'react-native-paper';

import { EmptyState, ErrorState, FadeIn, FilterChips, LoadingCards, Panel, Row, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { fieldOutline, space, useAppTheme } from '@/lib/theme';
import type { AdminSchoolDetail, Payment } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { DateField, dateOk, fmtDay, isoToday, rupees } from './common';

const METHODS = ['Cash', 'UPI', 'Bank', 'Cheque'];

export function SchoolPaymentsSection({ d, onSaved }: { d: AdminSchoolDetail; onSaved: () => void }) {
  const t = useAppTheme();
  const pays = useLoad(() => api<Payment[]>(`/admin/schools/${d.id}/payments`), [d.id]);
  const [open, setOpen] = useState(false);
  const total = (pays.data ?? []).reduce((s, p) => s + p.amount, 0);

  return (
    <View>
      <FadeIn>
        <Panel title="Payments received" icon="cash-multiple"
          subtitle={`Paid until ${fmtDay(d.subscription.valid_until)} · ${d.subscription.estimate.free ? 'Free' : `${rupees(d.subscription.estimate.amount)}/month`}`}
          right={<Text variant="titleMedium" style={{ fontWeight: '700', color: t.custom.success }}>{rupees(total)}</Text>}>
          {pays.error ? <ErrorState message={pays.error} onRetry={pays.reload} /> : null}
          {!pays.data ? <LoadingCards count={2} /> : pays.data.length ? pays.data.map((p, i) => (
            <Row key={p.id} title={rupees(p.amount)} divider={i < pays.data!.length - 1}
              subtitle={[fmtDay(p.paid_on), p.method, p.reference, p.period_from || p.period_to ? `${fmtDay(p.period_from)} → ${fmtDay(p.period_to)}` : '', p.note]
                .filter(Boolean).join(' · ')} />
          )) : <EmptyState icon="cash-remove" title="No payments recorded yet" />}
        </Panel>
      </FadeIn>
      <Button mode="contained" icon="cash-plus" onPress={() => { haptic.tap(); setOpen(true); }} contentStyle={{ paddingVertical: 6 }}>
        Record payment
      </Button>
      <RecordPayment visible={open} d={d} onDismiss={() => setOpen(false)} onSaved={() => { setOpen(false); pays.reload(); onSaved(); }} />
    </View>
  );
}

function RecordPayment({ visible, d, onDismiss, onSaved }: { visible: boolean; d: AdminSchoolDetail; onDismiss: () => void; onSaved: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [amount, setAmount] = useState(d.subscription.estimate.amount ? String(d.subscription.estimate.amount) : '');
  const [paidOn, setPaidOn] = useState(isoToday());
  const [method, setMethod] = useState('UPI');
  const [ref, setRef] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [extend, setExtend] = useState(true);
  const [busy, setBusy] = useState(false);
  const valid = Number(amount) > 0 && dateOk(paidOn) && paidOn !== '' && dateOk(from) && dateOk(to);

  async function save() {
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      await api(`/admin/schools/${d.id}/payments`, {
        body: { amount: Number(amount), paid_on: paidOn, method, reference: ref, note, period_from: from || null, period_to: to || null, extend_valid_until: extend },
      });
      toast(`Payment of ${rupees(Number(amount))} recorded`);
      setRef(''); setNote(''); setFrom(''); setTo('');
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Record payment">
      <TextInput mode="outlined" outlineStyle={fieldOutline} label="Amount (₹)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad"
        left={<TextInput.Icon icon="currency-inr" />} style={{ marginBottom: space.md }} />
      <DateField label="Paid on" value={paidOn} onChange={setPaidOn} quick={false} />
      <FilterChips label="Method" value={method} onChange={setMethod} options={METHODS.map((m) => ({ label: m, value: m }))} />
      <TextInput mode="outlined" outlineStyle={fieldOutline} label="Reference / UTR (optional)" value={ref} onChangeText={setRef} style={{ marginBottom: space.md }} />
      <DateField label="Period from (optional)" value={from} onChange={setFrom} quick={false} />
      <DateField label="Period to (optional)" value={to} onChange={setTo} />
      <TextInput mode="outlined" outlineStyle={fieldOutline} label="Note (optional)" value={note} onChangeText={setNote} style={{ marginBottom: space.md }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyLarge" style={{ color: t.colors.onSurface, fontWeight: '600' }}>Extend "paid until"</Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
            {to ? `To ${fmtDay(to)}` : `By one ${d.billing_cycle === 'yearly' ? 'year' : 'month'}`}
          </Text>
        </View>
        <Switch value={extend} onValueChange={setExtend} />
      </View>
      <Button mode="contained" icon="check" onPress={save} loading={busy} disabled={!valid} contentStyle={{ paddingVertical: 6 }}>Save payment</Button>
    </Sheet>
  );
}
