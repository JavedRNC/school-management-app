import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, View, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';

import { Icon, PressScale } from '@/components/ui';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { Banner } from '@/lib/types';

import { bannerGradient } from './util';

type Previewable = Pick<Banner, 'title' | 'text' | 'image_url' | 'color'> & { platform?: boolean };

/** One banner: gradient by colour, optional image behind a readable overlay. */
export function BannerCard({ banner, onPress, height = 150, style }: {
  banner: Previewable; onPress?: () => void; height?: number; style?: ViewStyle;
}) {
  const t = useAppTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!banner.image_url && banner.image_url.startsWith('https://') && !imgFailed;
  const [c1, c2] = bannerGradient(t, banner.color);
  return (
    <PressScale onPress={onPress} style={style}>
      <View style={{ height, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: c1,
        shadowColor: c1, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 }}>
        <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        {showImage ? (
          <>
            <Image source={{ uri: banner.image_url }} onError={() => setImgFailed(true)} resizeMode="cover"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          </>
        ) : (
          <>
            <View style={{ position: 'absolute', width: 160, height: 160, borderRadius: 80, right: -40, top: -50, backgroundColor: 'rgba(255,255,255,0.12)' }} />
            <View style={{ position: 'absolute', width: 90, height: 90, borderRadius: 45, right: 60, bottom: -40, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View style={{ position: 'absolute', right: space.lg, top: space.lg, opacity: 0.25 }}>
              <Icon name="bullhorn-variant" size={48} color="#fff" />
            </View>
          </>
        )}
        <View style={{ flex: 1, padding: space.lg, justifyContent: 'flex-end' }}>
          {banner.platform ? (
            <View style={{ position: 'absolute', top: space.md, left: space.md, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill,
              paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text variant="labelSmall" style={{ color: '#fff', fontWeight: '700' }}>Prangan</Text>
            </View>
          ) : null}
          <Text variant="titleLarge" numberOfLines={2} style={{ color: '#fff', fontWeight: '700' }}>{banner.title || 'Banner title'}</Text>
          {banner.text ? <Text variant="bodyMedium" numberOfLines={2} style={{ color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>{banner.text}</Text> : null}
        </View>
      </View>
    </PressScale>
  );
}
