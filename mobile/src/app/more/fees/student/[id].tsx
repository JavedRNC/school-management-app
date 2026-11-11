import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, IconButton, Menu, Text } from 'react-native-paper';

import { PaymentRow, useFeeGate } from '@/components/fees/staff/common';
import { AddChargeSheet, ConcessionSheet, RecordPaymentSheet } from '@/components/fees/staff/LedgerSheets';
import { Fab, EmptyState, ErrorState, FadeIn, Hero, Icon, LoadingCards, Panel, Screen, SectionTitle, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, inr, ITEM_LABEL, ITEM_TONE, KIND_ICON } from '@/lib/fees';
import { haptic } from '@/lib/feedback';
import { space, toneColors, useAppTheme } from '@/lib/theme';
import type { FeeItem, FeeLedger } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentLedger() {
  const gate = useFeeGate('Fee ledger');
  if (gate.block) return gate.block;
  return <Ledger canEdit={gate.canEdit} />;
}

function Ledger({ canEdit }: { canEdit: boolean }) {
  const t = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = Number(id);
  const l = useLoad(() => api<FeeLedger>(`/fees/students/${sid}`), [sid]);
  const [payOpen, setPayOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [edit, setEdit] = useState<FeeItem | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const d = l.data;

  const pending = d ? d.items.filter((i) => i.balance > 0) : [];
  const paid = d ? d.items.filter((i) => i.balance <= 0).slice().reverse() : [];

  function itemCard(i: FeeItem, index: number) {
    const tone = toneColors(t, ITEM_TONE[i.status]);
    const p = i.amount ? Math.min(1, i.paid / i.amount) : 1;
    return (
      <FadeIn key={i.id} index={index}>
        <Panel style={{ marginBottom: space.sm }} onPress={canEdit && i.balance > 0 ? () => { haptic.light(); setMenuFor(i.id); } : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={KIND_ICON[i.kind] ?? 'cash'} size={20} color={tone.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }} numberOfLines={2}>{i.title}</Text>
              <Text variant="bodySmall" style={{ color: i.status === 'overdue' ? t.custom.danger : t.colors.onSurfaceVariant }}>
                Due {fmtDate(i.due_date)}{i.paid > 0 && i.balance > 0 ? ` · paid ${inr(i.paid)}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{inr(i.balance > 0 ? i.balance : i.amount)}</Text>
              <ToneChip text={ITEM_LABEL[i.status]} tone={ITEM_TONE[i.status]} />
            </View>
            {canEdit && i.balance > 0 ? (
              <Menu visible={menuFor === i.id} onDismiss={() => setMenuFor(null)}
                anchor={<IconButton icon="dots-vertical" size={20} onPress={() => setMenuFor(i.id)} style={{ margin: -6 }} />}>
                <Menu.Item leadingIcon="cash-register" title="Collect this" onPress={() => { setMenuFor(null); setPayOpen(true); }} />
                <Menu.Item leadingIcon="sale" title="Concession / correct" onPress={() => { setMenuFor(null); setEdit(i); }} />
              </Menu>
            ) : null}
          </View>
          {i.paid > 0 && i.balance > 0 ? (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.custom.chartTrack, marginTop: space.sm, overflow: 'hidden', flexDirection: 'row' }}>
              <View style={{ flex: p, backgroundColor: t.custom.success }} />
              <View style={{ flex: 1 - p }} />
            </View>
          ) : null}
        </Panel>
      </FadeIn>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={l.refresh} refreshing={l.refreshing} footerSpace={130}
        header={
          <Hero title={d?.student.name ?? 'Fee ledger'} subtitle={d ? `${d.student.class_name || 'No class'}${d.student.roll_no ? ` · Roll ${d.student.roll_no}` : ''} · Adm. ${d.student.admission_no}` : undefined} compact>
            {d ? (
              <FadeIn>
                <Panel style={{ marginBottom: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <UserAvatar name={d.student.name} size={52} />
                    <View style={{ flex: 1 }}>
                      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Outstanding</Text>
                      <Text variant="headlineSmall" style={{ fontWeight: '700', color: d.totals.outstanding ? (d.totals.overdue ? t.custom.danger : t.custom.warning) : t.custom.success }}>
                        {d.totals.outstanding ? inr(d.totals.outstanding) : 'All paid ✓'}
                      </Text>
                      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
                        {d.totals.overdue ? `${inr(d.totals.overdue)} overdue · ` : ''}{d.totals.next_due ? `next due ${fmtDate(d.totals.next_due)}` : `paid ${inr(d.totals.paid)} in total`}
                      </Text>
                    </View>
                  </View>
                  {d.parent ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md, paddingTop: space.sm, borderTopWidth: 0.5, borderTopColor: t.colors.outlineVariant }}>
                      <Icon name="account-child-outline" size={18} color={t.colors.onSurfaceVariant} />
                      <Text variant="bodyMedium" style={{ flex: 1, marginLeft: 6, color: t.colors.onSurface }} numberOfLines={1}>{d.parent.name}</Text>
                      {d.parent.phone ? <Button compact icon="phone-outline" onPress={() => Linking.openURL(`tel:${d.parent?.phone}`)}>Call</Button> : null}
                    </View>
                  ) : null}
                </Panel>
              </FadeIn>
            ) : null}
          </Hero>
        }>
        <View style={{ height: space.lg }} />
        {l.error ? <ErrorState message={l.error} onRetry={l.reload} /> : null}
        {!d ? (l.error ? null : <LoadingCards />) : (
          <>
            <SectionTitle title={pending.length ? `Pending · ${pending.length}` : 'Pending'} action={canEdit ? 'Add charge' : undefined} onAction={() => setChargeOpen(true)} />
            {pending.length ? pending.map((i, k) => itemCard(i, k))
              : <EmptyState icon="check-decagram-outline" title="No dues" text="This student is fully paid up." />}

            {paid.length ? (
              <>
                <SectionTitle title={`Paid · ${paid.length}`} action={showPaid ? 'Hide' : 'Show'} onAction={() => setShowPaid((s) => !s)} />
                {showPaid ? paid.map((i, k) => itemCard(i, k)) : null}
              </>
            ) : null}

            <SectionTitle title="Payments & receipts" />
            <Panel style={{ paddingVertical: 0 }}>
              {d.payments.length ? d.payments.map((p, k) => (
                <PaymentRow key={p.id} p={p} showStudent={false} divider={k < d.payments.length - 1}
                  onPress={p.receipt_no ? () => router.push(`/more/fees/receipt/${p.id}` as never) : undefined} />
              )) : <EmptyState icon="receipt-text-outline" title="No payments yet" />}
            </Panel>
          </>
        )}
      </Screen>
      {canEdit && d && pending.length ? (
        <Fab icon="cash-register" label="Record payment" extended onPress={() => { haptic.tap(); setPayOpen(true); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.xl }} />
      ) : null}
      {d ? (
        <>
          <RecordPaymentSheet visible={payOpen} onDismiss={() => setPayOpen(false)} studentId={sid} studentName={d.student.name} items={d.items} onDone={l.reload} />
          <AddChargeSheet visible={chargeOpen} onDismiss={() => setChargeOpen(false)} studentId={sid} onDone={l.reload} />
          <ConcessionSheet item={edit} onDismiss={() => setEdit(null)} onDone={l.reload} />
        </>
      ) : null}
    </View>
  );
}
