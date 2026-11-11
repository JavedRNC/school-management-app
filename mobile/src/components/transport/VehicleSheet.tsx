import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Vehicle } from '@/lib/types';

import { FilterChips, Sheet } from '../ui';
import { DATE_RE, isoIn, KIND_ICON } from './common';

type Kind = Vehicle['kind'];

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = useAppTheme();
  const bad = !!value && !DATE_RE.test(value);
  return (
    <View style={{ marginBottom: space.sm }}>
      <TextInput mode="outlined" label={`${label} (YYYY-MM-DD)`} value={value} onChangeText={onChange} error={bad}
        left={<TextInput.Icon icon="calendar" />} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {[['+6 months', 182], ['+1 year', 365], ['+2 years', 730]].map(([l, d]) => (
          <Button key={l as string} compact mode="text" onPress={() => onChange(isoIn(d as number))}>{l as string}</Button>
        ))}
        {value ? <Button compact textColor={t.colors.onSurfaceVariant} onPress={() => onChange('')}>Clear</Button> : null}
      </View>
    </View>
  );
}

export function VehicleSheet({ visible, vehicle, onDismiss, onSaved, readOnly }: {
  visible: boolean; vehicle: Vehicle | null; onDismiss: () => void; onSaved: () => void; readOnly?: boolean;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [number, setNumber] = useState('');
  const [kind, setKind] = useState<Kind>('bus');
  const [capacity, setCapacity] = useState('40');
  const [insurance, setInsurance] = useState('');
  const [fitness, setFitness] = useState('');
  const [licenceUntil, setLicenceUntil] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [licence, setLicence] = useState('');
  const [attName, setAttName] = useState('');
  const [attPhone, setAttPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const v = vehicle;
    setNumber(v?.number ?? ''); setKind(v?.kind ?? 'bus'); setCapacity(String(v?.capacity ?? 40));
    setInsurance(v?.insurance_until ?? ''); setFitness(v?.fitness_until ?? ''); setLicenceUntil(v?.licence_until ?? '');
    setDriverName(v?.driver_name ?? ''); setDriverPhone(v?.driver_phone ?? ''); setLicence(v?.driver_licence ?? '');
    setAttName(v?.attendant_name ?? ''); setAttPhone(v?.attendant_phone ?? '');
  }, [visible, vehicle]);

  const cap = Number(capacity);
  const datesOk = [insurance, fitness, licenceUntil].every((d) => !d || DATE_RE.test(d));
  const valid = number.trim() && cap >= 1 && cap <= 120 && datesOk;

  async function save() {
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      const body = {
        number: number.trim().toUpperCase(), kind, capacity: cap, insurance_until: insurance || null, fitness_until: fitness || null,
        licence_until: licenceUntil || null, driver_name: driverName, driver_phone: driverPhone, driver_licence: licence,
        attendant_name: attName, attendant_phone: attPhone,
      };
      await api(vehicle ? `/transport/vehicles/${vehicle.id}` : '/transport/vehicles', { method: vehicle ? 'PUT' : 'POST', body });
      toast(vehicle ? 'Vehicle updated' : 'Vehicle added');
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={vehicle ? `Edit ${vehicle.number}` : 'Add vehicle'}>
      <TextInput mode="outlined" label="Vehicle number" value={number} onChangeText={setNumber} autoCapitalize="characters"
        placeholder="JH01 AB 1234" left={<TextInput.Icon icon="card-text-outline" />} disabled={readOnly} />
      <HelperText type="error" visible={!number.trim()}>Number is required</HelperText>
      <FilterChips label="Type" value={kind} onChange={setKind}
        options={(['bus', 'van', 'auto', 'other'] as Kind[]).map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: k, icon: KIND_ICON[k] }))} />
      <TextInput mode="outlined" label="Seats (capacity)" value={capacity} onChangeText={(v) => setCapacity(v.replace(/\D/g, ''))}
        keyboardType="number-pad" left={<TextInput.Icon icon="seat-passenger" />} error={!(cap >= 1 && cap <= 120)} disabled={readOnly} />
      <HelperText type="error" visible={!(cap >= 1 && cap <= 120)}>Between 1 and 120</HelperText>

      <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface, marginBottom: space.sm }}>Documents</Text>
      <DateField label="Insurance valid until" value={insurance} onChange={setInsurance} />
      <DateField label="Fitness certificate until" value={fitness} onChange={setFitness} />

      <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface, marginVertical: space.sm }}>Driver</Text>
      <TextInput mode="outlined" label="Driver name" value={driverName} onChangeText={setDriverName} left={<TextInput.Icon icon="steering" />} style={{ marginBottom: space.sm }} />
      <TextInput mode="outlined" label="Driver phone" value={driverPhone} onChangeText={(v) => setDriverPhone(v.replace(/[^\d+]/g, ''))}
        keyboardType="phone-pad" left={<TextInput.Icon icon="phone" />} style={{ marginBottom: space.sm }} />
      <TextInput mode="outlined" label="Licence number" value={licence} onChangeText={setLicence} autoCapitalize="characters"
        left={<TextInput.Icon icon="card-account-details-outline" />} style={{ marginBottom: space.sm }} />
      <DateField label="Licence valid until" value={licenceUntil} onChange={setLicenceUntil} />

      <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface, marginVertical: space.sm }}>Attendant (optional)</Text>
      <TextInput mode="outlined" label="Attendant name" value={attName} onChangeText={setAttName} left={<TextInput.Icon icon="account-heart-outline" />} style={{ marginBottom: space.sm }} />
      <TextInput mode="outlined" label="Attendant phone" value={attPhone} onChangeText={(v) => setAttPhone(v.replace(/[^\d+]/g, ''))}
        keyboardType="phone-pad" left={<TextInput.Icon icon="phone" />} style={{ marginBottom: space.md }} />

      {!readOnly ? (
        <Button mode="contained" icon="check" onPress={save} loading={busy} disabled={!valid} contentStyle={{ paddingVertical: 6 }}>
          {vehicle ? 'Save changes' : 'Add vehicle'}
        </Button>
      ) : null}
    </Sheet>
  );
}
