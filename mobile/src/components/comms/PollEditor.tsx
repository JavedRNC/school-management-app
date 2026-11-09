import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, HelperText, IconButton, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';

import { Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { Poll, SchoolClass } from '@/lib/types';

import { isoIn } from './util';

const AUD: { key: 'parent' | 'teacher' | 'student'; label: string }[] = [
  { key: 'parent', label: 'Parents' }, { key: 'teacher', label: 'Teachers' }, { key: 'student', label: 'Students' },
];

/** Create a consent form or a poll. */
export function PollEditor({ visible, onDismiss, onCreated }: { visible: boolean; onDismiss: () => void; onCreated: (p: Poll) => void }) {
  const t = useAppTheme();
  const toast = useToast();
  const [kind, setKind] = useState<'consent' | 'poll'>('consent');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [aud, setAud] = useState<('parent' | 'teacher' | 'student')[]>(['parent']);
  const [classIds, setClassIds] = useState<number[]>([]);
  const [deadline, setDeadline] = useState(isoIn(3));
  const [amount, setAmount] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKind('consent'); setTitle(''); setDesc(''); setOptions(['', '']); setMulti(false); setAud(['parent']); setClassIds([]);
    setDeadline(isoIn(3)); setAmount(''); setTouched(false);
    api<SchoolClass[]>('/classes').then(setClasses).catch(() => setClasses([]));
  }, [visible]);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const dlBad = !!deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const valid = title.trim() && aud.length && !dlBad && (kind === 'consent' || filled.length >= 2);

  async function create() {
    setTouched(true);
    if (!valid) return haptic.error();
    setBusy(true);
    try {
      const p = await api<Poll>('/polls', {
        body: {
          kind, title: title.trim(), description: desc.trim(), options: kind === 'poll' ? filled : [], multi: kind === 'poll' && multi,
          audience: kind === 'consent' ? ['parent'] : aud, class_ids: classIds, deadline: deadline || null,
          amount: kind === 'consent' && amount ? Number(amount) : null,
        },
      });
      toast(kind === 'consent' ? 'Consent form sent to parents' : 'Poll published');
      onCreated(p);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean, label: string, onPress: () => void, key: string | number) => (
    <Pressable key={key} onPress={() => { haptic.tap(); onPress(); }}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1,
        borderColor: on ? t.colors.primary : t.colors.outlineVariant, backgroundColor: on ? t.colors.secondaryContainer : 'transparent' }}>
      <Text variant="labelLarge" style={{ color: t.colors.onSurface, fontWeight: on ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title="New form">
      <SegmentedButtons value={kind} onValueChange={(v) => { haptic.tap(); setKind(v as 'consent' | 'poll'); }} style={{ marginBottom: space.md }}
        buttons={[{ value: 'consent', label: 'Consent form', icon: 'file-sign' }, { value: 'poll', label: 'Poll', icon: 'poll' }]} />
      <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>
        {kind === 'consent'
          ? 'Parents answer Yes / No separately for each child — e.g. trip permission.'
          : 'Ask parents, teachers or students to pick from your options.'}
      </Text>
      <TextInput mode="outlined" label={kind === 'consent' ? 'Title (e.g. Science museum trip)' : 'Question'} value={title} onChangeText={setTitle}
        maxLength={200} error={touched && !title.trim()} />
      <HelperText type="error" visible={touched && !title.trim()}>Required</HelperText>
      <TextInput mode="outlined" label="Details (optional)" value={desc} onChangeText={setDesc} multiline maxLength={2000}
        style={{ minHeight: 80, marginBottom: space.md }} />

      {kind === 'poll' ? (
        <View style={{ marginBottom: space.md }}>
          <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>Options</Text>
          {options.map((o, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <TextInput mode="outlined" dense label={`Option ${i + 1}`} value={o} style={{ flex: 1 }} maxLength={80}
                onChangeText={(v) => setOptions((arr) => arr.map((x, j) => (j === i ? v : x)))} />
              <IconButton icon="close" disabled={options.length <= 2} onPress={() => setOptions((arr) => arr.filter((_, j) => j !== i))} />
            </View>
          ))}
          {options.length < 10 ? <Button icon="plus" compact onPress={() => setOptions((a) => [...a, ''])} style={{ alignSelf: 'flex-start' }}>Add option</Button> : null}
          <HelperText type="error" visible={touched && filled.length < 2}>Add at least 2 options</HelperText>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="bodyLarge" style={{ flex: 1, color: t.colors.onSurface }}>Allow picking more than one</Text>
            <Switch value={multi} onValueChange={setMulti} />
          </View>
          <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginVertical: 6 }}>Who answers</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {AUD.map((a) => chip(aud.includes(a.key), a.label, () => setAud((cur) => (cur.includes(a.key) ? cur.filter((x) => x !== a.key) : [...cur, a.key])), a.key))}
          </View>
          <HelperText type="error" visible={touched && !aud.length}>Choose at least one group</HelperText>
        </View>
      ) : null}

      {classes.length ? (
        <View style={{ marginBottom: space.md }}>
          <Text variant="labelLarge" style={{ color: t.colors.onSurfaceVariant, marginBottom: 6 }}>
            Classes {classIds.length ? `(${classIds.length})` : '(whole school)'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {chip(!classIds.length, 'All', () => setClassIds([]), 'all')}
            {classes.map((c) => chip(classIds.includes(c.id), c.name,
              () => setClassIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id])), c.id))}
          </View>
        </View>
      ) : null}

      <TextInput mode="outlined" label="Answer by (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} error={dlBad}
        left={<TextInput.Icon icon="calendar-clock" />} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: space.sm }}>
        {([['Tomorrow', 1], ['3 days', 3], ['1 week', 7], ['2 weeks', 14]] as [string, number][]).map(([l, d]) =>
          chip(deadline === isoIn(d), l, () => setDeadline(isoIn(d)), l))}
        {chip(!deadline, 'No deadline', () => setDeadline(''), 'none')}
      </View>
      {kind === 'consent' ? (
        <TextInput mode="outlined" label="Amount to pay, if any (₹)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad" left={<TextInput.Icon icon="currency-inr" />} style={{ marginBottom: space.md }} />
      ) : null}
      <Button mode="contained" icon="send" onPress={create} loading={busy} disabled={busy} contentStyle={{ paddingVertical: 6 }}>
        {kind === 'consent' ? 'Send to parents' : 'Publish poll'}
      </Button>
    </Sheet>
  );
}
