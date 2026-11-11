import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, SegmentedButtons, Text, TextInput, TouchableRipple } from 'react-native-paper';

import { bellSummary, useBell } from '@/components/BellTimes';
import { subjectIcon, TimetableView } from '@/components/TimetableView';
import {
  EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, IconBadge, IconName, LoadingCards, Panel, PressScale, Row, Screen, Sheet, ToneChip,
  UserAvatar, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { DAYS, radius, space, useAppTheme } from '@/lib/theme';
import type { Assignment, Exam, SchoolClass, Slot, Subject, Usage, User } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Tab = 'subjects' | 'timetable' | 'setup';
type Base = { classes: SchoolClass[]; subjects: Subject[]; teachers: User[]; assignments: Assignment[]; exams: Exam[] };

export default function Classes() {
  const t = useAppTheme();
  const canEdit = useCan('classes', 'edit');
  const canAtt = useCan('attendance', 'view');
  const canExams = useCan('exams', 'view');
  const [classId, setClassId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('subjects');
  const base = useLoad(async (): Promise<Base> => {
    const [classes, subjects, teachers, assignments, exams] = await Promise.all([
      api<SchoolClass[]>('/classes'), api<Subject[]>('/subjects'),
      api<User[]>('/users', { params: { role: 'teacher' } }).catch(() => [] as User[]), // needs People view
      api<Assignment[]>('/assignments'), api<Exam[]>('/exams'),
    ]);
    return { classes, subjects, teachers, assignments, exams };
  });
  const d = base.data;
  const cid = classId ?? d?.classes[0]?.id ?? null;

  return (
    <Screen onRefresh={base.refresh} refreshing={base.refreshing}
      header={
        <Hero title="Classes" subtitle="Teachers, timetable & school setup" compact>
          <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: 6, elevation: 3,
            shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <SegmentedButtons value={tab} onValueChange={(v) => { haptic.tap(); setTab(v as Tab); }} density="small"
              buttons={[{ value: 'subjects', label: 'Teachers' }, { value: 'timetable', label: 'Timetable' }, { value: 'setup', label: 'Setup' }]} />
          </View>
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      {base.error ? <ErrorState message={base.error} onRetry={base.reload} /> : null}
      {!d ? <LoadingCards /> : (
        <>
          {tab !== 'setup' ? (
            d.classes.length
              ? <FilterChips options={d.classes.map((c) => ({ label: `${c.name}`, value: c.id, icon: 'google-classroom' as const }))} value={cid} onChange={setClassId} />
              : <EmptyState icon="google-classroom" title="No classes yet" text="Create your first class in Setup." action="Go to Setup" onAction={() => setTab('setup')} />
          ) : null}
          {tab !== 'setup' && cid && (canAtt || canExams) ? (
            <FadeIn>
              <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
                {([['clipboard-check-outline', 'Attendance', '/records/attendance', canAtt], ['pencil-box-multiple-outline', 'Marks', '/records/marks', canExams]] as const)
                  .filter((x) => x[3]).map(([icon, label, path]) => (
                  <PressScale key={label} style={{ flex: 1 }} onPress={() => router.push({ pathname: path, params: { class_id: String(cid) } })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: t.colors.secondaryContainer, borderRadius: radius.lg, padding: space.md }}>
                      <Icon name={icon} size={22} color={t.colors.onSecondaryContainer} />
                      <View style={{ flex: 1 }}>
                        <Text variant="labelLarge" style={{ fontWeight: '800', color: t.colors.onSecondaryContainer }}>{label}</Text>
                        <Text variant="labelSmall" style={{ color: t.colors.onSecondaryContainer }}>View & edit</Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={t.colors.onSecondaryContainer} />
                    </View>
                  </PressScale>
                ))}
              </View>
            </FadeIn>
          ) : null}
          {!canEdit ? (
            <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>View only — you can't change classes.</Text>
          ) : null}
          {tab === 'subjects' && cid ? <SubjectTeachers key={cid} classId={cid} data={d} onChange={base.reload} canEdit={canEdit} /> : null}
          {tab === 'timetable' && cid ? <ClassTimetable key={cid} classId={cid} data={d} canEdit={canEdit} /> : null}
          {tab === 'setup' ? <Setup data={d} onChange={base.reload} canEdit={canEdit} /> : null}
        </>
      )}
    </Screen>
  );
}

function SubjectTeachers({ classId, data, onChange, canEdit }: { classId: number; data: Base; onChange: () => void; canEdit: boolean }) {
  const t = useAppTheme();
  const toast = useToast();
  const [editing, setEditing] = useState<Subject | 'class-teacher' | null>(null);
  const cls = data.classes.find((c) => c.id === classId)!;
  const ct = data.teachers.find((x) => x.id === cls.class_teacher_id);
  const assigned = data.assignments.filter((a) => a.class_id === classId).length;

  async function pick(teacher: User) {
    try {
      if (editing === 'class-teacher') {
        await api(`/classes/${cls.id}`, { method: 'PUT', body: { name: cls.name, class_teacher_id: teacher.id } });
        toast(`${teacher.name} is now class teacher of ${cls.name}`);
      } else if (editing) {
        await api('/assignments', { body: { teacher_id: teacher.id, class_id: classId, subject_id: editing.id } });
        toast(`${teacher.name} teaches ${editing.name} in ${cls.name}`);
      }
      setEditing(null);
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  const currentAssignment = editing && editing !== 'class-teacher'
    ? data.assignments.find((a) => a.class_id === classId && a.subject_id === editing.id) : undefined;

  async function unassign() {
    try {
      if (editing === 'class-teacher') {
        await api(`/classes/${cls.id}`, { method: 'PUT', body: { name: cls.name, class_teacher_id: null } });
        toast(`${cls.name} has no class teacher now`);
      } else if (currentAssignment) {
        await api(`/assignments/${currentAssignment.id}`, { method: 'DELETE' });
        toast(`${currentAssignment.subject_name} has no teacher in ${cls.name} now`);
      }
      setEditing(null);
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <>
      <FadeIn>
        <Panel onPress={canEdit ? () => { haptic.tap(); setEditing('class-teacher'); } : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            {ct ? <UserAvatar name={ct.name} size={52} /> : <IconBadge icon="account-question-outline" tone="warning" size={52} />}
            <View style={{ flex: 1 }}>
              <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant }}>Class teacher · {cls.name}</Text>
              <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.onSurface }}>{ct?.name ?? 'Not assigned'}</Text>
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{cls.student_count} students · {assigned}/{data.subjects.length} subjects staffed</Text>
            </View>
            {canEdit ? <Icon name="pencil-outline" size={20} color={t.colors.primary} /> : null}
          </View>
        </Panel>
      </FadeIn>
      <FadeIn index={1}>
        <Panel title="Subject teachers" subtitle="Tap a subject to change its teacher" icon="book-education-outline">
          {data.subjects.map((s, i) => {
            const a = data.assignments.find((x) => x.class_id === classId && x.subject_id === s.id);
            return (
              <Row key={s.id} title={s.name} subtitle={a?.teacher_name ?? 'No teacher yet'} divider={i < data.subjects.length - 1}
                onPress={canEdit ? () => setEditing(s) : undefined}
                left={<View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.colors.primaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={subjectIcon(s.name)} size={22} color={t.colors.primary} /></View>}
                right={a ? <Icon name="check-circle" size={20} color={t.custom.success} /> : <ToneChip text="Assign" tone="warning" />} />
            );
          })}
        </Panel>
      </FadeIn>
      <Sheet visible={!!editing} onDismiss={() => setEditing(null)}
        title={editing === 'class-teacher' ? `Class teacher for ${cls.name}` : editing ? `Who teaches ${editing.name}?` : ''}>
        {data.teachers.map((x, i) => {
          const current = editing === 'class-teacher' ? x.id === cls.class_teacher_id
            : !!editing && data.assignments.some((a) => a.class_id === classId && a.subject_id === editing.id && a.teacher_id === x.id);
          return (
            <Row key={x.id} title={x.name} subtitle={`Login ID ${x.login_id}`} divider={i < data.teachers.length - 1} onPress={() => pick(x)}
              left={<UserAvatar name={x.name} size={40} />} right={current ? <ToneChip text="Current" tone="success" /> : undefined} />
          );
        })}
        {(editing === 'class-teacher' && cls.class_teacher_id) || currentAssignment ? (
          <Button mode="outlined" icon="account-cancel-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error, marginTop: space.md }}
            onPress={unassign}>{editing === 'class-teacher' ? 'Remove class teacher' : 'Remove teacher from this subject'}</Button>
        ) : null}
      </Sheet>
    </>
  );
}

function ClassTimetable({ classId, data, canEdit }: { classId: number; data: Base; canEdit: boolean }) {
  const toast = useToast();
  const tt = useLoad(() => api<Slot[]>('/timetable', { params: { class_id: classId } }), [classId]);
  const [slot, setSlot] = useState<{ day: number; period: number; current?: Slot } | null>(null);
  const here = data.assignments.filter((a) => a.class_id === classId);

  async function save(a: Assignment) {
    if (!slot) return;
    try {
      await api('/timetable', { method: 'PUT', body: { class_id: classId, day: slot.day, period: slot.period, subject_id: a.subject_id, teacher_id: a.teacher_id } });
      toast(`${DAYS[slot.day]} P${slot.period}: ${a.subject_name}`);
      setSlot(null);
      tt.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }
  async function clear() {
    if (!slot?.current) return;
    await api(`/timetable/${slot.current.id}`, { method: 'DELETE' });
    toast('Period cleared');
    setSlot(null);
    tt.reload();
  }

  return (
    <>
      {tt.error ? <ErrorState message={tt.error} onRetry={tt.reload} /> : null}
      {tt.data ? <TimetableView slots={tt.data} show="teacher" onSlotPress={canEdit ? (day, period, current) => setSlot({ day, period, current }) : undefined} /> : <LoadingCards />}
      <Sheet visible={!!slot} onDismiss={() => setSlot(null)} title={slot ? `${DAYS[slot.day]} · Period ${slot.period}` : ''}>
        {here.length ? here.map((a, i) => (
          <Row key={a.id} title={a.subject_name} subtitle={a.teacher_name} divider={i < here.length - 1} onPress={() => save(a)}
            left={<Icon name={subjectIcon(a.subject_name)} size={24} />}
            right={slot?.current?.subject_id === a.subject_id ? <ToneChip text="Current" tone="success" /> : undefined} />
        )) : <EmptyState icon="account-tie-outline" title="No subject teachers" text="Assign teachers to this class first." />}
        {slot?.current ? <Button icon="close-circle-outline" mode="outlined" onPress={clear} style={{ marginTop: space.md }}>Make it a free period</Button> : null}
      </Sheet>
    </>
  );
}

function Setup({ data, onChange, canEdit }: { data: Base; onChange: () => void; canEdit: boolean }) {
  const t = useAppTheme();
  const canExamEdit = useCan('exams', 'edit');
  const toast = useToast();
  const [sheet, setSheet] = useState<'class' | 'subject' | 'exam' | null>(null);
  const [name, setName] = useState('');
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
  const [max, setMax] = useState('100');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [rename, setRename] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [subj, setSubj] = useState<Subject | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const { bell } = useBell();
  const ownDays = bell ? Object.keys(bell.overrides).map((d) => DAYS[Number(d)]) : [];

  function openClass(c: SchoolClass) {
    haptic.tap();
    setRename(c.name);
    setEditing(c);
  }

  async function saveRename() {
    if (!editing || !rename.trim()) return haptic.error();
    setBusy(true);
    try {
      await api(`/classes/${editing.id}`, { method: 'PUT', body: { name: rename.trim(), class_teacher_id: editing.class_teacher_id } });
      toast(`Renamed to ${rename.trim()}`);
      setEditing(null);
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function deleteClass() {
    if (!editing) return;
    setConfirmDel(false);
    setBusy(true);
    try {
      await api(`/classes/${editing.id}`, { method: 'DELETE' });
      toast(`Class ${editing.name} archived`);
      setEditing(null);
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!name.trim()) return haptic.error();
    setBusy(true);
    try {
      if (sheet === 'class') await api('/classes', { body: { name } });
      if (sheet === 'subject') await api('/subjects', { body: { name } });
      if (sheet === 'exam') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) throw new Error('Date must be YYYY-MM-DD');
        await api('/exams', { body: { name, date: examDate, max_marks: Number(max) || 100 } });
      }
      toast(`${name.trim()} added`);
      setName('');
      setSheet(null);
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  type Item = { key: string; label: string; onPress?: () => void };
  const Block = ({ kind, title, icon, items, index, hint, editable }: { kind: 'class' | 'subject' | 'exam'; title: string; icon: IconName; items: Item[]; index: number; hint?: string; editable: boolean }) => (
    <FadeIn index={index}>
      <Panel title={title} subtitle={editable ? hint ?? `${items.length} total` : `${items.length} total`} icon={icon}
        right={editable ? <Button mode="contained-tonal" compact icon="plus" onPress={() => { haptic.tap(); setName(''); setSheet(kind); }}>Add</Button> : undefined}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {items.length ? items.map((x) => (
            <TouchableRipple key={x.key} disabled={!x.onPress} onPress={x.onPress} borderless style={{ borderRadius: radius.pill }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: x.onPress ? t.colors.primaryContainer : t.colors.surfaceVariant,
                borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text variant="labelLarge" style={{ color: x.onPress ? t.colors.onPrimaryContainer : t.colors.onSurfaceVariant }}>{x.label}</Text>
                {x.onPress ? <Icon name="pencil-outline" size={14} color={t.colors.onPrimaryContainer} /> : null}
              </View>
            </TouchableRipple>
          )) : <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>None yet</Text>}
        </View>
      </Panel>
    </FadeIn>
  );

  return (
    <>
      <Block kind="class" title="Classes" icon="google-classroom" index={0} editable={canEdit} hint={`${data.classes.length} total · tap one to rename or archive`}
        items={data.classes.map((c) => ({ key: String(c.id), label: c.name, onPress: canEdit ? () => openClass(c) : undefined }))} />
      <Block kind="subject" title="Subjects" icon="book-education-outline" index={1} editable={canEdit} hint={`${data.subjects.length} total · tap to edit`}
        items={data.subjects.map((x) => ({ key: String(x.id), label: x.name, onPress: canEdit ? () => { haptic.tap(); setSubj(x); } : undefined }))} />
      <FadeIn index={3}>
        <Panel icon="bell-ring-outline" title="Period timings"
          subtitle={bell ? (bell.configured ? `${bellSummary(bell.default)}${ownDays.length ? ` · own timings on ${ownDays.join(', ')}` : ''}` : 'Not set yet · tap to set start and end times')
            : 'Loading…'}
          onPress={() => { haptic.tap(); router.push('/more/periods'); }}
          right={<Icon name="chevron-right" size={22} color={t.colors.onSurfaceVariant} />} />
      </FadeIn>
      <Block kind="exam" title="Exams" icon="file-document-edit-outline" index={2} editable={canExamEdit} hint={`${data.exams.length} total · tap to edit`}
        items={data.exams.map((e) => ({ key: String(e.id), label: `${e.name} · ${new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
          onPress: canExamEdit ? () => { haptic.tap(); setExam(e); } : undefined }))} />
      <Text variant="labelSmall" style={{ color: t.colors.outline, textAlign: 'center', marginTop: space.xs }}>
        Archived items can be restored from Me → Archive.
      </Text>
      <Sheet visible={!!sheet} onDismiss={() => setSheet(null)} title={sheet === 'class' ? 'New class' : sheet === 'subject' ? 'New subject' : 'New exam'}>
        <TextInput mode="outlined" autoFocus label={sheet === 'class' ? 'Class name (e.g. 10-B)' : sheet === 'subject' ? 'Subject (e.g. Computer Science)' : 'Exam name (e.g. Unit Test 2)'}
          value={name} onChangeText={setName} style={{ marginBottom: space.md }} />
        {sheet === 'exam' ? (
          <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
            <TextInput mode="outlined" label="Date (YYYY-MM-DD)" value={examDate} onChangeText={setExamDate} style={{ flex: 2 }} left={<TextInput.Icon icon="calendar" />} />
            <TextInput mode="outlined" label="Max marks" value={max} onChangeText={(v) => setMax(v.replace(/\D/g, ''))} keyboardType="number-pad" style={{ flex: 1 }} />
          </View>
        ) : null}
        <Button mode="contained" icon="check" onPress={save} loading={busy} contentStyle={{ paddingVertical: 6 }}>Save</Button>
      </Sheet>

      <Sheet visible={!!editing} onDismiss={() => setEditing(null)} title={editing ? `Class ${editing.name}` : ''}>
        {editing ? (
          <View>
            <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
              {editing.student_count} student{editing.student_count === 1 ? '' : 's'} enrolled
            </Text>
            <TextInput mode="outlined" label="Class name" value={rename} onChangeText={setRename} style={{ marginBottom: space.md }} />
            <Button mode="contained" icon="content-save-outline" onPress={saveRename} loading={busy} disabled={rename.trim() === editing.name}
              contentStyle={{ paddingVertical: 6 }}>Save name</Button>
            <View style={{ height: 1, backgroundColor: t.colors.outlineVariant, marginVertical: space.lg }} />
            {editing.student_count > 0 ? (
              <Panel tone="warning" icon="account-alert-outline" title="Can't archive yet"
                subtitle={`Move or remove its ${editing.student_count} student${editing.student_count === 1 ? '' : 's'} first (People tab).`} />
            ) : null}
            <Button mode="outlined" icon="archive-arrow-down-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error }}
              disabled={busy || editing.student_count > 0} onPress={() => setConfirmDel(true)}>Archive class</Button>
          </View>
        ) : null}
      </Sheet>
      <TopLayer visible={confirmDel} onDismiss={() => setConfirmDel(false)}>
        <Dialog visible={confirmDel} onDismiss={() => setConfirmDel(false)}>
          <Dialog.Icon icon="archive-arrow-down-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Archive class {editing?.name}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">It will be hidden everywhere, but nothing is erased — restore it any time from Me → Archive.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDel(false)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={deleteClass}>Archive</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
      <SubjectEditor subject={subj} onClose={() => setSubj(null)} onChange={onChange} />
      <ExamEditor exam={exam} onClose={() => setExam(null)} onChange={onChange} />
    </>
  );
}

function ConfirmDelete({ visible, title, text, onCancel, onConfirm }: {
  visible: boolean; title: string; text: string; onCancel: () => void; onConfirm: () => void;
}) {
  const t = useAppTheme();
  return (
    <TopLayer visible={visible} onDismiss={onCancel}>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Icon icon="archive-arrow-down-outline" />
        <Dialog.Title style={{ textAlign: 'center' }}>{title}</Dialog.Title>
        <Dialog.Content><Text variant="bodyMedium">{text}</Text></Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Cancel</Button>
          <Button textColor={t.colors.error} onPress={onConfirm}>Archive</Button>
        </Dialog.Actions>
      </Dialog>
    </TopLayer>
  );
}

function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

function SubjectEditor({ subject, onClose, onChange }: { subject: Subject | null; onClose: () => void; onChange: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!subject) return;
    setName(subject.name);
    setUsage(null);
    api<Usage>(`/subjects/${subject.id}/usage`).then(setUsage).catch(() => {});
  }, [subject]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      onClose();
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const impact = usage ? [plural(usage.assignments, 'teacher assignment'), plural(usage.timetable, 'timetable period'), plural(usage.marks, 'mark')].join(', ') : '…';
  return (
    <>
      <Sheet visible={!!subject} onDismiss={onClose} title={subject ? subject.name : ''}>
        <TextInput mode="outlined" label="Subject name" value={name} onChangeText={setName} style={{ marginBottom: space.md }} />
        <Button mode="contained" icon="content-save-outline" loading={busy} disabled={!name.trim() || name.trim() === subject?.name}
          onPress={() => subject && run(() => api(`/subjects/${subject.id}`, { method: 'PUT', body: { name: name.trim() } }), 'Subject renamed')}
          contentStyle={{ paddingVertical: 6 }}>Save name</Button>
        <View style={{ height: 1, backgroundColor: t.colors.outlineVariant, marginVertical: space.lg }} />
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>Used in: {impact}</Text>
        <Button mode="outlined" icon="archive-arrow-down-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error }} disabled={busy}
          onPress={() => setConfirm(true)}>Archive subject</Button>
      </Sheet>
      <ConfirmDelete visible={confirm} title={`Archive ${subject?.name}?`}
        text={`It will be hidden with its ${impact}. Nothing is erased — restore it any time from Me → Archive and everything comes back.`}
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); if (subject) run(() => api(`/subjects/${subject.id}`, { method: 'DELETE' }), `${subject.name} archived`); }} />
    </>
  );
}

function ExamEditor({ exam, onClose, onChange }: { exam: Exam | null; onClose: () => void; onChange: () => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [max, setMax] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (exam) { setName(exam.name); setDate(exam.date); setMax(String(exam.max_marks)); }
  }, [exam]);

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const valid = name.trim() && dateOk && Number(max) > 0;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      onClose();
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const marks = exam?.mark_count ?? 0;
  return (
    <>
      <Sheet visible={!!exam} onDismiss={onClose} title={exam ? `Edit ${exam.name}` : ''}>
        <TextInput mode="outlined" label="Exam name" value={name} onChangeText={setName} style={{ marginBottom: space.md }} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <TextInput mode="outlined" label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} style={{ flex: 2 }} left={<TextInput.Icon icon="calendar" />} error={!dateOk} />
          <TextInput mode="outlined" label="Max marks" value={max} onChangeText={(v) => setMax(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" style={{ flex: 1 }} />
        </View>
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginVertical: space.sm }}>{plural(marks, 'mark')} entered for this exam</Text>
        <Button mode="contained" icon="content-save-outline" loading={busy} disabled={!valid}
          onPress={() => exam && run(() => api(`/exams/${exam.id}`, { method: 'PUT', body: { name: name.trim(), date, max_marks: Number(max) } }), 'Exam updated')}
          contentStyle={{ paddingVertical: 6 }}>Save changes</Button>
        <View style={{ height: 1, backgroundColor: t.colors.outlineVariant, marginVertical: space.lg }} />
        <Button mode="outlined" icon="archive-arrow-down-outline" textColor={t.colors.error} style={{ borderColor: t.colors.error }} disabled={busy}
          onPress={() => setConfirm(true)}>Archive exam</Button>
      </Sheet>
      <ConfirmDelete visible={confirm} title={`Archive ${exam?.name}?`}
        text={marks ? `Its ${plural(marks, 'mark')} will be hidden from report cards. Nothing is erased — restore it from Me → Archive.` : 'No marks have been entered for this exam yet. You can restore it from Me → Archive.'}
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); if (exam) run(() => api(`/exams/${exam.id}`, { method: 'DELETE' }), `${exam.name} archived`); }} />
    </>
  );
}
