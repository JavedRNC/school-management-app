import { TimetableView } from '@/components/TimetableView';
import { ErrorState, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { Slot } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentTimetable() {
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<Slot[]>('/timetable'));
  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="Timetable" subtitle="Your weekly schedule" compact />}>
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? <TimetableView slots={data} show="teacher" /> : <LoadingCards count={5} />}
    </Screen>
  );
}
