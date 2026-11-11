import { useState } from 'react';
import { Share, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { EmptyState, ErrorState, FadeIn, LoadingCards, Panel, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_LABEL, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { pctTone, space, toneColors, useAppTheme } from '@/lib/theme';
import type { StaffReport } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { MonthSwitcher } from './MyAttendance';
import { monthKey, monthLabel } from './util';

/** Monthly staff attendance report with share. */
export function Report() {
  const t = useAppTheme();
  const { school } = useAuth();
  const now = monthKey(new Date());
  const [month, setMonth] = useState(now);
  const { data, error, reload } = useLoad(() => api<StaffReport>('/staff-attendance/report', { params: { month } }), [month]);

  function share() {
    if (!data) return;
    haptic.tap();
    const lines = data.rows.map((r) => `${r.name}: ${r.present} present (${r.late} late), ${r.leave} leave, ${r.absent} absent — ${r.percent}%`);
    Share.share({ message: `${school?.name ?? 'School'} · Staff attendance ${monthLabel(month)} (${data.school_days} school days)\n\n${lines.join('\n')}` }).catch(() => {});
  }

  return (
    <View>
      <Panel>
        <MonthSwitcher month={month} onChange={setMonth} max={now} />
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center' }}>
          {data ? `${data.school_days} school day${data.school_days === 1 ? '' : 's'} so far` : ' '}
        </Text>
      </Panel>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <LoadingCards count={3} /> : !data.rows.length ? <EmptyState icon="account-group-outline" title="No staff yet" /> : (
        <FadeIn>
          <Panel>
            {data.rows.map((r, i) => {
              const c = toneColors(t, pctTone(r.percent, 85));
              return (
                <View key={r.user_id} style={{ paddingVertical: space.sm, borderBottomWidth: i < data.rows.length - 1 ? 0.5 : 0, borderBottomColor: t.colors.outlineVariant }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <UserAvatar name={r.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyLarge" style={{ fontWeight: '600', color: t.colors.onSurface }} numberOfLines={1}>{r.name}</Text>
                      <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>
                        {ROLE_LABEL[r.role]} · ✓ {r.present} · ⏰ {r.late} · ✈ {r.leave} · ✗ {r.absent}
                      </Text>
                    </View>
                    <Text variant="titleMedium" style={{ fontWeight: '700', color: c.fg }}>{r.percent}%</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: t.custom.chartTrack, marginTop: 6, marginLeft: 48, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, r.percent)}%`, height: 6, borderRadius: 3, backgroundColor: c.fg }} />
                  </View>
                </View>
              );
            })}
          </Panel>
          <Button mode="contained-tonal" icon="share-variant" onPress={share} style={{ marginBottom: space.md }}>Share report</Button>
        </FadeIn>
      )}
    </View>
  );
}
