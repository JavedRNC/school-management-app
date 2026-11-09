import { View } from 'react-native';
import { Text } from 'react-native-paper';

import { useAuth } from '@/lib/auth';
import { radius, space, Tone, toneColors, useAppTheme } from '@/lib/theme';

import { FadeIn, Icon, IconName } from './ui';

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso + 'T23:59:59').getTime();
  return Math.ceil((end - Date.now()) / 86400000);
}

function Banner({ tone, icon, title, text }: { tone: Tone; icon: IconName; title: string; text?: string }) {
  const t = useAppTheme();
  const c = toneColors(t, tone);
  return (
    <FadeIn>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: c.bg, borderRadius: radius.lg,
        padding: space.md, marginBottom: space.md }}>
        <Icon name={icon} size={22} color={c.fg} />
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" style={{ fontWeight: '800', color: c.on }}>{title}</Text>
          {text ? <Text variant="bodySmall" style={{ color: c.on, opacity: 0.9 }}>{text}</Text> : null}
        </View>
      </View>
    </FadeIn>
  );
}

/**
 * Subscription / school-day banners.
 * - `closed` adds "School closed today: <reason>" when today isn't a school day.
 * - `subscription` (default true) shows read-only / grace / trial notices.
 */
export function StatusBanner({ closed = false, subscription = true }: { closed?: boolean; subscription?: boolean }) {
  const { school, user } = useAuth();
  if (!school) return null;
  const sub = school.subscription;
  const manager = user && ['principal', 'vice_principal', 'coordinator'].includes(user.role);
  const out = [];
  if (subscription) {
    if (!school.can_write || school.status === 'expired' || school.status === 'suspended') {
      out.push(<Banner key="ro" tone="danger" icon="lock-alert-outline" title="Subscription expired — read-only"
        text="You can view everything, but changes are paused. Contact support to renew." />);
    } else if (school.status === 'grace' && manager) {
      const end = sub?.valid_until ? new Date(sub.valid_until + 'T00:00:00') : null;
      const left = end ? daysUntil(new Date(end.getTime() + (sub?.grace_days ?? 0) * 86400000).toISOString().slice(0, 10)) : null;
      out.push(<Banner key="grace" tone="warning" icon="clock-alert-outline" title="Subscription ended — please renew"
        text={left != null ? `Renew within ${Math.max(0, left)} day${left === 1 ? '' : 's'} to avoid read-only mode.` : 'Renew soon to avoid read-only mode.'} />);
    } else if (school.status === 'trial' && manager) {
      const left = daysUntil(sub?.trial_until);
      out.push(<Banner key="trial" tone="primary" icon="gift-outline" title="Free trial"
        text={left != null ? `${Math.max(0, left)} day${left === 1 ? '' : 's'} left in your trial.` : undefined} />);
    }
  }
  if (closed && !school.today_is_school_day) {
    out.push(<Banner key="closed" tone="primary" icon="beach" title={`School closed today${school.closed_reason ? `: ${school.closed_reason}` : ''}`}
      text="Attendance isn't needed today." />);
  }
  return out.length ? <>{out}</> : null;
}

/** Disabled-save hint when the school is read-only. */
export function useReadOnly(): boolean {
  const { school } = useAuth();
  return !!school && !school.can_write;
}
