import { BannerManager } from '@/components/comms/BannerManager';

/** Platform-wide banners shown to every school (Super Admin). */
export default function AdminBannersScreen() {
  return (
    <BannerManager endpoint="/admin/banners" canEdit allowImages showClasses={false} title="Platform banners"
      subtitle="Shown on home screens in every school" />
  );
}
