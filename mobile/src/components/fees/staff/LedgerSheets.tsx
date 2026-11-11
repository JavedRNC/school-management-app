import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Checkbox, HelperText, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { FilterChips, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, inr, MODE_ICON, MODE_LABEL, MODE_REF } from '@/lib/fees';
import { useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { FeeItem, FeeReceipt, PayMode } from '@/lib/types';

import { ISO_RE, isoToday } from './common';

const MODES: PayMode[] = ['cash', 'upi', 'cheque', 'bank', 'online'];

/** Record a counter payment against selected dues → issues a receipt. */
export function RecordPaymentSheet({ visible, onDismiss, studentId, studentName, items, onDone }: {
  visible: boolean; onDismiss: () => void; studentId: number; studentName: string; items: FeeItem[]; onDone: () => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const pending = useMemo(() => items.filter((i) => i.balance > 0), [items]);
  const [sel, setSel] = useState<number[]>([]);
  const [amount, setAmount] = useState('');
  const [touchedAmount, setTouched] = useState(false);
  const [mode, setMode] = useState<PayMode>('cash');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(isoToday());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const def = pending.filter((i) => i.status === 'overdue' || i.status === 'due' || i.status === 'partial').map((i) => i.id);
    setSel(def.length ? def : pending.map((i) => i.id));
    setTouched(false); setMode('cash'); setRef(''); setDate(isoToday()); setNote('');
  }, [visible, pending]);

  const selTotal = pending.filter((i) => sel.includes(i.id)).reduce((s, i) => s + i.balance, 0);
  useEffect(() => { if (!touchedAmount) setAmount(selTotal ? String(Math.round(selTotal * 100) / 100) : ''); }, [selTotal, touchedAmount]);

  const amt = Number(amount);
  const amtErr = amount !== '' && (!(amt > 0) || amt > selTotal + 0.001) ? (amt > selTotal ? `More than selected dues (${inr(selTotal)})` : 'Enter a valid amount') : '';
  const refLabel = MODE_REF[mode];
  const needRef = mode === 'cheque' || mode === 'bank' || mode === 'upi';

  async function save() {
    if (!sel.length) return toast('Select at least one charge', { error: true });
    if (!(amt > 0) || amtErr) return toast(amtErr || 'Enter the amount received', { error: true });
    if (needRef && !ref.trim()) return toast(`${refLabel} is needed`, { error: true });
    if (!ISO_RE.test(date)) return toast('Date should be YYYY-MM-DD', { error: true });
    setBusy(true);
    try {
      const order = pending.filter((i) => sel.includes(i.id)).map((i) => i.id);
      const r = await api<FeeReceipt>('/fees/payments', {
        body: { student_id: studentId, amount: amt, mode, reference: ref.trim(), paid_on: date, item_ids: order, note: note.trim() },
      });
      toast(`Receipt ${r.receipt_no} issued · ${inr(r.amount)}`);
      onDismiss();
      onDone();
      router.push(`/more/fees/receipt/${r.id}` as never);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={`Record payment · ${studentName.split(' ')[0]}`}>
      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 4 }}>Paying for</Text>
      {pending.map((i) => {
        const on = sel.includes(i.id);
        return (
          <Checkbox.Item key={i.id} status={on ? 'checked' : 'unchecked'} mode="android" position="leading"
            onPress={() => setSel((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))}
            label={`${i.title}\n${inr(i.balance)}${i.paid ? ` left of ${inr(i.amount)}` : ''} · due ${fmtDate(i.due_date)}`}
            labelStyle={{ color: i.status === 'overdue' ? t.custom.danger : t.colors.onSurface, fontSize: 14, textAlign: 'left' }}
            style={{ paddingVertical: 2, paddingHorizontal: 0 }} />
        );
      })}
      <TextInput mode="outlined" label="Amount received (₹)" keyboardType="decimal-pad" value={amount}
        onChangeText={(v) => { setTouched(true); setAmount(v.replace(/[^0-9.]/g, '')); }} style={{ marginTop: space.sm }}
        left={<TextInput.Affix text="₹" />} right={touchedAmount ? <TextInput.Icon icon="restore" onPress={() => setTouched(false)} /> : undefined} />
      <HelperText type={amtErr ? 'error' : 'info'}>{amtErr || `Selected dues ${inr(selTotal)} · part payments are fine`}</HelperText>
      <FilterChips label="Mode" value={mode} onChange={setMode} options={MODES.map((m) => ({ label: MODE_LABEL[m], value: m, icon: MODE_ICON[m] }))} />
      {refLabel ? <TextInput mode="outlined" label={`${refLabel}${needRef ? '' : ' (optional)'}`} value={ref} onChangeText={setRef} autoCapitalize="characters" style={{ marginBottom: space.md }} /> : null}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <TextInput mode="outlined" label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} style={{ flex: 1 }} error={!!date && !ISO_RE.test(date)} />
        <Button mode="text" compact onPress={() => setDate(isoToday())} style={{ alignSelf: 'center' }}>Today</Button>
      </View>
      <TextInput mode="outlined" label="Note (optional)" value={note} onChangeText={setNote} style={{ marginTop: space.md }} />
      <Button mode="contained" icon="receipt-text-check-outline" onPress={save} loading={busy} disabled={busy}
        style={{ marginTop: space.lg }} contentStyle={{ paddingVertical: 6 }}>
        {amt > 0 ? `Receive ${inr(amt)} & issue receipt` : 'Issue receipt'}
      </Button>
    </Sheet>
  );
}

