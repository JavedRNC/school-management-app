import { useState } from 'react';
import { Alert, Modal, Text, View } from 'react-native';

import { TimetableView } from '@/components/TimetableView';
import { Button, Card, Chips, Empty, ErrorBox, Field, Header, ListRow, Loading, Pill, Screen, styles } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, DAYS, space } from '@/lib/theme';
import type { Assignment, Exam, SchoolClass, Slot, Subject, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Tab = 'subjects' | 'timetable' | 'setup';

export default function Classes() {
  const [classId, setClassId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('subjects');
  const base = useLoad(async () => {
    const [classes, subjects, teachers, assignments, exams] = await Promise.all([
      api<SchoolClass[]>('/classes'), api<Subject[]>('/subjects'), api<User[]>('/users', { params: { role: 'teacher' } }),
      api<Assignment[]>('/assignments'), api<Exam[]>('/exams'),
    ]);
    return { classes, subjects, teachers, assignments, exams };
  });
  const d = base.data;
  const cid = classId ?? d?.classes[0]?.id ?? null;

  return (
    <Screen onRefresh={base.refresh} refreshing={base.refreshing}>
      <Header title="Classes" subtitle="Subjects, teachers & timetable" />
      {base.error ? <ErrorBox message={base.error} onRetry={base.reload} /> : null}
      {!d ? <Loading /> : (
        <>
          <Chips options={[{ label: 'Subjects & teachers', value: 'subjects' as Tab }, { label: 'Timetable', value: 'timetable' as Tab }, { label: 'School setup', value: 'setup' as Tab }]}
            value={tab} onChange={setTab} />
          {tab !== 'setup' ? (
            d.classes.length ? <Chips label="Class" options={d.classes.map((c) => ({ label: `${c.name} (${c.student_count})`, value: c.id }))} value={cid} onChange={setClassId} />
              : <Empty text="Create a class in School setup first" />
          ) : null}
          {tab === 'subjects' && cid ? <SubjectTeachers classId={cid} data={d} onChange={base.reload} /> : null}
          {tab === 'timetable' && cid ? <ClassTimetable classId={cid} data={d} /> : null}
          {tab === 'setup' ? <Setup data={d} onChange={base.reload} /> : null}
        </>
      )}
    </Screen>
  );
}

type Base = { classes: SchoolClass[]; subjects: Subject[]; teachers: User[]; assignments: Assignment[]; exams: Exam[] };

function SubjectTeachers({ classId, data, onChange }: { classId: number; data: Base; onChange: () => void }) {
  const [editing, setEditing] = useState<Subject | null>(null);
  const cls = data.classes.find((c) => c.id === classId);
  const ct = data.teachers.find((t) => t.id === cls?.class_teacher_id);

  async function assign(teacherId: number) {
    if (!editing) return;
    try {
      await api('/assignments', { body: { teacher_id: teacherId, class_id: classId, subject_id: editing.id } });
      setEditing(null);
      onChange();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }

  async function setClassTeacher(teacherId: number) {
    if (!cls) return;
    try {
      await api(`/classes/${cls.id}`, { method: 'PUT', body: { name: cls.name, class_teacher_id: teacherId } });
      onChange();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }

  return (
    <>
      <Card title="Class teacher">
        <Chips options={data.teachers.map((t) => ({ label: t.name, value: t.id }))} value={ct?.id} onChange={setClassTeacher} />
        <Text style={[styles.muted, { fontSize: 12 }]}>The class teacher can mark attendance for this class.</Text>
      </Card>
      <Card title="Subject teachers">
        {data.subjects.map((s) => {
          const a = data.assignments.find((x) => x.class_id === classId && x.subject_id === s.id);
          return (
            <ListRow key={s.id} title={s.name} onPress={() => setEditing(s)}
              right={a ? <Pill text={a.teacher_name} /> : <Pill text="Assign" color={colors.warn} bg={colors.warnSoft} />} />
          );
        })}
      </Card>
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Card style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: space.xl * 2 }} title={`Who teaches ${editing?.name}?`}>
            {data.teachers.map((t) => <ListRow key={t.id} title={t.name} subtitle={t.email} onPress={() => assign(t.id)} />)}
            <Button title="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ marginTop: space.md }} />
          </Card>
        </View>
      </Modal>
    </>
  );
}

function ClassTimetable({ classId, data }: { classId: number; data: Base }) {
  const tt = useLoad(() => api<Slot[]>('/timetable', { params: { class_id: classId } }), [classId]);
  const [slot, setSlot] = useState<{ day: number; period: number; current?: Slot } | null>(null);
  const subjectsHere = data.assignments.filter((a) => a.class_id === classId);

  async function save(a: Assignment) {
    if (!slot) return;
    try {
      await api('/timetable', { method: 'PUT', body: { class_id: classId, day: slot.day, period: slot.period, subject_id: a.subject_id, teacher_id: a.teacher_id } });
      setSlot(null);
      tt.reload();
    } catch (e) {
      Alert.alert('Could not set', (e as Error).message);
    }
  }
  async function clear() {
    if (!slot?.current) return;
    await api(`/timetable/${slot.current.id}`, { method: 'DELETE' });
    setSlot(null);
    tt.reload();
  }

  return (
    <>
      {tt.error ? <ErrorBox message={tt.error} onRetry={tt.reload} /> : null}
      {tt.data ? <TimetableView slots={tt.data} show="teacher" onSlotPress={(day, period, current) => setSlot({ day, period, current })} /> : <Loading />}
      <Modal visible={!!slot} transparent animationType="slide" onRequestClose={() => setSlot(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Card style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: space.xl * 2 }}
            title={slot ? `${DAYS[slot.day]} · Period ${slot.period}` : ''}>
            {subjectsHere.length ? subjectsHere.map((a) => (
              <ListRow key={a.id} title={a.subject_name} subtitle={a.teacher_name} onPress={() => save(a)}
                right={slot?.current?.subject_id === a.subject_id ? <Pill text="Current" /> : undefined} />
            )) : <Empty text="Assign subject teachers first" />}
            {slot?.current ? <Button title="Clear this period" variant="danger" onPress={clear} style={{ marginTop: space.md }} /> : null}
            <Button title="Cancel" variant="ghost" onPress={() => setSlot(null)} style={{ marginTop: space.sm }} />
          </Card>
        </View>
      </Modal>
    </>
  );
}

function Setup({ data, onChange }: { data: Base; onChange: () => void }) {
  const [cls, setCls] = useState('');
  const [sub, setSub] = useState('');
  const [exam, setExam] = useState('');
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
  const [max, setMax] = useState('100');

  async function run(fn: () => Promise<unknown>, reset: () => void) {
    try {
      await fn();
      reset();
      onChange();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }

  return (
    <>
      <Card title="Classes">
        <Text style={[styles.muted, { marginBottom: space.sm }]}>{data.classes.map((c) => c.name).join(', ') || 'None yet'}</Text>
        <Field label="New class name" value={cls} onChangeText={setCls} placeholder="e.g. 10-B" />
        <Button title="Add class" variant="secondary" disabled={!cls.trim()}
          onPress={() => run(() => api('/classes', { body: { name: cls } }), () => setCls(''))} />
      </Card>
      <Card title="Subjects">
        <Text style={[styles.muted, { marginBottom: space.sm }]}>{data.subjects.map((s) => s.name).join(', ') || 'None yet'}</Text>
        <Field label="New subject" value={sub} onChangeText={setSub} placeholder="e.g. Computer Science" />
        <Button title="Add subject" variant="secondary" disabled={!sub.trim()}
          onPress={() => run(() => api('/subjects', { body: { name: sub } }), () => setSub(''))} />
      </Card>
      <Card title="Exams">
        {data.exams.map((e) => <ListRow key={e.id} title={e.name} subtitle={`${e.date} · out of ${e.max_marks}`} />)}
        <View style={{ height: space.md }} />
        <Field label="Exam name" value={exam} onChangeText={setExam} placeholder="e.g. Unit Test 2" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 2 }}><Field label="Date (YYYY-MM-DD)" value={examDate} onChangeText={setExamDate} /></View>
          <View style={{ flex: 1 }}><Field label="Max marks" value={max} onChangeText={setMax} keyboardType="number-pad" /></View>
        </View>
        <Button title="Add exam" variant="secondary" disabled={!exam.trim()}
          onPress={() => run(() => api('/exams', { body: { name: exam, date: examDate, max_marks: Number(max) || 100 } }), () => setExam(''))} />
      </Card>
    </>
  );
}
