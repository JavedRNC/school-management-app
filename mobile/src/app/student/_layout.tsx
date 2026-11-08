import { RoleTabs } from '@/components/RoleTabs';

export default function StudentLayout() {
  return (
    <RoleTabs role="student" tabs={[
      { name: 'index', title: 'Home', icon: 'home' },
      { name: 'marks', title: 'Marks', icon: 'ribbon' },
      { name: 'timetable', title: 'Timetable', icon: 'calendar' },
      { name: 'homework', title: 'Homework', icon: 'book' },
      { name: 'profile', title: 'Profile', icon: 'person-circle' },
    ]} />
  );
}
