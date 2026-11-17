import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, SegmentedButtons, Switch, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { LinesEditor, NotInPlan, roleName } from '@/components/payroll/parts';
import { StatusBanner } from '@/components/StatusBanner';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Row, Screen, SectionTitle, Sheet, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { inr, shiftMonth } from '@/lib/fees';
import { amount, cleanLines, draftTotal, linesError, toDraft, type LineDraft, type PayrollConfig, type PayrollRun, type RunDetail, type StaffSalaries, type StaffSalary } from '@/lib/payroll';
import { space, useAppTheme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type Tab = 'months' | 'salaries' | 'setup';

/** Payroll for the principal: monthly payroll, salaries and settings. Everyone else goes to their own payslips. */
export default function PayrollScreen() {
  const { user, school } = useAuth();
  const enabled = useModule('payroll');
  const [tab, setTab] = useState<Tab>('months');
  if (!enabled) return <NotInPlan title="Payroll" />;
  if (user?.role !== 'principal') return <Redirect href={'/more/payroll/my' as never} />;
  const canWrite = school?.can_write !== false;
  return (
    <Screen header={<Hero title="Payroll" subtitle="Salaries and payslips for your staff" compact />}>
      <StatusBanner />
      <SegmentedButtons value={tab} onValueChange={(v) => { haptic.tap(); setTab(v as Tab); }} density="small" style={{ marginBottom: space.md }}
        buttons={[{ value: 'months', label: 'Months', icon: 'calendar-month-outline' }, { value: 'salaries', label: 'Salaries', icon: 'account-cash-outline' }, { value: 'setup', label: 'Setup', icon: 'cog-outline' }]} />
      {tab === 'months' ? <Months canWrite={canWrite} onSalaries={() => setTab('salaries')} /> : tab === 'salaries' ? <Salaries canWrite={canWrite} /> : <Setup canWrite={canWrite} />}
    </Screen>
  );
}

// ---------------------------------------------------------------- months
function Months({ canWrite, onSalaries }: { canWrite: boolean; onSalaries: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<{ runs: PayrollRun[]; this_month: string }>('/payroll/runs'), []);
  const [busy, setBusy] = useState<string | null>(null);
  if (loading && !data) return <LoadingCards count={2} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const have = new Set(data.runs.map((r) => r.month));
  const open = [data.this_month, shiftMonth(data.this_month, -1)].filter((m) => !have.has(m));
  async function prepare(month: string) {
    setBusy(month);
    try {
      const r = await api<RunDetail>('/payroll/runs', { body: { month } });
      toast(`Payroll for ${r.run.month_label} is ready to check`);
      router.push(`/more/payroll/run/${r.run.id}` as never);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }
  const label = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return (
    <>
      {canWrite && open.length ? (
        <FadeIn>
          <Panel title="Prepare payroll" subtitle="Works out everyone's pay for the month. You check it before it is locked." icon="calculator-variant-outline">
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {open.map((m, i) => (
                <Button key={m} mode={i === 0 ? 'contained' : 'contained-tonal'} icon="plus" loading={busy === m} disabled={!!busy} onPress={() => prepare(m)}>{label(m)}</Button>
              ))}
            </View>
          </Panel>
        </FadeIn>
      ) : null}
      {!data.runs.length ? <EmptyState icon="cash-clock" title="No payroll yet" text="Set salaries first, then prepare the first month." action="Go to salaries" onAction={onSalaries} /> : (
        <FadeIn index={1}>
          <SectionTitle title="Months" />
          <Panel style={{ paddingVertical: 0 }}>
            {data.runs.map((r, i) => (
              <Row key={r.id} title={r.month_label} subtitle={`${r.people} people · net ${inr(r.net)}${r.status === 'final' && r.unpaid_count ? ` · ${inr(r.unpaid_amount)} to pay` : ''}`}
                divider={i < data.runs.length - 1} onPress={() => router.push(`/more/payroll/run/${r.id}` as never)}
                right={r.status === 'draft' ? <ToneChip text="Being prepared" tone="neutral" /> : r.unpaid_count ? <ToneChip text={`${r.unpaid_count} unpaid`} tone="warning" /> : <ToneChip text="All paid" tone="success" />} />
            ))}
          </Panel>
        </FadeIn>
      )}
      {error ? <Text variant="bodySmall" style={{ color: t.custom.danger, marginTop: space.sm }}>{error}</Text> : null}
    </>
  );
}

// ---------------------------------------------------------------- salaries
function Salaries({ canWrite }: { canWrite: boolean }) {
  const t = useAppTheme();
  const { data, error, loading, reload } = useLoad(() => api<StaffSalaries>('/payroll/staff'), []);
  const [edit, setEdit] = useState<StaffSalary | null>(null);
  if (loading && !data) return <LoadingCards count={3} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <>
      <FadeIn>
        <Panel>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}><Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Monthly net pay</Text>
              <Text variant="headlineSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{inr(data.monthly_net)}</Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>With a salary</Text>
              <Text variant="headlineSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{data.with_salary} of {data.people}</Text></View>
          </View>
        </Panel>
      </FadeIn>
      {!data.rows.length ? <EmptyState icon="account-off-outline" title="No staff accounts yet" text="Add teachers under People first." /> : (
        <FadeIn index={1}>
          <Panel style={{ paddingVertical: 0 }}>
            {data.rows.map((r, i) => (
              <Row key={r.user_id} title={r.name} subtitle={`${roleName(r.role)} · ${r.login_id}`} divider={i < data.rows.length - 1} onPress={() => setEdit(r)}
                left={<UserAvatar name={r.name} size={38} />}
                right={r.salary && r.salary.gross > 0
                  ? <View style={{ alignItems: 'flex-end' }}><Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{inr(r.salary.net)}</Text><Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>a month</Text></View>
                  : <ToneChip text="Not set" tone="neutral" />} />
            ))}
          </Panel>
        </FadeIn>
      )}
      {edit ? <SalarySheet row={edit} canWrite={canWrite} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} /> : null}
    </>
  );
}

