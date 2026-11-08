import { Alert, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { colors, space } from '@/lib/theme';
import type { Post } from '@/lib/types';

import { Button, Card, Empty, Pill, styles } from './ui';

export function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function PostList({ posts, canDelete, onDeleted }: {
  posts: Post[]; canDelete?: (p: Post) => boolean; onDeleted?: () => void;
}) {
  if (!posts.length) return <Empty text="Nothing posted yet" />;
  const del = (p: Post) =>
    Alert.alert('Delete post?', p.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api(`/posts/${p.id}`, { method: 'DELETE' });
            onDeleted?.();
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  return (
    <View>
      {posts.map((p) => {
        const overdue = p.due_date && new Date(p.due_date + 'T23:59:59') < new Date();
        return (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' }}>
              {p.kind === 'homework' ? <Pill text="Homework" color={colors.warn} bg={colors.warnSoft} /> : <Pill text="Notice" />}
              <Pill text={p.class_name ? `Class ${p.class_name}` : 'Whole school'} color={colors.muted} bg={colors.bg} />
              {p.subject_name ? <Pill text={p.subject_name} color={colors.muted} bg={colors.bg} /> : null}
            </View>
            <Text style={styles.h3}>{p.title}</Text>
            {p.body ? <Text style={[styles.body, { marginTop: 4 }]}>{p.body}</Text> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm }}>
              <Text style={[styles.muted, { fontSize: 12 }]}>
                {p.author_name} · {fmtDate(p.created_at)}
                {p.due_date ? `  ·  Due ${fmtDate(p.due_date)}` : ''}
              </Text>
              {overdue ? <Pill text="Past due" color={colors.bad} bg={colors.badSoft} /> : null}
            </View>
            {canDelete?.(p) ? <Button title="Delete" variant="ghost" small onPress={() => del(p)} style={{ alignSelf: 'flex-end' }} /> : null}
          </Card>
        );
      })}
    </View>
  );
}
