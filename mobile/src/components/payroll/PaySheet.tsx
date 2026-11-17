import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { FilterChips, Sheet } from '@/components/ui';
import { useToast } from '@/lib/feedback';
import { isoToday, realDate, SALARY_MODES, type SalaryMode } from '@/lib/payroll';
import { space, useAppTheme } from '@/lib/theme';

/** Record how a salary (or all unpaid salaries of a month) was paid. Prangan only keeps the record. */
export function PaySheet({ visible, title, detail, month, monthLabel, onDismiss, submit, onDone }: {
  visible: boolean; title: string; detail: string; month: string; monthLabel: string; onDismiss: () => void;
  submit: (body: { paid_on: string; mode: SalaryMode; reference: string }) => Promise<unknown>; onDone: (result: unknown) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [on, setOn] = useState(isoToday());
  const [mode, setMode] = useState<SalaryMode>('bank');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setOn(isoToday()); setMode('bank'); setRef(''); } }, [visible]);
  const bad = !realDate(on) ? 'Type the date as YYYY-MM-DD' : on > isoToday() ? "The date can't be in the future" : on < `${month}-01` ? `The date can't be before ${monthLabel}` : null;
  async function save() {
    if (bad) return toast(bad, { error: true });
    setBusy(true);
    try {
      onDone(await submit({ paid_on: on, mode, reference: ref.trim() }));
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title}>
      <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>{detail} Pay the money yourself, then save it here. Prangan only keeps the record.</Text>
      <TextInput mode="outlined" dense label="Paid on (YYYY-MM-DD)" value={on} onChangeText={setOn} error={!!bad} keyboardType="numbers-and-punctuation" />
      {bad ? <Text variant="bodySmall" style={{ color: t.custom.danger, marginTop: 4 }}>{bad}</Text> : null}
      <View style={{ height: space.md }} />
      <FilterChips label="Paid by" value={mode} onChange={setMode} options={SALARY_MODES.map((m) => ({ label: m.label, value: m.value, icon: m.icon }))} />
      <TextInput mode="outlined" dense label="Reference (optional)" value={ref} onChangeText={setRef} maxLength={80} />
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        <Button mode="outlined" style={{ flex: 1 }} onPress={onDismiss}>Cancel</Button>
        <Button mode="contained" style={{ flex: 1 }} loading={busy} disabled={busy || !!bad} onPress={save}>Mark as paid</Button>
      </View>
    </Sheet>
  );
}
