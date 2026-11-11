import { useState } from 'react';
import { View } from 'react-native';


import { PostComposer } from '@/components/PostComposer';
import { PostList } from '@/components/PostList';
import { Fab, ErrorState, FilterChips, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { haptic } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Post, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Notices() {
  const t = useAppTheme();
  const { user, school } = useAuth();
  const canEdit = useCan('notices', 'edit') && school?.can_write !== false;
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [filter, setFilter] = useState<'all' | 'notice' | 'homework'>('all');
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [posts, classes] = await Promise.all([api<Post[]>('/posts'), api<SchoolClass[]>('/classes')]);
    return { posts, classes };
  });
  const posts = (data?.posts ?? []).filter((p) => filter === 'all' || p.kind === filter);
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={refresh} refreshing={refreshing} header={<Hero title="Notices" subtitle="Announcements & homework across school" compact />}>
        <FilterChips value={filter} onChange={setFilter} options={[
          { label: 'All', value: 'all', icon: 'view-list-outline' }, { label: 'Notices', value: 'notice', icon: 'bullhorn-outline' },
          { label: 'Homework', value: 'homework', icon: 'book-open-outline' }]} />
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!data ? <LoadingCards /> : <PostList posts={posts} canDelete={(p) => canEdit || (p.author_id === user?.id && school?.can_write !== false)} onDeleted={reload} onEdit={(p) => { setEditing(p); setComposing(true); }} />}
      </Screen>
      {canEdit ? (
        <Fab icon="plus" label="New notice" extended onPress={() => { haptic.tap(); setEditing(null); setComposing(true); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}
      {data ? (
        <PostComposer visible={composing} editing={editing} onDismiss={() => setComposing(false)} classes={data.classes} allowSchoolWide
          onPosted={() => { setComposing(false); setEditing(null); reload(); }} />
      ) : null}
    </View>
  );
}
