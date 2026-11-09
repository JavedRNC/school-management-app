import { useState } from 'react';

import { PostList } from '@/components/PostList';
import { ErrorState, FilterChips, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { childParams, useChild } from '@/lib/child';
import type { Post } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { ChildBar, useChildGate } from './common';

export default function HomeworkScreen() {
  const { user } = useAuth();
  const { child, studentId } = useChild();
  const isParent = user?.role === 'parent';
  const { blocked, gate } = useChildGate();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const { data, error, reload, refresh, refreshing } = useLoad(
    async () => (isParent && !studentId ? null : api<Post[]>('/posts', { params: childParams(studentId, { kind: 'homework' }) })), [studentId, isParent]);
  const posts = (data ?? []).filter((p) => filter === 'all' || !p.due_date || new Date(p.due_date + 'T23:59:59') >= new Date());
  const who = isParent && child ? `${child.name.split(' ')[0]} · ` : '';
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}
      header={<Hero title="Homework" subtitle={data ? `${who}${posts.length} ${filter === 'pending' ? 'pending' : 'total'}` : ' '} compact />}>
      <ChildBar />
      {blocked ? gate : (
        <>
          <FilterChips value={filter} onChange={setFilter} options={[
            { label: 'Pending', value: 'pending', icon: 'clock-outline' }, { label: 'All', value: 'all', icon: 'view-list-outline' }]} />
          {error ? <ErrorState message={error} onRetry={reload} /> : null}
          {data ? <PostList posts={posts} emptyText={filter === 'pending' ? 'All caught up! 🎉' : 'No homework yet'} /> : <LoadingCards />}
        </>
      )}
    </Screen>
  );
}
