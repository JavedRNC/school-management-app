import { router } from 'expo-router';
import { View } from 'react-native';
import { Chip, Text, TextInput } from 'react-native-paper';

import { Row, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/feedback';
import { fieldOutline, space, Tone, useAppTheme } from '@/lib/theme';
import type { AdminSchoolRow, SchoolStatus } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export const STATUS_TONE: Record<SchoolStatus, Tone> = {
  active: 'success', free: 'primary', trial: 'warning', grace: 'warning', expired: 'danger', suspended: 'danger',
};

export const STATUS_LABEL: Record<SchoolStatus, string> = {
  active: 'Active', free: 'Free', trial: 'Trial', grace: 'Grace', expired: 'Expired', suspended: 'Suspended',
};

export function StatusChip({ status }: { status: SchoolStatus }) {
  return <ToneChip text={STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status] ?? 'neutral'} />;
}

export const rupees = (n: number | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function fmtDay(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTime(iso: string) {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function isoToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addMonths(base: string, months: number) {
  const d = base && /^\d{4}-\d{2}-\d{2}$/.test(base) ? new Date(base + 'T00:00:00') : new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const dateOk = (v: string) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

/** YYYY-MM-DD input with quick chips. Empty = not set. */
export function DateField({ label, value, onChange, quick = true }: { label: string; value: string; onChange: (v: string) => void; quick?: boolean }) {
  const today = isoToday();
  const base = value && value > today ? value : today;
  return (
    <View style={{ marginBottom: space.md }}>
      <TextInput mode="outlined" outlineStyle={fieldOutline} label={`${label} (YYYY-MM-DD)`} value={value} onChangeText={onChange} error={!dateOk(value)}
        left={<TextInput.Icon icon="calendar" />} placeholder="Not set" />
      {quick ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {[['+1 month', 1], ['+3 months', 3], ['+1 year', 12]].map(([l, m]) => (
            <Chip key={l} compact onPress={() => { haptic.tap(); onChange(addMonths(base, m as number)); }}>{l}</Chip>
          ))}
          <Chip compact icon="close" onPress={() => { haptic.tap(); onChange(''); }}>Clear</Chip>
        </View>
      ) : null}
    </View>
  );
}

export function useModules() {
  return useLoad(() => api<Record<string, string>>('/admin/modules'));
}

/** School list row → opens detail. */
export function SchoolRow({ s, divider = true }: { s: AdminSchoolRow; divider?: boolean }) {
  const t = useAppTheme();
  return (
    <Row title={s.name} divider={divider}
      subtitle={`${s.code} · ${s.plan ?? 'No plan'} · ${s.students} students · ${s.is_free ? 'Free' : `${rupees(s.monthly_amount)}/mo`}`}
      onPress={() => router.push({ pathname: '/admin-school/[id]', params: { id: String(s.id) } })}
      left={<View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: t.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="labelLarge" style={{ fontWeight: '700', color: t.colors.onPrimaryContainer }}>{s.code.slice(0, 3)}</Text>
      </View>}
      right={<StatusChip status={s.status} />} />
  );
}

export const ROLE_TONE: Record<string, Tone> = {
  admin: 'danger', principal: 'primary', vice_principal: 'primary', coordinator: 'primary', teacher: 'warning', student: 'success', parent: 'neutral',
};
