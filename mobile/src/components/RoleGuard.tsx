import { Redirect } from 'expo-router';
import { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useAppTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';

export function Splash() {
  const t = useAppTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.background }}>
      <ActivityIndicator size="large" color={t.colors.primary} />
    </View>
  );
}

export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={`/${user.role}`} />;
  return <>{children}</>;
}
