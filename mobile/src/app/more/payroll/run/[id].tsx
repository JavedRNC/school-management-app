import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';

import { NotInPlan, roleName, SlipStatus } from '@/components/payroll/parts';
import { PaySheet } from '@/components/payroll/PaySheet';
import { StatusBanner } from '@/components/StatusBanner';
import { ErrorState, FadeIn, Hero, LoadingCards, Panel, Row, Screen, SectionTitle, TopLayer, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useModule } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { fmtDate, inr } from '@/lib/fees';
import type { RunDetail } from '@/lib/payroll';
import { space, useAppTheme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Ask = 'lock' | 'reopen' | 'delete';
const ASK: Record<Ask, { icon: string; title: string; body: string; action: string; danger?: boolean }> = {
  lock: { icon: 'lock-check-outline', title: 'Lock this payroll?', body: 'Payslips get their numbers and staff can see them in the app. You can reopen it only while no salary is marked paid.', action: 'Lock payroll' },
  reopen: { icon: 'lock-open-variant-outline', title: 'Reopen this payroll?', body: 'Staff stop seeing these payslips until you lock it again. Payslip numbers are given afresh.', action: 'Reopen' },
  delete: { icon: 'delete-outline', title: 'Delete this payroll?', body: 'The payslips prepared for this month are removed. Salaries are not changed.', action: 'Delete payroll', danger: true },
};

/** One month's payroll for the principal: totals, every payslip, and the steps prepare → lock → mark paid. */
export default function PayrollRunScreen() {
  const { user } = useAuth();
  const enabled = useModule('payroll');
  if (!enabled || user?.role !== 'principal') return <NotInPlan title="Payroll" />;
  return <Run />;
}

function Run() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload, refresh, refreshing, setData } = useLoad(() => api<RunDetail>(`/payroll/runs/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pay, setPay] = useState(false);
  const canWrite = school?.can_write !== false;
  const run = data?.run;
  const draft = run?.status === 'draft';

  async function step(kind: 'recalculate' | 'finalize' | 'reopen', done: string) {
    setBusy(kind);
    try {
      setData(await api<RunDetail>(`/payroll/runs/${id}/${kind}`, { body: {} }));
      toast(done);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
      setAsk(null);
    }
  }
  async function remove() {
    setBusy('delete');
    try {
      await api(`/payroll/runs/${id}`, { method: 'DELETE' });
      toast('Payroll deleted');
      setAsk(null);
      router.back();
    } catch (e) {
      toast((e as Error).message, { error: true });
      setBusy(null);
      setAsk(null);
    }
  }
  const confirm = () => (ask === 'lock' ? step('finalize', 'Payroll locked. Staff can now see their payslips.') : ask === 'reopen' ? step('reopen', 'Payroll reopened') : remove());

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={<Hero title={run ? run.month_label : 'Payroll'} subtitle={!run ? undefined : draft ? 'Being prepared. Check each person, then lock it.' : run.unpaid_count ? 'Locked. Record each salary as you pay it.' : 'Locked and fully paid.'} compact />}>
      <StatusBanner />
      {loading && !data ? <LoadingCards count={3} /> : null}
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && run ? (
        <>
          <FadeIn>
            <Panel>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1 }}><Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Net pay</Text>
                  <Text variant="headlineMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>{inr(run.net)}</Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{run.people} people · pay {inr(run.gross)} · deductions {inr(run.total_deductions)}</Text></View>
              </View>
              {!draft ? (
                <View style={{ flexDirection: 'row', marginTop: space.md, gap: space.lg }}>
                  <View><Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>Paid</Text><Text variant="titleMedium" style={{ fontWeight: '700', color: t.custom.success }}>{inr(run.paid_amount)}</Text></View>
                  <View><Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>Still to pay</Text><Text variant="titleMedium" style={{ fontWeight: '700', color: run.unpaid_count ? t.custom.warning : t.colors.onSurface }}>{inr(run.unpaid_amount)}</Text></View>
                </View>
              ) : null}
              {run.lop_enabled ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>Pay is cut for absent days without approved leave, counted up to {fmtDate(run.counted_until)}.</Text> : null}
            </Panel>
          </FadeIn>
          {canWrite ? (
            <FadeIn index={1}>
              {draft ? (
                <>
                  <Button mode="contained" icon="lock-check-outline" contentStyle={{ paddingVertical: 6 }} disabled={!!busy} onPress={() => setAsk('lock')}>Lock payroll</Button>
                  <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                    <Button mode="contained-tonal" icon="refresh" style={{ flex: 1 }} loading={busy === 'recalculate'} disabled={!!busy}
                      onPress={() => step('recalculate', "Worked out again from today's salaries and attendance")}>Work out again</Button>
                    <Button mode="outlined" icon="delete-outline" textColor={t.custom.danger} style={{ flex: 1 }} disabled={!!busy} onPress={() => setAsk('delete')}>Delete</Button>
                  </View>
                </>
              ) : (
                <>
                  {run.unpaid_count ? <Button mode="contained" icon="cash-check" contentStyle={{ paddingVertical: 6 }} disabled={!!busy} onPress={() => setPay(true)}>{run.unpaid_count === 1 ? 'Mark 1 salary as paid' : `Mark all ${run.unpaid_count} as paid`}</Button> : null}
                  {run.paid_count === 0 ? <Button mode="text" style={{ marginTop: space.xs }} disabled={!!busy} onPress={() => setAsk('reopen')}>Reopen to make changes</Button> : null}
                </>
              )}
            </FadeIn>
          ) : null}
          <FadeIn index={2}>
            <SectionTitle title="Payslips" />
            <Panel style={{ paddingVertical: 0 }}>
              {data.payslips.map((p, i) => (
                <Row key={p.id} title={p.name} subtitle={`${roleName(p.role)} · ${p.login_id}${p.lop_days ? ` · ${p.lop_days} unpaid day${p.lop_days === 1 ? '' : 's'}` : ''}`}
                  divider={i < data.payslips.length - 1} onPress={() => router.push(`/more/payroll/slip/${p.id}` as never)}
                  left={<UserAvatar name={p.name} size={38} />}
                  right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{inr(p.net)}</Text><SlipStatus p={p} /></View>} />
              ))}
            </Panel>
          </FadeIn>
          <PaySheet visible={pay} title={`Mark ${run.unpaid_count} ${run.unpaid_count === 1 ? 'salary' : 'salaries'} as paid`} detail={`Total ${inr(run.unpaid_amount)}.`} month={run.month} monthLabel={run.month_label}
            onDismiss={() => setPay(false)} submit={(body) => api<RunDetail & { paid: number }>(`/payroll/runs/${run.id}/pay`, { body })}
            onDone={(r) => { const x = r as RunDetail & { paid: number }; setPay(false); setData({ run: x.run, payslips: x.payslips }); toast(`${x.paid} ${x.paid === 1 ? 'salary' : 'salaries'} marked as paid`); }} />
        </>
      ) : null}

      <TopLayer visible={!!ask} onDismiss={() => setAsk(null)}>
        <Dialog visible={!!ask} onDismiss={() => setAsk(null)}>
          {ask ? <Dialog.Icon icon={ASK[ask].icon} /> : null}
          <Dialog.Title style={{ textAlign: 'center' }}>{ask ? ASK[ask].title : ''}</Dialog.Title>
          <Dialog.Content><Text variant="bodyMedium">{ask ? ASK[ask].body : ''}</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAsk(null)}>Cancel</Button>
            <Button textColor={ask && ASK[ask].danger ? t.custom.danger : undefined} loading={!!busy} disabled={!!busy} onPress={confirm}>{ask ? ASK[ask].action : ''}</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </Screen>
  );
}
