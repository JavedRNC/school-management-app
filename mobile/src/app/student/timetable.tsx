import { TimetableView } from '@/components/TimetableView';
import { ErrorBox, Header, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { Slot } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentTimetable() {
  const { data, error, reload } = useLoad(() => api<Slot[]>('/timetable'));
  return (
    <Screen>
      <Header title="Timetable" />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <TimetableView slots={data} show="teacher" /> : <Loading />}
    </Screen>
  );
}
