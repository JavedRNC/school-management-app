import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';
import QRCode from 'react-native-qrcode-svg';

import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { inr, upiLink } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';

import { Icon, Sheet } from '../ui';

const UTR_RE = /^[A-Za-z0-9]{6,30}$/;

/** UPI pay: QR + deep link → parent enters UTR → school confirms and issues the receipt. */
export function PaySheet({ visible, onDismiss, onDone, studentId, studentName, amount, itemIds, upiId, payee }: {
  visible: boolean; onDismiss: () => void; onDone: () => void; studentId: number; studentName: string;
  amount: number; itemIds: number[]; upiId: string; payee: string;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) { setStep(1); setUtr(''); } }, [visible]);

  const link = upiLink({ upiId, payee, amount, note: `Fees ${studentName}`.slice(0, 60) });
  const clean = utr.replace(/\s/g, '');
  const bad = clean.length > 0 && !UTR_RE.test(clean);

  async function openApp() {
    try {
      await Linking.openURL(link);
      haptic.light();
      setTimeout(() => setStep(2), 600);
    } catch {
      toast('No UPI app found — scan the QR from another phone or app', { error: true });
    }
  }

  async function submit() {
    if (!UTR_RE.test(clean)) return toast('Enter the 6–30 character UPI reference (UTR)', { error: true });
    setBusy(true);
    try {
      await api('/fees/me/claim', { body: { student_id: studentId, amount, reference: clean, item_ids: itemIds } });
      toast('Sent to school for confirmation');
      onDone();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={step === 1 ? 'Pay by UPI' : 'Confirm your payment'}>
      <View style={{ alignItems: 'center', marginBottom: space.md }}>
        <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Amount for {studentName}</Text>
        <Text style={{ fontSize: 38, fontWeight: '700', color: t.colors.primary }}>{inr(amount)}</Text>
      </View>
      {step === 1 ? (
        <>
          <View style={{ alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.xl, padding: space.lg, alignSelf: 'center',
            shadowColor: t.colors.primary, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
            <QRCode value={link} size={196} color="#123A6E" backgroundColor="#fff" />
          </View>
          <Text variant="titleSmall" style={{ textAlign: 'center', fontWeight: '700', marginTop: space.md, color: t.colors.onSurface }}>{payee}</Text>
          <Text variant="bodyMedium" style={{ textAlign: 'center', color: t.colors.onSurfaceVariant }} selectable>{upiId}</Text>
          <Text variant="bodySmall" style={{ textAlign: 'center', color: t.colors.outline, marginVertical: space.md }}>
            Scan with any UPI app (GPay, PhonePe, Paytm, BHIM) or open one on this phone.
          </Text>
          <Button mode="contained" icon="cellphone-arrow-down" onPress={openApp} contentStyle={{ paddingVertical: 6 }}>Open UPI app</Button>
          <Button mode="text" icon="check-circle-outline" onPress={() => { haptic.tap(); setStep(2); }} style={{ marginTop: space.sm }}>
            I've paid — enter reference
          </Button>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm, backgroundColor: t.colors.secondaryContainer, borderRadius: radius.lg, padding: space.md, marginBottom: space.md }}>
            <Icon name="information-outline" size={20} color={t.colors.onSecondaryContainer} />
            <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onSecondaryContainer }}>
              Find the 12-digit UPI reference / UTR in your UPI app's payment details. The school checks it and then issues your receipt.
            </Text>
          </View>
          <TextInput mode="outlined" label="UPI reference / UTR" value={utr} onChangeText={setUtr} autoCapitalize="characters"
            keyboardType="default" maxLength={34} error={bad} left={<TextInput.Icon icon="pound" />} />
          <HelperText type={bad ? 'error' : 'info'} visible>{bad ? 'Only letters and numbers, 6–30 characters' : 'Example: 634512987745'}</HelperText>
          <Button mode="contained" icon="send-check" onPress={submit} loading={busy} disabled={busy || !clean} contentStyle={{ paddingVertical: 6 }}>
            Submit for confirmation
          </Button>
          <Button mode="text" icon="qrcode" onPress={() => setStep(1)} style={{ marginTop: space.sm }}>Back to QR</Button>
        </>
      )}
    </Sheet>
  );
}
