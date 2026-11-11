import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import type { BellSchedule, BellSlot } from '@/lib/types';

/** Period timings (F28): loaded once per app session, shared by every screen. */
let cache: BellSchedule | null = null;
let inflight: Promise<BellSchedule> | null = null;
const listeners = new Set<(b: BellSchedule | null) => void>();

async function fetchBell(force = false): Promise<BellSchedule> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = api<BellSchedule>('/school/bell')
    .then((b) => {
      cache = b;
      listeners.forEach((l) => l(b));
      return b;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Store a fresh schedule (e.g. right after saving) so every screen updates. */
export function setBellCache(b: BellSchedule | null) {
  cache = b;
  listeners.forEach((l) => l(b));
}

export function useBell() {
  const [bell, setBell] = useState<BellSchedule | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setBell);
    if (!cache) fetchBell().catch((e) => setError((e as Error).message));
    return () => { listeners.delete(setBell); };
  }, []);
  const refresh = useCallback(async () => {
    try {
      setError(null);
      return await fetchBell(true);
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);
  return { bell, error, loading: !bell && !error, refresh };
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Timings that apply on `day` (0 = Mon … 6 = Sun): that day's own timings, else the normal ones. Null if none set. */
export function slotsForDay(bell: BellSchedule | null | undefined, day: number): BellSlot[] | null {
  if (!bell) return null;
  const own = bell.overrides?.[String(day)];
  if (own?.length) return own;
  return bell.default?.length ? bell.default : null;
}

export function periodTime(bell: BellSchedule | null | undefined, day: number, period: number): { start: string; end: string } | null {
  const s = slotsForDay(bell, day)?.find((x) => x.kind === 'period' && x.period === period);
  return s ? { start: s.start, end: s.end } : null;
}

export function periodCount(bell: BellSchedule | null | undefined, day: number): number | null {
  const s = slotsForDay(bell, day);
  return s ? s.filter((x) => x.kind === 'period').length : null;
}

/** What's on right now, and what comes next. */
export function currentSlot(bell: BellSchedule | null | undefined, day: number, now: Date = new Date()): { now: BellSlot | null; next: BellSlot | null } {
  const s = slotsForDay(bell, day);
  if (!s) return { now: null, next: null };
  const m = now.getHours() * 60 + now.getMinutes();
  const cur = s.find((x) => m >= toMin(x.start) && m < toMin(x.end)) ?? null;
  const next = s.find((x) => toMin(x.start) > m) ?? null;
  return { now: cur, next };
}

export function bellSummary(slots: { kind: string; start: string; end: string }[] | null | undefined): string {
  if (!slots?.length) return 'Not set yet';
  const n = slots.filter((x) => x.kind === 'period').length;
  return `${n} period${n === 1 ? '' : 's'} · ${slots[0].start}–${slots[slots.length - 1].end}`;
}
