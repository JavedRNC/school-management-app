import { RoleTabs } from '@/components/RoleTabs';

export default function PrincipalLayout() {
  return (
    <RoleTabs role="principal" tabs={[
      { name: 'index', title: 'Dashboard', icon: 'stats-chart' },
      { name: 'people', title: 'People', icon: 'people' },
      { name: 'classes', title: 'Classes', icon: 'school' },
      { name: 'notices', title: 'Notices', icon: 'megaphone' },
      { name: 'profile', title: 'Profile', icon: 'person-circle' },
    ]} />
  );
}
