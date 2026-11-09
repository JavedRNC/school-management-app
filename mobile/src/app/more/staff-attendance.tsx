import { useState } from 'react';
import { View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

import { StatusBanner } from '@/components/StatusBanner';
import { DayBoard } from '@/components/staff/DayBoard';
import { GeoSettings } from '@/components/staff/GeoSettings';
import { MyAttendance } from '@/components/staff/MyAttendance';
import { Report } from '@/components/staff/Report';
import { EmptyState, Hero, Screen } from '@/components/ui';
import { useAuth, useCan, useModule } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { space } from '@/lib/theme';

type Tab = 'mine' | 'today' | 'report' | 'setup';

/** GPS staff attendance (F22): my check-ins, today's board, monthly report, school location setup. */
export default function StaffAttendanceScreen() {
  const { user } = useAuth();
  const enabled = useModule('staff_attendance');
  const isStaff = !!user && ['teacher', 'vice_principal', 'coordinator'].includes(user.role);
  const canBoard = useCan('staff_attendance', 'view');
  const canSetup = useCan('settings', 'edit');

  const tabs: { value: Tab; label: string; icon: string }[] = [
    ...(isStaff ? [{ value: 'mine' as Tab, label: 'Mine', icon: 'account-clock-outline' }] : []),
    ...(canBoard ? [{ value: 'today' as Tab, label: 'Day', icon: 'calendar-today' }, { value: 'report' as Tab, label: 'Report', icon: 'chart-box-outline' }] : []),
    ...(canSetup ? [{ value: 'setup' as Tab, label: 'Setup', icon: 'map-marker-radius-outline' }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? 'mine');

  if (!enabled) {
    return (
      <Screen header={<Hero title="Staff attendance" compact />}>
        <EmptyState icon="map-marker-off-outline" title="Not in your plan"
          text="GPS staff attendance is part of the Staff attendance module. Contact support to enable it." />
      </Screen>
    );
  }
  if (!tabs.length) {
    return (
      <Screen header={<Hero title="Staff attendance" compact />}>
        <EmptyState icon="lock-outline" title="No access" text="You don't have permission to view staff attendance." />
      </Screen>
    );
  }

  return (
    <Screen header={<Hero title="Staff attendance" subtitle="GPS check-in at school" compact />}>
      <StatusBanner />
      {tabs.length > 1 ? (
        <SegmentedButtons value={tab} onValueChange={(v) => { haptic.tap(); setTab(v as Tab); }} density="small" style={{ marginBottom: space.md }}
          buttons={tabs.map((x) => ({ value: x.value, label: x.label, icon: x.icon }))} />
      ) : null}
      <View>
        {tab === 'mine' && isStaff ? <MyAttendance /> : null}
        {tab === 'today' && canBoard ? <DayBoard /> : null}
        {tab === 'report' && canBoard ? <Report /> : null}
        {tab === 'setup' && canSetup ? <GeoSettings /> : null}
      </View>
    </Screen>
  );
}
