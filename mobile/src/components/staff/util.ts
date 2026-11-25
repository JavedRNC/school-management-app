import * as Location from 'expo-location';
import { Linking } from 'react-native';

import type { AppTheme, Tone } from '@/lib/theme';
import { toneColors } from '@/lib/theme';
import type { StaffDayStatus } from '@/lib/types';

/** Server sends naive UTC ISO strings → local Date. */
export function parseUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtTime(iso: string | null | undefined): string {
  const d = parseUtc(iso);
  return d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export const STATUS_LABEL: Record<StaffDayStatus, string> = { present: 'Present', late: 'Late', leave: 'On leave', absent: 'Absent' };
export const STATUS_TONE: Record<StaffDayStatus, Tone> = { present: 'success', late: 'warning', leave: 'primary', absent: 'danger' };

export function statusColors(t: AppTheme, s: StaffDayStatus) {
  return toneColors(t, STATUS_TONE[s]);
}

export class LocationError extends Error {
  canOpenSettings: boolean;
  constructor(message: string, canOpenSettings = false) {
    super(message);
    this.canOpenSettings = canOpenSettings;
  }
}

type Fix = { lat: number; lng: number; accuracy: number | null; mocked: boolean; t: number };
export type Reading = { lat: number; lng: number; accuracy: number | null; mocked: boolean; samples: Fix[]; rooted: boolean };

export const FAKE_LOCATION = 'A fake-location app seems to be on. Turn it off to check in.';
const toFix = (p: Location.LocationObject): Fix => ({
  lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, mocked: p.mocked === true, t: p.timestamp,
});

/** Up to `n` fresh readings about a second apart (stops early after `ms`). The watch is always stopped afterwards. */
async function watchFixes(n: number, ms: number): Promise<Fix[]> {
  const out: Fix[] = [];
  let finished = false;
  let sub: Location.LocationSubscription | null = null;
  await new Promise<void>((resolve) => {
    const finish = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(finish, ms);
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, (p) => {
      if (finished) return;
      out.push(toFix(p));
      if (out.length >= n) finish();
    }).then((s) => {
      if (finished) s.remove();          // the time ran out before the watch even started: stop it at once
      else sub = s;
    }).catch(finish);
  });
  (sub as Location.LocationSubscription | null)?.remove();
  return out;
}

async function rootedPhone(): Promise<boolean> {
  try {
    const Device = await import('expo-device');
    return (await Device.isRootedExperimentalAsync()) === true;
  } catch {
    return false;
  }
}

/**
 * Ask permission (once) and read the position a few times, a second apart. A reading that Android marks as coming from a
 * mock-location app stops the check-in here, and the server refuses it too and logs the attempt. Other odd signs (a rooted
 * phone, no accuracy, a jump) only add a note for the principal. This stops the usual fake-GPS apps; it cannot stop a
 * modified app on a rooted phone. Location is used only for this check-in.
 */
export async function readPosition(): Promise<Reading> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new LocationError('Location permission is off. Allow location for Prangan to check in.', !perm.canAskAgain);
  }
  const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!enabled) throw new LocationError('Turn on Location (GPS) on your phone and try again.');
  const first = toFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  if (first.mocked) throw new LocationError(FAKE_LOCATION);
  const more = await watchFixes(3, 4500);
  const samples = [first, ...more].sort((a, b) => a.t - b.t).filter((f, i, all) => i === 0 || f.t !== all[i - 1].t).slice(-5);
  if (samples.some((f) => f.mocked)) throw new LocationError(FAKE_LOCATION);
  const last = samples[samples.length - 1];
  return { lat: last.lat, lng: last.lng, accuracy: last.accuracy, mocked: false, samples, rooted: await rootedPhone() };
}

export function openSettings() {
  Linking.openSettings().catch(() => {});
}
