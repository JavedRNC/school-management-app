import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB, SegmentedButtons } from 'react-native-paper';

import { AnswerSheet } from '@/components/comms/AnswerSheet';
import { PollCard } from '@/components/comms/PollCard';
import { PollEditor } from '@/components/comms/PollEditor';
import { EmptyState, ErrorState, FadeIn, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan, useModule } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Poll } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

/** Consent forms & polls (F20): answer what's for me; managers create and track. */
export default function PollsScreen() {
  const t = useAppTheme();
  const { school } = useAuth();
  const enabled = useModule('communication');
  const canCreate = useCan('notices', 'edit') && school?.can_write !== false;
  const { data, error, reload, refresh, refreshing, setData } = useLoad(
    () => (enabled ? api<Poll[]>('/polls') : Promise.resolve([] as Poll[])), [enabled]);
  const [tab, setTab] = useState<'answer' | 'created'>('answer');
  const [active, setActive] = useState<Poll | null>(null);
  const [creating, setCreating] = useState(false);

  if (!enabled) {
    return (
      <Screen header={<Hero title="Forms & polls" compact />}>
        <EmptyState icon="lock-outline" title="Not on your school's plan" text="Consent forms and polls are part of the Communication module." />
      </Screen>
    );
  }

  const mine = (data ?? []).filter((p) => p.my_targets.length);
  const managed = (data ?? []).filter((p) => p.can_manage);
  const showTabs = managed.length > 0 || canCreate;
  const view = showTabs ? tab : 'answer';
  const sortedMine = [...mine].sort((a, b) => {
    const pa = a.open && a.my_targets.some((x) => !x.response) ? 0 : 1;
    const pb = b.open && b.my_targets.some((x) => !x.response) ? 0 : 1;
    return pa - pb;
  });
  const list = view === 'answer' ? sortedMine : managed;
  const pendingCount = mine.filter((p) => p.open && p.my_targets.some((x) => !x.response)).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={refresh} refreshing={refreshing} footerSpace={120}
        header={
          <Hero title="Forms & polls" subtitle={pendingCount ? `${pendingCount} waiting for your answer` : 'Consent forms and polls'} compact>
            {showTabs ? (
              <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: 20, padding: 6, elevation: 3 }}>
                <SegmentedButtons value={view} onValueChange={(v) => { haptic.tap(); setTab(v as 'answer' | 'created'); }} density="small"
                  buttons={[{ value: 'answer', label: `To answer${pendingCount ? ` · ${pendingCount}` : ''}`, icon: 'pencil-outline' },
                    { value: 'created', label: `Created · ${managed.length}`, icon: 'chart-box-outline' }]} />
              </View>
            ) : undefined}
          </Hero>
        }>
        {showTabs ? <View style={{ height: space.lg }} /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!data ? <LoadingCards /> : list.length ? list.map((p, i) => (
          <FadeIn key={p.id} index={i}>
            {view === 'answer' ? (
              <PollCard poll={p} onAnswer={() => setActive(p)} />
            ) : (
              <PollCard poll={p} showProgress onOpen={() => router.push({ pathname: '/more/poll/[id]', params: { id: String(p.id) } } as never)} />
            )}
          </FadeIn>
        )) : (
          <EmptyState icon={view === 'answer' ? 'check-circle-outline' : 'file-sign'}
            title={view === 'answer' ? 'Nothing to answer' : 'No forms yet'}
            text={view === 'answer' ? "You're all caught up 🎉" : 'Send a consent form for a trip, or a quick poll.'}
            action={view === 'created' && canCreate ? 'New form' : undefined} onAction={() => setCreating(true)} />
        )}
      </Screen>
      {canCreate ? (
        <AnimatedFAB icon="plus" label="New form" extended onPress={() => { haptic.tap(); setCreating(true); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}
      <AnswerSheet poll={active} visible={!!active} onDismiss={() => setActive(null)}
        onAnswered={(p) => { setActive(p); setData((arr) => (arr ?? []).map((x) => (x.id === p.id ? { ...x, ...p } : x))); }} />
      <PollEditor visible={creating} onDismiss={() => setCreating(false)}
        onCreated={() => { setCreating(false); setTab('created'); reload(); }} />
    </View>
  );
}
