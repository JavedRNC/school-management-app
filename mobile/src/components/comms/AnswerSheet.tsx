import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';

import { Icon, Sheet, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { fieldOutline, radius, space, useAppTheme } from '@/lib/theme';
import type { Poll } from '@/lib/types';

import { deadlineText, rupees, shortDate } from './util';

type Target = Poll['my_targets'][number];

/** Answer a consent form (per child) or a poll. */
export function AnswerSheet({ poll, visible, onDismiss, onAnswered }: {
  poll: Poll | null; visible: boolean; onDismiss: () => void; onAnswered: (p: Poll) => void;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [sel, setSel] = useState<Record<number, number[]>>({});   // student_id → choices
  const [comment, setComment] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!visible || !poll) return;
    const s: Record<number, number[]> = {};
    const c: Record<number, string> = {};
    for (const tg of poll.my_targets) {
      s[tg.student_id] = tg.response?.choices ?? [];
      c[tg.student_id] = tg.response?.comment ?? '';
    }
    setSel(s);
    setComment(c);
  }, [visible, poll]);

  if (!poll) return null;
  const readOnly = !poll.open;

  function toggle(sid: number, idx: number) {
    haptic.tap();
    setSel((m) => {
      const cur = m[sid] ?? [];
      if (poll!.multi) return { ...m, [sid]: cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx] };
      return { ...m, [sid]: [idx] };
    });
  }

  async function submit(tg: Target) {
    const choices = sel[tg.student_id] ?? [];
    if (!choices.length) return toast('Pick an option first', { error: true });
    setBusy(tg.student_id);
    try {
      const p = await api<Poll>(`/polls/${poll!.id}/respond`, {
        body: { choices, comment: (comment[tg.student_id] ?? '').trim(), ...(tg.student_id ? { student_id: tg.student_id } : {}) },
      });
      toast(poll!.kind === 'consent'
        ? `Answer saved${tg.student_name ? ` for ${tg.student_name.split(' ')[0]}` : ''}`
        : 'Thanks for voting!');
      onAnswered(p);
      const remaining = p.my_targets.filter((x) => !x.response).length;
      if (!remaining) onDismiss();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={poll.title}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.sm }}>
        <ToneChip text={poll.kind === 'consent' ? 'Consent form' : poll.multi ? 'Poll · pick any' : 'Poll'} tone="primary"
          icon={poll.kind === 'consent' ? 'file-sign' : 'poll'} />
        <ToneChip text={deadlineText(poll.deadline, poll.open)} tone={poll.open ? 'warning' : 'neutral'} icon="clock-outline" />
        {poll.amount ? <ToneChip text={rupees(poll.amount)} tone="success" icon="cash" /> : null}
      </View>
      {poll.description ? <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>{poll.description}</Text> : null}
      {poll.deadline ? (
        <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>Answer by {shortDate(poll.deadline)}</Text>
      ) : null}

      {poll.my_targets.map((tg) => {
        const chosen = sel[tg.student_id] ?? [];
        const saved = !!tg.response;
        return (
          <View key={tg.student_id} style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.lg, padding: space.md, marginBottom: space.md }}>
            {tg.student_name ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
                <Icon name="account-school-outline" size={20} color={t.colors.primary} />
                <Text variant="titleSmall" style={{ fontWeight: '700', flex: 1, color: t.colors.onSurface }}>For {tg.student_name}</Text>
                {saved ? <ToneChip text="Answered" tone="success" icon="check" /> : null}
              </View>
            ) : saved ? <View style={{ marginBottom: space.sm }}><ToneChip text="Your answer is saved — you can change it" tone="success" icon="check" /></View> : null}
            <View style={{ flexDirection: poll.kind === 'consent' ? 'row' : 'column', gap: space.sm }}>
              {poll.options.map((opt, i) => {
                const on = chosen.includes(i);
                const yes = poll.kind === 'consent' && i === 0;
                const no = poll.kind === 'consent' && i === 1;
                const accent = yes ? t.custom.success : no ? t.custom.danger : t.colors.primary;
                return (
                  <Pressable key={i} disabled={readOnly} onPress={() => toggle(tg.student_id, i)}
                    style={{ flex: poll.kind === 'consent' ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: space.sm,
                      paddingVertical: 12, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: on ? 2 : 1,
                      borderColor: on ? accent : t.colors.outlineVariant, backgroundColor: on ? (yes ? t.custom.successContainer : no ? t.custom.dangerContainer : t.colors.primaryContainer) : t.colors.surface }}>
                    <Icon name={poll.multi ? (on ? 'checkbox-marked' : 'checkbox-blank-outline') : on ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20} color={on ? accent : t.colors.outline} />
                    <Text variant="bodyLarge" style={{ color: t.colors.onSurface, fontWeight: on ? '700' : '400', flexShrink: 1 }}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
            {!readOnly ? (
              <>
                <TextInput mode="outlined" outlineStyle={fieldOutline} dense label="Comment (optional)" value={comment[tg.student_id] ?? ''} maxLength={500}
                  onChangeText={(v) => setComment((m) => ({ ...m, [tg.student_id]: v }))} style={{ marginTop: space.sm }} />
                <Button mode="contained" icon="send" style={{ marginTop: space.sm }} loading={busy === tg.student_id} disabled={busy !== null}
                  onPress={() => submit(tg)}>{saved ? 'Update answer' : 'Submit'}</Button>
              </>
            ) : null}
          </View>
        );
      })}
      {readOnly ? <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, textAlign: 'center' }}>This form is closed.</Text> : null}
    </Sheet>
  );
}
