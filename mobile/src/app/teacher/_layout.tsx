import { RoleTabs } from '@/components/RoleTabs';

export default function TeacherLayout() {
  return (
    <RoleTabs role="teacher" tabs={[
      { name: 'index', title: 'Today', icon: 'calendar-today-outline', iconActive: 'calendar-today' },
      { name: 'attendance', title: 'Attendance', icon: 'clipboard-check-outline', iconActive: 'clipboard-check' },
      { name: 'marks', title: 'Marks', icon: 'pencil-box-multiple-outline', iconActive: 'pencil-box-multiple' },
      { name: 'posts', title: 'Posts', icon: 'bullhorn-outline', iconActive: 'bullhorn' },
      { name: 'profile', title: 'Me', icon: 'account-circle-outline', iconActive: 'account-circle' },
    ]} />
  );
}
