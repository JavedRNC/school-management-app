import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Chip, Searchbar, Text } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { SchoolClass, User } from '@/lib/types';

/** Search students and multi-select the parent's children. */
export function ChildrenPicker({ students, classes, value, onChange, disabled }: {
  students: User[]; classes: SchoolClass[]; value: number[]; onChange: (ids: number[]) => void; disabled?: boolean;
}) {
  const t = useAppTheme();
  const [q, setQ] = useState('');
  const className = (id: number | null) => classes.find((c) => c.id === id)?.name ?? '';
  const selected = students.filter((s) => value.includes(s.id));
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const k = q.toLowerCase();
    return students.filter((s) => !value.includes(s.id) &&
      (s.name.toLowerCase().includes(k) || s.login_id.toLowerCase().includes(k))).slice(0, 8);
  }, [q, students, value]);

  const toggle = (id: number) => {
    if (disabled) return;
    haptic.tap();
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <View style={{ marginBottom: space.md }}>
      <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>
        Children {selected.length ? `(${selected.length})` : ''}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.sm }}>
        {selected.length ? selected.map((s) => (
          <Chip key={s.id} icon="account-school" onClose={disabled ? undefined : () => toggle(s.id)} style={{ backgroundColor: t.colors.secondaryContainer }}>
            {s.name} · {className(s.class_id)}
          </Chip>
        )) : <Text variant="bodySmall" style={{ color: t.colors.outline }}>No children linked yet</Text>}
      </View>
      {!disabled ? (
        <>
          <Searchbar placeholder="Search student by name or admission no." value={q} onChangeText={setQ} style={{ borderRadius: 16, backgroundColor: t.custom.inset }} elevation={0} inputStyle={{ fontSize: 14 }} />
          {matches.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm }}>
              {matches.map((s) => (
                <Chip key={s.id} icon="plus" mode="outlined" onPress={() => { toggle(s.id); setQ(''); }}>
                  {s.name} · {className(s.class_id)} · {s.login_id}
                </Chip>
              ))}
            </View>
          ) : q.trim() ? <Text variant="bodySmall" style={{ color: t.colors.outline, marginTop: 6 }}>No matching students</Text> : null}
        </>
      ) : null}
    </View>
  );
}
