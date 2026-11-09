import { Redirect } from 'expo-router';
import { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { homeFor, useAuth } from '@/lib/auth';
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

/** Renders children only for the given roles; otherwise sends the user to their own home. */
export function RoleGuard({ role, roles, children }: { role?: Role; roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (user.must_change_password) return <Redirect href="/change-password" />;
  if (user.role === 'parent' && !user.consent_at) return <Redirect href="/consent" />;
  const allowed = roles ?? (role ? [role] : []);
  if (!allowed.includes(user.role)) return <Redirect href={homeFor(user) as '/'} />;
  return <>{children}</>;
}
