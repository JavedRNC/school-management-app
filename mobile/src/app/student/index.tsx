import { Text, View } from 'react-native';

import { Ring } from '@/components/charts';
import { fmtDate, PostList } from '@/components/PostList';
import { Card, ErrorBox, Header, Loading, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import type { MyAttendance, Post } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentHome() {
  const { user } = useAuth();
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [att, notices] = await Promise.all([api<MyAttendance>('/me/attendance'), api<Post[]>('/posts', { params: { kind: 'notice' } })]);
    return { att, notices };
  });

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title={`Hi, ${user?.name.split(' ')[0] ?? ''} 👋`} subtitle={`Roll no. ${user?.roll_no ?? '-'}`} />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!data ? <Loading /> : (
        <>
          <Card title="My attendance">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
              <Ring value={data.att.percent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{data.att.present_days} of {data.att.total_days} days present</Text>
                <Text style={[styles.muted, { fontSize: 13, marginTop: 4 }]}>
                  {data.att.percent >= 75 ? 'Great — keep it up!' : 'Below 75% — try not to miss school.'}
                </Text>
              </View>
            </View>
            <Text style={[styles.label, { marginTop: space.lg }]}>Recent days</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[...data.att.recent].reverse().slice(-21).map((r) => (
                <View key={r.date} style={{ alignItems: 'center', width: 34 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: r.present ? colors.goodSoft : colors.badSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: r.present ? colors.good : colors.bad }}>{r.present ? 'P' : 'A'}</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: colors.muted }}>{fmtDate(r.date).split(' ')[0]}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Text style={[styles.h2, { marginVertical: space.sm }]}>Notices</Text>
          <PostList posts={data.notices} />
        </>
      )}
    </Screen>
  );
}
