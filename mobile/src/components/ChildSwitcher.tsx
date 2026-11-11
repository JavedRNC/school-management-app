import { useEffect, useRef } from 'react';
import { Animated, ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useChild } from '@/lib/child';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { User } from '@/lib/types';

import { PressScale, UserAvatar } from './ui';

/** Parent-only: pick which child the screen shows. Renders nothing for students. */
export function ChildSwitcher() {
  const { children, child, setChildId, classNames } = useChild();
  if (!children.length) return null;
  if (children.length === 1) {
    return <ChildCard kid={children[0]} cls={classNames[children[0].class_id ?? 0]} on compact />;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}>
      {children.map((k) => (
        <PressScale key={k.id} onPress={() => { if (k.id !== child?.id) { haptic.light(); setChildId(k.id); } }}>
          <ChildCard kid={k} cls={classNames[k.class_id ?? 0]} on={k.id === child?.id} />
        </PressScale>
      ))}
    </ScrollView>
  );
}

function ChildCard({ kid, cls, on, compact }: { kid: User; cls?: string; on: boolean; compact?: boolean }) {
  const t = useAppTheme();
  const a = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: on ? 1 : 0, useNativeDriver: false, speed: 18, bounciness: 6 }).start();
  }, [on, a]);
  const bg = a.interpolate({ inputRange: [0, 1], outputRange: [t.colors.elevation.level2, t.colors.primaryContainer] });
  const border = a.interpolate({ inputRange: [0, 1], outputRange: ['transparent', t.colors.primary] });
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: bg, borderColor: border, borderWidth: 1.5,
      borderRadius: radius.pill, paddingVertical: 6, paddingLeft: 6, paddingRight: space.lg, alignSelf: compact ? 'flex-start' : undefined,
      shadowColor: t.colors.primary, shadowOpacity: on ? 0.25 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: on ? 3 : 0 }}>
      <UserAvatar name={kid.name} size={34} />
      <View>
        <Text variant="labelLarge" style={{ fontWeight: '700', color: on ? t.colors.onPrimaryContainer : t.colors.onSurface }}>{kid.name.split(' ')[0]}</Text>
        <Text variant="labelSmall" style={{ color: on ? t.colors.onPrimaryContainer : t.colors.onSurfaceVariant }}>
          {cls ? `Class ${cls}` : 'Student'}{kid.roll_no ? ` · Roll ${kid.roll_no}` : ''}
        </Text>
      </View>
    </Animated.View>
  );
}
