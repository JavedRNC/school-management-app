import { Text, View } from 'react-native';

import { HBarChart } from '@/components/charts';
import { fmtDate } from '@/components/PostList';
import { Card, Empty, ErrorBox, Header, Loading, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { pctColor, space } from '@/lib/theme';
import type { ReportCard } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentMarks() {
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<ReportCard[]>('/me/marks'));
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Report card" />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!data ? <Loading /> : !data.length ? <Empty text="No marks published yet" /> : data.map((c) => (
        <Card key={c.exam_id} title={c.exam} right={<Text style={styles.muted}>{fmtDate(c.date)}</Text>}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginBottom: space.md }}>
            <Text style={{ fontSize: 30, fontWeight: '800', color: pctColor(c.percent, 50) }}>{c.percent}%</Text>
            <Text style={styles.muted}>{c.total} / {c.max_marks * c.subjects.length}</Text>
          </View>
          <HBarChart low={50} data={c.subjects.map((s) => ({ label: `${s.subject}  ${s.score}/${c.max_marks}`, value: Math.round((100 * s.score) / c.max_marks) }))} />
        </Card>
      ))}
    </Screen>
  );
}
