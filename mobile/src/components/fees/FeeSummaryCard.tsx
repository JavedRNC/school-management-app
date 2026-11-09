import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { api } from '@/lib/api';
import { useCan, useModule } from '@/lib/auth';
import { inr, inrShort } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeeSummary } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { FadeIn, Icon, IconBadge, PressScale, SectionTitle } from '../ui';

/** Principal / VP home: today's collection, month progress, defaulters and UPI checks. */
export function FeeSummaryCard() {
  const enabled = useModule('fees');
  const can = useCan('fees', 'view');
  if (!enabled || !can) return null;
  return <Inner />;
}

function Inner() {
  const t = useAppTheme();
  const { data } = useLoad(() => api<FeeSummary>('/fees/summary'), []);
  if (!data) return null;
  const pct = data.collection_pct ?? 0;
  const open = (path = '/more/fees') => router.push(path as never);
  return (
    <FadeIn>
      <SectionTitle title="Fees" action="Open" onAction={() => open()} />
      <PressScale onPress={() => open()}>
        <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: space.lg,
          shadowColor: t.colors.primary, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
          {!data.configured ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <IconBadge icon="cash-plus" />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '800', color: t.colors.onSurface }}>Set up fees</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Add the monthly fee to start billing and receipts</Text>
              </View>
              <Icon name="chevron-right" size={22} color={t.colors.outline} />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>Collected today</Text>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: t.custom.success }}>{inr(data.collected_today)}</Text>
                  <Text variant="labelSmall" style={{ color: t.colors.outline }}>{data.receipts_today} receipt{data.receipts_today === 1 ? '' : 's'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>{data.period_label}</Text>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: t.colors.onSurface }}>{inrShort(data.collected_month)}</Text>
                  <Text variant="labelSmall" style={{ color: t.colors.outline }}>of {inrShort(data.expected_month)} billed</Text>
                </View>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: t.custom.chartTrack, marginTop: space.md, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(pct, 100)}%`, height: 8, borderRadius: 4,
                  backgroundColor: pct >= 75 ? t.custom.success : pct >= 40 ? t.custom.amber : t.custom.danger }} />
              </View>
              <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4 }}>
                {data.collection_pct == null ? 'Nothing billed this month' : `${pct}% of this month's dues settled`}
              </Text>
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                <Pill icon="account-alert-outline" label="Defaulters" value={String(data.defaulters)} tone={data.defaulters ? 'danger' : 'success'}
                  onPress={() => open('/more/fees/students?status=overdue')} />
                <Pill icon="cash-clock" label="Overdue" value={inrShort(data.overdue)} tone={data.overdue ? 'warning' : 'success'} onPress={() => open('/more/fees/students?status=overdue')} />
                <Pill icon="qrcode-scan" label="UPI checks" value={String(data.pending_claims)} tone={data.pending_claims ? 'primary' : 'neutral'}
                  glow={data.pending_claims > 0} onPress={() => open('/more/fees/claims')} />
              </View>
            </>
          )}
        </View>
      </PressScale>
    </FadeIn>
  );
}

function Pill({ icon, label, value, tone, onPress, glow }: {
  icon: 'account-alert-outline' | 'cash-clock' | 'qrcode-scan'; label: string; value: string;
  tone: 'danger' | 'warning' | 'success' | 'primary' | 'neutral'; onPress: () => void; glow?: boolean;
}) {
  const t = useAppTheme();
  const bg = { danger: t.custom.dangerContainer, warning: t.custom.warningContainer, success: t.custom.successContainer,
    primary: t.colors.primaryContainer, neutral: t.colors.surfaceVariant }[tone];
  const fg = { danger: t.custom.onDangerContainer, warning: t.custom.onWarningContainer, success: t.custom.onSuccessContainer,
    primary: t.colors.onPrimaryContainer, neutral: t.colors.onSurfaceVariant }[tone];
  return (
    <PressScale onPress={onPress} style={{ flex: 1 }}>
      <View style={{ backgroundColor: bg, borderRadius: radius.lg, padding: space.sm, alignItems: 'center',
        shadowColor: t.colors.primary, shadowOpacity: glow ? 0.45 : 0, shadowRadius: glow ? 10 : 0, elevation: glow ? 5 : 0 }}>
        <Icon name={icon} size={18} color={fg} />
        <Text style={{ color: fg, fontWeight: '900', fontSize: 16 }}>{value}</Text>
        <Text variant="labelSmall" style={{ color: fg }} numberOfLines={1}>{label}</Text>
      </View>
    </PressScale>
  );
}
