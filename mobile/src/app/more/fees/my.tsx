import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Checkbox, Text } from 'react-native-paper';

import { ChildSwitcher } from '@/components/ChildSwitcher';
import { PaySheet } from '@/components/fees/PaySheet';
import { CountUp, EmptyState, ErrorState, FadeIn, Hero, Icon, LoadingCards, Panel, Row, Screen, SectionTitle, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ChildProvider, childParams, useChild } from '@/lib/child';
import { haptic } from '@/lib/feedback';
import { fmtDate, inr, ITEM_LABEL, ITEM_TONE, KIND_ICON, MODE_ICON, MODE_LABEL, PAY_LABEL, PAY_TONE } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeeLedger, FeePayment } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function MyFeesScreen() {
  return (
    <ChildProvider>
      <MyFees />
    </ChildProvider>
  );
}

function MyFees() {
  const t = useAppTheme();
  const { user } = useAuth();
  const { student_id } = useLocalSearchParams<{ student_id?: string }>();
  const { studentId, setChildId, children } = useChild();
  const applied = useRef(false);
  useEffect(() => {
    if (!applied.current && student_id && children.some((k) => k.id === Number(student_id))) {
      applied.current = true;
      if (Number(student_id) !== studentId) setChildId(Number(student_id));
    }
  }, [student_id, children, studentId, setChildId]);

  const parentWaiting = user?.role === 'parent' && !studentId && !children.length;
  const { data, error, loading, reload, refresh, refreshing } = useLoad(
    () => api<FeeLedger>('/fees/me', { params: childParams(studentId) }), [studentId]);

  const pendingItems = useMemo(() => (data?.items ?? []).filter((i) => i.balance > 0), [data]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => { setSel(new Set(pendingItems.map((i) => i.id))); }, [pendingItems]);
  const [payOpen, setPayOpen] = useState(false);

  const amount = pendingItems.filter((i) => sel.has(i.id)).reduce((a, i) => a + i.balance, 0);
  const totals = data?.totals;
  const late = (totals?.overdue ?? 0) > 0;
  const paidItems = (data?.items ?? []).filter((i) => i.balance <= 0);

  function toggle(id: number) {
    haptic.tap();
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={
      <Hero title="Fees" subtitle={data ? `${data.student.name}${data.student.class_name ? ` · ${data.student.class_name}` : ''}` : undefined} compact>
        {data && totals ? (
          <FadeIn>
            <Panel style={{ marginBottom: 0, borderWidth: late ? 1.5 : 0, borderColor: t.custom.danger,
              shadowColor: late ? t.custom.danger : '#000', shadowOpacity: late ? 0.35 : 0.08, shadowRadius: late ? 18 : 10, elevation: late ? 8 : 3 }}>
              <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Outstanding</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <Text style={{ fontSize: 30, fontWeight: '700', color: late ? t.custom.danger : t.colors.onSurface }}>₹</Text>
                <CountUp value={totals.outstanding} format={(n) => Math.round(n).toLocaleString('en-IN')} variant="displaySmall" style={{ fontWeight: '700', color: late ? t.custom.danger : t.colors.onSurface }} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
                {late ? <ToneChip text={`${inr(totals.overdue)} overdue`} tone="danger" icon="alert-circle-outline" /> : null}
                {totals.next_due ? <ToneChip text={`Next due ${fmtDate(totals.next_due)}`} tone="warning" icon="calendar-clock" /> : null}
                {totals.outstanding <= 0 ? <ToneChip text="All clear" tone="success" icon="check-decagram" /> : null}
                <ToneChip text={`Paid ${inr(totals.paid)}`} tone="neutral" icon="cash-check" />
              </View>
            </Panel>
          </FadeIn>
        ) : null}
      </Hero>
    }>
      <View style={{ height: space.lg }} />
      {user?.role === 'parent' ? <View style={{ marginBottom: space.md }}><ChildSwitcher /></View> : null}
      {(loading || parentWaiting) && !data ? <LoadingCards count={3} /> : null}
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          <SectionTitle title="Dues" />
          {pendingItems.length ? (
            <FadeIn index={1}>
              <Panel style={{ paddingVertical: 0 }}>
                {pendingItems.map((i, n) => (
                  <Row key={i.id} divider={n < pendingItems.length - 1}
                    title={i.title}
                    subtitle={`${i.due_date ? `Due ${fmtDate(i.due_date)}` : 'No due date'}${i.paid > 0 ? ` · paid ${inr(i.paid)} of ${inr(i.amount)}` : ''}`}
                    onPress={data.upi?.enabled ? () => toggle(i.id) : undefined}
                    left={data.upi?.enabled ? (
                      <Checkbox.Android status={sel.has(i.id) ? 'checked' : 'unchecked'} onPress={() => toggle(i.id)} />
                    ) : <Icon name={KIND_ICON[i.kind] ?? 'receipt-text-outline'} size={22} color={t.colors.primary} />}
                    right={
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{inr(i.balance)}</Text>
                        <ToneChip text={ITEM_LABEL[i.status]} tone={ITEM_TONE[i.status]} />
                      </View>
                    } />
                ))}
              </Panel>
            </FadeIn>
          ) : <EmptyState icon="party-popper" title="Nothing due" text="All fees are paid. Receipts are below." />}

          {pendingItems.length && data.upi?.enabled ? (
            <FadeIn index={2}>
              <Button mode="contained" icon="qrcode-scan" disabled={amount <= 0} onPress={() => { haptic.light(); setPayOpen(true); }}
                contentStyle={{ paddingVertical: 8 }} style={{ borderRadius: radius.pill }}
                buttonColor={late ? t.custom.danger : undefined}>
                {amount > 0 ? `Pay ${inr(amount)} by UPI` : 'Select dues to pay'}
              </Button>
            </FadeIn>
          ) : pendingItems.length ? (
            <Panel tone="neutral" icon="store-outline" title="Pay at the school office" subtitle="Online UPI payment isn't set up by your school yet." />
          ) : null}

          <SectionTitle title="Payments & receipts" />
          {data.payments.length ? (
            <FadeIn index={3}>
              <Panel style={{ paddingVertical: 0 }}>
                {data.payments.map((p, n) => <PaymentRow key={p.id} p={p} last={n === data.payments.length - 1} />)}
              </Panel>
            </FadeIn>
          ) : <EmptyState icon="receipt-text-outline" title="No payments yet" />}

          {paidItems.length ? (
            <>
              <SectionTitle title="Paid charges" />
              <Panel style={{ paddingVertical: 0 }}>
                {paidItems.slice(0, 30).map((i, n) => (
                  <Row key={i.id} divider={n < Math.min(paidItems.length, 30) - 1} title={i.title}
                    left={<Icon name={KIND_ICON[i.kind] ?? 'receipt-text-outline'} size={20} color={t.custom.success} />}
                    right={<Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>{inr(i.amount)}</Text>} />
                ))}
              </Panel>
            </>
          ) : null}

          {data.upi?.enabled ? (
            <PaySheet visible={payOpen} onDismiss={() => setPayOpen(false)} onDone={() => { setPayOpen(false); reload(); }}
              studentId={data.student.id} studentName={data.student.name} amount={Math.round(amount * 100) / 100}
              itemIds={pendingItems.filter((i) => sel.has(i.id)).map((i) => i.id)} upiId={data.upi.upi_id} payee={data.upi.payee} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function PaymentRow({ p, last }: { p: FeePayment; last: boolean }) {
  const t = useAppTheme();
  const ok = p.status === 'confirmed' && !!p.receipt_no;
  const sub = [
    fmtDate(p.paid_on), MODE_LABEL[p.mode] ?? p.mode, p.receipt_no ?? (p.reference ? `UTR ${p.reference}` : ''),
  ].filter(Boolean).join(' · ');
  return (
    <Row divider={!last} title={inr(p.amount)}
      subtitle={p.status === 'rejected' && p.cancel_reason ? `${sub}\nRejected: ${p.cancel_reason}` : p.status === 'pending' ? `${sub}\nAwaiting school check` : sub}
      onPress={ok ? () => router.push(`/more/fees/receipt/${p.id}` as never) : undefined}
      left={<Icon name={MODE_ICON[p.mode] ?? 'cash'} size={22} color={ok ? t.custom.success : t.colors.onSurfaceVariant} />}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ToneChip text={p.status === 'pending' ? 'Awaiting check' : PAY_LABEL[p.status]} tone={PAY_TONE[p.status]} />
          {ok ? <Icon name="chevron-right" size={20} color={t.colors.outline} /> : null}
        </View>
      } />
  );
}
