import { PostList } from '@/components/PostList';
import { ErrorBox, Header, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import type { Post } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function StudentHomework() {
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<Post[]>('/posts', { params: { kind: 'homework' } }));
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Homework" />
      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      {data ? <PostList posts={data} /> : <Loading />}
    </Screen>
  );
}
