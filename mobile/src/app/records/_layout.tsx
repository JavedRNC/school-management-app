import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/RoleGuard';
import { StackedContext } from '@/components/ui';

/** Attendance & marks registers opened on top of the tabs (principal / VP / coordinator / teacher). */
export default function RecordsLayout() {
  return (
    <RoleGuard roles={['principal', 'vice_principal', 'coordinator', 'teacher']}>
      <StackedContext.Provider value>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
      </StackedContext.Provider>
    </RoleGuard>
  );
}