function SalarySheet({ row, canWrite, onClose, onSaved }: { row: StaffSalary; canWrite: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const s = row.salary;
  const [basic, setBasic] = useState(s ? String(s.basic) : '');
  const [allow, setAllow] = useState<LineDraft[]>(toDraft(s?.allowances ?? []));
  const [ded, setDed] = useState<LineDraft[]>(toDraft(s?.deductions ?? []));
  const [busy, setBusy] = useState(false);
  const b = basic.trim() === '' ? 0 : amount(basic);
  const gross = (b ?? 0) + draftTotal(allow);
  const dd = draftTotal(ded);
  const bad = b === null ? 'Enter the basic pay as a number' : b > 10000000 ? 'That basic pay is too large'
    : linesError(allow, 'allowance') ?? linesError(ded, 'deduction') ?? (dd > gross ? "Deductions can't be more than the pay" : null);
  async function save() {
    if (bad) return toast(bad, { error: true });
    setBusy(true);
    try {
      await api(`/payroll/staff/${row.user_id}`, { method: 'PUT', body: { basic: b ?? 0, allowances: cleanLines(allow), deductions: cleanLines(ded), note: s?.note ?? '' } });
      toast(`Salary saved for ${row.name}`);
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible onDismiss={onClose} title={`Salary · ${row.name}`}>
      <TextInput mode="outlined" dense label="Basic pay a month (₹)" value={basic} keyboardType="decimal-pad" disabled={!canWrite}
        onChangeText={(v) => setBasic(v.replace(/[^\d.]/g, '').slice(0, 11))} />
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4, marginBottom: space.md }}>Leave empty or 0 to keep this person out of payroll.</Text>
      {canWrite ? <>
        <LinesEditor title="Allowances" rows={allow} onChange={setAllow} addLabel="Add an allowance" hint="Paid every month, like house rent or travel." />
        <LinesEditor title="Deductions" rows={ded} onChange={setDed} addLabel="Add a deduction" hint="Cut every month, like provident fund." />
      </> : null}
      <Text variant="titleMedium" style={{ fontWeight: '700', color: bad ? t.custom.danger : t.colors.onSurface }}>{bad ?? `Net pay ${inr(Math.max(gross - dd, 0))} a month`}</Text>
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4 }}>Applies from the next payroll you prepare. Locked payslips never change.</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        <Button mode="outlined" style={{ flex: 1 }} onPress={onClose}>{canWrite ? 'Cancel' : 'Close'}</Button>
        {canWrite ? <Button mode="contained" style={{ flex: 1 }} loading={busy} disabled={busy || !!bad} onPress={save}>Save salary</Button> : null}
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- setup
function Setup({ canWrite }: { canWrite: boolean }) {
  const t = useAppTheme();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api<PayrollConfig>('/payroll/config'), []);
  const [lop, setLop] = useState(false);
  const [basis, setBasis] = useState<'calendar' | 'working'>('calendar');
  const [prefix, setPrefix] = useState('SAL');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setLop(data.lop_enabled); setBasis(data.lop_basis); setPrefix(data.slip_prefix); } }, [data]);
  if (loading && !data) return <LoadingCards count={2} />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const bad = !/^[A-Za-z0-9/-]{1,12}$/.test(prefix) ? 'Use up to 12 letters, numbers, - or /' : null;
  async function save() {
    if (bad) return toast(bad, { error: true });
    setBusy(true);
    try {
      setData(await api<PayrollConfig>('/payroll/config', { method: 'PUT', body: { lop_enabled: lop, lop_basis: basis, slip_prefix: prefix } }));
      toast('Payroll settings saved');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <FadeIn>
      <Panel title="Absent days" icon="calendar-remove-outline">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
          <Text variant="bodyLarge" style={{ flex: 1, color: t.colors.onSurface }}>Cut pay for absent days without approved leave</Text>
          <Switch value={lop} onValueChange={setLop} disabled={!canWrite || !data.attendance_available} />
        </View>
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4, marginBottom: space.md }}>
          {data.attendance_available ? 'Uses staff attendance: a school day with no check-in and no approved leave counts as absent. You can still change the days on any payslip before locking.'
            : "This needs Staff attendance, which is not part of your school's plan. You can still type unpaid days on a payslip by hand."}
        </Text>
        <FilterChips label="One day's pay is monthly pay divided by" value={basis} onChange={(v) => canWrite && setBasis(v)}
          options={[{ label: 'Days in the month', value: 'calendar' as const }, { label: 'School days', value: 'working' as const }]} />
      </Panel>
      <Panel title="Payslip numbers" icon="pound">
        <TextInput mode="outlined" dense label="Starts with" value={prefix} disabled={!canWrite} error={!!bad} autoCapitalize="characters" style={{ marginTop: space.sm }}
          onChangeText={(v) => setPrefix(v.toUpperCase().slice(0, 12))} />
        <Text variant="bodySmall" style={{ color: bad ? t.custom.danger : t.colors.onSurfaceVariant, marginTop: 4 }}>{bad ?? `Example: ${prefix}/202611/001`}</Text>
      </Panel>
      {canWrite ? <Button mode="contained" style={{ marginTop: space.md }} contentStyle={{ paddingVertical: 6 }} loading={busy} disabled={busy || !!bad} onPress={save}>Save settings</Button> : null}
    </FadeIn>
  );
}
