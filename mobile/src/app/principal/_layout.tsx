import { RoleTabs } from '@/components/RoleTabs';

export default function PrincipalLayout() {
  return (
    <RoleTabs role="principal" tabs={[
      { name: 'index', title: 'Insights', icon: 'chart-box-outline', iconActive: 'chart-box' },
      { name: 'people', title: 'People', icon: 'account-group-outline', iconActive: 'account-group' },
      { name: 'classes', title: 'Classes', icon: 'google-classroom', iconActive: 'google-classroom' },
      { name: 'notices', title: 'Notices', icon: 'bullhorn-outline', iconActive: 'bullhorn' },
      { name: 'profile', title: 'Me', icon: 'account-circle-outline', iconActive: 'account-circle' },
    ]} />
  );
}
