import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { DataTools } from '@/components/data/DataTools';
import { ErrorState, Hero, LoadingCards, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { space, useAppTheme } from '@/lib/theme';
import type { AdminSchoolDetail } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

/** Admin · import / backup for one school — only while the school has granted support access (privacy rule). */
export default function AdminSchoolData() {
  const t = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = Number(id);
  const detail = useLoad(() => api<AdminSchoolDetail>(`/admin/schools/${sid}`), [sid]);
  const d = detail.data;
  return (
    <Screen onRefresh={detail.refresh} refreshing={detail.refreshing}
      header={<Hero eyebrow={d?.code ?? 'School'} title="Import & backup" subtitle={d?.name ?? ' '} compact />}>
      <View style={{ height: space.lg }} />
      {detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : null}
      {!d ? (detail.error ? null : <LoadingCards />) : !d.privacy.full_access ? (
        <Panel tone="warning" title="Support access needed" icon="shield-lock-outline"
          subtitle="This school's data is private. Ask the principal to allow support access (Me → Privacy) — then you can import or back up for them.">
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Every import and backup you do is recorded in the school's activity log.</Text>
        </Panel>
      ) : (
        <>
          <Panel tone="primary" title="Acting for the school" icon="account-tie-outline"
            subtitle="Recorded in the school's activity log. Principal accounts can't be changed from a file." />
          <DataTools base={`/admin/schools/${sid}/data`} schoolCode={d.code} schoolName={d.name} />
        </>
      )}
    </Screen>
  );
}
