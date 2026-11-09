import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { EmptyState, Icon, ToneChip } from '@/components/ui';
import { space, useAppTheme } from '@/lib/theme';
import type { AuditEntry } from '@/lib/types';

import { fmtTime, ROLE_TONE } from './common';

function actionIcon(a: string) {
  if (a.startsWith('admin.viewed')) return 'eye-outline';
  if (a.includes('password')) return 'lock-reset';
  if (a.includes('payment')) return 'cash';
  if (a.includes('privacy')) return 'shield-account-outline';
  if (a.includes('archived') || a.includes('removed')) return 'archive-outline';
  if (a.includes('created') || a.includes('added')) return 'plus-circle-outline';
  return 'pencil-outline';
}

export function AuditList({ items, schoolName }: { items: AuditEntry[]; schoolName?: (id: number | null) => string | undefined }) {
  const t = useAppTheme();
  if (!items.length) return <EmptyState icon="clipboard-text-outline" title="No activity yet" />;
  return (
    <View>
      {items.map((e, i) => (
        <View key={e.id} style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm,
          borderBottomWidth: i < items.length - 1 ? 0.5 : 0, borderBottomColor: t.colors.outlineVariant }}>
          <Icon name={actionIcon(e.action) as 'pencil-outline'} size={20} color={e.actor_role === 'admin' ? t.custom.danger : t.colors.primary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text variant="labelLarge" style={{ fontWeight: '700', color: t.colors.onSurface }}>{e.action}</Text>
              {e.actor_role ? <ToneChip text={e.actor_role.replace('_', ' ')} tone={ROLE_TONE[e.actor_role] ?? 'neutral'} /> : null}
            </View>
            {e.detail ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{e.detail}</Text> : null}
            <Text variant="labelSmall" style={{ color: t.colors.outline }}>
              {e.actor_name} · {fmtTime(e.at)}{schoolName && e.school_id ? ` · ${schoolName(e.school_id) ?? ''}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
