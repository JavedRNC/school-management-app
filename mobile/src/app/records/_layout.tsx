import { Redirect, Stack } from 'expo-router';

import { Splash } from '@/components/RoleGuard';
import { StackedContext } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Attendance & marks registers opened on top of the tabs (principal, or teacher). */
export default function RecordsLayout() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (user.role === 'student') return <Redirect href="/student" />;
  return (
    <StackedContext.Provider value>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </StackedContext.Provider>
  );
}
