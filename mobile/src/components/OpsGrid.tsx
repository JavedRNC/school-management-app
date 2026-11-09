import { router } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { useAuth, useCan, useModule } from '@/lib/auth';
import { radius, space, useAppTheme } from '@/lib/theme';

import { FadeIn, Icon, IconName, PressScale, SectionTitle } from './ui';

type Op = { key: string; label: string; icon: IconName; path: string; show: boolean };

/** Shortcuts (fees, leaves, staff attendance, transport, polls, banners) — shown only when allowed. */
export function useOps(): Op[] {
  const { user } = useAuth();
  const staff = user?.role === 'teacher' || user?.role === 'vice_principal' || user?.role === 'coordinator';
  const leaves = useModule('leaves');
  const staffAtt = useModule('staff_attendance');
  const transport = useModule('transport');
  const comms = useModule('communication');
  const fees = useModule('fees');
  const canFees = useCan('fees', 'view');
  const canLeaves = useCan('leaves', 'view');
  const canStaffAtt = useCan('staff_attendance', 'view');
  const canTransport = useCan('transport', 'view');
  const canNotices = useCan('notices', 'view');
  const parentish = user?.role === 'parent' || user?.role === 'student';
  return [
    { key: 'fees', label: 'Fees', icon: 'cash-multiple', path: parentish ? '/more/fees/my' : '/more/fees', show: fees && (canFees || parentish) },
    { key: 'leaves', label: 'Leaves', icon: 'calendar-account-outline', path: '/more/leaves', show: leaves && (canLeaves || staff || user?.role === 'parent') },
    { key: 'staff', label: 'Staff attendance', icon: 'map-marker-check-outline', path: '/more/staff-attendance', show: staffAtt && (staff || canStaffAtt) },
    { key: 'transport', label: 'Transport', icon: 'bus-school', path: '/more/transport', show: transport && (canTransport || parentish) },
    { key: 'polls', label: 'Forms & polls', icon: 'clipboard-check-multiple-outline', path: '/more/polls', show: comms },
    { key: 'banners', label: 'Banners', icon: 'image-text', path: '/more/banners', show: canNotices },
  ].filter((o) => o.show) as Op[];
}

export function OpsGrid({ title = 'Operations' }: { title?: string }) {
  const t = useAppTheme();
  const ops = useOps();
  if (!ops.length) return null;
  const tones = [t.colors.primaryContainer, t.colors.secondaryContainer, t.colors.tertiaryContainer];
  const fg = [t.colors.onPrimaryContainer, t.colors.onSecondaryContainer, t.colors.onTertiaryContainer];
  return (
    <FadeIn>
      <SectionTitle title={title} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {ops.map((o, i) => (
          <PressScale key={o.key} style={{ width: '31.5%' }} onPress={() => router.push(o.path as never)}>
            <View style={{ backgroundColor: tones[i % 3], borderRadius: radius.xl, paddingVertical: space.lg, paddingHorizontal: space.sm,
              alignItems: 'center', gap: 6, minHeight: 92 }}>
              <Icon name={o.icon} size={26} color={fg[i % 3]} />
              <Text variant="labelLarge" style={{ color: fg[i % 3], fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>{o.label}</Text>
            </View>
          </PressScale>
        ))}
      </View>
    </FadeIn>
  );
}
