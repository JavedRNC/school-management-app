import { useState } from 'react';

import { AuditList } from '@/components/admin/AuditList';
import { ErrorState, FadeIn, FilterChips, Hero, LoadingCards, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { AdminSchoolRow, AuditEntry } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Audit() {
  const [sid, setSid] = useState(0);
  const schools = useLoad(() => api<AdminSchoolRow[]>('/admin/schools'));
  const log = useLoad(() => api<AuditEntry[]>('/admin/audit', { params: { school_id: sid || undefined } }), [sid]);
  const nameOf = (id: number | null) => schools.data?.find((s) => s.id === id)?.code;

  return (
    <Screen onRefresh={log.refresh} refreshing={log.refreshing}
      header={<Hero title="Audit log" subtitle="Every admin access and important change" compact />}>
      {schools.data ? (
        <FilterChips value={sid} onChange={setSid}
          options={[{ label: 'All schools', value: 0 }, ...schools.data.map((s) => ({ label: s.code, value: s.id }))]} />
      ) : null}
      {log.error ? <ErrorState message={log.error} onRetry={log.reload} /> : null}
      {log.loading && !log.data ? <LoadingCards /> : null}
      {log.data ? <FadeIn><Panel><AuditList items={log.data} schoolName={sid ? undefined : nameOf} /></Panel></FadeIn> : null}
    </Screen>
  );
}
