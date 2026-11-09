import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { api } from '@/lib/api';
import { useModule } from '@/lib/auth';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { MyBus } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { PersonLine, PlateChip, StopTimeline } from './transport/common';
import { FadeIn, Icon, Panel } from './ui';

/** Student / parent bus card (self-loading). Renders nothing unless Transport is on and the student is assigned. */
export function MyBusCard({ studentId }: { studentId?: number }) {
  const enabled = useModule('transport');
  if (!enabled) return null;
  return <BusCardInner studentId={studentId} />;
}

function BusCardInner({ studentId }: { studentId?: number }) {
  const t = useAppTheme();
  const { data } = useLoad(
    () => api<MyBus>('/transport/me', { params: studentId ? { student_id: studentId } : undefined }), [studentId]);
  if (!data || !data.assigned) return null;
  return (
    <FadeIn>
      <Panel style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ margin: -space.lg }}>
          <LinearGradient colors={[t.custom.heroStart, t.custom.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ padding: space.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="bus-school" size={20} color="#fff" />
                <Text variant="labelLarge" style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>School bus</Text>
              </View>
              {data.vehicle_number ? <PlateChip number={data.vehicle_number} kind={data.vehicle_kind} /> : null}
            </View>
            <Text variant="titleMedium" style={{ color: '#fff', fontWeight: '800' }} numberOfLines={2}>{data.route}</Text>
            {data.stop ? (
              <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
                <TimeBox label="Pickup" time={data.pickup_time} icon="weather-sunset-up" />
                <TimeBox label="Drop" time={data.drop_time} icon="home-import-outline" />
              </View>
            ) : null}
            {data.stop ? (
              <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.85)', marginTop: space.sm }}>Stop: {data.stop}</Text>
            ) : (
              <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.85)', marginTop: space.sm }}>Stop not assigned yet</Text>
            )}
          </LinearGradient>
          <View style={{ padding: space.lg }}>
            <StopTimeline stops={data.stops} compact />
            <View style={{ height: 1, backgroundColor: t.colors.outlineVariant, marginVertical: space.sm }} />
            <PersonLine icon="steering" label="Driver" name={data.driver_name} phone={data.driver_phone} />
            <PersonLine icon="account-heart-outline" label="Attendant" name={data.attendant_name} phone={data.attendant_phone} />
          </View>
        </View>
      </Panel>
    </FadeIn>
  );
}

function TimeBox({ label, time, icon }: { label: string; time: string | null; icon: 'weather-sunset-up' | 'home-import-outline' }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={14} color="rgba(255,255,255,0.85)" />
        <Text variant="labelSmall" style={{ color: 'rgba(255,255,255,0.85)' }}>{label}</Text>
      </View>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{time || '--:--'}</Text>
    </View>
  );
}
