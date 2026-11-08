import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { user } = useAuth();
  return <ProfileView extra={user?.roll_no ? `Roll no. ${user.roll_no}` : undefined} />;
}
