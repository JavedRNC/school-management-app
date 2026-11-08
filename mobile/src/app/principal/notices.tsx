import { useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB } from 'react-native-paper';

import { PostComposer } from '@/components/PostComposer';
import { PostList } from '@/components/PostList';
import { ErrorState, FilterChips, Hero, LoadingCards, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Post, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Notices() {
  const t = useAppTheme();
  const [composing, setComposing] = useState(false);
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
        {!data ? <LoadingCards /> : <PostList posts={posts} canDelete={() => true} onDeleted={reload} />}
      </Screen>
      <AnimatedFAB icon="plus" label="New notice" extended onPress={() => { haptic.tap(); setComposing(true); }}
        style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      {data ? (
        <PostComposer visible={composing} onDismiss={() => setComposing(false)} classes={data.classes} allowSchoolWide
          onPosted={() => { setComposing(false); reload(); }} />
      ) : null}
    </View>
  );
}
