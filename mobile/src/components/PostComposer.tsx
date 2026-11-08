import { useState } from 'react';
import { Alert } from 'react-native';

import { api } from '@/lib/api';
import type { SchoolClass, Subject } from '@/lib/types';

import { Button, Card, Chips, Field } from './ui';

/** Form for notices / homework. Principal may post school-wide (class=null). */
export function PostComposer({ classes, subjects, allowSchoolWide, onPosted }: {
  classes: SchoolClass[]; subjects?: Subject[]; allowSchoolWide: boolean; onPosted: () => void;
}) {
  const [kind, setKind] = useState<'notice' | 'homework'>('notice');
  const [classId, setClassId] = useState<number>(allowSchoolWide ? 0 : classes[0]?.id ?? 0);
  const [subjectId, setSubjectId] = useState<number>(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  const classOpts = [
    ...(allowSchoolWide && kind === 'notice' ? [{ label: 'Whole school', value: 0 }] : []),
    ...classes.map((c) => ({ label: c.name, value: c.id })),
  ];

  async function submit() {
    if (!title.trim()) return Alert.alert('Add a title');
    if (kind === 'homework' && !classId) return Alert.alert('Pick a class for homework');
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return Alert.alert('Due date format: YYYY-MM-DD');
    setBusy(true);
    try {
      await api('/posts', {
        body: {
          kind, title: title.trim(), body: body.trim(), class_id: classId || null,
          subject_id: kind === 'homework' && subjectId ? subjectId : null, due_date: kind === 'homework' && due ? due : null,
        },
      });
      setTitle('');
      setBody('');
      setDue('');
      onPosted();
    } catch (e) {
      Alert.alert('Could not post', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New post">
      <Chips options={[{ label: 'Notice', value: 'notice' as const }, { label: 'Homework', value: 'homework' as const }]}
        value={kind} onChange={(k) => { setKind(k); if (k === 'homework' && !classId) setClassId(classes[0]?.id ?? 0); }} />
      <Chips label="For" options={classOpts} value={classId} onChange={setClassId} />
      {kind === 'homework' && subjects?.length ? (
        <Chips label="Subject" options={subjects.map((s) => ({ label: s.name, value: s.id }))} value={subjectId} onChange={setSubjectId} />
      ) : null}
      <Field label="Title" value={title} onChangeText={setTitle} placeholder={kind === 'homework' ? 'e.g. Chapter 4 exercises' : 'e.g. Holiday tomorrow'} />
      <Field label="Details" value={body} onChangeText={setBody} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      {kind === 'homework' ? <Field label="Due date (YYYY-MM-DD, optional)" value={due} onChangeText={setDue} placeholder="2026-11-12" /> : null}
      <Button title="Post" onPress={submit} loading={busy} />
    </Card>
  );
}
