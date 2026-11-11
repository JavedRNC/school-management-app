import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { fmtDate, inr, KIND_ICON, MODE_ICON, MODE_LABEL, PAY_LABEL, PAY_TONE } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { FeeReceipt } from '@/lib/types';

import { Icon, ToneChip } from '../ui';

/** Ticket-style on-screen receipt. */
export function ReceiptCard({ r }: { r: FeeReceipt }) {
  const t = useAppTheme();
  const cancelled = r.status === 'cancelled';
  const ok = r.status === 'confirmed';
  return (
    <View style={{ borderRadius: radius.xl, backgroundColor: t.colors.elevation.level1, overflow: 'hidden',
      shadowColor: ok ? t.custom.success : '#000', shadowOpacity: ok ? 0.22 : 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}>
      <LinearGradient colors={[t.custom.heroStart, t.custom.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: space.lg }}>
        <Text variant="titleMedium" style={{ color: '#fff', fontWeight: '700' }} numberOfLines={2}>{r.school.name}</Text>
        {r.school.address ? <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.8)' }} numberOfLines={2}>{r.school.address}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md }}>
          <View>
            <Text variant="labelSmall" style={{ color: 'rgba(255,255,255,0.75)', letterSpacing: 2 }}>FEE RECEIPT</Text>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] }}>{r.receipt_no}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="labelSmall" style={{ color: 'rgba(255,255,255,0.75)' }}>{fmtDate(r.paid_on)}</Text>
            <Text variant="labelSmall" style={{ color: 'rgba(255,255,255,0.75)' }}>AY {r.academic_year}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={{ padding: space.lg }}>
        {ok ? (
          <View style={{ position: 'absolute', right: space.lg, top: space.md, borderWidth: 3, borderColor: t.custom.success, borderRadius: 8,
            paddingHorizontal: 10, paddingVertical: 2, transform: [{ rotate: '-12deg' }], opacity: 0.85 }}>
            <Text style={{ color: t.custom.success, fontWeight: '900', letterSpacing: 3, fontSize: 16 }}>PAID</Text>
          </View>
        ) : <ToneChip text={PAY_LABEL[r.status]} tone={PAY_TONE[r.status]} icon={cancelled ? 'cancel' : 'clock-outline'} />}
        {cancelled && r.cancel_reason ? (
          <Text variant="bodySmall" style={{ color: t.custom.danger, marginTop: 6 }}>Reason: {r.cancel_reason}</Text>
        ) : null}

        <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface, marginTop: ok ? 0 : space.sm, paddingRight: 90 }}>{r.student.name}</Text>
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
          Adm. {r.student.admission_no}{r.student.class_name ? ` · ${r.student.class_name}` : ''}{r.student.roll_no != null ? ` · Roll ${r.student.roll_no}` : ''}
        </Text>
        {r.parent_name ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Parent: {r.parent_name}</Text> : null}

        <Perforation />

        {r.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 }}>
            <Icon name={KIND_ICON[l.kind] ?? 'receipt-text-outline'} size={18} color={t.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" style={{ color: t.colors.onSurface }} numberOfLines={2}>{l.title}</Text>
              {l.amount < l.charge ? <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>Part of {inr(l.charge)}</Text> : null}
            </View>
            <Text variant="bodyMedium" style={{ fontWeight: '700', color: t.colors.onSurface, fontVariant: ['tabular-nums'] }}>{inr(l.amount)}</Text>
          </View>
        ))}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm, paddingTop: space.sm,
          borderTopWidth: 2, borderTopColor: t.colors.primary }}>
          <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>Total received</Text>
          <Text variant="headlineSmall" style={{ fontWeight: '900', color: cancelled ? t.colors.outline : t.colors.primary,
            textDecorationLine: cancelled ? 'line-through' : 'none' }}>{inr(r.amount)}</Text>
        </View>
        <View style={{ backgroundColor: t.custom.warningContainer, borderRadius: radius.md, padding: space.sm, marginTop: space.sm }}>
          <Text variant="bodySmall" style={{ color: t.custom.onWarningContainer, fontStyle: 'italic' }}>{r.amount_words}</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          <ToneChip text={MODE_LABEL[r.mode] ?? r.mode} icon={MODE_ICON[r.mode]} tone="primary" />
          {r.reference ? <ToneChip text={`Ref ${r.reference}`} tone="neutral" /> : null}
          <ToneChip text={r.balance_after > 0 ? `Balance ${inr(r.balance_after)}` : 'No dues left'} tone={r.balance_after > 0 ? 'warning' : 'success'} />
        </View>
        {r.note ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>Note: {r.note}</Text> : null}
        {r.received_by_name ? (
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>Received by {r.received_by_name}</Text>
        ) : null}
        {r.footer ? <Text variant="labelSmall" style={{ color: t.colors.outline, marginTop: space.md, textAlign: 'center' }}>{r.footer}</Text> : null}
      </View>
    </View>
  );
}

/** Dashed tear line with side notches. */
function Perforation() {
  const t = useAppTheme();
  return (
    <View style={{ marginHorizontal: -space.lg, marginVertical: space.md, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.background, marginLeft: -11 }} />
      <View style={{ flex: 1, borderTopWidth: 2, borderStyle: 'dashed', borderColor: t.colors.outlineVariant }} />
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.background, marginRight: -11 }} />
    </View>
  );
}
