import { BannerManager } from '@/components/comms/BannerManager';
import { EmptyState, Hero, Screen } from '@/components/ui';
import { useAuth, useCan, useModule } from '@/lib/auth';

/** School banners manager (F15): staff with notices access. */
export default function BannersScreen() {
  const { school } = useAuth();
  const canView = useCan('notices', 'view');
  const canEdit = useCan('notices', 'edit') && school?.can_write !== false;
  const images = useModule('communication');
  if (!canView) {
    return (
      <Screen header={<Hero title="Banners" compact />}>
        <EmptyState icon="lock-outline" title="You don't have access to banners" />
      </Screen>
    );
  }
  return (
    <BannerManager endpoint="/banners" canEdit={canEdit} allowImages={images} showClasses title="Banners"
      subtitle="Highlights at the top of everyone's home screen" />
  );
}
