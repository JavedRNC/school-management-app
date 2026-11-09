import { TimetableView } from '@/components/TimetableView';
import { ErrorState, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { childParams, useChild } from '@/lib/child';
import type { Slot } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { ChildBar, useChildGate } from './common';

export default function TimetableScreen() {
  const { user } = useAuth();
  const { child, studentId, classNames } = useChild();
  const isParent = user?.role === 'parent';
  const { blocked, gate } = useChildGate();
  const { data, error, reload, refresh, refreshing } = useLoad(
    async () => (isParent && !studentId ? null : api<Slot[]>('/timetable', { params: childParams(studentId) })), [studentId, isParent]);
  const cls = child?.class_id ? classNames[child.class_id] : undefined;
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={<Hero title="Timetable" subtitle={isParent ? (child ? `${child.name.split(' ')[0]}'s week${cls ? ` · Class ${cls}` : ''}` : ' ') : 'Your weekly schedule'} compact />}>
      <ChildBar />
      {blocked ? gate : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {blocked ? null : data ? <TimetableView key={studentId ?? 0} slots={data} show="teacher" /> : <LoadingCards count={5} />}
    </Screen>
  );
}
