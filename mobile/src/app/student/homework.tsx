import { useState } from 'react';

import { PostList } from '@/components/PostList';
import { ErrorState, FilterChips, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentHomework() {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<Post[]>('/posts', { params: { kind: 'homework' } }));
  const posts = (data ?? []).filter((p) => filter === 'all' || !p.due_date || new Date(p.due_date + 'T23:59:59') >= new Date());
  return (
    <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="Homework" subtitle={data ? `${posts.length} ${filter === 'pending' ? 'pending' : 'total'}` : ' '} compact />}>
      <FilterChips value={filter} onChange={setFilter} options={[
        { label: 'Pending', value: 'pending', icon: 'clock-outline' }, { label: 'All', value: 'all', icon: 'view-list-outline' }]} />
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? <PostList posts={posts} emptyText={filter === 'pending' ? 'All caught up! 🎉' : 'No homework yet'} /> : <LoadingCards />}
    </Screen>
  );
}
