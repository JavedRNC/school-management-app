import { useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, IconName, LoadingCards, Panel, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { ArchiveItem } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

const GROUPS: { kind: ArchiveItem['kind']; title: string; icon: IconName }[] = [
  { kind: 'class', title: 'Classes', icon: 'google-classroom' },
  { kind: 'subject', title: 'Subjects', icon: 'book-education-outline' },
  { kind: 'exam', title: 'Exams', icon: 'file-document-edit-outline' },
  { kind: 'post', title: 'Notices & homework', icon: 'bullhorn-outline' },
  { kind: 'holiday', title: 'Calendar', icon: 'calendar-month-outline' },
  { kind: 'user', title: 'People', icon: 'account-off-outline' },
];

/** Archived (soft-deleted) items with one-tap restore (F12). */
export default function ArchiveScreen() {
  const t = useAppTheme();
  const toast = useToast();
  const { school } = useAuth();
  const canRestore = useCan('settings', 'edit') && school?.can_write !== false;
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<ArchiveItem[]>('/archive'));
  const [filter, setFilter] = useState<ArchiveItem['kind'] | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  async function restore(it: ArchiveItem) {
    const k = `${it.kind}-${it.id}`;
    setBusy(k);
    try {
      await api(`/archive/${it.kind}/${it.id}/restore`, { method: 'POST' });
      toast(`${it.label.split(' · ')[0]} restored`);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  const items = data ?? [];
  const groups = GROUPS.filter((g) => (filter === 'all' || g.kind === filter) && items.some((i) => i.kind === g.kind));

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={<Hero title="Archive" subtitle="Nothing is ever erased — restore anything here" compact />}>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <LoadingCards /> : !items.length ? (
        <EmptyState icon="archive-check-outline" title="Archive is empty" text="When you archive a class, subject, exam, post, calendar entry or person, it appears here." />
      ) : (
        <>
          <FilterChips value={filter} onChange={setFilter} options={[
            { label: `All · ${items.length}`, value: 'all' as const },
            ...GROUPS.filter((g) => items.some((i) => i.kind === g.kind))
              .map((g) => ({ label: `${g.title} · ${items.filter((i) => i.kind === g.kind).length}`, value: g.kind, icon: g.icon })),
          ]} />
          {groups.map((g, gi) => {
            const list = items.filter((i) => i.kind === g.kind);
            return (
              <FadeIn key={g.kind} index={gi}>
                <Panel title={g.title} icon={g.icon} subtitle={`${list.length} archived`}>
                  {list.map((it, i) => (
                    <Row key={`${it.kind}-${it.id}`} title={it.label} divider={i < list.length - 1}
                      subtitle={it.archived_at ? `Archived ${new Date(it.archived_at + (it.archived_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : undefined}
                      right={canRestore ? (
                        <Button compact mode="contained-tonal" icon="restore" loading={busy === `${it.kind}-${it.id}`} onPress={() => restore(it)}>Restore</Button>
                      ) : undefined} />
                  ))}
                </Panel>
              </FadeIn>
            );
          })}
          {!canRestore ? (
            <View style={{ alignItems: 'center' }}>
              <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>View only — ask the principal to restore items.</Text>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
