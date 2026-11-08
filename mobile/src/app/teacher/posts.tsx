import { useState } from 'react';

import { PostComposer } from '@/components/PostComposer';
import { PostList } from '@/components/PostList';
import { Button, ErrorBox, Header, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Assignment, Post, SchoolClass, Subject } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function TeacherPosts() {
  const { user } = useAuth();
  const [composing, setComposing] = useState(false);
  const { data, error, reload, refresh, refreshing } = useLoad(async () => {
    const [posts, classes, assignments] = await Promise.all([
      api<Post[]>('/posts'), api<SchoolClass[]>('/classes'), api<Assignment[]>('/assignments'),
    ]);
    const subjects: Subject[] = [...new Map(assignments.map((a) => [a.subject_id, { id: a.subject_id, name: a.subject_name }])).values()];
    return { posts, classes, subjects };
  });
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Homework & notices"
        right={<Button title={composing ? 'Close' : '+ New'} small variant="secondary" onPress={() => setComposing((c) => !c)} />} />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {!data ? <Loading /> : (
        <>
          {composing ? (
            <PostComposer classes={data.classes} subjects={data.subjects} allowSchoolWide={false}
              onPosted={() => { setComposing(false); reload(); }} />
          ) : null}
          <PostList posts={data.posts} canDelete={(p) => p.author_id === user?.id} onDeleted={reload} />
        </>
      )}
    </Screen>
  );
}
