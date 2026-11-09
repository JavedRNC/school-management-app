import { useState } from 'react';
import { View } from 'react-native';
import { AnimatedFAB, Button, Dialog, Portal, Text } from 'react-native-paper';

import { EmptyState, ErrorState, FadeIn, Hero, LoadingCards, Panel, Screen, SectionTitle, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Banner } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

import { BannerCard } from './BannerCard';
import { BannerBody, BannerEditor } from './BannerEditor';
import { audienceLabel, isoIn, shortDate } from './util';

function scheduleState(b: Banner): { text: string; tone: 'success' | 'warning' | 'neutral' } {
  const today = isoIn(0);
  if (b.start_date && b.start_date > today) return { text: `Starts ${shortDate(b.start_date)}`, tone: 'warning' };
  if (b.end_date && b.end_date < today) return { text: 'Ended', tone: 'neutral' };
  return { text: b.end_date ? `Live · until ${shortDate(b.end_date)}` : 'Live', tone: 'success' };
}

/** Banner list + editor for a school (`/banners`) or the platform (`/admin/banners`). */
export function BannerManager({ endpoint, canEdit, allowImages, showClasses, title, subtitle }: {
  endpoint: '/banners' | '/admin/banners'; canEdit: boolean; allowImages: boolean; showClasses: boolean; title: string; subtitle: string;
}) {
  const t = useAppTheme();
  const toast = useToast();
  const { data, error, reload, refresh, refreshing } = useLoad(() => api<Banner[]>(endpoint), [endpoint]);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Banner | null>(null);

  async function save(body: BannerBody) {
    try {
      if (editing) {
        await api(`${endpoint}/${editing.id}`, { method: 'PUT', body });
        toast('Banner updated');
      } else {
        await api(endpoint, { body });
        toast(body.popup ? 'Banner published · shows as a pop-up once' : 'Banner published');
      }
      setOpen(false);
      setEditing(null);
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  async function archive(b: Banner) {
    setConfirm(null);
    try {
      await api(`${endpoint}/${b.id}`, { method: 'DELETE' });
      toast(endpoint === '/banners' ? 'Banner archived — restore it from More → Archive' : 'Banner removed');
      reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  const live = (data ?? []).filter((b) => scheduleState(b).tone === 'success');

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Screen onRefresh={refresh} refreshing={refreshing} footerSpace={120} header={<Hero title={title} subtitle={subtitle} compact />}>
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {!data ? <LoadingCards /> : (
          <>
            {live.length ? (
              <FadeIn>
                <SectionTitle title="Live now" style={{ marginTop: 0 }} />
                <BannerCard banner={live[0]} />
                {live.length > 1 ? (
                  <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 6 }}>+{live.length - 1} more swipe after this one</Text>
                ) : null}
              </FadeIn>
            ) : null}
            <SectionTitle title={`All banners · ${data.length}`} />
            {data.length ? data.map((b, i) => {
              const st = scheduleState(b);
              return (
                <FadeIn key={b.id} index={i}>
                  <Panel onPress={canEdit ? () => { haptic.tap(); setEditing(b); setOpen(true); } : undefined}>
                    <BannerCard banner={b} height={110} onPress={canEdit ? () => { setEditing(b); setOpen(true); } : undefined} />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>
                      <ToneChip text={st.text} tone={st.tone} icon="calendar-clock" />
                      <ToneChip text={audienceLabel(b.roles)} tone="primary" icon="account-group-outline" />
                      {b.class_ids.length ? <ToneChip text={`${b.class_ids.length} class${b.class_ids.length > 1 ? 'es' : ''}`} icon="google-classroom" /> : null}
                      {b.popup ? <ToneChip text="Pop-up" tone="warning" icon="message-alert-outline" /> : null}
                      {b.image_url ? <ToneChip text="Image" icon="image-outline" /> : null}
                    </View>
                    {canEdit ? (
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.sm }}>
                        <Button compact icon="pencil-outline" onPress={() => { setEditing(b); setOpen(true); }}>Edit</Button>
                        <Button compact icon="archive-arrow-down-outline" textColor={t.colors.error} onPress={() => setConfirm(b)}>
                          {endpoint === '/banners' ? 'Archive' : 'Remove'}
                        </Button>
                      </View>
                    ) : null}
                  </Panel>
                </FadeIn>
              );
            }) : (
              <EmptyState icon="bullhorn-variant-outline" title="No banners yet"
                text="Banners appear at the top of everyone's home screen — great for events and urgent news."
                action={canEdit ? 'Create a banner' : undefined} onAction={() => { setEditing(null); setOpen(true); }} />
            )}
          </>
        )}
      </Screen>
      {canEdit ? (
        <AnimatedFAB icon="plus" label="New banner" extended onPress={() => { haptic.tap(); setEditing(null); setOpen(true); }}
          style={{ position: 'absolute', right: space.lg, bottom: space.lg }} />
      ) : null}
      <BannerEditor visible={open} onDismiss={() => { setOpen(false); setEditing(null); }} initial={editing} allowImages={allowImages}
        showClasses={showClasses} onSave={save} />
      <Portal>
        <Dialog visible={!!confirm} onDismiss={() => setConfirm(null)}>
          <Dialog.Icon icon="archive-arrow-down-outline" />
          <Dialog.Title style={{ textAlign: 'center' }}>{endpoint === '/banners' ? 'Archive' : 'Remove'} this banner?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">“{confirm?.title}” will stop showing on home screens.{endpoint === '/banners' ? ' You can restore it from More → Archive.' : ''}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>Cancel</Button>
            <Button textColor={t.colors.error} onPress={() => confirm && archive(confirm)}>{endpoint === '/banners' ? 'Archive' : 'Remove'}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
