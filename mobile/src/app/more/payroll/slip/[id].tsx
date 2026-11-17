import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { LinesEditor, NotInPlan, PayslipCard } from '@/components/payroll/parts';
import { savePayslip, sharePayslip } from '@/components/payroll/payslipHtml';
import { PaySheet } from '@/components/payroll/PaySheet';
import { StatusBanner } from '@/components/StatusBanner';
import { ErrorState, FadeIn, Hero, LoadingCards, Screen, Sheet, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useModule } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { inr } from '@/lib/fees';
import { amount, cleanLines, draftTotal, linesError, linesTotal, lopBasis, toDraft, type LineDraft, type Payslip, type SlipSchool } from '@/lib/payroll';
import { space, useAppTheme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

/** One payslip: staff read and save their own; the principal can also adjust a draft, mark it paid or undo a payment. */
export default function PayslipScreen() {
  const enabled = useModule('payroll');
  if (!enabled) return <NotInPlan title="Payslip" />;
  return <Slip />;
}

function Slip() {
  const t = useAppTheme();
  const toast = useToast();
  const { user, school } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload, refresh, refreshing } = useLoad(() => api<{ school: SlipSchool; payslip: Payslip }>(`/payroll/payslips/${id}`), [id]);
  const [busy, setBusy] = useState<'share' | 'save' | 'undo' | 'edit' | null>(null);
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [undo, setUndo] = useState(false);
  const [reason, setReason] = useState('');
  const p = data?.payslip;
  const manage = user?.role === 'principal' && school?.can_write !== false;
  const draft = p?.run_status === 'draft';

  async function file(kind: 'share' | 'save') {
    if (!data) return;
    setBusy(kind);
    try {
      if (kind === 'save') {
        const saved = await savePayslip(data.payslip, data.school);
        toast(saved?.folder ? `Payslip saved in ${saved.folder}` : 'Payslip PDF ready');
      } else {
        await sharePayslip(data.payslip, data.school);
      }
    } catch (e) {
      toast((e as Error).message || 'Could not create the PDF', { error: true });
    } finally {
      setBusy(null);
    }
  }

  async function doUndo() {
    if (!p) return;
    if (reason.trim().length < 3) return toast('Give a reason (kept in the activity log)', { error: true });
    setBusy('undo');
    try {
      await api(`/payroll/payslips/${p.id}/undo-payment`, { body: { reason: reason.trim() } });
      toast('Payment undone. The salary is unpaid again.');
      setUndo(false);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="Payslip" subtitle={p ? `${p.name} · ${p.month_label}` : undefined} compact />}>
      <StatusBanner />
      {loading && !data ? <LoadingCards count={2} /> : null}
      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && p ? (
        <>
          <FadeIn><PayslipCard p={p} school={data.school} /></FadeIn>
          <FadeIn index={1}>
            {manage && draft ? (
              <Button mode="contained" icon="pencil-outline" style={{ marginTop: space.lg }} contentStyle={{ paddingVertical: 6 }} onPress={() => setEdit(true)}>Change this month's payslip</Button>
            ) : null}
            {manage && !draft && p.status !== 'paid' ? (
              <Button mode="contained" icon="cash-check" style={{ marginTop: space.lg }} contentStyle={{ paddingVertical: 6 }} onPress={() => setPay(true)}>Mark as paid</Button>
            ) : null}
            {!draft ? (
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                <Button mode="contained-tonal" icon="download" style={{ flex: 1 }} contentStyle={{ paddingVertical: 6 }} loading={busy === 'save'} disabled={!!busy} onPress={() => file('save')}>Save PDF</Button>
                <Button mode="contained-tonal" icon="share-variant" style={{ flex: 1 }} contentStyle={{ paddingVertical: 6 }} loading={busy === 'share'} disabled={!!busy} onPress={() => file('share')}>Share PDF</Button>
              </View>
            ) : null}
            {manage && p.status === 'paid' ? (
              <Button mode="text" textColor={t.custom.danger} style={{ marginTop: space.sm }} onPress={() => { setReason(''); setUndo(true); }}>Undo payment</Button>
            ) : null}
          </FadeIn>
          {edit ? <EditSheet p={p} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} /> : null}
          <PaySheet visible={pay} title={`Mark ${p.name}'s salary as paid`} detail={`Net pay ${inr(p.net)}.`} month={p.month} monthLabel={p.month_label}
            onDismiss={() => setPay(false)} submit={(body) => api(`/payroll/payslips/${p.id}/pay`, { body })}
            onDone={() => { setPay(false); toast(`${p.name}'s salary marked as paid`); reload(); }} />
        </>
      ) : null}
      {error && data ? <Text variant="bodySmall" style={{ color: t.custom.danger, marginTop: space.sm }}>{error}</Text> : null}

      <TopLayer visible={undo} onDismiss={() => setUndo(false)}>
        <Dialog visible={undo} onDismiss={() => setUndo(false)}>
          <Dialog.Icon icon="cash-refund" />
          <Dialog.Title style={{ textAlign: 'center' }}>Undo this payment?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: space.md }}>The salary goes back to "Not paid". The reason is kept in the activity log.</Text>
            <TextInput mode="outlined" label="Reason" value={reason} onChangeText={setReason} maxLength={300} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setUndo(false)}>Keep it</Button>
            <Button textColor={t.custom.danger} onPress={doUndo} loading={busy === 'undo'} disabled={busy === 'undo'}>Undo payment</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </Screen>
  );
}

