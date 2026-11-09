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

/** Ask permission (once) and read a precise position. Location is used only for this reading. */
export async function readPosition(): Promise<{ lat: number; lng: number; accuracy: number | null; mocked: boolean }> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new LocationError('Location permission is off. Allow location for School Hub to check in.', !perm.canAskAgain);
  }
  const enabled = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!enabled) throw new LocationError('Turn on Location (GPS) on your phone and try again.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, mocked: pos.mocked === true };
}

export function openSettings() {
  Linking.openSettings().catch(() => {});
}
