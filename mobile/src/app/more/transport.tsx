import { useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB, Button, Dialog, SegmentedButtons, Text } from 'react-native-paper';

import { MyBusCard } from '@/components/BusCard';
import { AssignSheet } from '@/components/transport/AssignSheet';
import { CallButton, daysUntil, expiryTone, fmtDay, KIND_ICON, PlateChip, SeatsBar, StopTimeline } from '@/components/transport/common';
import { RouteSheet } from '@/components/transport/RouteSheet';
import { VehicleSheet } from '@/components/transport/VehicleSheet';
import {
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, LoadingCards, Panel, Row, Screen, SectionTitle, StatTile, ToneChip, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan, useModule } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Rider, SchoolClass, TransportOverview, TransportRoute, User, Vehicle } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Tab = 'overview' | 'vehicles' | 'routes' | 'students';

export default function TransportScreen() {
  const { user } = useAuth();
  const enabled = useModule('transport');
  const canView = useCan('transport', 'view');
  if (!enabled) {
    return (
      <Screen header={<Hero title="Transport" compact />}>
        <EmptyState icon="bus-alert" title="Transport isn't on your plan" text="Ask the school to enable the Transport module." />
      </Screen>
    );
  }
  if (user?.role === 'student' || user?.role === 'parent') return <FamilyBus />;
  if (!canView) {
    return (
      <Screen header={<Hero title="Transport" compact />}>
        <EmptyState icon="lock-outline" title="No access" text="You don't have permission to view transport." />
      </Screen>
    );
  }
  return <ManageTransport />;
}

// ---------------------------------------------------------------- students & parents
function FamilyBus() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const kids = useLoad(() => (isParent ? api<User[]>('/me/children') : Promise.resolve([] as User[])), [isParent]);
  const [kid, setKid] = useState<number | null>(null);
  const studentId = isParent ? (kid ?? kids.data?.[0]?.id) : undefined;
  return (
    <Screen header={<Hero title="School bus" subtitle="Route, stop and timings" compact />}>
      {isParent && (kids.data?.length ?? 0) > 1 ? (
        <FilterChips value={studentId} onChange={setKid} options={(kids.data ?? []).map((k) => ({ label: k.name.split(' ')[0], value: k.id, icon: 'account-school' as const }))} />
      ) : null}
      {isParent && !studentId ? <LoadingCards count={1} /> : (
        <>
          <MyBusCard studentId={studentId} />
          <NotAssigned studentId={studentId} />
        </>
      )}
    </Screen>
  );
}

function NotAssigned({ studentId }: { studentId?: number }) {
  const { data } = useLoad(() => api<{ assigned: boolean }>('/transport/me', { params: studentId ? { student_id: studentId } : undefined }), [studentId]);
  if (!data || data.assigned) return null;
  return <EmptyState icon="bus-clock" title="Not using school transport" text="If you need the bus, contact the school office." />;
}

