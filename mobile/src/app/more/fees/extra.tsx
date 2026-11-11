import { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';

import { Bar, Glow } from '@/components/fees/setup/common';
import { RolloutSheet } from '@/components/fees/setup/RolloutSheet';
import { StatusBanner } from '@/components/StatusBanner';
import { Fab, EmptyState, ErrorState, FadeIn, Hero, Icon, LoadingCards, Panel, Screen, StatTile, ToneChip, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { fmtDate, inr } from '@/lib/fees';
import { space, useAppTheme } from '@/lib/theme';
import type { FeeBatch, FeeConfig } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

/** Extra fees rolled out to the school / classes / students (F14). */
export default function ExtraFeesScreen() {
  const enabled = useModule('fees');
  const canView = useCan('fees', 'view');
  if (!enabled || !canView) {
    return (
      <Screen header={<Hero title="Extra fees" compact />}>
        <EmptyState icon={enabled ? 'lock-outline' : 'cash-lock'} title={enabled ? 'No access' : "Fees aren't on your plan"}
          text={enabled ? "You don't have permission to view fees." : 'Ask the school to enable the Fees module.'} />
      </Screen>
    );
  }
  return <ExtraFees />;
}

function ExtraFees() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canEdit = useCan('fees', 'edit') && school?.can_write !== false;
  const batches = useLoad(() => api<FeeBatch[]>('/fees/batches'));
  const cfg = useLoad(() => api<FeeConfig>('/fees/config'));
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<FeeBatch | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);

  const list = batches.data ?? [];
  const expected = list.reduce((a, b) => a + b.expected, 0);
  const collected = list.reduce((a, b) => a + b.collected, 0);

  async function withdraw() {
    const b = confirm;
    if (!b) return;
    setConfirm(null);
    try {
      const r = await api<{ ok: boolean; voided: number; kept_paid: number }>(`/fees/batches/${b.id}`, { method: 'DELETE' });
      toast(`${b.title} withdrawn · ${r.voided} unpaid charge${r.voided === 1 ? '' : 's'} removed${r.kept_paid ? ` · ${r.kept_paid} paid kept` : ''}`);
      batches.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={batches.refresh} refreshing={batches.refreshing} footerSpace={120}
        header={
          <Hero title="Extra fees" subtitle="Exam, activity and other one-time fees" compact>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <StatTile icon="star-four-points-outline" label="Fees running" value={batches.data ? list.length : null} />
              <StatTile icon="cash-check" label="Collected (₹)" value={batches.data ? Math.round(collected) : null} tone="success" hint={batches.data ? `of ${inr(expected)}` : undefined} />
            </View>
          </Hero>
        }>
        <View style={{ height: space.lg }} />
        <StatusBanner />
        {batches.error ? <ErrorState message={batches.error} onRetry={batches.reload} /> : null}
        {!batches.data && !batches.error ? <LoadingCards /> : null}
        {batches.data && !list.length ? (
          <EmptyState icon="cash-plus" title="No extra fees yet"
            text={canEdit ? 'Roll out an exam, activity or maintenance fee to the whole school, some classes or chosen students.' : undefined}
            action={canEdit ? 'Roll out a fee' : undefined} onAction={() => setOpen(true)} />
        ) : null}
        {list.map((b, i) => {
          const pct = b.count ? b.paid_count / b.count : 0;
          const overdue = !!b.due_date && b.due_date < new Date().toISOString().slice(0, 10) && b.outstanding > 0;
          return (
            <FadeIn key={b.id} index={i}>
              <Glow trigger={fresh === b.id ? b.id : null} style={{ marginBottom: space.md }}>
                <Panel style={{ marginBottom: 0 }} title={b.title} subtitle={`${inr(b.amount)} per student · ${b.target_label}`} icon="star-four-points-outline"
                  right={canEdit ? (
                    <Button compact textColor={t.colors.error} icon="undo-variant" onPress={() => { haptic.tap(); setConfirm(b); }}>Withdraw</Button>
                  ) : undefined}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
                    <ToneChip icon="calendar" text={b.due_date ? `Due ${fmtDate(b.due_date)}` : 'No due date'} tone={overdue ? 'danger' : 'neutral'} />
                    <ToneChip icon="account-group-outline" text={`${b.count} students`} tone="primary" />
                    {pct >= 1 ? <ToneChip icon="check-all" text="All paid" tone="success" /> : null}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>{b.paid_count} of {b.count} paid</Text>
                    <Text variant="labelMedium" style={{ color: t.custom.success, fontWeight: '700' }}>{Math.round(pct * 100)}%</Text>
                  </View>
                  <Bar value={pct} color={pct >= 1 ? t.custom.success : overdue ? t.custom.warning : t.colors.primary} />
                  <View style={{ flexDirection: 'row', marginTop: space.md }}>
                    <Money label="Collected" value={b.collected} color={t.custom.success} />
                    <Money label="Pending" value={b.outstanding} color={b.outstanding ? t.custom.warning : t.colors.onSurfaceVariant} />
                    <Money label="Expected" value={b.expected} color={t.colors.onSurface} />
                  </View>
                  {b.note ? (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: space.md }}>
                      <Icon name="note-text-outline" size={16} color={t.colors.onSurfaceVariant} />
                      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, flex: 1 }}>{b.note}</Text>
                    </View>
                  ) : null}
                </Panel>
              </Glow>
            </FadeIn>
          );
        })}
      </Screen>

      {canEdit ? (
        <Fab icon="cash-plus" label="Roll out fee" extended onPress={() => { haptic.tap(); setOpen(true); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}

      <RolloutSheet visible={open} classes={cfg.data?.classes ?? []} onDismiss={() => setOpen(false)}
        onDone={(b) => { setOpen(false); setFresh(b.id); batches.reload(); }} />

      <TopLayer visible={!!confirm} onDismiss={() => setConfirm(null)}>
        <Dialog visible={!!confirm} onDismiss={() => setConfirm(null)}>
          <Dialog.Icon icon="undo-variant" />
          <Dialog.Title style={{ textAlign: 'center' }}>Withdraw {confirm?.title}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Unpaid charges will be removed from {confirm ? confirm.count - confirm.paid_count : 0} students' fees.
              {confirm?.paid_count ? ` ${confirm.paid_count} students already paid — their receipts and payments are kept.` : ''}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={withdraw}>Withdraw</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </View>
  );
}

function Money({ label, value, color }: { label: string; value: number; color: string }) {
  const t = useAppTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{label}</Text>
      <Text variant="titleSmall" style={{ color, fontWeight: '700' }}>{inr(value)}</Text>
    </View>
  );
}
