import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View, ViewStyle } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { AnswerSheet } from '@/components/comms/AnswerSheet';
import { deadlineText, rupees } from '@/components/comms/util';
import { Icon, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { useModule } from '@/lib/auth';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { Poll } from '@/lib/types';

/** Forms & polls waiting for MY answer (home screens). Renders nothing when there is nothing to answer. */
export function PendingPollsCard({ style }: { style?: ViewStyle }) {
  const t = useAppTheme();
  const enabled = useModule('communication');
  const [polls, setPolls] = useState<Poll[]>([]);
  const [active, setActive] = useState<Poll | null>(null);

  const load = useCallback(() => {
    if (!enabled) return;
    api<Poll[]>('/polls').then(setPolls).catch(() => setPolls([]));
  }, [enabled]);
  useEffect(load, [load]);

  const pending = polls.filter((p) => p.open && p.my_targets.some((x) => !x.response));
  if (!enabled || !pending.length) return null;

  return (
    <View style={style}>
      <Panel title={pending.length === 1 ? '1 form needs your answer' : `${pending.length} forms need your answer`}
        subtitle="Consent forms & polls" icon="file-sign" tone="warning"
        right={<Button compact onPress={() => router.push('/more/polls' as never)}>See all</Button>}>
        {pending.slice(0, 3).map((p, i) => {
          const left = p.my_targets.filter((x) => !x.response).length;
          return (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm,
              borderTopWidth: i ? 0.5 : 0, borderTopColor: t.colors.outlineVariant }}>
              <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: t.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={p.kind === 'consent' ? 'file-sign' : 'poll'} size={22} color={t.custom.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '700', color: t.custom.onWarningContainer }}>{p.title}</Text>
                <Text variant="labelSmall" style={{ color: t.custom.onWarningContainer, opacity: 0.85 }}>
                  {deadlineText(p.deadline, p.open)}{p.amount ? ` · ${rupees(p.amount)}` : ''}{left > 1 ? ` · ${left} children` : ''}
                </Text>
              </View>
              <Button mode="contained" compact onPress={() => setActive(p)}>Answer</Button>
            </View>
          );
        })}
      </Panel>
      <AnswerSheet poll={active} visible={!!active} onDismiss={() => setActive(null)}
        onAnswered={(p) => { setActive(p); setPolls((arr) => arr.map((x) => (x.id === p.id ? { ...x, ...p } : x))); }} />
    </View>
  );
}
