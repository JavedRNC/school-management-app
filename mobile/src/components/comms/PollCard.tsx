import { View } from 'react-native';
import { Button, ProgressBar, Text } from 'react-native-paper';

import { Panel, ToneChip } from '@/components/ui';
import { space, useAppTheme } from '@/lib/theme';
import type { Poll } from '@/lib/types';

import { deadlineText, rupees } from './util';

/** Summary card for a consent form / poll. */
export function PollCard({ poll, onAnswer, onOpen, showProgress }: {
  poll: Poll; onAnswer?: () => void; onOpen?: () => void; showProgress?: boolean;
}) {
  const t = useAppTheme();
  const pending = poll.my_targets.filter((x) => !x.response).length;
  const answered = poll.my_targets.length - pending;
  const pct = poll.eligible ? poll.responded / poll.eligible : 0;
  return (
    <Panel onPress={onOpen ?? onAnswer} title={poll.title}
      subtitle={`${poll.kind === 'consent' ? 'Consent form' : 'Poll'} · by ${poll.created_by_name}`}
      icon={poll.kind === 'consent' ? 'file-sign' : 'poll'}>
      {poll.description ? (
        <Text variant="bodyMedium" numberOfLines={2} style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>{poll.description}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <ToneChip text={poll.open ? 'Open' : 'Closed'} tone={poll.open ? 'success' : 'neutral'} />
        <ToneChip text={deadlineText(poll.deadline, poll.open)} tone={poll.open ? 'warning' : 'neutral'} icon="clock-outline" />
        {poll.amount ? <ToneChip text={rupees(poll.amount)} tone="primary" icon="cash" /> : null}
        {poll.my_targets.length ? (
          pending && poll.open
            ? <ToneChip text={poll.my_targets.length > 1 ? `${pending} to answer` : 'Awaiting your answer'} tone="danger" icon="alert-circle-outline" />
            : answered ? <ToneChip text="Answered" tone="success" icon="check" /> : null
        ) : null}
      </View>
      {showProgress ? (
        <View style={{ marginTop: space.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant }}>Responses</Text>
            <Text variant="labelMedium" style={{ color: t.colors.onSurface, fontWeight: '700' }}>{poll.responded} / {poll.eligible}</Text>
          </View>
          <ProgressBar progress={pct} color={t.colors.primary} style={{ height: 8, borderRadius: 4, backgroundColor: t.custom.chartTrack }} />
        </View>
      ) : null}
      {onAnswer && poll.my_targets.length && poll.open ? (
        <Button mode={pending ? 'contained' : 'outlined'} icon={pending ? 'pencil' : 'pencil-outline'} onPress={onAnswer} style={{ marginTop: space.md, alignSelf: 'flex-start' }}>
          {pending ? 'Answer' : 'Change answer'}
        </Button>
      ) : null}
    </Panel>
  );
}
