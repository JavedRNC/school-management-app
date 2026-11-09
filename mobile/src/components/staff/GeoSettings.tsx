import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { FilterChips, Icon, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { StaffGeoSettings } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { LocationError, openSettings, readPosition } from './util';

const RADII = [100, 150, 200, 300];
const TIMES = ['08:00', '08:30', '08:45', '09:00', '09:30'];

/** Principal sets the school's location, radius and late time. */
export function GeoSettings() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const readOnly = school?.can_write === false;
  const { data, reload } = useLoad(() => api<StaffGeoSettings>('/staff-attendance/settings'));
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  const [radiusM, setRadiusM] = useState(150);
  const [late, setLate] = useState('09:00');
  const [busy, setBusy] = useState<'loc' | 'save' | null>(null);
  const [needSettings, setNeedSettings] = useState(false);

  useEffect(() => {
    if (data) {
      setRadiusM(data.radius_m);
      setLate(data.late_after);
      if (data.lat != null && data.lng != null) setPos({ lat: data.lat, lng: data.lng });
    }
  }, [data]);

  async function useMine() {
    setBusy('loc');
    setNeedSettings(false);
    try {
      const p = await readPosition();
      if (p.mocked) throw new LocationError('A fake-location app is on. Turn it off and try again.');
      setPos({ lat: p.lat, lng: p.lng });
      setAcc(p.accuracy);
      toast(`Location captured (±${Math.round(p.accuracy ?? 0)} m) — tap Save`);
    } catch (e) {
      setNeedSettings(e instanceof LocationError && e.canOpenSettings);
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!pos) return toast('Capture the school location first', { error: true });
    setBusy('save');
    try {
      await api('/staff-attendance/settings', { method: 'PUT', body: { lat: pos.lat, lng: pos.lng, radius_m: radiusM, late_after: late } });
      toast('Check-in settings saved');
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  const changed = !!data && (!!pos && (pos.lat !== data.lat || pos.lng !== data.lng) || radiusM !== data.radius_m || late !== data.late_after);

  return (
    <Panel title="School location" subtitle="Where staff can check in" icon="map-marker-radius-outline">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md,
        backgroundColor: pos ? t.custom.successContainer : t.custom.warningContainer, marginBottom: space.md }}>
        <Icon name={pos ? 'map-marker-check' : 'map-marker-question-outline'} size={22} color={pos ? t.custom.success : t.custom.warning} />
        <Text variant="bodyMedium" style={{ flex: 1, color: pos ? t.custom.onSuccessContainer : t.custom.onWarningContainer }}>
          {pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}${acc != null ? `  (±${Math.round(acc)} m)` : ''}` : 'Not set — staff can’t check in yet'}
        </Text>
      </View>
      <Button mode="contained-tonal" icon="crosshairs-gps" onPress={useMine} loading={busy === 'loc'} disabled={!!busy || readOnly}>
        Use my current location
      </Button>
      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 6, marginBottom: space.md }}>
        Stand inside the school campus (near the main gate or office) with GPS on.
        {needSettings ? ' Location permission is off — ' : ''}
      </Text>
      {needSettings ? <Button compact onPress={openSettings} style={{ alignSelf: 'flex-start', marginTop: -space.sm }}>Open settings</Button> : null}
      <FilterChips label="Check-in distance" value={radiusM} onChange={setRadiusM} options={RADII.map((r) => ({ label: `${r} m`, value: r }))} />
      <FilterChips label="Late after" value={late} onChange={setLate} options={TIMES.map((x) => ({ label: x, value: x }))} />
      <Button mode="contained" icon="content-save-outline" onPress={save} loading={busy === 'save'} disabled={!changed || !!busy || readOnly}
        contentStyle={{ paddingVertical: 6 }}>Save check-in settings</Button>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Icon name="shield-lock-outline" size={18} color={t.colors.primary} />
        <Text variant="bodySmall" style={{ flex: 1, color: t.colors.onSurfaceVariant }}>
          The phone's location is read only at the moment someone taps Check in or Check out. It is never tracked in the background.
        </Text>
      </View>
    </Panel>
  );
}
