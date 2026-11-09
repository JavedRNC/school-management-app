import { RoleTabs } from '@/components/RoleTabs';
import { ChildProvider } from '@/lib/child';

export default function ParentLayout() {
  return (
    <ChildProvider>
      <RoleTabs role="parent" tabs={[
        { name: 'index', title: 'Home', icon: 'home-variant-outline', iconActive: 'home-variant' },
        { name: 'marks', title: 'Results', icon: 'trophy-outline', iconActive: 'trophy' },
        { name: 'timetable', title: 'Timetable', icon: 'calendar-clock-outline', iconActive: 'calendar-clock' },
        { name: 'homework', title: 'Homework', icon: 'book-open-outline', iconActive: 'book-open-variant' },
        { name: 'profile', title: 'Me', icon: 'account-circle-outline', iconActive: 'account-circle' },
      ]} />
    </ChildProvider>
  );
}
