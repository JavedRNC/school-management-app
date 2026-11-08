import { Redirect } from 'expo-router';

import { Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Index() {
  const { user, ready } = useAuth();
  if (!ready) return <Screen><Loading /></Screen>;
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={`/${user.role}`} />;
}
