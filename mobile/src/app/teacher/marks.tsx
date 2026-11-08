import { useEffect, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Button, Card, Chips, Empty, ErrorBox, Header, Loading, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, space } from '@/lib/theme';
import type { Assignment, Exam, MarkRow } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Marks() {
  const base = useLoad(async () => {
    const [assignments, exams] = await Promise.all([api<Assignment[]>('/assignments'), api<Exam[]>('/exams')]);
    return { assignments, exams };
  });
  const [aid, setAid] = useState<number | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const a = base.data?.assignments.find((x) => x.id === (aid ?? base.data?.assignments[0]?.id));
  const exam = base.data?.exams.find((e) => e.id === (examId ?? base.data?.exams[0]?.id));

  return (
    <Screen>
      <Header title="Exam marks" />
      {base.error ? <ErrorBox message={base.error} onRetry={base.reload} /> : null}
      {!base.data ? <Loading /> : !base.data.assignments.length ? <Empty text="No subjects assigned to you yet" />
        : !base.data.exams.length ? <Empty text="The principal hasn't created any exams yet" /> : (
          <>
            <Chips label="Exam" options={base.data.exams.map((e) => ({ label: e.name, value: e.id }))} value={exam?.id} onChange={setExamId} />
            <Chips label="Class & subject" options={base.data.assignments.map((x) => ({ label: `${x.class_name} · ${x.subject_name}`, value: x.id }))}
              value={a?.id} onChange={setAid} />
            {a && exam ? <MarkSheet key={`${a.id}-${exam.id}`} a={a} exam={exam} /> : null}
          </>
        )}
    </Screen>
  );
}

function MarkSheet({ a, exam }: { a: Assignment; exam: Exam }) {
  const { data, error, reload } = useLoad(
    () => api<MarkRow[]>('/marks', { params: { exam_id: exam.id, class_id: a.class_id, subject_id: a.subject_id } }), [a.id, exam.id]);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setVals(Object.fromEntries(data.map((r) => [r.student_id, r.score == null ? '' : String(r.score)])));
  }, [data]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty text="No students in this class" />;

  const filled = Object.values(vals).filter((v) => v.trim() !== '');
  const avg = filled.length ? filled.reduce((s, v) => s + Number(v), 0) / filled.length : null;

  async function save() {
    const records = [];
    for (const r of data!) {
      const v = (vals[r.student_id] ?? '').trim();
      if (!v) continue;
      const n = Number(v);
      if (Number.isNaN(n) || n < 0 || n > exam.max_marks) return Alert.alert('Check marks', `${r.name}: enter 0–${exam.max_marks}`);
      records.push({ student_id: r.student_id, score: n });
    }
    if (!records.length) return Alert.alert('Enter at least one mark');
    setBusy(true);
    try {
      await api('/marks', { body: { exam_id: exam.id, class_id: a.class_id, subject_id: a.subject_id, records } });
      Alert.alert('Saved', `${records.length} marks saved`);
      reload();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={`Out of ${exam.max_marks}`}
      right={<Text style={styles.muted}>{filled.length}/{data.length}{avg != null ? ` · avg ${avg.toFixed(1)}` : ''}</Text>}>
      {data.map((r) => (
        <View key={r.student_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Text style={[styles.muted, { width: 32 }]}>{r.roll_no ?? '-'}</Text>
          <Text style={[styles.body, { flex: 1 }]}>{r.name}</Text>
          <TextInput value={vals[r.student_id] ?? ''} onChangeText={(t) => setVals((v) => ({ ...v, [r.student_id]: t.replace(/[^0-9.]/g, '') }))}
            keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.muted}
            style={{ width: 70, textAlign: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 7, fontSize: 15, color: colors.text, backgroundColor: '#fff' }} />
        </View>
      ))}
      <Button title="Save marks" onPress={save} loading={busy} style={{ marginTop: space.md }} />
    </Card>
  );
}
