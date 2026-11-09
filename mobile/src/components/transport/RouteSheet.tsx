import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, IconButton, Text, TextInput } from 'react-native-paper';

import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { TransportRoute, Vehicle } from '@/lib/types';

import { FilterChips, Sheet } from '../ui';
import { TIME_RE } from './common';

type DraftStop = { key: string; id?: number; name: string; pickup_time: string; drop_time: string };

let seq = 0;
const newKey = () => `n${++seq}`;

export function RouteSheet({ visible, route, vehicles, onDismiss, onSaved }: {
  visible: boolean; route: TransportRoute | null; vehicles: Vehicle[]; onDismiss: () => void; onSaved: () => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [vehicleId, setVehicleId] = useState<number>(0);
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(route?.name ?? '');
    setVehicleId(route?.vehicle_id ?? 0);
    setStops(route?.stops.map((s) => ({ key: `s${s.id}`, id: s.id, name: s.name, pickup_time: s.pickup_time, drop_time: s.drop_time }))
      ?? [{ key: newKey(), name: '', pickup_time: '', drop_time: '' }]);
  }, [visible, route]);

  const timeOk = (v: string) => !v || TIME_RE.test(v);
  const stopsOk = stops.every((s) => s.name.trim() && timeOk(s.pickup_time) && timeOk(s.drop_time));
  const valid = name.trim() && stopsOk;

  function patch(i: number, p: Partial<DraftStop>) {
    setStops((ss) => ss.map((s, j) => (j === i ? { ...s, ...p } : s)));
  }
  function move(i: number, d: -1 | 1) {
    haptic.tap();
    setStops((ss) => {
      const j = i + d;
      if (j < 0 || j >= ss.length) return ss;
      const c = [...ss];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }
  function fmtTime(v: string) {
    const d = v.replace(/[^\d]/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  }

  async function save() {
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      const body = {
        name: name.trim(), vehicle_id: vehicleId || null,
        stops: stops.map((s) => ({ id: s.id, name: s.name.trim(), pickup_time: s.pickup_time, drop_time: s.drop_time })),
      };
      await api(route ? `/transport/routes/${route.id}` : '/transport/routes', { method: route ? 'PUT' : 'POST', body });
      toast(route ? 'Route updated' : 'Route added');
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={route ? 'Edit route' : 'New route'}>
      <TextInput mode="outlined" label="Route name" value={name} onChangeText={setName} placeholder="Route 3 · Bariatu – Lalpur"
        left={<TextInput.Icon icon="map-marker-path" />} />
      <HelperText type="error" visible={!name.trim()}>Name is required</HelperText>
      <FilterChips label="Vehicle" value={vehicleId} onChange={setVehicleId}
        options={[{ label: 'None yet', value: 0 }, ...vehicles.map((v) => ({ label: `${v.number} · ${v.capacity} seats`, value: v.id }))]} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
        <Text variant="titleSmall" style={{ flex: 1, fontWeight: '700', color: t.colors.onSurface }}>Stops in order</Text>
        <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>pickup · drop (HH:MM)</Text>
      </View>
      {stops.map((s, i) => (
        <View key={s.key} style={{ borderWidth: 1, borderColor: t.colors.outlineVariant, borderRadius: radius.lg, padding: space.sm, marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="labelMedium" style={{ color: t.colors.onPrimaryContainer, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <TextInput mode="flat" dense label="Stop name" value={s.name} onChangeText={(v) => patch(i, { name: v })} style={{ flex: 1, backgroundColor: 'transparent' }} />
            <IconButton icon="arrow-up" size={18} disabled={i === 0} onPress={() => move(i, -1)} style={{ margin: 0 }} />
            <IconButton icon="arrow-down" size={18} disabled={i === stops.length - 1} onPress={() => move(i, 1)} style={{ margin: 0 }} />
            <IconButton icon="close" size={18} iconColor={t.colors.error} disabled={stops.length === 1}
              onPress={() => { haptic.tap(); setStops((ss) => ss.filter((_, j) => j !== i)); }} style={{ margin: 0 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 4 }}>
            <TextInput mode="outlined" dense label="Pickup" value={s.pickup_time} placeholder="07:10" keyboardType="number-pad"
              onChangeText={(v) => patch(i, { pickup_time: fmtTime(v) })} error={!timeOk(s.pickup_time)} style={{ flex: 1 }} />
            <TextInput mode="outlined" dense label="Drop" value={s.drop_time} placeholder="14:20" keyboardType="number-pad"
              onChangeText={(v) => patch(i, { drop_time: fmtTime(v) })} error={!timeOk(s.drop_time)} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
      {!stopsOk ? <HelperText type="error" visible>Every stop needs a name; times must be HH:MM (24-hour)</HelperText> : null}
      <Button mode="outlined" icon="plus" onPress={() => { haptic.tap(); setStops((ss) => [...ss, { key: newKey(), name: '', pickup_time: '', drop_time: '' }]); }}
        style={{ marginBottom: space.md }}>Add stop</Button>
      <Button mode="contained" icon="check" onPress={save} loading={busy} disabled={!valid} contentStyle={{ paddingVertical: 6 }}>
        {route ? 'Save route' : 'Create route'}
      </Button>
    </Sheet>
  );
}
