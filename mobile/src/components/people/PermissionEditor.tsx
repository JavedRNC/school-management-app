import { View } from 'react-native';
import { Button, SegmentedButtons, Text } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Area, Level } from '@/lib/types';

import { AREAS, DEFAULT_PERMS } from './constants';

/** Area × None/View/Edit switches for Vice Principals and Coordinators. */
export function PermissionEditor({ role, value, onChange, disabled }: {
  role: 'vice_principal' | 'coordinator'; value: Record<Area, Level>; onChange: (v: Record<Area, Level>) => void; disabled?: boolean;
}) {
  const t = useAppTheme();
  return (
    <View style={{ marginBottom: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs }}>
        <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Permissions</Text>
        {!disabled ? (
          <Button compact icon="restore" onPress={() => { haptic.tap(); onChange({ ...DEFAULT_PERMS[role] }); }}>Reset to defaults</Button>
        ) : null}
      </View>
      {AREAS.map((a) => (
        <View key={a.key} style={{ paddingVertical: space.sm, borderBottomWidth: 0.5, borderBottomColor: t.colors.outlineVariant }}>
          <Text variant="bodyMedium" style={{ fontWeight: '600', color: t.colors.onSurface }}>{a.label}</Text>
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>{a.desc}</Text>
          <SegmentedButtons density="small" value={value[a.key] ?? 'none'}
            onValueChange={(v) => { if (disabled) return; haptic.tap(); onChange({ ...value, [a.key]: v as Level }); }}
            buttons={[
              { value: 'none', label: 'None', disabled },
              { value: 'view', label: 'View', disabled },
              { value: 'edit', label: 'Edit', disabled },
            ]} />
        </View>
      ))}
    </View>
  );
}
