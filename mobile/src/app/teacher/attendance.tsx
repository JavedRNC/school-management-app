import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Chips, Empty, ErrorBox, Header, Loading, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius, space } from '@/lib/theme';
import type { AttendanceRow, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

function isoDay(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Attendance() {
  const { user } = useAuth();
  const classes = useLoad(() => api<SchoolClass[]>('/classes'));
  const [classId, setClassId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const day = isoDay(offset);

  useEffect(() => {
    if (classes.data && classId == null) {
      const own = classes.data.find((c) => c.class_teacher_id === user?.id) ?? classes.data[0];
      if (own) setClassId(own.id);
    }
  }, [classes.data, classId, user]);

  return (
    <Screen>
      <Header title="Attendance" />
      {classes.error ? <ErrorBox message={classes.error} onRetry={classes.reload} /> : null}
      {!classes.data ? <Loading /> : !classes.data.length ? <Empty text="You aren't assigned to any class yet" /> : (
        <>
          <Chips label="Class" options={classes.data.map((c) => ({ label: c.name, value: c.id }))} value={classId} onChange={setClassId} />
          <Chips label="Day" options={[0, 1, 2, 3, 4, 5, 6].map((o) => ({
            label: o === 0 ? 'Today' : o === 1 ? 'Yesterday' : new Date(isoDay(o) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
            value: o,
          }))} value={offset} onChange={setOffset} />
          {classId ? <Sheet key={`${classId}-${day}`} classId={classId} day={day} /> : null}
        </>
      )}
    </Screen>
  );
}

function Sheet({ classId, day }: { classId: number; day: string }) {
  const { data, error, reload } = useLoad(() => api<AttendanceRow[]>('/attendance', { params: { class_id: classId, day } }), [classId, day]);
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setMarks(Object.fromEntries(data.map((r) => [r.student_id, r.present ?? true])));
  }, [data]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty text="No students in this class" />;

  const already = data.some((r) => r.present !== null);
  const present = Object.values(marks).filter(Boolean).length;

  async function save() {
    setBusy(true);
    try {
      await api('/attendance', { body: { class_id: classId, date: day, records: data!.map((r) => ({ student_id: r.student_id, present: marks[r.student_id] ?? true })) } });
      Alert.alert('Saved', `${present} present, ${data!.length - present} absent`);
      reload();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={already ? 'Marked — edit if needed' : 'Tap a student to mark absent'}
      right={<Text style={{ fontWeight: '700', color: colors.primary }}>{present}/{data.length}</Text>}>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Button title="All present" small variant="secondary" style={{ flex: 1 }} onPress={() => setMarks(Object.fromEntries(data.map((r) => [r.student_id, true])))} />
        <Button title="All absent" small variant="secondary" style={{ flex: 1 }} onPress={() => setMarks(Object.fromEntries(data.map((r) => [r.student_id, false])))} />
      </View>
      {data.map((r) => {
        const p = marks[r.student_id] ?? true;
        return (
          <Pressable key={r.student_id} onPress={() => setMarks((m) => ({ ...m, [r.student_id]: !p }))}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', padding: space.md, marginBottom: 6, borderRadius: radius.md,
              backgroundColor: p ? colors.goodSoft : colors.badSoft, opacity: pressed ? 0.7 : 1,
            }]}>
            <Text style={[styles.muted, { width: 32 }]}>{r.roll_no ?? '-'}</Text>
            <Text style={[styles.body, { flex: 1, fontWeight: '600' }]}>{r.name}</Text>
            <Text style={{ fontWeight: '800', color: p ? colors.good : colors.bad }}>{p ? 'P' : 'A'}</Text>
          </Pressable>
        );
      })}
      <Button title={already ? 'Update attendance' : 'Save attendance'} onPress={save} loading={busy} style={{ marginTop: space.md }} />
    </Card>
  );
}