/** Add a one-off charge (fine, book fee…) to one student. */
export function AddChargeSheet({ visible, onDismiss, studentId, onDone }: { visible: boolean; onDismiss: () => void; studentId: number; onDone: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(isoToday());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setTitle(''); setAmount(''); setDue(isoToday()); } }, [visible]);
  async function save() {
    const a = Number(amount);
    if (title.trim().length < 2) return toast('Give the charge a name', { error: true });
    if (!(a > 0)) return toast('Enter a valid amount', { error: true });
    if (due && !ISO_RE.test(due)) return toast('Due date should be YYYY-MM-DD', { error: true });
    setBusy(true);
    try {
      await api('/fees/items', { body: { student_id: studentId, title: title.trim(), amount: a, due_date: due || null } });
      toast(`Charge added · ${inr(a)}`);
      onDismiss();
      onDone();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Add a charge">
      <FilterChips value={title} onChange={setTitle} options={['Late fee', 'Library fine', 'Books', 'Uniform', 'ID card'].map((x) => ({ label: x, value: x }))} />
      <TextInput mode="outlined" label="What is it for?" value={title} onChangeText={setTitle} style={{ marginBottom: space.md }} />
      <TextInput mode="outlined" label="Amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
        left={<TextInput.Affix text="₹" />} style={{ marginBottom: space.md }} />
      <TextInput mode="outlined" label="Due date (YYYY-MM-DD)" value={due} onChangeText={setDue} error={!!due && !ISO_RE.test(due)} />
      <Button mode="contained" icon="plus" onPress={save} loading={busy} disabled={busy} style={{ marginTop: space.lg }} contentStyle={{ paddingVertical: 6 }}>Add charge</Button>
    </Sheet>
  );
}

/** Concession / correction on one charge; 0 with nothing paid waives it. */
export function ConcessionSheet({ item, onDismiss, onDone }: { item: FeeItem | null; onDismiss: () => void; onDone: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (item) { setAmount(String(item.amount)); setReason(''); } }, [item]);
  if (!item) return null;
  const a = Number(amount);
  const err = amount === '' || isNaN(a) || a < 0 ? 'Enter a valid amount' : a < item.paid ? `${inr(item.paid)} is already paid — can't go lower` : '';
  async function save(target?: number) {
    if (!item) return;
    const v = target ?? a;
    if (target === undefined && err) return toast(err, { error: true });
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; waived: boolean }>(`/fees/items/${item.id}`, { method: 'PUT', body: { amount: v, reason: reason.trim() } });
      toast(r.waived ? `${item.title} waived` : `Updated to ${inr(v)}`);
      onDismiss();
      onDone();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={!!item} onDismiss={onDismiss} title="Concession / correction">
      <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{item.title}</Text>
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
        Charged {inr(item.amount)} · paid {inr(item.paid)} · due {fmtDate(item.due_date)}
      </Text>
      <TextInput mode="outlined" label="New amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
        left={<TextInput.Affix text="₹" />} error={!!err} />
      <HelperText type={err ? 'error' : 'info'}>{err || (a < item.amount ? `Concession of ${inr(item.amount - a)}` : ' ')}</HelperText>
      <TextInput mode="outlined" label="Reason (shown in audit log)" value={reason} onChangeText={setReason} />
      <Button mode="contained" icon="content-save-outline" onPress={() => save()} loading={busy} disabled={busy || !!err}
        style={{ marginTop: space.lg }} contentStyle={{ paddingVertical: 6 }}>Save</Button>
      {item.paid === 0 ? (
        <Button mode="text" icon="close-circle-outline" textColor={t.custom.danger} onPress={() => save(0)} disabled={busy} style={{ marginTop: space.sm }}>
          Waive this charge completely
        </Button>
      ) : null}
    </Sheet>
  );
}
