import { useState } from 'react';

import { PostComposer } from '@/components/PostComposer';
import { PostList } from '@/components/PostList';
import { Button, ErrorBox, Header, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { Post, SchoolClass } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Notices() {
  const [composing, setComposing] = useState(false);
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [posts, classes] = await Promise.all([api<Post[]>('/posts'), api<SchoolClass[]>('/classes')]);
    return { posts, classes };
  });
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Notices" subtitle="Announcements & homework"
        right={<Button title={composing ? 'Close' : '+ New'} small variant="secondary" onPress={() => setComposing((c) => !c)} />} />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!data ? <Loading /> : (
        <>
          {composing ? <PostComposer classes={data.classes} allowSchoolWide onPosted={() => { setComposing(false); reload(); }} /> : null}
          <PostList posts={data.posts} canDelete={() => true} onDeleted={reload} />
        </>
      )}
    </Screen>
  );
}
