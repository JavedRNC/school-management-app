import { Redirect } from 'expo-router';
import { ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';

import { Loading, Screen } from './ui';

export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Screen><Loading /></Screen>;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={`/${user.role}`} />;
  return <>{children}</>;
}
