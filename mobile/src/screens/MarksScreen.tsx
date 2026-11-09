import { useLocalSearchParams } from 'expo-router';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB, Text, TextInput } from 'react-native-paper';

import { subjectIcon } from '@/components/TimetableView';
import { EmptyState, ErrorState, FilterChips, Hero, LoadingCards, Panel, Screen, ToneChip, UserAvatar } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { gradeOf, pctTone, radius, space, toneColors, useAppTheme } from '@/lib/theme';
import type { Assignment, Exam, MarkRow } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function MarksScreen() {
  const params = useLocalSearchParams<{ class_id?: string }>();
  const t = useAppTheme();
  const base = useLoad(async () => {
    const [assignments, exams] = await Promise.all([api<Assignment[]>('/assignments'), api<Exam[]>('/exams')]);
    return { assignments, exams };
  });
  const [aid, setAid] = useState<number | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const firstA = base.data?.assignments.find((x) => !params.class_id || x.class_id === Number(params.class_id)) ?? base.data?.assignments[0];
  const a = base.data?.assignments.find((x) => x.id === (aid ?? firstA?.id));
  const exam = base.data?.exams.find((e) => e.id === (examId ?? base.data?.exams[0]?.id));

  const pickers = base.data ? (
    <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
      <FilterChips label="Exam" options={base.data.exams.map((e) => ({ label: e.name, value: e.id, icon: 'file-document-outline' as const }))} value={exam?.id} onChange={setExamId} />
      <FilterChips label="Class & subject" value={a?.id} onChange={setAid}
        options={base.data.assignments.map((x) => ({ label: `${x.class_name} · ${x.subject_name}`, value: x.id, icon: subjectIcon(x.subject_name) }))} />
    </View>
  ) : null;

  if (base.error) return <Screen header={<Hero title="Marks" compact />}><ErrorState message={base.error} onRetry={base.reload} /></Screen>;
  if (!base.data) return <Screen header={<Hero title="Marks" compact />}><LoadingCards /></Screen>;
  if (!base.data.assignments.length) return <Screen header={<Hero title="Marks" compact />}><EmptyState icon="book-off-outline" title="No subjects assigned" text="Ask the principal to assign you a subject." /></Screen>;
  if (!base.data.exams.length) return <Screen header={<Hero title="Marks" compact />}><EmptyState icon="file-document-outline" title="No exams yet" text="The principal creates exams in Classes → Setup." /></Screen>;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {a && exam ? <MarkSheet key={`${a.id}-${exam.id}`} a={a} exam={exam} pickers={pickers} /> : null}
    </View>
  );
}

function MarkSheet({ a, exam, pickers }: { a: Assignment; exam: Exam; pickers: ReactNode }) {
  const t = useAppTheme();
  const toast = useToast();
  const { data, error, reload } = useLoad(
    () => api<MarkRow[]>('/marks', { params: { exam_id: exam.id, class_id: a.class_id, subject_id: a.subject_id } }), [a.id, exam.id]);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const refs = useRef<Record<number, { focus: () => void } | null>>({});

  useEffect(() => {
    if (data) setVals(Object.fromEntries(data.map((r) => [r.student_id, r.score == null ? '' : String(r.score)])));
  }, [data]);

  const stats = useMemo(() => {
    const nums = Object.values(vals).filter((v) => v.trim() !== '' && !Number.isNaN(Number(v))).map(Number);
    if (!nums.length) return null;
    const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
    return { n: nums.length, avg, hi: Math.max(...nums), lo: Math.min(...nums), pass: nums.filter((n) => (100 * n) / exam.max_marks >= 33).length };
  }, [vals, exam.max_marks]);

  const dirty = !!data?.some((r) => (r.score == null ? '' : String(r.score)) !== (vals[r.student_id] ?? ''));

  async function save() {
    if (!data) return;
    const records = [];
    for (const r of data) {
      const v = (vals[r.student_id] ?? '').trim();
      if (!v) continue;
      const n = Number(v);
      if (Number.isNaN(n) || n < 0 || n > exam.max_marks) {
        refs.current[r.student_id]?.focus();
        return toast(`${r.name}: enter 0–${exam.max_marks}`, { error: true });
      }
      records.push({ student_id: r.student_id, score: n });
    }
    if (!records.length) return toast('Enter at least one mark', { error: true });
    setBusy(true);
    try {
      await api('/marks', { body: { exam_id: exam.id, class_id: a.class_id, subject_id: a.subject_id, records } });
      toast(`${records.length} marks saved`);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <>
      <Hero title="Marks" subtitle={`${exam.name} · ${a.subject_name} · Class ${a.class_name}`} compact>
        <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: space.md, flexDirection: 'row', elevation: 3,
          shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          {[
            { label: 'Entered', value: stats ? `${stats.n}/${data?.length ?? 0}` : `0/${data?.length ?? 0}` },
            { label: 'Average', value: stats ? stats.avg.toFixed(1) : '—' },
            { label: 'Highest', value: stats ? String(stats.hi) : '—' },
            { label: 'Passing', value: stats ? `${stats.pass}` : '—' },
          ].map((s, i) => (
            <View key={s.label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: t.colors.outlineVariant }}>
              <Text variant="titleLarge" style={{ fontWeight: '800', color: t.colors.onSurface }}>{s.value}</Text>
              <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </Hero>
      {pickers}
    </>
  );

  return (
    <>
      <Screen header={header} footerSpace={140}>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!data ? <LoadingCards count={5} /> : !data.length ? <EmptyState title="No students in this class" /> : (
          <Panel title={`Out of ${exam.max_marks}`} subtitle="Grade updates as you type" icon="pencil-box-multiple-outline">
            {data.map((r, i) => {
              const raw = vals[r.student_id] ?? '';
              const n = raw === '' ? null : Number(raw);
              const bad = n != null && (Number.isNaN(n) || n > exam.max_marks);
              const pct = n != null && !bad ? (100 * n) / exam.max_marks : null;
              const tone = pct == null ? 'neutral' : pctTone(pct, 50);
              return (
                <View key={r.student_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6,
                  borderBottomWidth: i < data.length - 1 ? 0.5 : 0, borderBottomColor: t.colors.outlineVariant }}>
                  <UserAvatar name={r.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge" style={{ color: t.colors.onSurface, fontWeight: '500' }} numberOfLines={1}>{r.name}</Text>
                    <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant }}>Roll {r.roll_no ?? '-'}</Text>
                  </View>
                  {pct != null ? <ToneChip text={gradeOf(pct)} tone={tone} /> : null}
                  <TextInput mode="outlined" dense value={raw} placeholder="—" keyboardType="decimal-pad" returnKeyType={i < data.length - 1 ? 'next' : 'done'}
                    ref={(el: unknown) => { refs.current[r.student_id] = el as { focus: () => void } | null; }}
                    onSubmitEditing={() => refs.current[data[i + 1]?.student_id]?.focus()}
                    blurOnSubmit={i === data.length - 1}
                    onChangeText={(v) => { const c = v.replace(/[^0-9.]/g, ''); if (Number(c) > exam.max_marks) haptic.error(); setVals((s) => ({ ...s, [r.student_id]: c })); }}
                    error={bad} style={{ width: 76, textAlign: 'center', backgroundColor: pct != null ? toneColors(t, tone).bg : undefined }} />
                </View>
              );
            })}
          </Panel>
        )}
      </Screen>
      {data?.length && dirty ? (
        <AnimatedFAB icon="content-save-outline" label={busy ? 'Saving…' : 'Save marks'} extended onPress={save} disabled={busy}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}
    </>
  );
}
