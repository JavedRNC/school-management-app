import { Redirect } from 'expo-router';

import { Splash } from '@/components/RoleGuard';
import { useAuth } from '@/lib/auth';

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={`/${user.role}`} />;
}
