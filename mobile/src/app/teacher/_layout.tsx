import { RoleTabs } from '@/components/RoleTabs';

export default function TeacherLayout() {
  return (
    <RoleTabs role="teacher" tabs={[
      { name: 'index', title: 'Today', icon: 'today' },
      { name: 'attendance', title: 'Attendance', icon: 'checkmark-done' },
      { name: 'marks', title: 'Marks', icon: 'create' },
      { name: 'posts', title: 'Posts', icon: 'megaphone' },
      { name: 'profile', title: 'Profile', icon: 'person-circle' },
    ]} />
  );
}
