import { Redirect } from 'expo-router';

import { Splash } from '@/components/RoleGuard';
import { homeFor, useAuth } from '@/lib/auth';

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={homeFor(user) as '/'} />;
}
