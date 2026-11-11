import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';

import { Ring } from '@/components/charts';
import { deadlineText, rupees, shortDate } from '@/components/comms/util';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Row, Screen, ToneChip, UserAvatar, TopLayer } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { PollResults } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

const BAR_COLORS = ['primary', 'amber', 'green', 'purple', 'red'] as const;

/** Results of a consent form / poll: bars per option, who answered, who hasn't. */
export default function PollResultsScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const canEdit = useCan('notices', 'edit') && school?.can_write !== false;
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<PollResults>(`/polls/${id}/results`), [id]);
  const [listTab, setListTab] = useState<'answered' | 'pending'>('answered');
  const [optFilter, setOptFilter] = useState<number>(-1);
  const [confirm, setConfirm] = useState<'close' | 'archive' | null>(null);

  const colors = useMemo(() => {
    const map: Record<string, string> = { primary: t.colors.primary, amber: t.custom.amber, green: t.custom.success, purple: '#7E57C2', red: t.custom.danger };
    return BAR_COLORS.map((c) => map[c]);
  }, [t]);

  if (error) return <Screen header={<Hero title="Results" compact />}><ErrorState message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen header={<Hero title="Results" compact />}><LoadingCards /></Screen>;

  const total = data.counts.reduce((a, b) => a + b, 0);
  const pct = data.eligible ? (100 * data.responded) / data.eligible : 0;
  const consent = data.kind === 'consent';
  const answered = optFilter < 0 ? data.answered : data.answered.filter((a) => a.choices.includes(optFilter));
  const optionColor = (i: number) => (consent ? (i === 0 ? t.custom.success : t.custom.danger) : colors[i % colors.length]);

  async function act(kind: 'close' | 'archive') {
    setConfirm(null);
    try {
      if (kind === 'close') {
        await api(`/polls/${id}/close`, { method: 'POST' });
        toast('Closed — no more answers accepted');
        reload();
      } else {
        await api(`/polls/${id}`, { method: 'DELETE' });
        toast('Archived — restore it from More → Archive');
        router.back();
      }
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  function share() {
    const lines: string[] = [`${data!.title}${consent ? ' — consent' : ''}`, `${data!.responded}/${data!.eligible} answered`, ''];
    if (consent) {
      const yes = data!.answered.filter((a) => a.choices.includes(0));
      const no = data!.answered.filter((a) => a.choices.includes(1));
      lines.push(`✅ Allowed (${yes.length}):`, ...yes.map((a) => `• ${a.student_name ?? a.name}${a.class_name ? ` (${a.class_name})` : ''}`), '');
      lines.push(`❌ Not allowed (${no.length}):`, ...no.map((a) => `• ${a.student_name ?? a.name}${a.class_name ? ` (${a.class_name})` : ''}`), '');
      lines.push(`⏳ No answer yet (${data!.pending.length}):`, ...data!.pending.map((p) => `• ${p.student_name ?? p.name}${p.class_name ? ` (${p.class_name})` : ''}`));
    } else {
      data!.options.forEach((o, i) => lines.push(`${o}: ${data!.counts[i]}`));
    }
    Share.share({ message: lines.join('\n') }).catch(() => {});
  }

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={
        <Hero title={data.title} subtitle={`${consent ? 'Consent form' : 'Poll'} · ${deadlineText(data.deadline, data.open)}`} compact>
          <FadeIn>
            <Panel style={{ marginBottom: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                <Ring value={pct} size={96} label="answered" low={50} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text variant="headlineSmall" style={{ fontWeight: '800', color: t.colors.onSurface }}>
                    {data.responded}<Text variant="titleMedium" style={{ color: t.colors.onSurfaceVariant }}> / {data.eligible}</Text>
                  </Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>
                    {consent ? 'children answered for' : 'people answered'}{data.deadline ? ` · by ${shortDate(data.deadline)}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <ToneChip text={data.open ? 'Open' : 'Closed'} tone={data.open ? 'success' : 'neutral'} />
                    {data.amount ? <ToneChip text={rupees(data.amount)} tone="primary" icon="cash" /> : null}
                  </View>
                </View>
              </View>
            </Panel>
          </FadeIn>
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      {data.description ? <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.md }}>{data.description}</Text> : null}

      <FadeIn index={1}>
        <Panel title="Results" icon="chart-bar" subtitle={data.multi ? 'People could pick more than one' : undefined}>
          {data.options.map((o, i) => {
            const n = data.counts[i] ?? 0;
            const p = total ? Math.round((100 * n) / total) : 0;
            const c = optionColor(i);
            return (
              <View key={i} style={{ marginBottom: space.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface, flex: 1 }}>{o}</Text>
                  <Text variant="titleSmall" style={{ fontWeight: '800', color: c }}>{n} · {p}%</Text>
                </View>
                <View style={{ height: 14, borderRadius: 7, backgroundColor: t.custom.chartTrack, overflow: 'hidden' }}>
                  <View style={{ width: `${p}%`, height: 14, borderRadius: 7, backgroundColor: c }} />
                </View>
              </View>
            );
          })}
        </Panel>
      </FadeIn>

      <FadeIn index={2}>
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          <Button mode="contained-tonal" icon="share-variant" style={{ flex: 1 }} onPress={share} compact>Share</Button>
          {canEdit && data.open ? <Button mode="outlined" icon="lock-outline" style={{ flex: 1 }} onPress={() => setConfirm('close')}>Close</Button> : null}
          {canEdit ? <Button mode="outlined" icon="archive-arrow-down-outline" textColor={t.colors.error} onPress={() => setConfirm('archive')}>Archive</Button> : null}
        </View>
      </FadeIn>

      <FilterChips value={listTab} onChange={setListTab} options={[
        { label: `Answered · ${data.answered.length}`, value: 'answered', icon: 'check-circle-outline' },
        { label: `Not yet · ${data.pending.length}`, value: 'pending', icon: 'clock-outline' }]} />
      {listTab === 'answered' && data.answered.length ? (
        <FilterChips value={optFilter} onChange={setOptFilter}
          options={[{ label: 'All', value: -1 }, ...data.options.map((o, i) => ({ label: o, value: i }))]} />
      ) : null}

      <FadeIn index={3}>
        <Panel>
          {listTab === 'answered' ? (
            answered.length ? answered.map((a, i) => (
              <Row key={`${a.user_id}-${a.student_id ?? 0}`} divider={i < answered.length - 1}
                title={a.student_name ? a.student_name : a.name}
                subtitle={[a.student_name ? `Parent: ${a.name}` : null, a.class_name ? `Class ${a.class_name}` : null, a.comment ? `“${a.comment}”` : null]
                  .filter(Boolean).join(' · ')}
                left={<UserAvatar name={a.student_name ?? a.name} size={38} />}
                right={
                  <View style={{ backgroundColor: optionColor(a.choices[0] ?? 0), borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, maxWidth: 130 }}>
                    <Text variant="labelMedium" numberOfLines={1} style={{ color: '#fff', fontWeight: '700' }}>{a.answer}</Text>
                  </View>
                } />
            )) : <EmptyState icon="inbox-outline" title="No answers yet" />
          ) : (
            data.pending.length ? data.pending.map((p, i) => (
              <Row key={`${p.user_id}-${p.student_id ?? 0}`} divider={i < data.pending.length - 1}
                title={p.student_name ?? p.name}
                subtitle={[p.student_name ? `Parent: ${p.name}` : null, p.class_name ? `Class ${p.class_name}` : null].filter(Boolean).join(' · ')}
                left={<UserAvatar name={p.student_name ?? p.name} size={38} />} right={<ToneChip text="Waiting" tone="warning" />} />
            )) : <EmptyState icon="party-popper" title="Everyone has answered 🎉" />
          )}
        </Panel>
      </FadeIn>

      <TopLayer visible={!!confirm} onDismiss={() => setConfirm(null)}>
        <Dialog visible={!!confirm} onDismiss={() => setConfirm(null)}>
          <Dialog.Icon icon={confirm === 'close' ? 'lock-outline' : 'archive-arrow-down-outline'} />
          <Dialog.Title style={{ textAlign: 'center' }}>{confirm === 'close' ? 'Close this form?' : 'Archive this form?'}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {confirm === 'close' ? 'No more answers will be accepted. Results stay visible.' : 'It will be hidden for everyone. You can restore it from More → Archive.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>Cancel</Button>
            <Button textColor={confirm === 'archive' ? t.colors.error : undefined} onPress={() => confirm && act(confirm)}>
              {confirm === 'close' ? 'Close form' : 'Archive'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </Screen>
  );
}
