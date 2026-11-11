import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { FadeIn, Icon, Panel, ToneChip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth, useModule } from '@/lib/auth';
import { space, useAppTheme } from '@/lib/theme';
import type { LeaveRequest, OnLeaveToday } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { fmtRange, STAFF_ROLES, STATUS_ICON, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from './common';

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return null;
    throw e;
  }
}

/** Home-screen card for leaves. Self-loading; renders nothing when the module is off or there's nothing to show. */
export function LeaveSummaryCard() {
  const t = useAppTheme();
  const { user } = useAuth();
  const enabled = useModule('leaves');
  const role = user?.role;
  const isManagerish = role === 'principal' || role === 'vice_principal' || role === 'coordinator' || role === 'teacher';
  const { data } = useLoad(async () => {
    if (!enabled || !role || role === 'student' || role === 'admin') return null;
    const [inbox, today, mine] = await Promise.all([
      isManagerish ? orNull(api<LeaveRequest[]>('/leaves', { params: { scope: 'inbox', status: 'pending' } })) : Promise.resolve(null),
      isManagerish ? orNull(api<OnLeaveToday>('/leaves/today')) : Promise.resolve(null),
      orNull(api<LeaveRequest[]>('/leaves', { params: { scope: 'mine' } })),
    ]);
    return { inbox, today, mine };
  }, [enabled, role]);

  if (!enabled || !data) return null;
  const go = (params?: Record<string, string>) => router.push({ pathname: '/more/leaves', params } as never);
  const pending = data.inbox?.filter((x) => x.can_decide).length ?? 0;
  const onLeave = [...(data.today?.staff ?? []), ...(data.today?.students ?? [])];
  const latest = data.mine?.[0];
  const isParent = role === 'parent';
  const isStaff = STAFF_ROLES.includes(role ?? '');

  if (!pending && !onLeave.length && !latest && !isParent) return null;

  return (
    <FadeIn>
      <Panel title="Leaves" icon="calendar-account" onPress={() => go()}
        subtitle={pending ? `${pending} request${pending === 1 ? '' : 's'} waiting for you` : onLeave.length ? `${onLeave.length} on leave today` : 'Your requests'}
        right={pending ? (
          <View style={{ minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: t.custom.warning, alignItems: 'center', justifyContent: 'center',
            shadowColor: t.custom.amber, shadowOpacity: 0.6, shadowRadius: 8, elevation: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{pending}</Text>
          </View>
        ) : <Icon name="chevron-right" size={22} color={t.colors.outline} />}>
        {onLeave.length ? (
          <View style={{ marginBottom: latest ? space.md : 0 }}>
            <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>On leave today</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {onLeave.slice(0, 6).map((p) => (
                <ToneChip key={p.user_id} text={`${p.name.split(' ')[0]}${p.class_name ? ` · ${p.class_name}` : ''}${p.half_day ? ' · ½' : ''}`} tone="neutral" icon="account-clock-outline" />
              ))}
              {onLeave.length > 6 ? <ToneChip text={`+${onLeave.length - 6}`} /> : null}
            </View>
          </View>
        ) : null}
        {latest && (isStaff || isParent) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" style={{ color: t.colors.onSurface, fontWeight: '600' }} numberOfLines={1}>
                {isParent ? `${latest.user_name.split(' ')[0]} · ` : ''}{TYPE_LABEL[latest.leave_type] ?? latest.leave_type} leave
              </Text>
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{fmtRange(latest.start_date, latest.end_date)}</Text>
            </View>
            <ToneChip text={STATUS_LABEL[latest.status]} tone={STATUS_TONE[latest.status]} icon={STATUS_ICON[latest.status]} />
          </View>
        ) : null}
        {isParent ? (
          <Button mode="contained-tonal" icon="calendar-plus" onPress={() => go({ apply: '1' })} style={{ marginTop: latest ? space.md : 0 }}>
            Apply leave for my child
          </Button>
        ) : null}
      </Panel>
    </FadeIn>
  );
}
