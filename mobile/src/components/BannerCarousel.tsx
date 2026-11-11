import { TopLayer } from '@/components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View, ViewStyle } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';

import { BannerCard } from '@/components/comms/BannerCard';
import { shortDate } from '@/components/comms/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { space, useAppTheme } from '@/lib/theme';
import type { Banner } from '@/lib/types';

const seenKey = (uid: number, bid: number) => `banner_seen_${uid}_${bid}`;

/** Home-screen announcements: swipeable cards with dots, auto-advance, tap for details, one-time pop-ups. */
export function BannerCarousel({ style }: { style?: ViewStyle }) {
  const t = useAppTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<Banner[]>([]);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<Banner | null>(null);
  const [popup, setPopup] = useState<Banner | null>(null);
  const [queue, setQueue] = useState<Banner[]>([]);
  const scroll = useRef<{ scrollTo: (o: { x: number; animated?: boolean }) => void } | null>(null);
  const x = useRef(new Animated.Value(0)).current;
  const paused = useRef(false);

  useEffect(() => {
    let alive = true;
    api<Banner[]>('/banners/active').then(async (rows) => {
      if (!alive) return;
      setItems(rows);
      if (!user) return;
      const unseen: Banner[] = [];
      for (const b of rows.filter((r) => r.popup)) {
        let seen = false;
        try { seen = !!(await AsyncStorage.getItem(seenKey(user.id, b.id))); } catch { /* storage unavailable */ }
        if (!seen) unseen.push(b);
      }
      if (alive && unseen.length) {
        setPopup(unseen[0]);
        setQueue(unseen.slice(1));
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  // auto-advance every 5 s (paused while touching)
  useEffect(() => {
    if (items.length < 2 || !width) return;
    const id = setInterval(() => {
      if (paused.current) return;
      const next = (index + 1) % items.length;
      scroll.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, 5000);
    return () => clearInterval(id);
  }, [items.length, width, index]);

  const dismissPopup = useCallback(() => {
    if (popup && user) {
      AsyncStorage.setItem(seenKey(user.id, popup.id), '1').catch(() => {});
    }
    setPopup(queue[0] ?? null);
    setQueue((q) => q.slice(1));
  }, [popup, queue, user]);

  if (!items.length) return null;

  // Pages bleed 16dp past the content column so the banner's glow isn't clipped by the pager.
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width + 2 * space.lg);
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    paused.current = false;
  };

  const detail = open ?? popup;
  return (
    <View style={style} onLayout={onLayout}>
      {width ? (
        <ScrollView ref={scroll as never} horizontal pagingEnabled style={{ marginHorizontal: -space.lg }} showsHorizontalScrollIndicator={false} decelerationRate="fast"
          onScrollBeginDrag={() => { paused.current = true; }} onMomentumScrollEnd={onEnd} scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: false })}>
          {items.map((b) => (
            <View key={b.id} style={{ width, paddingHorizontal: space.lg, paddingTop: 2, paddingBottom: 12 }}>
              <BannerCard banner={b} onPress={() => setOpen(b)} />
            </View>
          ))}
        </ScrollView>
      ) : <View style={{ height: 150 }} />}
      {items.length > 1 && width ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 0, marginBottom: 4 }}>
          {items.map((b, i) => {
            const w = x.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [6, 18, 6], extrapolate: 'clamp' });
            const o = x.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [0.35, 1, 0.35], extrapolate: 'clamp' });
            return <Animated.View key={b.id} style={{ height: 6, width: w, opacity: o, borderRadius: 3, backgroundColor: t.colors.primary }} />;
          })}
        </View>
      ) : null}

      <TopLayer visible={!!detail} onDismiss={() => (open ? setOpen(null) : dismissPopup())}>
        <Dialog visible={!!detail} onDismiss={() => (open ? setOpen(null) : dismissPopup())}>
          {detail?.image_url ? (
            <Image source={{ uri: detail.image_url }} resizeMode="cover"
              style={{ height: 180, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, marginBottom: space.md }} />
          ) : <Dialog.Icon icon="bullhorn-variant" />}
          <Dialog.Title style={{ textAlign: detail?.image_url ? 'left' : 'center' }}>{detail?.title}</Dialog.Title>
          <Dialog.Content>
            {detail?.text ? <Text variant="bodyMedium">{detail.text}</Text> : null}
            {detail?.end_date ? (
              <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>Until {shortDate(detail.end_date)}</Text>
            ) : null}
            {detail?.platform ? (
              <Text variant="labelSmall" style={{ color: t.colors.onSurfaceVariant, marginTop: 4 }}>From School Hub</Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => (open ? setOpen(null) : dismissPopup())}>{open ? 'Close' : 'Got it'}</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </View>
  );
}
