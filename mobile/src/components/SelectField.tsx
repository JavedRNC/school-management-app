// A dropdown field: shows the chosen item like the app's other fields and opens a list from the bottom.
// Used for lists that grow with the school (classes, exams, subjects, routes…). Short fixed choices stay as chips.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ComponentProps, useMemo, useState } from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { TextInput } from '@/components/Field';
import { Sheet } from '@/components/ui';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type SelectOption<T> = { label: string; value: T; icon?: IconName; sub?: string };

/** A search box appears once a list is longer than this. */
const SEARCH_FROM = 8;

export function SelectField<T extends string | number>({ label, options, value, onChange, placeholder = 'Choose', disabled, style, sheetTitle }: {
  label: string; options: SelectOption<T>[]; value: T | null | undefined; onChange: (v: T) => void;
  placeholder?: string; disabled?: boolean; style?: ViewStyle; sheetTitle?: string;
}) {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const chosen = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(s)) : options;
  }, [options, q]);
  const off = disabled || !options.length;
  const pick = (v: T) => {
    haptic.tap();
    setOpen(false);
    setQ('');
    if (v !== value) onChange(v);
  };

  return (
    <View style={[{ marginBottom: space.md }, style]}>
      <Pressable disabled={off} onPress={() => { haptic.tap(); setOpen(true); }}
        accessibilityRole="button" accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`} accessibilityHint="Opens a list to choose from"
        accessibilityState={{ disabled: off, expanded: open }}
        android_ripple={{ color: t.colors.surfaceVariant }}
        style={({ pressed }) => ({ minHeight: 56, borderRadius: radius.sm, borderWidth: open ? 2 : 1, overflow: 'hidden',
          borderColor: open ? t.colors.primary : t.colors.outline, backgroundColor: pressed ? t.colors.surfaceVariant : t.colors.surface,
          paddingHorizontal: space.md, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: off ? 0.55 : 1 })}>
        {chosen?.icon ? <MaterialCommunityIcons name={chosen.icon} size={20} color={t.colors.primary} /> : null}
        <View style={{ flex: 1 }}>
          <Text variant="labelSmall" style={{ color: open ? t.colors.primary : t.colors.onSurfaceVariant }}>{label}</Text>
          <Text variant="bodyLarge" numberOfLines={1} style={{ color: chosen ? t.colors.onSurface : t.colors.onSurfaceVariant, fontWeight: chosen ? '600' : '400' }}>
            {chosen?.label ?? placeholder}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={22} color={t.colors.onSurfaceVariant} />
      </Pressable>

      <Sheet visible={open} onDismiss={() => { setOpen(false); setQ(''); }} title={sheetTitle ?? label}>
        {options.length > SEARCH_FROM ? (
          <TextInput mode="outlined" dense label={`Search ${label.toLowerCase()}`} value={q} onChangeText={setQ} autoCorrect={false}
            left={<TextInput.Icon icon="magnify" />} right={q ? <TextInput.Icon icon="close" onPress={() => setQ('')} accessibilityLabel="Clear search" /> : undefined}
            style={{ marginBottom: space.sm }} />
        ) : null}
        {shown.map((o, i) => {
          const on = o.value === value;
          return (
            <TouchableRipple key={String(o.value)} onPress={() => pick(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on, selected: on }}
              accessibilityLabel={o.sub ? `${o.label}, ${o.sub}` : o.label}
              style={{ marginHorizontal: -space.lg, paddingHorizontal: space.lg, backgroundColor: on ? t.colors.secondaryContainer : undefined }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingVertical: 8,
                borderBottomWidth: i < shown.length - 1 ? 1 : 0, borderColor: t.colors.outlineVariant }}>
                {o.icon ? <MaterialCommunityIcons name={o.icon} size={20} color={on ? t.colors.onSecondaryContainer : t.colors.primary} /> : null}
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLarge" style={{ color: on ? t.colors.onSecondaryContainer : t.colors.onSurface, fontWeight: on ? '700' : '400' }}>{o.label}</Text>
                  {o.sub ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{o.sub}</Text> : null}
                </View>
                {on ? <MaterialCommunityIcons name="check" size={22} color={t.colors.onSecondaryContainer} /> : null}
              </View>
            </TouchableRipple>
          );
        })}
        {!shown.length ? <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, paddingVertical: space.lg, textAlign: 'center' }}>Nothing matches “{q}”</Text> : null}
      </Sheet>
    </View>
  );
}
