import { Tabs } from 'expo-router/js-tabs';
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Text } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { prefersReducedMotion } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';

import { RoleGuard } from './RoleGuard';
import { Icon, IconName } from './ui';

/** `visible: false` keeps the route but hides it from the bar (e.g. no permission / module). */
export type TabDef = { name: string; title: string; icon: IconName; iconActive: IconName; visible?: boolean };

/** Bar shell. Chalk / Register: flat surface with a hairline top edge. Night: a floating rounded bar. */
function TabBar({ children, bottom }: { children: ReactNode; bottom: number }) {
  const t = useAppTheme();
  if (t.shape.tabs === 'floating') {
    return (
      <View style={{ backgroundColor: t.colors.background, paddingHorizontal: space.md, paddingTop: 6, paddingBottom: bottom + space.sm }}>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.colors.elevation.level1, borderRadius: 32,
          paddingHorizontal: 4, borderWidth: 1, borderColor: t.custom.cardBorder }}>
          {children}
        </View>
      </View>
    );
  }
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', backgroundColor: t.colors.elevation.level2, paddingBottom: bottom, paddingHorizontal: 4,
      borderTopWidth: t.shape.tabs === 'line' ? 1.5 : 1, borderTopColor: t.shape.tabs === 'line' ? t.colors.outlineVariant : t.custom.cardBorder }]}>
      {children}
    </View>
  );
}

/**
 * One tab, 64dp tall (comfortable thumb target). The active marker follows the theme:
 *  pill (Chalk) = soft tinted pill behind the icon · line (Register) = ink line on top · floating (Night) = solid marigold pill.
 */
function TabItem({ def, label, focused, onPress }: { def?: TabDef; label: string; focused: boolean; onPress: () => void }) {
  const t = useAppTheme();
  const style = t.shape.tabs;
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) v.setValue(focused ? 1 : 0);
    else Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 22, bounciness: focused ? 10 : 0 }).start();
  }, [v, focused]);
  const pillBg = style === 'floating' ? t.colors.primary : t.colors.primaryContainer;
  const iconOn = style === 'floating' ? t.colors.onPrimary : style === 'line' ? t.colors.primary : (t.dark ? t.colors.onPrimaryContainer : t.colors.primary);
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} aria-selected={focused} accessibilityLabel={label}
      android_ripple={{ color: t.colors.surfaceVariant, borderless: true, radius: 40 }}
      style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }}>
      {style === 'line' ? (
        <Animated.View style={{ position: 'absolute', top: 0, width: 40, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
          backgroundColor: t.colors.primary, opacity: v, transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }} />
      ) : null}
      <View style={{ width: 56, height: 30, alignItems: 'center', justifyContent: 'center' }}>
        {style !== 'line' ? (
          <Animated.View style={{ position: 'absolute', width: 56, height: 30, borderRadius: 15, backgroundColor: pillBg,
            opacity: v, transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }] }} />
        ) : null}
        <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
          {def ? <Icon name={focused ? def.iconActive : def.icon} size={22} color={focused ? iconOn : t.colors.onSurfaceVariant} /> : null}
        </Animated.View>
      </View>
      <Text variant="labelMedium" numberOfLines={1} maxFontSizeMultiplier={1.15}
        style={{ marginTop: 3, color: focused ? (style === 'floating' ? t.colors.onSurface : t.colors.primary) : t.colors.onSurfaceVariant, fontWeight: focused ? '700' : '500' }}>{label}</Text>
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
