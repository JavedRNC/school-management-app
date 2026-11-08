import { useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, SegmentedButtons, TextInput } from 'react-native-paper';

import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space } from '@/lib/theme';
import type { SchoolClass, Subject } from '@/lib/types';

import { FilterChips, Sheet } from './ui';

function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Bottom sheet to post a notice or homework. */
export function PostComposer({ visible, onDismiss, classes, subjects, allowSchoolWide, onPosted }: {
  visible: boolean; onDismiss: () => void; classes: SchoolClass[]; subjects?: Subject[]; allowSchoolWide: boolean; onPosted: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<'notice' | 'homework'>('notice');
  const [classId, setClassId] = useState<number>(allowSchoolWide ? 0 : classes[0]?.id ?? 0);
  const [subjectId, setSubjectId] = useState<number>(subjects?.[0]?.id ?? 0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [due, setDue] = useState<string>(isoIn(1));
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const classOpts = [
    ...(allowSchoolWide && kind === 'notice' ? [{ label: 'Whole school', value: 0, icon: 'domain' as const }] : []),
    ...classes.map((c) => ({ label: c.name, value: c.id })),
  ];

  async function submit() {
    setTouched(true);
    if (!title.trim()) return haptic.error();
    if (kind === 'homework' && !classId) return toast('Pick a class for homework', { error: true });
    setBusy(true);
    try {
      await api('/posts', {
        body: {
          kind, title: title.trim(), body: body.trim(), class_id: classId || null,
          subject_id: kind === 'homework' && subjectId ? subjectId : null, due_date: kind === 'homework' ? due : null,
        },
      });
      setTitle(''); setBody(''); setTouched(false);
      toast(kind === 'homework' ? 'Homework posted' : 'Notice published');
      onPosted();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="Create post">
      <SegmentedButtons value={kind} style={{ marginBottom: space.md }}
        onValueChange={(v) => { haptic.tap(); const k = v as 'notice' | 'homework'; setKind(k); if (k === 'homework' && !classId) setClassId(classes[0]?.id ?? 0); }}
        buttons={[{ value: 'notice', label: 'Notice', icon: 'bullhorn-outline' }, { value: 'homework', label: 'Homework', icon: 'book-open-outline' }]} />
      <FilterChips label="Audience" options={classOpts} value={classId} onChange={setClassId} />
      {kind === 'homework' && subjects?.length ? (
        <FilterChips label="Subject" options={subjects.map((s) => ({ label: s.name, value: s.id }))} value={subjectId} onChange={setSubjectId} />
      ) : null}
      <TextInput mode="outlined" label="Title" value={title} onChangeText={setTitle} error={touched && !title.trim()}
        placeholder={kind === 'homework' ? 'e.g. Chapter 4 exercises' : 'e.g. School closed tomorrow'} />
      <HelperText type="error" visible={touched && !title.trim()}>Title is required</HelperText>
      <TextInput mode="outlined" label="Details" value={body} onChangeText={setBody} multiline numberOfLines={4} style={{ minHeight: 100 }} />
      {kind === 'homework' ? (
        <FilterChips label="Due" style={{ marginTop: space.md }} value={due} onChange={setDue}
          options={[1, 2, 3, 7].map((d) => ({ label: d === 1 ? 'Tomorrow' : d === 7 ? 'Next week' : `In ${d} days`, value: isoIn(d) }))} />
      ) : <View style={{ height: space.md }} />}
      <Button mode="contained" icon="send" onPress={submit} loading={busy} contentStyle={{ paddingVertical: 6 }} style={{ marginTop: space.sm }}>
        {kind === 'homework' ? 'Post homework' : 'Publish notice'}
      </Button>
    </Sheet>
  );
}
