import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Checkbox, Searchbar, Text } from 'react-native-paper';

import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Rider, SchoolClass, TransportRoute, User } from '@/lib/types';

import { FilterChips, Sheet, ToneChip } from '../ui';

/** Assign (or move) students to a route + stop. `preselect` = students to move. */
export function AssignSheet({ visible, routes, riders, students, classes, preselect, onDismiss, onSaved }: {
  visible: boolean; routes: TransportRoute[]; riders: Rider[]; students: User[]; classes: SchoolClass[];
  preselect?: { studentIds: number[]; routeId?: number }; onDismiss: () => void; onSaved: () => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [routeId, setRouteId] = useState<number>(0);
  const [stopId, setStopId] = useState<number>(0);
  const [classId, setClassId] = useState<number>(0);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const r = preselect?.routeId ?? routes[0]?.id ?? 0;
    setRouteId(r);
    setStopId(routes.find((x) => x.id === r)?.stops[0]?.id ?? 0);
    setSel(new Set(preselect?.studentIds ?? []));
    setQ('');
    setClassId(0);
  }, [visible, preselect, routes]);

  const route = routes.find((r) => r.id === routeId);
  const riderOf = useMemo(() => new Map(riders.map((r) => [r.student_id, r])), [riders]);
  const className = (id: number | null) => classes.find((c) => c.id === id)?.name ?? '';
  const list = students.filter((s) => (!classId || s.class_id === classId) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.login_id.toLowerCase().includes(q.toLowerCase())));

  // seats: current riders on this route, minus selected ones already on it, plus selected
  const alreadyHere = [...sel].filter((id) => riderOf.get(id)?.route_id === routeId).length;
  const after = (route?.riders ?? 0) - alreadyHere + sel.size;
  const cap = route?.capacity ?? null;
  const over = cap !== null && after > cap;

  function toggle(id: number) {
    haptic.tap();
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    if (!routeId || !sel.size) return haptic.error();
    setBusy(true);
    try {
      await api('/transport/students', { method: 'PUT', body: { student_ids: [...sel], route_id: routeId, stop_id: stopId || null } });
      toast(`${sel.size} student${sel.size === 1 ? '' : 's'} assigned to ${route?.name ?? 'route'}`);
      onSaved();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Assign students">
      {!routes.length ? (
        <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Create a route first.</Text>
      ) : (
        <>
          <FilterChips label="Route" value={routeId} onChange={(v) => { setRouteId(v); setStopId(routes.find((x) => x.id === v)?.stops[0]?.id ?? 0); }}
            options={routes.map((r) => ({ label: r.name, value: r.id, icon: 'map-marker-path' as const }))} />
          <FilterChips label="Stop" value={stopId} onChange={setStopId}
            options={[...(route?.stops ?? []).map((s) => ({ label: `${s.name}${s.pickup_time ? ` · ${s.pickup_time}` : ''}`, value: s.id })), { label: 'No stop yet', value: 0 }]} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
            <ToneChip text={cap !== null ? `${after} / ${cap} seats after saving` : 'No vehicle on this route'}
              tone={cap === null ? 'neutral' : over ? 'danger' : after > cap * 0.85 ? 'warning' : 'success'} icon="seat-passenger" compact={false} />
          </View>
          <Searchbar placeholder="Search students" value={q} onChangeText={setQ} style={{ marginBottom: space.sm }} />
          <FilterChips value={classId} onChange={setClassId} options={[{ label: 'All classes', value: 0 }, ...classes.map((c) => ({ label: c.name, value: c.id }))]} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>{sel.size} selected</Text>
            <Button compact onPress={() => setSel((s) => new Set([...s, ...list.map((x) => x.id)]))}>Select all shown</Button>
          </View>
          {list.slice(0, 150).map((s) => {
            const r = riderOf.get(s.id);
            const on = routes.find((x) => x.id === r?.route_id);
            return (
              <Checkbox.Item key={s.id} status={sel.has(s.id) ? 'checked' : 'unchecked'} onPress={() => toggle(s.id)} position="leading"
                label={`${s.name} · ${className(s.class_id)}${on ? `   🚌 ${on.name.split('·')[0].trim()}` : ''}`}
                labelStyle={{ textAlign: 'left', fontSize: 14 }} style={{ paddingHorizontal: 0, paddingVertical: 2 }} />
            );
          })}
          {over ? <Text variant="bodySmall" style={{ color: t.custom.danger, marginTop: space.sm }}>This will be over the vehicle's capacity.</Text> : null}
          <Button mode="contained" icon="check" onPress={save} loading={busy} disabled={!sel.size} style={{ marginTop: space.md }} contentStyle={{ paddingVertical: 6 }}>
            Assign {sel.size || ''}
          </Button>
        </>
      )}
    </Sheet>
  );
}
