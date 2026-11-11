import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { useFeeGate } from '@/components/fees/staff/common';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, LoadingCards, Panel, Screen, Sheet, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, inr, PAY_LABEL, PAY_TONE } from '@/lib/fees';
import { useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeePayment, FeeReceipt } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Status = 'pending' | 'confirmed' | 'rejected' | 'all';
const REASONS = ['UTR not found in bank statement', 'Amount does not match', 'Paid to a different account', 'Duplicate claim'];

export default function Claims() {
  const gate = useFeeGate('Verify UPI payments');
  if (gate.block) return gate.block;
  return <Inbox canEdit={gate.canEdit} />;
}

function Inbox({ canEdit }: { canEdit: boolean }) {
  const t = useAppTheme();
  const toast = useToast();
  const [status, setStatus] = useState<Status>('pending');
  const list = useLoad(() => api<FeePayment[]>('/fees/claims', { params: { status } }), [status]);
  const [confirm, setConfirm] = useState<FeePayment | null>(null);
  const [reject, setReject] = useState<FeePayment | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function doConfirm() {
    if (!confirm) return;
    const a = Number(amount);
    if (!(a > 0)) return toast('Enter the amount you received', { error: true });
    setBusy(true);
    try {
      const r = await api<FeeReceipt>(`/fees/claims/${confirm.id}/confirm`, { body: a !== confirm.amount ? { amount: a } : {} });
      toast(`Confirmed · receipt ${r.receipt_no}`);
      setConfirm(null);
      list.reload();
      router.push(`/more/fees/receipt/${r.id}` as never);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  async function doReject() {
    if (!reject) return;
    if (reason.trim().length < 3) return toast('Tell the parent why', { error: true });
    setBusy(true);
    try {
      await api(`/fees/claims/${reject.id}/reject`, { body: { reason: reason.trim() } });
      toast('Payment claim rejected — the parent will see the reason');
      setReject(null);
      list.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const rows = list.data ?? [];
  const pendingTotal = status === 'pending' ? rows.reduce((s, r) => s + r.amount, 0) : 0;

  return (
    <Screen onRefresh={list.refresh} refreshing={list.refreshing}
      header={<Hero title="Verify UPI payments" subtitle={status === 'pending' && list.data ? `${rows.length} waiting · ${inr(pendingTotal)}` : 'Match the UTR with your bank / UPI app'} compact />}>
      <FilterChips value={status} onChange={setStatus} options={[
        { label: 'Pending', value: 'pending', icon: 'timer-sand' },
        { label: 'Confirmed', value: 'confirmed', icon: 'check-circle-outline' },
        { label: 'Rejected', value: 'rejected', icon: 'close-circle-outline' },
        { label: 'All', value: 'all' },
      ]} />
      {status === 'pending' && rows.length ? (
        <Panel tone="primary" icon="shield-check-outline" title="Check before confirming"
          subtitle="Open your bank or UPI business app and find the UTR. Confirm only when the money has reached the school account." />
      ) : null}
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {!list.data ? (list.error ? null : <LoadingCards count={3} />) : rows.length === 0 ? (
        <EmptyState icon={status === 'pending' ? 'check-all' : 'inbox-outline'} title={status === 'pending' ? 'All caught up' : 'Nothing here'}
          text={status === 'pending' ? 'UPI payments that parents report will appear here.' : undefined} />
      ) : rows.map((p, i) => (
        <FadeIn key={p.id} index={i}>
          <Panel style={{ marginBottom: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <UserAvatar name={p.student_name} size={42} />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }} numberOfLines={1}>{p.student_name}</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }} numberOfLines={1}>
                  {p.class_name} · {p.admission_no}{p.submitted_by_name ? ` · by ${p.submitted_by_name}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.primary }}>{inr(p.amount)}</Text>
                <ToneChip text={PAY_LABEL[p.status]} tone={PAY_TONE[p.status]} />
              </View>
            </View>
            <View style={{ backgroundColor: t.colors.surfaceVariant, borderRadius: radius.md, padding: space.md, marginTop: space.md, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="pound" size={16} color={t.colors.onSurfaceVariant} />
                <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>UTR</Text>
                <Text selectable variant="titleSmall" style={{ fontWeight: '700', letterSpacing: 1, color: t.colors.onSurface, flex: 1 }}>{p.reference}</Text>
              </View>
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
                Paid {fmtDate(p.paid_on)} · reported {fmtDate(p.created_at)}{p.outstanding != null ? ` · student owes ${inr(p.outstanding)}` : ''}
              </Text>
              {p.cancel_reason ? <Text variant="bodySmall" style={{ color: t.custom.danger }}>Reason: {p.cancel_reason}</Text> : null}
            </View>
            {p.status === 'pending' && canEdit ? (
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                <Button mode="outlined" icon="close" textColor={t.custom.danger} style={{ flex: 1 }} onPress={() => { setReason(''); setReject(p); }}>Reject</Button>
                <Button mode="contained" icon="check" style={{ flex: 1.4 }} buttonColor={t.custom.success} textColor="#fff"
                  onPress={() => { setAmount(String(p.amount)); setConfirm(p); }}>Confirm</Button>
              </View>
            ) : p.status === 'confirmed' && p.receipt_no ? (
              <Button mode="text" icon="receipt-text-outline" onPress={() => router.push(`/more/fees/receipt/${p.id}` as never)} style={{ marginTop: space.sm, alignSelf: 'flex-start' }}>
                Receipt {p.receipt_no}
              </Button>
            ) : null}
          </Panel>
        </FadeIn>
      ))}

      <Sheet visible={!!confirm} onDismiss={() => setConfirm(null)} title="Confirm UPI payment">
        {confirm ? (
          <>
            <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
              {confirm.student_name} · UTR <Text style={{ fontWeight: '700' }}>{confirm.reference}</Text>
            </Text>
            <TextInput mode="outlined" label="Amount received (₹)" keyboardType="decimal-pad" value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} left={<TextInput.Affix text="₹" />} />
            <HelperText type="info">{Number(amount) !== confirm.amount ? `Parent reported ${inr(confirm.amount)}` : 'Change it only if the bank shows a different amount'}</HelperText>
            <Button mode="contained" icon="receipt-text-check-outline" onPress={doConfirm} loading={busy} disabled={busy}
              style={{ marginTop: space.sm }} contentStyle={{ paddingVertical: 6 }}>Confirm & issue receipt</Button>
          </>
        ) : null}
      </Sheet>
      <Sheet visible={!!reject} onDismiss={() => setReject(null)} title="Reject payment claim">
        <FilterChips value={reason} onChange={setReason} options={REASONS.map((r) => ({ label: r, value: r }))} />
        <TextInput mode="outlined" label="Reason for the parent" value={reason} onChangeText={setReason} multiline />
        <Button mode="contained" icon="close" buttonColor={t.custom.danger} textColor="#fff" onPress={doReject} loading={busy} disabled={busy}
          style={{ marginTop: space.lg }} contentStyle={{ paddingVertical: 6 }}>Reject</Button>
      </Sheet>
    </Screen>
  );
}
