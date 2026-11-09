import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Checkbox, Text } from 'react-native-paper';

import { Splash } from '@/components/RoleGuard';
import { FadeIn, Hero, Icon, IconName, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { User } from '@/lib/types';

const POINTS: [IconName, string][] = [
  ['school-outline', "Your school collects your child's details (name, class, attendance, marks, contact) to run school activities."],
  ['eye-off-outline', 'Only your school and you can see them. The app provider sees only what your school allows, and every access is logged.'],
  ['cancel', 'No ads, no selling of data, and no tracking of your child.'],
  ['account-edit-outline', 'You can ask the school to correct or remove your details at any time.'],
];

/** Parent privacy notice + consent (India DPDP Act: verifiable parental consent for children's data). */
export default function Consent() {
  const t = useAppTheme();
  const toast = useToast();
  const { user, ready, setUser, logout } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'parent' || user.consent_at) return <Redirect href={homeFor(user) as '/'} />;

  async function accept() {
    setBusy(true);
    try {
      const u = await api<User>('/auth/consent', { method: 'POST' });
      setUser(u);
      toast('Thank you!');
      router.replace(homeFor(u) as '/');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<Hero eyebrow="Before you continue" title="Your privacy" subtitle="How your child's information is used" />}>
      <FadeIn>
        <Panel>
          {POINTS.map(([icon, text]) => (
            <View key={icon} style={{ flexDirection: 'row', gap: space.md, marginBottom: space.md }}>
              <Icon name={icon} size={22} color={t.colors.primary} />
              <Text variant="bodyMedium" style={{ flex: 1, color: t.colors.onSurface }}>{text}</Text>
            </View>
          ))}
          <Checkbox.Item label="I am the parent/guardian and I agree" status={agree ? 'checked' : 'unchecked'} onPress={() => setAgree((a) => !a)}
            position="leading" labelStyle={{ textAlign: 'left' }} style={{ paddingHorizontal: 0 }} />
          <Button mode="contained" icon="check" disabled={!agree} loading={busy} onPress={accept} contentStyle={{ paddingVertical: 8 }}>
            Agree and continue
          </Button>
        </Panel>
        <Button onPress={() => { logout(); router.replace('/login'); }}>Not now — sign out</Button>
      </FadeIn>
    </Screen>
  );
}
