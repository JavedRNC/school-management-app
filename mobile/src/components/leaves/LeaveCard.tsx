import { View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';

import { FadeIn, Icon, ToneChip, UserAvatar } from '@/components/ui';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { LeaveRequest } from '@/lib/types';

import { daysLabel, fmtRange, STATUS_ICON, STATUS_LABEL, STATUS_TONE, TYPE_ICON, TYPE_LABEL } from './common';

/** One leave request. `showPerson` for inbox/children lists; actions passed by the screen. */
export function LeaveCard({ lr, index = 0, showPerson, onApprove, onReject, onCancel, busy, disabled }: {
  lr: LeaveRequest; index?: number; showPerson?: boolean;
  onApprove?: () => void; onReject?: () => void; onCancel?: () => void; busy?: boolean; disabled?: boolean;
}) {
  const t = useAppTheme();
  const accent = { pending: t.custom.warning, approved: t.custom.success, rejected: t.custom.danger, cancelled: t.colors.outline }[lr.status];
  return (
    <FadeIn index={index}>
      <Card mode="elevated" elevation={1} style={{ marginBottom: space.md, borderRadius: radius.xl, backgroundColor: t.colors.elevation.level1, borderWidth: 1, borderColor: t.custom.cardBorder }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, backgroundColor: accent, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
          <View style={{ flex: 1, padding: space.lg }}>
            {showPerson ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm }}>
                <UserAvatar name={lr.user_name || '?'} size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }} numberOfLines={1}>{lr.user_name}</Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }} numberOfLines={1}>
                    {lr.kind === 'student' ? `Student${lr.class_name ? ` · Class ${lr.class_name}` : ''} · by ${lr.applied_by_name}` : 'Staff'}
                  </Text>
                </View>
                <ToneChip text={STATUS_LABEL[lr.status]} tone={STATUS_TONE[lr.status]} icon={STATUS_ICON[lr.status]} />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <Icon name={TYPE_ICON[lr.leave_type] ?? 'calendar'} size={20} color={t.colors.primary} />
              <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{TYPE_LABEL[lr.leave_type] ?? lr.leave_type} leave</Text>
              <ToneChip text={daysLabel(lr.days)} tone="primary" />
              {!showPerson ? <View style={{ flex: 1, alignItems: 'flex-end' }}><ToneChip text={STATUS_LABEL[lr.status]} tone={STATUS_TONE[lr.status]} icon={STATUS_ICON[lr.status]} /></View> : null}
            </View>
            <Text variant="bodyMedium" style={{ color: t.colors.onSurface, marginTop: 4 }}>
              {fmtRange(lr.start_date, lr.end_date)}{lr.half_day ? ' · half day' : ''}
            </Text>
            {lr.reason ? <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginTop: 4 }}>“{lr.reason}”</Text> : null}
            {lr.decided_by_name && lr.status !== 'pending' ? (
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
                {STATUS_LABEL[lr.status]} by {lr.decided_by_name}{lr.comment ? ` — “${lr.comment}”` : ''}
              </Text>
            ) : null}
            {onApprove || onReject || onCancel ? (
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                {onReject ? (
                  <Button mode="outlined" icon="close" textColor={t.custom.danger} style={{ flex: 1, borderColor: t.custom.danger }}
                    onPress={onReject} disabled={busy || disabled}>Reject</Button>
                ) : null}
                {onApprove ? (
                  <Button mode="contained" icon="check" buttonColor={t.custom.success} style={{ flex: 1 }}
                    onPress={onApprove} loading={busy} disabled={busy || disabled}>Approve</Button>
                ) : null}
                {onCancel ? (
                  <Button mode="text" icon="cancel" textColor={t.colors.error} onPress={onCancel} disabled={busy || disabled}>Cancel request</Button>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </FadeIn>
  );
}
