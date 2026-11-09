import { useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB } from 'react-native-paper';

import { PostComposer } from '@/components/PostComposer';
import { PostList } from '@/components/PostList';
import { ErrorState, FilterChips, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Assignment, Post, SchoolClass, Subject } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function TeacherPosts() {
  const t = useAppTheme();
  const { user } = useAuth();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [filter, setFilter] = useState<'mine' | 'homework' | 'notice' | 'all'>('all');
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [posts, classes, assignments] = await Promise.all([api<Post[]>('/posts'), api<SchoolClass[]>('/classes'), api<Assignment[]>('/assignments')]);
    const subjects: Subject[] = [...new Map(assignments.map((a) => [a.subject_id, { id: a.subject_id, name: a.subject_name }])).values()];
    return { posts, classes, subjects };
  });
  const posts = (data?.posts ?? []).filter((p) => filter === 'all' || (filter === 'mine' ? p.author_id === user?.id : p.kind === filter));
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="Posts" subtitle="Homework & class notices" compact />}>
        <FilterChips value={filter} onChange={setFilter} options={[
          { label: 'All', value: 'all', icon: 'view-list-outline' }, { label: 'Mine', value: 'mine', icon: 'account-edit-outline' },
          { label: 'Homework', value: 'homework', icon: 'book-open-outline' }, { label: 'Notices', value: 'notice', icon: 'bullhorn-outline' }]} />
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!data ? <LoadingCards /> : <PostList posts={posts} canDelete={(p) => p.author_id === user?.id} onDeleted={reload} onEdit={(p) => { setEditing(p); setComposing(true); }} />}
      </Screen>
      <AnimatedFAB icon="book-plus-outline" label="New homework" extended onPress={() => { haptic.tap(); setEditing(null); setComposing(true); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      {data ? (
        <PostComposer visible={composing} editing={editing} onDismiss={() => setComposing(false)} classes={data.classes} subjects={data.subjects}
          allowSchoolWide={false} onPosted={() => { setComposing(false); setEditing(null); reload(); }} />
      ) : null}
    </View>
  );
}