// ---------------------------------------------------------------- managers
function ManageTransport() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canEdit = useCan('transport', 'edit') && school?.can_write !== false;
  const [tab, setTab] = useState<Tab>('overview');
  const [vehicleSheet, setVehicleSheet] = useState<{ open: boolean; v: Vehicle | null }>({ open: false, v: null });
  const [routeSheet, setRouteSheet] = useState<{ open: boolean; r: TransportRoute | null }>({ open: false, r: null });
  const [assign, setAssign] = useState<{ open: boolean; pre?: { studentIds: number[]; routeId?: number } }>({ open: false });
  const [confirm, setConfirm] = useState<{ kind: 'vehicle' | 'route' | 'rider'; id: number; label: string } | null>(null);
  const [routeFilter, setRouteFilter] = useState<number>(0);

  const ov = useLoad(() => api<TransportOverview>('/transport/overview'));
  const riders = useLoad(() => api<Rider[]>('/transport/students'));
  const people = useLoad(async () => {
    const [students, classes] = await Promise.all([
      api<User[]>('/users', { params: { role: 'student' } }).catch(() => [] as User[]),
      api<SchoolClass[]>('/classes'),
    ]);
    return { students, classes };
  });

  const reload = () => { ov.reload(); riders.reload(); };
  const d = ov.data;

  async function doArchive() {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    try {
      if (c.kind === 'vehicle') await api(`/transport/vehicles/${c.id}`, { method: 'DELETE' });
      else if (c.kind === 'route') await api(`/transport/routes/${c.id}`, { method: 'DELETE' });
      else await api('/transport/students', { method: 'PUT', body: { student_ids: [c.id], route_id: null } });
      toast(c.kind === 'rider' ? `${c.label} removed from transport` : `${c.label} archived`);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  const fab = canEdit && tab !== 'overview' ? (
    tab === 'vehicles' ? { icon: 'bus-plus' as const, label: 'Add vehicle', onPress: () => setVehicleSheet({ open: true, v: null }) }
      : tab === 'routes' ? { icon: 'map-marker-plus-outline' as const, label: 'Add route', onPress: () => setRouteSheet({ open: true, r: null }) }
        : { icon: 'account-multiple-plus-outline' as const, label: 'Assign students', onPress: () => setAssign({ open: true }) }
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={() => { ov.refresh(); riders.refresh(); }} refreshing={ov.refreshing} footerSpace={120}
        header={
          <Hero title="Transport" subtitle={d ? `${d.vehicles.length} vehicles · ${d.routes.length} routes · ${d.riders} riders` : 'Buses, routes and riders'} compact>
            <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: 20, padding: 6, elevation: 3 }}>
              <SegmentedButtons value={tab} onValueChange={(v) => { haptic.tap(); setTab(v as Tab); }} density="small"
                buttons={[{ value: 'overview', label: 'Home' }, { value: 'vehicles', label: 'Buses' }, { value: 'routes', label: 'Routes' }, { value: 'students', label: 'Riders' }]} />
            </View>
          </Hero>
        }>
        <View style={{ height: space.lg }} />
        {ov.error ? <ErrorState message={ov.error} onRetry={reload} /> : null}
        {!d ? <LoadingCards /> : (
          <>
            {tab === 'overview' ? <Overview d={d} onRoute={(r) => { setRouteFilter(r.id); setTab('students'); }} /> : null}
            {tab === 'vehicles' ? (
              d.vehicles.length ? d.vehicles.map((v, i) => (
                <VehicleCard key={v.id} v={v} index={i} canEdit={canEdit} onEdit={() => setVehicleSheet({ open: true, v })}
                  onArchive={() => setConfirm({ kind: 'vehicle', id: v.id, label: v.number })} />
              )) : <EmptyState icon="bus" title="No vehicles yet" text={canEdit ? 'Add your first bus or van.' : undefined} />
            ) : null}
            {tab === 'routes' ? (
              d.routes.length ? d.routes.map((r, i) => (
                <FadeIn key={r.id} index={i}>
                  <Panel title={r.name} subtitle={r.vehicle_number ? `${r.vehicle_number} · ${r.stops.length} stops` : `${r.stops.length} stops · no vehicle`}
                    icon="map-marker-path" onPress={canEdit ? () => setRouteSheet({ open: true, r }) : undefined}
                    right={canEdit ? <Button compact textColor={t.colors.error} icon="archive-arrow-down-outline" onPress={() => setConfirm({ kind: 'route', id: r.id, label: r.name })}>{''}</Button> : undefined}>
                    <SeatsBar used={r.riders} capacity={r.capacity} />
                    <View style={{ height: space.md }} />
                    <StopTimeline stops={r.stops} />
                    <Button compact icon="account-group-outline" onPress={() => { setRouteFilter(r.id); setTab('students'); }} style={{ alignSelf: 'flex-start' }}>
                      See {r.riders} rider{r.riders === 1 ? '' : 's'}
                    </Button>
                  </Panel>
                </FadeIn>
              )) : <EmptyState icon="map-marker-path" title="No routes yet" text={canEdit ? 'Create a route with its stops.' : undefined} />
            ) : null}
            {tab === 'students' ? (
              <Riders routes={d.routes} riders={riders.data ?? []} loading={!riders.data} filter={routeFilter} setFilter={setRouteFilter} canEdit={canEdit}
                onMove={(r) => setAssign({ open: true, pre: { studentIds: [r.student_id], routeId: r.route_id } })}
                onRemove={(r) => setConfirm({ kind: 'rider', id: r.student_id, label: r.name })} />
            ) : null}
          </>
        )}
      </Screen>

      {fab ? <AnimatedFAB icon={fab.icon} label={fab.label} extended onPress={() => { haptic.tap(); fab.onPress(); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} /> : null}

      <VehicleSheet visible={vehicleSheet.open} vehicle={vehicleSheet.v} onDismiss={() => setVehicleSheet({ open: false, v: null })}
        onSaved={() => { setVehicleSheet({ open: false, v: null }); reload(); }} />
      <RouteSheet visible={routeSheet.open} route={routeSheet.r} vehicles={d?.vehicles ?? []} onDismiss={() => setRouteSheet({ open: false, r: null })}
        onSaved={() => { setRouteSheet({ open: false, r: null }); reload(); }} />
      <AssignSheet visible={assign.open} routes={d?.routes ?? []} riders={riders.data ?? []} students={people.data?.students ?? []}
        classes={people.data?.classes ?? []} preselect={assign.pre} onDismiss={() => setAssign({ open: false })}
        onSaved={() => { setAssign({ open: false }); reload(); }} />
      <TopLayer visible={!!confirm} onDismiss={() => setConfirm(null)}>
        <Dialog visible={!!confirm} onDismiss={() => setConfirm(null)}>
          <Dialog.Icon icon={confirm?.kind === 'rider' ? 'account-remove-outline' : 'archive-arrow-down-outline'} />
          <Dialog.Title style={{ textAlign: 'center' }}>
            {confirm?.kind === 'rider' ? `Remove ${confirm.label} from transport?` : `Archive ${confirm?.label}?`}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {confirm?.kind === 'vehicle' ? 'Routes using it will have no vehicle. You can restore it from More → Archive.'
                : confirm?.kind === 'route' ? 'Routes with riders can’t be archived — move the students first.'
                  : 'They will no longer see a bus in their app.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={doArchive}>{confirm?.kind === 'rider' ? 'Remove' : 'Archive'}</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </View>
  );
}

function Overview({ d, onRoute }: { d: TransportOverview; onRoute: (r: TransportRoute) => void }) {
  const t = useAppTheme();
  return (
    <>
      <FadeIn>
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
          <StatTile icon="bus" label="Vehicles" value={d.vehicles.length} />
          <StatTile icon="map-marker-path" label="Routes" value={d.routes.length} tone="warning" />
          <StatTile icon="account-group" label="Riders" value={d.riders} tone="success" hint={`of ${d.students} students`} />
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <Panel title="Alerts" icon="alert-outline" tone={d.alerts.length ? 'warning' : 'success'}
          subtitle={d.alerts.length ? 'Documents expiring within 30 days or overloaded vehicles' : 'All documents valid · no overloaded vehicles'}>
          {d.alerts.map((a) => (
            <View key={a.vehicle} style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              <PlateChip number={a.vehicle} />
              {a.items.map((it) => <ToneChip key={it} text={it === 'Over capacity' ? it : `${it} expiring`} tone={it === 'Over capacity' ? 'danger' : 'warning'} icon="alert-circle-outline" />)}
            </View>
          ))}
        </Panel>
      </FadeIn>
      <SectionTitle title="Routes" />
      {d.routes.length ? d.routes.map((r, i) => (
        <FadeIn key={r.id} index={i + 2}>
          <Panel onPress={() => onRoute(r)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
              <Icon name="map-marker-path" size={20} color={t.colors.primary} />
              <Text variant="titleSmall" style={{ flex: 1, fontWeight: '700', color: t.colors.onSurface }} numberOfLines={1}>{r.name}</Text>
              {r.vehicle_number ? <PlateChip number={r.vehicle_number} /> : <ToneChip text="No vehicle" tone="warning" />}
            </View>
            <SeatsBar used={r.riders} capacity={r.capacity} />
          </Panel>
        </FadeIn>
      )) : <EmptyState icon="map-marker-path" title="No routes yet" />}
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center', marginTop: space.md }}>
        Transport fees will connect to Fees in Phase 3.
      </Text>
    </>
  );
}

function VehicleCard({ v, index, canEdit, onEdit, onArchive }: { v: Vehicle; index: number; canEdit: boolean; onEdit: () => void; onArchive: () => void }) {
  const t = useAppTheme();
  const docs: [string, string | null][] = [['Insurance', v.insurance_until], ['Fitness', v.fitness_until], ['Licence', v.licence_until]];
  return (
    <FadeIn index={index}>
      <Panel onPress={canEdit ? onEdit : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: t.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={KIND_ICON[v.kind] ?? 'bus'} size={28} color={t.colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <PlateChip number={v.number} large />
            <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>
              {v.kind.charAt(0).toUpperCase() + v.kind.slice(1)} · {v.seats_used}/{v.capacity} seats used
            </Text>
          </View>
          {canEdit ? <Button compact textColor={t.colors.error} icon="archive-arrow-down-outline" onPress={onArchive}>{''}</Button> : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>
          {docs.map(([label, date]) => {
            const left = daysUntil(date);
            const tone = expiryTone(date);
            return (
              <ToneChip key={label} tone={tone} icon={tone === 'danger' ? 'alert-circle' : tone === 'warning' ? 'clock-alert-outline' : 'check-circle-outline'}
                text={date ? `${label}: ${left !== null && left < 0 ? 'expired' : fmtDay(date)}` : `${label}: not set`} />
            );
          })}
        </View>
        {v.driver_name || v.driver_phone ? (
          <Row title={v.driver_name || 'Driver'} subtitle={`Driver${v.driver_phone ? ` · ${v.driver_phone}` : ''}`} divider={!!v.attendant_name}
            left={<Icon name="steering" size={22} color={t.colors.onSurfaceVariant} />} right={<CallButton phone={v.driver_phone} />} />
        ) : null}
        {v.attendant_name ? (
          <Row title={v.attendant_name} subtitle={`Attendant${v.attendant_phone ? ` · ${v.attendant_phone}` : ''}`} divider={false}
            left={<Icon name="account-heart-outline" size={22} color={t.colors.onSurfaceVariant} />} right={<CallButton phone={v.attendant_phone} />} />
        ) : null}
      </Panel>
    </FadeIn>
  );
}

function Riders({ routes, riders, loading, filter, setFilter, canEdit, onMove, onRemove }: {
  routes: TransportRoute[]; riders: Rider[]; loading: boolean; filter: number; setFilter: (n: number) => void; canEdit: boolean;
  onMove: (r: Rider) => void; onRemove: (r: Rider) => void;
}) {
  const t = useAppTheme();
  const list = riders.filter((r) => !filter || r.route_id === filter).sort((a, b) => (a.stop_name ?? '').localeCompare(b.stop_name ?? '') || a.name.localeCompare(b.name));
  const routeName = (id: number) => routes.find((r) => r.id === id)?.name ?? '';
  return (
    <>
      <FilterChips value={filter} onChange={setFilter}
        options={[{ label: `All · ${riders.length}`, value: 0 }, ...routes.map((r) => ({ label: `${r.name.split('·')[0].trim()} · ${r.riders}`, value: r.id }))]} />
      {loading ? <LoadingCards /> : list.length ? (
        <FadeIn>
          <Panel>
            {list.map((r, i) => (
              <Row key={r.student_id} title={r.name} divider={i < list.length - 1}
                subtitle={`${r.class_name ? `Class ${r.class_name} · ` : ''}${r.stop_name ?? 'No stop'}${filter ? '' : ` · ${routeName(r.route_id)}`}`}
                left={<Icon name="account-school-outline" size={22} color={t.colors.primary} />}
                right={canEdit ? (
                  <View style={{ flexDirection: 'row' }}>
                    <Button compact onPress={() => onMove(r)}>Change</Button>
                    <Button compact textColor={t.colors.error} onPress={() => onRemove(r)}>Remove</Button>
                  </View>
                ) : undefined} />
            ))}
          </Panel>
        </FadeIn>
      ) : <EmptyState icon="account-group-outline" title="No riders" text={canEdit ? 'Use “Assign students” to add riders.' : undefined} />}
    </>
  );
}
