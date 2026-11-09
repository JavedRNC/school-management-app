import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { api } from '@/lib/api';
import { useModule } from '@/lib/auth';
import { childParams, useChild } from '@/lib/child';
import { fmtDate, inr } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeeLedger } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { FadeIn, IconBadge, PressScale, ToneChip } from '../ui';

/** Parent / student home: what's due and a Pay button. Hidden unless the Fees module is on. */
export function FeeDueCard() {
  const enabled = useModule('fees');
  if (!enabled) return null;
  return <Inner />;
}

function Inner() {
  const t = useAppTheme();
  const { studentId } = useChild();
  const { data } = useLoad(() => api<FeeLedger>('/fees/me', { params: childParams(studentId) }), [studentId]);
  if (!data) return null;
  const { outstanding, overdue, next_due } = data.totals;
  const open = () => router.push({ pathname: '/more/fees/my', params: studentId ? { student_id: String(studentId) } : {} } as never);
  const pending = data.payments.some((p) => p.status === 'pending');

  if (outstanding <= 0) {
    return (
      <FadeIn>
        <PressScale onPress={open}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.custom.successContainer,
            borderRadius: radius.xl, padding: space.md, marginBottom: space.md }}>
            <IconBadge icon="check-decagram" tone="success" size={36} />
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" style={{ fontWeight: '800', color: t.custom.onSuccessContainer }}>All fees paid ✓</Text>
              <Text variant="bodySmall" style={{ color: t.custom.onSuccessContainer }}>Tap to see receipts</Text>
            </View>
          </View>
        </PressScale>
      </FadeIn>
    );
  }

  const late = overdue > 0;
  return (
    <FadeIn>
      <PressScale onPress={open}>
        <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: space.lg, marginBottom: space.md,
          borderWidth: late ? 1.5 : 0, borderColor: t.custom.danger,
          shadowColor: late ? t.custom.danger : '#000', shadowOpacity: late ? 0.3 : 0.06, shadowRadius: late ? 16 : 10,
          shadowOffset: { width: 0, height: 4 }, elevation: late ? 6 : 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <IconBadge icon="cash-clock" tone={late ? 'danger' : 'warning'} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Fees due{data.student.name ? ` · ${data.student.name.split(' ')[0]}` : ''}</Text>
              <Text style={{ fontSize: 26, fontWeight: '900', color: late ? t.custom.danger : t.colors.onSurface }}>{inr(outstanding)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            {late ? <ToneChip text={`${inr(overdue)} overdue`} tone="danger" icon="alert-circle-outline" /> : null}
            {next_due ? <ToneChip text={`Due ${fmtDate(next_due)}`} tone="warning" icon="calendar-clock" /> : null}
            {pending ? <ToneChip text="Payment awaiting check" tone="primary" icon="clock-outline" /> : null}
          </View>
          <Button mode="contained" icon={data.upi?.enabled ? 'qrcode-scan' : 'receipt-text-outline'} onPress={open}
            style={{ marginTop: space.md }} buttonColor={late ? t.custom.danger : undefined}>
            {data.upi?.enabled ? 'Pay now' : 'View fees'}
          </Button>
        </View>
      </PressScale>
    </FadeIn>
  );
}
