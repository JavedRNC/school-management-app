import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/RoleGuard';
import { StackedContext } from '@/components/ui';

/** Platform-wide banners opened on top of the admin tabs. */
export default function AdminBannersLayout() {
  return (
    <RoleGuard roles={['admin']}>
      <StackedContext.Provider value>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
      </StackedContext.Provider>
    </RoleGuard>
  );
}
