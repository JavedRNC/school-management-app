// Small pieces shared by the payroll screens: the line editor, the payslip card and the "module off / no access" screens.
import { View } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { EmptyState, Hero, Panel, Screen, ToneChip } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/auth';
import { fmtDate, inr } from '@/lib/fees';
import { salaryModeLabel, type LineDraft, type Payslip, type SlipSchool } from '@/lib/payroll';
import { space, useAppTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';

import { slipLines } from './payslipHtml';

export const roleName = (r: string) => ROLE_LABEL[r as Role] ?? r;

export function NotInPlan({ title }: { title: string }) {
  return (
    <Screen header={<Hero title={title} compact />}>
      <EmptyState icon="cash-lock" title="Not in your plan" text="Payroll is not part of your school's plan. Ask your principal or contact support to add it." />
    </Screen>
  );
}

export function LinesEditor({ title, rows, onChange, addLabel, hint }: { title: string; rows: LineDraft[]; onChange: (r: LineDraft[]) => void; addLabel: string; hint?: string }) {
  const t = useAppTheme();
  return (
    <View style={{ marginBottom: space.md }}>
      <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{title}</Text>
      {hint ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: 4 }}>{hint}</Text> : null}
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs }}>
          <TextInput mode="outlined" dense label="Name" value={r.name} maxLength={40} style={{ flex: 1.4 }}
            onChangeText={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
          <TextInput mode="outlined" dense label="₹" value={r.amount} keyboardType="decimal-pad" style={{ flex: 1 }}
            onChangeText={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, amount: v.replace(/[^\d.]/g, '').slice(0, 11) } : x)))} />
          <IconButton icon="close" size={18} onPress={() => onChange(rows.filter((_, j) => j !== i))} accessibilityLabel={`Remove ${r.name || `line ${i + 1}`}`} />
        </View>
      ))}
      {rows.length < 12 ? <Button compact icon="plus" mode="text" style={{ alignSelf: 'flex-start', marginTop: 2 }} onPress={() => onChange([...rows, { name: '', amount: '' }])}>{addLabel}</Button> : null}
    </View>
  );
}

export function SlipStatus({ p }: { p: Pick<Payslip, 'status' | 'run_status' | 'paid_on'> }) {
  if (p.run_status === 'draft') return <ToneChip text="Draft" tone="neutral" icon="pencil-outline" />;
  return p.status === 'paid' ? <ToneChip text="Paid" tone="success" icon="check-circle-outline" /> : <ToneChip text="Not paid" tone="warning" icon="clock-outline" />;
}

/** The payslip as it reads on paper: who, earnings, deductions, net pay, how it was paid. */
export function PayslipCard({ p, school }: { p: Payslip; school: SlipSchool }) {
  const t = useAppTheme();
  const { earnings, deductions } = slipLines(p);
  const line = (l: { name: string; amount: number }, i: number, minus = false) => (
    <View key={`${l.name}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
      <Text variant="bodyMedium" style={{ color: t.colors.onSurface, flex: 1 }}>{l.name}</Text>
      <Text variant="bodyMedium" style={{ color: minus ? t.custom.danger : t.colors.onSurface, fontVariant: ['tabular-nums'] }}>{minus ? '− ' : ''}{inr(l.amount)}</Text>
    </View>
  );
  const head = (label: string, total: number) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, paddingBottom: 4, borderBottomWidth: 1, borderColor: t.colors.outlineVariant }}>
      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>{label}</Text>
      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>{inr(total)}</Text>
    </View>
  );
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>{school.name}</Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Payslip for {p.month_label}{p.slip_no ? ` · ${p.slip_no}` : ''}</Text>
        </View>
        <SlipStatus p={p} />
      </View>
      <Text variant="bodyMedium" style={{ marginTop: space.md, color: t.colors.onSurface, fontWeight: '600' }}>{p.name}</Text>
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{roleName(p.role)} · {p.login_id}</Text>
      {head('Earnings', p.gross)}
      {earnings.map((l, i) => line(l, i))}
      {deductions.length ? head('Deductions', p.total_deductions) : null}
      {deductions.map((l, i) => line(l, i, true))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.md, paddingTop: space.sm, borderTopWidth: 2, borderColor: t.colors.primary }}>
        <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>Net pay</Text>
        <Text variant="headlineSmall" style={{ fontWeight: '800', color: t.colors.primary, fontVariant: ['tabular-nums'] }}>{inr(p.net)}</Text>
      </View>
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
        {p.status === 'paid' ? `Paid on ${fmtDate(p.paid_on)} by ${salaryModeLabel(p.mode).toLowerCase()}${p.reference ? ` · ${p.reference}` : ''}` : p.run_status === 'draft' ? 'Not final yet.' : 'Not paid yet.'}
      </Text>
      {p.note ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 2 }}>{p.note}</Text> : null}
    </Panel>
  );
}
