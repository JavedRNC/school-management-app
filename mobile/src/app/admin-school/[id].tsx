import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

import { AuditList } from '@/components/admin/AuditList';
import { StatusChip } from '@/components/admin/common';
import { SchoolDetailsSection } from '@/components/admin/SchoolDetailsSection';
import { SchoolPaymentsSection } from '@/components/admin/SchoolPaymentsSection';
import { SchoolPeopleSection } from '@/components/admin/SchoolPeopleSection';
import { SchoolPlanSection } from '@/components/admin/SchoolPlanSection';
import { ErrorState, FadeIn, Hero, LoadingCards, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { AdminSchoolDetail, AuditEntry } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

type Section = 'details' | 'plan' | 'people' | 'payments' | 'log';

export default function AdminSchool() {
  const t = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = Number(id);
  const [section, setSection] = useState<Section>('details');
  const detail = useLoad(() => api<AdminSchoolDetail>(`/admin/schools/${sid}`), [sid]);
  const d = detail.data;

  return (
    <Screen onRefresh={detail.refresh} refreshing={detail.refreshing}
      header={
        <Hero eyebrow={d ? d.code : 'School'} title={d?.name ?? 'Loading…'} compact
          subtitle={d ? `${d.plan ?? 'No plan'} · ${d.students} students · ${d.teachers} teachers` : ' '}
          right={d ? <StatusChip status={d.status} /> : null}>
          <View style={{ backgroundColor: t.colors.elevation.level2, borderRadius: radius.xl, padding: 6, elevation: 3,
            shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <SegmentedButtons value={section} onValueChange={(v) => { haptic.tap(); setSection(v as Section); }} density="small"
              buttons={[
                { value: 'details', label: 'Info' }, { value: 'plan', label: 'Plan' }, { value: 'people', label: 'People' },
                { value: 'payments', label: 'Pay' }, { value: 'log', label: 'Log' },
              ]} />
          </View>
        </Hero>
      }>
      <View style={{ height: space.lg }} />
      {detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : null}
      {!d ? (detail.error ? null : <LoadingCards />) : (
        <>
          {section === 'details' ? <SchoolDetailsSection d={d} onSaved={detail.reload} /> : null}
          {section === 'plan' ? <SchoolPlanSection d={d} onSaved={detail.reload} /> : null}
          {section === 'people' ? <SchoolPeopleSection d={d} /> : null}
          {section === 'payments' ? <SchoolPaymentsSection d={d} onSaved={detail.reload} /> : null}
          {section === 'log' ? <SchoolLog sid={sid} /> : null}
        </>
      )}
    </Screen>
  );
}

function SchoolLog({ sid }: { sid: number }) {
  const log = useLoad(() => api<AuditEntry[]>('/admin/audit', { params: { school_id: sid } }), [sid]);
  if (log.error) return <ErrorState message={log.error} onRetry={log.reload} />;
  if (!log.data) return <LoadingCards />;
  return <FadeIn><Panel title="Activity" icon="clipboard-text-clock-outline"><AuditList items={log.data} /></Panel></FadeIn>;
}
