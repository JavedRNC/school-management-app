import { Tabs } from 'expo-router/js-tabs';
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Text } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { prefersReducedMotion } from '@/lib/feedback';
import { shadow, useAppTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';

import { RoleGuard } from './RoleGuard';
import { Icon, IconName } from './ui';

/** `visible: false` keeps the route but hides it from the bar (e.g. no permission / module). */
export type TabDef = { name: string; title: string; icon: IconName; iconActive: IconName; visible?: boolean };

/** Bar shell: white (or raised dark) surface with a soft upward shadow instead of a tinted slab. */
function TabBar({ children, bottom }: { children: ReactNode; bottom: number }) {
  const t = useAppTheme();
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', backgroundColor: t.colors.elevation.level2, paddingBottom: bottom, paddingHorizontal: 4,
      borderTopWidth: 1, borderTopColor: t.custom.cardBorder }, shadow(t, 3)]}>
      {children}
    </View>
  );
}

/** One tab: amber pill grows behind the icon, icon pops, label goes bold. 64dp tall = comfortable thumb target. */
function TabItem({ def, label, focused, onPress }: { def?: TabDef; label: string; focused: boolean; onPress: () => void }) {
  const t = useAppTheme();
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) v.setValue(focused ? 1 : 0);
    else Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 22, bounciness: focused ? 10 : 0 }).start();
  }, [v, focused]);
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}
      android_ripple={{ color: t.colors.surfaceVariant, borderless: true, radius: 40 }}
      style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 56, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: 56, height: 30, borderRadius: 15, backgroundColor: t.colors.secondaryContainer,
          opacity: v, transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }] }} />
        <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
          {def ? <Icon name={focused ? def.iconActive : def.icon} size={22} color={focused ? t.colors.onSecondaryContainer : t.colors.onSurfaceVariant} /> : null}
        </Animated.View>
      </View>
      <Text variant="labelMedium" numberOfLines={1} maxFontSizeMultiplier={1.15}
        style={{ marginTop: 3, color: focused ? t.colors.onSurface : t.colors.onSurfaceVariant, fontWeight: focused ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

/** Material 3 navigation bar for a role's tabs. */
export function RoleTabs({ role, roles, tabs }: { role?: Role; roles?: Role[]; tabs: TabDef[] }) {
  const t = useAppTheme();
  const byName = Object.fromEntries(tabs.map((x) => [x.name, x]));
  return (
    <RoleGuard role={role} roles={roles}>
      <Tabs
        screenOptions={{ headerShown: false, animation: 'shift' }}
        tabBar={({ emitter, navigateToTab, state, descriptors, insets }) => {
          const shown = state.routes.filter((r) => byName[r.name] && byName[r.name].visible !== false);
          const current = state.routes[state.index]?.key;
          return (
            <TabBar bottom={insets?.bottom ?? 0}>
              {shown.map((route) => {
                const def = byName[route.name];
                const o = descriptors[route.key]?.options;
                const label = (typeof o?.title === 'string' ? o.title : undefined) ?? def?.title ?? route.name;
                return (
                  <TabItem key={route.key} def={def} label={label} focused={route.key === current}
                    onPress={() => {
                      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                      if (!event.defaultPrevented) {
                        haptic.tap();
                        navigateToTab(route.key);
                      }
                    }} />
                );
              })}
            </TabBar>
          );
        }}
      >
        {tabs.map((x) => <Tabs.Screen key={x.name} name={x.name} options={{ title: x.title }} />)}
      </Tabs>
    </RoleGuard>
  );
}
