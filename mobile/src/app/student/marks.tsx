import { useState } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { ProgressRows, Ring } from '@/components/charts';
import { fmtDate } from '@/components/PostList';
import { subjectIcon } from '@/components/TimetableView';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, Icon, LoadingCards, Panel, Screen, SectionTitle, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { gradeOf, pctTone, space, useAppTheme } from '@/lib/theme';
import type { ReportCard } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentMarks() {
  const t = useAppTheme();
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<ReportCard[]>('/me/marks'));
  const [examId, setExamId] = useState<number | null>(null);
  const card = data?.find((c) => c.exam_id === (examId ?? data[0]?.exam_id));
  const prev = card && data ? data[data.indexOf(card) + 1] : undefined;
  const delta = card && prev ? +(card.percent - prev.percent).toFixed(1) : null;
  const best = card ? [...card.subjects].sort((a, b) => b.score - a.score)[0] : null;
  const weak = card ? [...card.subjects].sort((a, b) => a.score - b.score)[0] : null;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={
        <Hero title="Results" subtitle={card ? `${card.exam} · ${fmtDate(card.date)}` : 'Your report cards'} compact>
          {card ? (
            <FadeIn>
              <Panel style={{ marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
                  <Ring value={card.percent} low={50} label={`Grade ${gradeOf(card.percent)}`} />
                  <View style={{ flex: 1 }}>
                    <Text variant="headlineSmall" style={{ fontWeight: '800', color: t.colors.onSurface }}>{card.total} <Text variant="titleMedium" style={{ color: t.colors.onSurfaceVariant }}>/ {card.max_marks * card.subjects.length}</Text></Text>
                    <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginBottom: space.sm }}>Total across {card.subjects.length} subjects</Text>
                    {delta != null ? (
                      <ToneChip text={`${delta >= 0 ? '+' : ''}${delta}% vs ${prev!.exam}`} tone={delta >= 0 ? 'success' : 'danger'} icon={delta >= 0 ? 'trending-up' : 'trending-down'} />
                    ) : null}
                  </View>
                </View>
              </Panel>
            </FadeIn>
          ) : <View style={{ height: 40 }} />}
        </Hero>
      }>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!data ? <View style={{ marginTop: space.lg }}><LoadingCards /></View> : !data.length ? <EmptyState icon="trophy-outline" title="No results yet" text="Marks will appear here once your teachers publish them." /> : card ? (
        <>
          <View style={{ height: space.lg }} />
          {data.length > 1 ? <FilterChips options={data.map((c) => ({ label: c.exam, value: c.exam_id, icon: 'file-document-outline' as const }))} value={card.exam_id} onChange={setExamId} /> : null}
          {best && weak && best.subject !== weak.subject ? (
            <FadeIn index={1}>
              <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
                <Panel style={{ flex: 1, marginBottom: 0 }} tone="success">
                  <Icon name="star-outline" size={22} color={t.custom.success} />
                  <Text variant="labelMedium" style={{ color: t.custom.onSuccessContainer, marginTop: 4 }}>Strongest</Text>
                  <Text variant="titleMedium" style={{ fontWeight: '800', color: t.custom.onSuccessContainer }} numberOfLines={1}>{best.subject}</Text>
                </Panel>
                <Panel style={{ flex: 1, marginBottom: 0 }} tone="warning">
                  <Icon name="target" size={22} color={t.custom.warning} />
                  <Text variant="labelMedium" style={{ color: t.custom.onWarningContainer, marginTop: 4 }}>Focus area</Text>
                  <Text variant="titleMedium" style={{ fontWeight: '800', color: t.custom.onWarningContainer }} numberOfLines={1}>{weak.subject}</Text>
                </Panel>
              </View>
            </FadeIn>
          ) : null}
          <SectionTitle title="Subject-wise" />
          <FadeIn index={2}>
            <Panel>
              <ProgressRows low={50} data={card.subjects.map((s) => ({ label: s.subject, caption: `${s.score}/${card.max_marks}`, value: Math.round((100 * s.score) / card.max_marks) }))} />
            </Panel>
          </FadeIn>
          <FadeIn index={3}>
            <Panel title="Grades" icon="certificate-outline">
              {card.subjects.map((s, i) => {
                const p = (100 * s.score) / card.max_marks;
                return (
                  <View key={s.subject} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8,
                    borderBottomWidth: i < card.subjects.length - 1 ? 0.5 : 0, borderBottomColor: t.colors.outlineVariant }}>
                    <Icon name={subjectIcon(s.subject)} size={22} color={t.colors.primary} />
                    <Text variant="bodyLarge" style={{ flex: 1, color: t.colors.onSurface }}>{s.subject}</Text>
                    <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>{s.score}</Text>
                    <ToneChip text={gradeOf(p)} tone={pctTone(p, 50)} />
                  </View>
                );
              })}
            </Panel>
          </FadeIn>
        </>
      ) : null}
    </Screen>
  );
}
