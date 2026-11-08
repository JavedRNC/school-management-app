import { Tabs } from 'expo-router/js-tabs';
import { BottomNavigation } from 'react-native-paper';

import { haptic } from '@/lib/feedback';
import { useAppTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';

import { RoleGuard } from './RoleGuard';
import { Icon, IconName } from './ui';

type TabDef = { name: string; title: string; icon: IconName; iconActive: IconName };

/** Material 3 navigation bar for a role's tabs. */
export function RoleTabs({ role, tabs }: { role: Role; tabs: TabDef[] }) {
  const t = useAppTheme();
  const byName = Object.fromEntries(tabs.map((x) => [x.name, x]));
  return (
    <RoleGuard role={role}>
      <Tabs
        screenOptions={{ headerShown: false, animation: 'shift' }}
        tabBar={({ emitter, navigateToTab, state, descriptors, insets }) => (
          <BottomNavigation.Bar
            navigationState={state}
            safeAreaInsets={insets}
            style={{ backgroundColor: t.colors.elevation.level2 }}
            activeIndicatorStyle={{ backgroundColor: t.colors.secondaryContainer }}
            onTabPress={({ route, preventDefault }) => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (event.defaultPrevented) preventDefault();
              else {
                haptic.tap();
                navigateToTab(route.key);
              }
            }}
            renderIcon={({ route, focused, color }) => {
              const def = byName[route.name];
              return def ? <Icon name={focused ? def.iconActive : def.icon} size={24} color={color} /> : null;
            }}
            getLabelText={({ route }) => {
              const o = descriptors[route.key]?.options;
              return (typeof o?.title === 'string' ? o.title : undefined) ?? byName[route.name]?.title ?? route.name;
            }}
          />
        )}
      >
        {tabs.map((x) => <Tabs.Screen key={x.name} name={x.name} options={{ title: x.title }} />)}
      </Tabs>
    </RoleGuard>
  );
}
