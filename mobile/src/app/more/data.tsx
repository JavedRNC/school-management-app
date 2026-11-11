import { DataTools } from '@/components/data/DataTools';
import { EmptyState, Hero, LoadingCards, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { space } from '@/lib/theme';
import { View } from 'react-native';

/** F30/F31 · Principal: Excel template, import (merge / replace) and full backup. */
export default function DataScreen() {
  const { user, school } = useAuth();
  return (
    <Screen header={<Hero title="Import & backup" subtitle="Excel template · import · full backup & restore" compact />}>
      <View style={{ height: space.lg }} />
      {!school || !user ? <LoadingCards /> : user.role !== 'principal' ? (
        <EmptyState icon="lock-outline" title="Principal only" text="Only the principal can import or back up school data." />
      ) : (
        <DataTools base="/data" schoolCode={school.code} schoolName={school.name} />
      )}
    </Screen>
  );
}
