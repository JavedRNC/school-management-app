import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/RoleGuard';
import { StackedContext } from '@/components/ui';

/** School "More" pages (calendar, settings, archive, privacy, plan) opened over the tabs. */
export default function MoreLayout() {
  return (
    <RoleGuard roles={['principal', 'vice_principal', 'coordinator', 'teacher', 'student', 'parent']}>
      <StackedContext.Provider value>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
      </StackedContext.Provider>
    </RoleGuard>
  );
}
