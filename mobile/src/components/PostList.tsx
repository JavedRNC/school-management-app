import { useState } from 'react';
import { LayoutAnimation, Platform, UIManager, View } from 'react-native';
import { Button, Card, Dialog, IconButton, Portal, Text } from 'react-native-paper';

import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { Post } from '@/lib/types';

import { subjectIcon } from './TimetableView';
import { EmptyState, FadeIn, Icon, ToneChip, UserAvatar } from './ui';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

export function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function relDate(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDate(iso);
}

function dueInfo(due: string): { text: string; tone: 'danger' | 'warning' | 'success' } {
  const end = new Date(due + 'T23:59:59').getTime();
  const days = Math.ceil((end - Date.now()) / 86400000) - 1;
  if (end < Date.now()) return { text: 'Past due', tone: 'danger' };
  if (days <= 0) return { text: 'Due today', tone: 'danger' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'warning' };
  return { text: `Due in ${days} days`, tone: 'success' };
}

export function PostList({ posts, canDelete, onDeleted, onEdit, emptyText = 'Nothing posted yet' }: {
  posts: Post[]; canDelete?: (p: Post) => boolean; onDeleted?: () => void; onEdit?: (p: Post) => void; emptyText?: string;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Post | null>(null);
  if (!posts.length) return <EmptyState icon="bullhorn-outline" title={emptyText} />;

  async function del(p: Post) {
    setConfirm(null);
    try {
      await api(`/posts/${p.id}`, { method: 'DELETE' });
      LayoutAnimation.easeInEaseOut();
      toast('Post deleted');
      onDeleted?.();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <View>
      {posts.map((p, i) => {
        const hw = p.kind === 'homework';
        const expanded = open === p.id;
        const long = p.body.length > 110;
        const due = p.due_date ? dueInfo(p.due_date) : null;
        return (
          <FadeIn key={p.id} index={i}>
            <Card mode="elevated" elevation={1} style={{ marginBottom: space.md, borderRadius: radius.xl, backgroundColor: t.colors.elevation.level1 }}
              onPress={long ? () => { haptic.tap(); LayoutAnimation.easeInEaseOut(); setOpen(expanded ? null : p.id); } : undefined}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 5, backgroundColor: hw ? t.custom.amber : t.colors.primary, borderTopLeftRadius: radius.xl, borderBottomLeftRadius: radius.xl }} />
                <View style={{ flex: 1, padding: space.lg }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm }}>
                    <Icon name={hw ? (p.subject_name ? subjectIcon(p.subject_name) : 'book-open-variant') : 'bullhorn'} size={18}
                      color={hw ? t.custom.warning : t.colors.primary} />
                    <Text variant="labelLarge" style={{ color: hw ? t.custom.warning : t.colors.primary, fontWeight: '700' }}>
                      {hw ? (p.subject_name ?? 'Homework') : 'Notice'}
                    </Text>
                    <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, flex: 1 }} numberOfLines={1}>· {p.class_name ? `Class ${p.class_name}` : 'Whole school'}</Text>
                    <Text variant="labelSmall" style={{ color: t.colors.outline }}>{relDate(p.created_at)}</Text>
                  </View>
                  <Text variant="titleMedium" style={{ fontWeight: '700', color: t.colors.onSurface }}>{p.title}</Text>
                  {p.body ? (
                    <Text variant="bodyMedium" numberOfLines={expanded ? undefined : 3} style={{ color: t.colors.onSurfaceVariant, marginTop: 4 }}>{p.body}</Text>
                  ) : null}
                  {long ? <Text variant="labelMedium" style={{ color: t.colors.primary, marginTop: 4 }}>{expanded ? 'Show less' : 'Read more'}</Text> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: space.sm }}>
                    <UserAvatar name={p.author_name || '?'} size={26} />
                    <Text variant="labelMedium" style={{ color: t.colors.onSurfaceVariant, flex: 1 }} numberOfLines={1}>
                      {p.author_name}
                    </Text>
                    {due ? <ToneChip text={due.text} tone={due.tone} icon="clock-outline" /> : null}
                    {onEdit && canDelete?.(p) ? (
                      <IconButton icon="pencil-outline" size={20} style={{ margin: 0 }} onPress={() => { haptic.tap(); onEdit(p); }} />
                    ) : null}
                    {canDelete?.(p) ? (
                      <IconButton icon="delete-outline" size={20} iconColor={t.colors.error} style={{ margin: 0 }} onPress={() => setConfirm(p)} />
                    ) : null}
                  </View>
                </View>
              </View>
            </Card>
          </FadeIn>
        );
      })}
      <Portal>
        <Dialog visible={!!confirm} onDismiss={() => setConfirm(null)}>
          <Dialog.Icon icon="delete-alert-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>Delete this post?</Dialog.Title>
          <Dialog.Content><Text variant="bodyMedium">“{confirm?.title}” will be removed for everyone.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={() => confirm && del(confirm)}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
