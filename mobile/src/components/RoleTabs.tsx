import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { ComponentProps } from 'react';

import { colors } from '@/lib/theme';
import type { Role } from '@/lib/types';

import { RoleGuard } from './RoleGuard';

type Icon = ComponentProps<typeof Ionicons>['name'];

/** Bottom tabs for a role. Screens not listed are hidden from the tab bar. */
export function RoleTabs({ role, tabs, hidden = [] }: {
  role: Role; tabs: { name: string; title: string; icon: Icon }[]; hidden?: string[];
}) {
  return (
    <RoleGuard role={role}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        {tabs.map((t) => (
          <Tabs.Screen key={t.name} name={t.name} options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} size={size} color={String(color)} />,
          }} />
        ))}
        {hidden.map((n) => <Tabs.Screen key={n} name={n} options={{ href: null }} />)}
      </Tabs>
    </RoleGuard>
  );
}
