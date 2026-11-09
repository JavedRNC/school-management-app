import { RoleTabs } from '@/components/RoleTabs';

export default function AdminLayout() {
  return (
    <RoleTabs roles={['admin']} tabs={[
      { name: 'index', title: 'Overview', icon: 'view-dashboard-outline', iconActive: 'view-dashboard' },
      { name: 'schools', title: 'Schools', icon: 'domain', iconActive: 'domain' },
      { name: 'plans', title: 'Plans', icon: 'tag-outline', iconActive: 'tag' },
      { name: 'audit', title: 'Audit', icon: 'clipboard-text-clock-outline', iconActive: 'clipboard-text-clock' },
      { name: 'profile', title: 'Me', icon: 'account-circle-outline', iconActive: 'account-circle' },
    ]} />
  );
}
