import { RoleTabs } from '@/components/RoleTabs';
import { useCan } from '@/lib/auth';

/** Principal, Vice Principal and Coordinator share this interface; tabs follow their permissions. */
export default function PrincipalLayout() {
  const insights = useCan('insights', 'view');
  const people = useCan('people', 'view');
  const classes = useCan('classes', 'view');
  const notices = useCan('notices', 'view');
  return (
    <RoleTabs roles={['principal', 'vice_principal', 'coordinator']} tabs={[
      { name: 'index', title: 'Insights', icon: 'chart-box-outline', iconActive: 'chart-box', visible: insights },
      { name: 'people', title: 'People', icon: 'account-group-outline', iconActive: 'account-group', visible: people },
      { name: 'classes', title: 'Classes', icon: 'google-classroom', iconActive: 'google-classroom', visible: classes },
      { name: 'notices', title: 'Notices', icon: 'bullhorn-outline', iconActive: 'bullhorn', visible: notices },
      { name: 'profile', title: 'Me', icon: 'account-circle-outline', iconActive: 'account-circle' },
    ]} />
  );
}
