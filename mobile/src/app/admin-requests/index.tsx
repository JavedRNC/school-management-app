import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { TextInput } from '@/components/Field';
import { EmptyState, ErrorState, FadeIn, FilterChips, Hero, IconBadge, LoadingCards, Panel, Row, Screen, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { REQ_STATUS_LABEL, REQ_STATUS_TONE, type RequestRow, when } from '@/lib/onboarding';
import { space } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

/** Admin: requests from the website and from this app, in one list. */
export default function AdminRequests() {
  const [status, setStatus] = useState('PENDING');
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const { data, error, loading, reload, refresh, refreshing } = useLoad(
    () => api<{ items: RequestRow[]; total: number }>('/admin/onboarding', { params: { status: status || undefined, q: q || undefined, size: 50 } }), [status, q]);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="Onboarding requests" subtitle="Schools asking to join Prangan" compact />}>
      <TextInput mode="outlined" dense label="Search name, registration no., mobile, reference" value={typed} onChangeText={setTyped} returnKeyType="search"
        onSubmitEditing={() => setQ(typed.trim())} right={<TextInput.Icon icon="magnify" onPress={() => setQ(typed.trim())} />} style={{ marginBottom: space.sm }} />
      <FilterChips value={status} onChange={setStatus}
        options={[{ label: 'All', value: '' }, ...Object.entries(REQ_STATUS_LABEL).map(([value, label]) => ({ label, value }))]} />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading && !data ? <LoadingCards /> : null}
      {data && !data.items.length ? <EmptyState icon="inbox-outline" title="Nothing here" text={status || q ? 'Try another status or search.' : 'New requests appear here at once.'} /> : null}
      {data?.items.length ? (
        <FadeIn>
          <Panel style={{ paddingVertical: 0 }}>
            <View style={{ marginVertical: -space.sm }}>
              {data.items.map((r, i) => (
                <Row key={r.id} title={r.school_name} subtitle={`${[r.city, r.state].filter(Boolean).join(', ')} · ${r.reference} · ${when(r.created_at)}`}
                  divider={i < data.items.length - 1} left={<IconBadge icon={r.source === 'app' ? 'cellphone' : 'web'} tone="neutral" size={38} />}
                  right={<ToneChip text={REQ_STATUS_LABEL[r.status] ?? r.status} tone={REQ_STATUS_TONE[r.status] ?? 'neutral'} />}
                  onPress={() => router.push({ pathname: '/admin-requests/[id]', params: { id: String(r.id) } } as never)} />
              ))}
            </View>
          </Panel>
        </FadeIn>
      ) : null}
    </Screen>
  );
}