function EditSheet({ p: s, onClose, onSaved }: { p: Payslip; onClose: () => void; onSaved: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [earn, setEarn] = useState<LineDraft[]>(toDraft(s.extra_earnings));
  const [ded, setDed] = useState<LineDraft[]>(toDraft(s.extra_deductions));
  const [lop, setLop] = useState(String(s.lop_days));
  const [note, setNote] = useState(s.note);
  const [saving, setSaving] = useState(false);
  const basis = lopBasis({ lop_basis: s.lop_basis, days_in_month: s.days_in_month, working_days: s.working_days });
  const days = amount(lop);
  const fixed = s.basic + linesTotal(s.allowances);
  const cut = basis && days ? Math.round((fixed * days) / basis) : 0;
  const net = fixed + draftTotal(earn) - linesTotal(s.deductions) - draftTotal(ded) - cut;
  const bad = linesError(earn, 'extra payment') ?? linesError(ded, 'deduction')
    ?? (days === null ? 'Enter the unpaid days as a number' : days > basis ? `Unpaid days can't be more than ${basis}` : (days * 2) % 1 !== 0 ? 'Use whole or half days' : net < 0 ? "Deductions can't be more than the pay" : null);
  async function save() {
    if (bad) return toast(bad, { error: true });
    setSaving(true);
    try {
      await api(`/payroll/payslips/${s.id}`, { method: 'PUT', body: { lop_days: days, extra_earnings: cleanLines(earn), extra_deductions: cleanLines(ded), note: note.trim() } });
      toast('Payslip saved');
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Sheet visible onDismiss={onClose} title={`${s.name} · ${s.month_label}`}>
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
        Basic pay, allowances and regular deductions come from this person's salary. Add anything for this month only here.
      </Text>
      <LinesEditor title="Extra payments" rows={earn} onChange={setEarn} addLabel="Add an extra payment" />
      <LinesEditor title="Extra deductions" rows={ded} onChange={setDed} addLabel="Add a deduction" />
      <TextInput mode="outlined" dense label="Unpaid days" value={lop} keyboardType="decimal-pad" onChangeText={(v) => setLop(v.replace(/[^\d.]/g, '').slice(0, 4))} />
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4, marginBottom: space.md }}>
        One day cuts {inr(basis ? Math.round(fixed / basis) : 0)}.{cut ? ` Cut now: ${inr(cut)}.` : ''}
      </Text>
      <TextInput mode="outlined" dense label="Note on the payslip (optional)" value={note} onChangeText={setNote} maxLength={300} />
      <Text variant="titleMedium" style={{ fontWeight: '700', marginTop: space.md, color: bad ? t.custom.danger : t.colors.onSurface }}>{bad ?? `Net pay ${inr(net)}`}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Button mode="outlined" style={{ flex: 1 }} onPress={onClose}>Cancel</Button>
        <Button mode="contained" style={{ flex: 1 }} loading={saving} disabled={saving || !!bad} onPress={save}>Save payslip</Button>
      </View>
    </Sheet>
  );
}
