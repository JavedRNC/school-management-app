import { memo } from 'react';
import { View } from 'react-native';
import { Chip, HelperText, IconButton, Text, TextInput } from 'react-native-paper';

import { fieldOutline, radius, space, useAppTheme } from '@/lib/theme';
import type { SchoolClass } from '@/lib/types';

import type { PersonRole } from './constants';

export type BulkField = 'name' | 'login_id' | 'class' | 'roll_no' | 'dob' | 'parent_name' | 'parent_mobile' | 'phone' | 'email';
export type BulkRowData = Partial<Record<BulkField, string>> & { key: string };

type FieldDef = { key: BulkField; label: string; required?: boolean; numeric?: boolean; placeholder?: string; half?: boolean };

/** Fields per role, in the order used for pasting. */
export function fieldsFor(role: PersonRole): FieldDef[] {
  if (role === 'student') {
    return [
      { key: 'name', label: 'Name', required: true },
      { key: 'login_id', label: 'Admission no.', required: true, half: true, placeholder: '2026025' },
      { key: 'class', label: 'Class', required: true, placeholder: 'Type or tap a class below' },
      { key: 'roll_no', label: 'Roll no.', numeric: true, half: true },
      { key: 'dob', label: 'Date of birth', half: true, placeholder: '31/05/2013' },
      { key: 'parent_name', label: 'Parent name', half: true },
      { key: 'parent_mobile', label: 'Parent mobile', numeric: true, half: true, placeholder: '10 digits' },
    ];
  }
  if (role === 'parent') {
    return [
      { key: 'name', label: 'Name', required: true },
      { key: 'login_id', label: 'Mobile', required: true, numeric: true, half: true, placeholder: '10 digits' },
      { key: 'email', label: 'Email', half: true },
    ];
  }
  return [
    { key: 'name', label: 'Name', required: true },
    { key: 'login_id', label: role === 'teacher' ? 'Employee code' : 'Login ID', required: true, half: true, placeholder: role === 'teacher' ? 'T006' : '' },
    { key: 'phone', label: 'Phone', numeric: true, half: true },
    { key: 'email', label: 'Email' },
  ];
}

export function isEmptyRow(r: BulkRowData) {
  return !Object.entries(r).some(([k, v]) => k !== 'key' && String(v ?? '').trim());
}

type Props = {
  index: number; row: BulkRowData; role: PersonRole; classes: SchoolClass[];
  errors?: Partial<Record<string, string>>; onChange: (key: string, field: BulkField, value: string) => void; onRemove: (key: string) => void;
};

export const AddManyRow = memo(function AddManyRow({ index, row, role, classes, errors, onChange, onRemove }: Props) {
  const t = useAppTheme();
  const fields = fieldsFor(role);
  const hasErr = !!errors && Object.keys(errors).length > 0;
  const rowErr = errors?._row;
  return (
    <View style={{
      backgroundColor: t.colors.elevation.level1, borderRadius: radius.xl, padding: space.md, marginBottom: space.md,
      borderWidth: hasErr ? 1.5 : 0, borderColor: t.custom.danger,
      shadowColor: hasErr ? t.custom.danger : '#000', shadowOpacity: hasErr ? 0.25 : 0.06, shadowRadius: hasErr ? 12 : 8,
      shadowOffset: { width: 0, height: 3 }, elevation: hasErr ? 4 : 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.xs }}>
        <View style={{ backgroundColor: hasErr ? t.custom.dangerContainer : t.colors.primaryContainer, borderRadius: radius.pill,
          paddingHorizontal: 10, paddingVertical: 2 }}>
          <Text variant="labelMedium" style={{ fontWeight: '700', color: hasErr ? t.custom.onDangerContainer : t.colors.onPrimaryContainer }}>#{index + 1}</Text>
        </View>
        <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1, marginLeft: space.sm, color: t.colors.onSurfaceVariant }}>
          {row.name?.trim() || 'New person'}
        </Text>
        <IconButton icon="close" size={18} onPress={() => onRemove(row.key)} accessibilityLabel={`Remove row ${index + 1}`} style={{ margin: 0 }} />
      </View>
      {rowErr ? <HelperText type="error" visible style={{ paddingHorizontal: 0 }}>{rowErr}</HelperText> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs }}>
        {fields.map((f) => {
          const err = errors?.[f.key];
          return (
            <View key={f.key} style={{ width: f.half ? '50%' : '100%', paddingHorizontal: space.xs }}>
              <TextInput mode="outlined" outlineStyle={fieldOutline} dense label={f.label + (f.required ? ' *' : '')} value={row[f.key] ?? ''} placeholder={f.placeholder}
                onChangeText={(v) => onChange(row.key, f.key, v)} error={!!err} keyboardType={f.numeric ? 'phone-pad' : 'default'}
                autoCapitalize={f.key === 'name' || f.key === 'parent_name' ? 'words' : 'none'} />
              {err ? <HelperText type="error" visible style={{ paddingHorizontal: 0 }}>{err}</HelperText> : <View style={{ height: space.xs }} />}
              {f.key === 'class' && classes.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: space.xs }}>
                  {classes.slice(0, 12).map((c) => (
                    <Chip key={c.id} compact selected={(row.class ?? '').trim().toLowerCase() === c.name.toLowerCase()}
                      onPress={() => onChange(row.key, 'class', c.name)} textStyle={{ fontSize: 11, marginVertical: 0 }} style={{ height: 26 }}>
                      {c.name}
                    </Chip>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
});
