import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Checkbox, Chip, HelperText, ProgressBar, Searchbar, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { Icon, Sheet, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { fmtDate, inr } from '@/lib/fees';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { BatchPreview, FeeBatch, FeeConfig, FeeStudentRow } from '@/lib/types';

import { DATE_RE, isoIn, KV, MoneyInput, parseAmount } from './common';

type Target = 'school' | 'classes' | 'students';
const SUGGEST = ['Examination fee', 'Annual day fee', 'Maintenance fee', 'Sports fee', 'Picnic fee'];

/** 3-step wizard: details → who pays → review & roll out (F14). */
export function RolloutSheet({ visible, onDismiss, onDone, classes }: {
  visible: boolean; onDismiss: () => void; onDone: (b: FeeBatch) => void; classes: FeeConfig['classes'];
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(isoIn(14));
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<Target>('school');
  const [classIds, setClassIds] = useState<number[]>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [excludeIds, setExcludeIds] = useState<number[]>([]);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<FeeStudentRow[] | null>(null);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(0); setTitle(''); setAmount(''); setDue(isoIn(14)); setNote(''); setTarget('school');
    setClassIds([]); setStudentIds([]); setExcludeIds([]); setExcludeOpen(false); setQ(''); setPreview(null);
  }, [visible]);

  useEffect(() => {
    if (visible && step === 1 && !students) {
      api<FeeStudentRow[]>('/fees/students').then(setStudents).catch((e) => toast((e as Error).message, { error: true }));
    }
  }, [visible, step, students, toast]);

  const amt = parseAmount(amount);
  const dueOk = !due || DATE_RE.test(due);
  const step0Ok = title.trim().length >= 2 && amt > 0 && dueOk;
  const step1Ok = target === 'school' || (target === 'classes' ? classIds.length > 0 : studentIds.length > 0);

  // pool the exclusions are chosen from
  const pool = useMemo(() => {
    const all = students ?? [];
    if (target === 'classes') return all.filter((s) => s.class_id != null && classIds.includes(s.class_id));
    if (target === 'students') return all.filter((s) => studentIds.includes(s.id));
    return all;
  }, [students, target, classIds, studentIds]);

  const listed = useMemo(() => {
    const base = target === 'students' && !excludeOpen ? (students ?? []) : pool;
    const ql = q.trim().toLowerCase();
    const rows = ql ? base.filter((s) => s.name.toLowerCase().includes(ql) || s.admission_no.toLowerCase().includes(ql) || s.class_name.toLowerCase().includes(ql)) : base;
    return rows.slice(0, 80);
  }, [students, pool, q, target, excludeOpen]);

  const body = () => ({
    title: title.trim(), amount: amt, due_date: due || null, note: note.trim(), target,
    class_ids: target === 'classes' ? classIds : [], student_ids: target === 'students' ? studentIds : [],
    exclude_ids: target === 'students' ? [] : excludeIds.filter((id) => pool.some((p) => p.id === id)),
  });

  async function toReview() {
    setBusy(true);
    try {
      const p = await api<BatchPreview>('/fees/batches', { body: { ...body(), preview: true } });
      setPreview(p);
      setStep(2);
      haptic.light();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  async function rollOut() {
    setBusy(true);
    try {
      const b = await api<FeeBatch>('/fees/batches', { body: body() });
      toast(`${b.title} rolled out to ${b.count} students · ${inr(b.expected)}`);
      onDone(b);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (arr: number[], set: (v: number[]) => void, id: number) => { haptic.tap(); set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]); };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Roll out a fee">
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: space.md }}>
        {['Details', 'Who pays', 'Review'].map((s, i) => (
          <View key={s} style={{ flex: 1 }}>
            <ProgressBar progress={i <= step ? 1 : 0} color={t.colors.primary} style={{ height: 4, borderRadius: 2 }} />
            <Text variant="labelSmall" style={{ color: i === step ? t.colors.primary : t.colors.onSurfaceVariant, fontWeight: i === step ? '800' : '500', marginTop: 4 }}>
              {i + 1}. {s}
            </Text>
          </View>
        ))}
      </View>

      {step === 0 ? (
        <View>
          <TextInput mode="outlined" label="Fee name" value={title} onChangeText={setTitle} maxLength={120} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: space.sm }}>
            {SUGGEST.map((s) => (
              <Chip key={s} compact selected={title === s} onPress={() => { haptic.tap(); setTitle(s); }}>{s}</Chip>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <MoneyInput label="Amount per student" value={amount} onChange={setAmount} style={{ flex: 1 }} />
            <TextInput mode="outlined" label="Due date" value={due} onChangeText={setDue} placeholder="YYYY-MM-DD" error={!dueOk} style={{ flex: 1 }} />
          </View>
          <HelperText type={dueOk ? 'info' : 'error'}>{dueOk ? (due ? `Due ${fmtDate(due)}` : 'No due date — never overdue') : 'Use YYYY-MM-DD'}</HelperText>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: space.sm }}>
            {[7, 14, 30].map((d) => <Chip key={d} compact onPress={() => { haptic.tap(); setDue(isoIn(d)); }}>In {d} days</Chip>)}
          </View>
          <TextInput mode="outlined" label="Note for parents (optional)" value={note} onChangeText={setNote} multiline maxLength={500} />
          <Button mode="contained" icon="arrow-right" onPress={() => { haptic.tap(); setStep(1); }} disabled={!step0Ok} style={{ marginTop: space.lg }}
            contentStyle={{ paddingVertical: 6, flexDirection: 'row-reverse' }}>Next: who pays</Button>
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <SegmentedButtons value={target} density="small" onValueChange={(v) => { haptic.tap(); setTarget(v as Target); setExcludeOpen(false); setQ(''); }}
            buttons={[{ value: 'school', label: 'Whole school', icon: 'domain' }, { value: 'classes', label: 'Classes', icon: 'google-classroom' },
              { value: 'students', label: 'Students', icon: 'account-multiple-check-outline' }]} />
          <View style={{ height: space.md }} />
          {target === 'classes' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
              <Chip compact icon="select-all" onPress={() => { haptic.tap(); setClassIds(classIds.length === classes.length ? [] : classes.map((c) => c.id)); }}>
                {classIds.length === classes.length ? 'Clear' : 'All'}
              </Chip>
              {classes.map((c) => (
                <Chip key={c.id} selected={classIds.includes(c.id)} showSelectedCheck onPress={() => toggle(classIds, setClassIds, c.id)}>
                  {c.name} · {c.students}
                </Chip>
              ))}
            </View>
          ) : null}

          {target === 'school' || (target === 'classes' && classIds.length) ? (
            <Button compact mode={excludeOpen ? 'contained-tonal' : 'text'} icon="account-cancel-outline" style={{ alignSelf: 'flex-start', marginBottom: space.sm }}
              onPress={() => { haptic.tap(); setExcludeOpen((o) => !o); }}>
              {excludeIds.length ? `${excludeIds.length} excluded` : 'Exclude some students'}
            </Button>
          ) : null}

          {target === 'students' || excludeOpen ? (
            <View>
              <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>
                {target === 'students' ? `Pick students · ${studentIds.length} selected` : 'Tick students who should NOT pay'}
              </Text>
              <Searchbar placeholder="Search name, admission no. or class" value={q} onChangeText={setQ} style={{ marginBottom: space.sm }} />
              {!students ? <Text style={{ color: t.colors.onSurfaceVariant, padding: space.md }}>Loading students…</Text> : (
                <View style={{ borderRadius: radius.lg, backgroundColor: t.colors.surface, overflow: 'hidden' }}>
                  {listed.map((s) => {
                    const sel = target === 'students' ? studentIds.includes(s.id) : excludeIds.includes(s.id);
                    return (
                      <Checkbox.Item key={s.id} status={sel ? 'checked' : 'unchecked'} mode="android" position="leading"
                        label={`${s.name} · ${s.class_name || "No class"} · ${s.admission_no}`} labelVariant="bodyMedium" labelStyle={{ textAlign: 'left' }}
                        onPress={() => (target === 'students' ? toggle(studentIds, setStudentIds, s.id) : toggle(excludeIds, setExcludeIds, s.id))}
                        style={{ paddingVertical: 2 }} />
                    );
                  })}
                  {!listed.length ? <Text style={{ color: t.colors.onSurfaceVariant, padding: space.md }}>No students match.</Text> : null}
                </View>
              )}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
            <Button mode="outlined" icon="arrow-left" onPress={() => setStep(0)} style={{ flex: 1 }}>Back</Button>
            <Button mode="contained" icon="eye-check-outline" onPress={toReview} loading={busy} disabled={!step1Ok || busy} style={{ flex: 1.4 }}>Review</Button>
          </View>
        </View>
      ) : null}

      {step === 2 && preview ? (
        <View>
          <View style={{ borderRadius: radius.xl, padding: space.lg, backgroundColor: t.colors.primaryContainer, marginBottom: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Icon name="star-four-points-outline" size={22} color={t.colors.onPrimaryContainer} />
              <Text variant="titleMedium" style={{ fontWeight: '800', color: t.colors.onPrimaryContainer, flex: 1 }}>{title.trim()}</Text>
            </View>
            <Text variant="headlineMedium" style={{ fontWeight: '900', color: t.colors.onPrimaryContainer, marginTop: space.sm }}>{inr(preview.total)}</Text>
            <Text variant="bodyMedium" style={{ color: t.colors.onPrimaryContainer }}>{inr(amt)} × {preview.count} student{preview.count === 1 ? '' : 's'}</Text>
          </View>
          <KV k="Due" v={due ? fmtDate(due) : 'No due date'} />
          {excludeIds.length && target !== 'students' ? <KV k="Excluded" v={`${body().exclude_ids.length} students`} /> : null}
          {preview.by_class.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: space.sm }}>
              {preview.by_class.map((b) => <ToneChip key={b.class_name} text={`${b.class_name} · ${b.students}`} tone="primary" />)}
            </View>
          ) : null}
          {preview.sample.length ? (
            <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
              Including {preview.sample.join(', ')}{preview.count > preview.sample.length ? ` and ${preview.count - preview.sample.length} more` : ''}.
            </Text>
          ) : null}
          {!preview.count ? <HelperText type="error">No students match — go back and change the selection.</HelperText> : null}
          <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
            It appears in each family's Fees immediately. You can withdraw it later; charges already paid are kept.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
            <Button mode="outlined" icon="arrow-left" onPress={() => setStep(1)} style={{ flex: 1 }}>Back</Button>
            <Button mode="contained" icon="send-check-outline" onPress={rollOut} loading={busy} disabled={busy || !preview.count} style={{ flex: 1.6 }}>
              Roll out to {preview.count}
            </Button>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
