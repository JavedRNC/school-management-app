import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { TimetableView } from '@/components/TimetableView';
import { Button, Card, ErrorBox, Header, ListRow, Loading, Pill, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import type { Assignment, SchoolClass, Slot } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function TeacherHome() {
  const { user } = useAuth();
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [slots, classes, assignments] = await Promise.all([
      api<Slot[]>('/timetable'), api<SchoolClass[]>('/classes'), api<Assignment[]>('/assignments'),
    ]);
    return { slots, classes, assignments };
  });
  const myClass = data?.classes.find((c) => c.class_teacher_id === user?.id);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title={`Hello, ${user?.name.split(' ')[0] ?? ''}`} subtitle={new Date().toDateString()} />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!data ? <Loading /> : (
        <>
          {myClass ? (
            <Card>
              <Text style={styles.muted}>Class teacher of</Text>
              <Text style={[styles.h2, { marginBottom: space.md }]}>{myClass.name} · {myClass.student_count} students</Text>
              <Button title="Take today's attendance" onPress={() => router.push('/teacher/attendance')} />
            </Card>
          ) : null}
          <Card title="My subjects">
            {data.assignments.map((a) => (
              <ListRow key={a.id} title={a.subject_name} right={<Pill text={`Class ${a.class_name}`} color={colors.muted} bg={colors.bg} />} />
            ))}
          </Card>
          <Text style={[styles.h2, { marginVertical: space.sm }]}>My timetable</Text>
          <View>
            <TimetableView slots={data.slots} show="class" />
          </View>
        </>
      )}
    </Screen>
  );
}
