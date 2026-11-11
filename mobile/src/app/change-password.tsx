import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { TextInput } from '@/components/Field';

import { Splash } from '@/components/RoleGuard';
import { FadeIn, Hero, Icon, Panel, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import type { User } from '@/lib/types';

/** First sign-in with a temporary password (F3): the user must choose their own. */
export default function ChangePassword() {
  const t = useAppTheme();
  const toast = useToast();
  const { user, ready, setUser, refreshSchool, logout } = useAuth();
  const [oldPw, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Splash />;
  if (!user) return <Redirect href="/login" />;
  if (!user.must_change_password) return <Redirect href={homeFor(user) as '/'} />;

  const tooShort = pw.length > 0 && pw.length < 6;
  const sameAsId = pw.trim().toLowerCase() === user.login_id.toLowerCase();
  const mismatch = pw2.length > 0 && pw !== pw2;
  const valid = oldPw && pw.length >= 6 && !sameAsId && pw === pw2 && pw !== oldPw;

  async function save() {
    if (!valid) return haptic.error();
    setBusy(true);
    setError(null);
    try {
      const u = await api<User>('/auth/password', { body: { old_password: oldPw, new_password: pw } });
      setUser(u);
      if (u.school_id) await refreshSchool();
      toast('Password set — welcome! 🎉');
      router.replace(homeFor(u) as '/');
    } catch (e) {
      setError((e as Error).message);
      haptic.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<Hero eyebrow={`Hi ${user.name.split(' ')[0]}`} title="Set your password" subtitle="Your school gave you a temporary password. Choose your own to continue." />}>
      <FadeIn>
        <Panel>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', marginBottom: space.md }}>
            <Icon name="shield-lock-outline" size={22} color={t.colors.primary} />
            <Text variant="bodyMedium" style={{ flex: 1, color: t.colors.onSurfaceVariant }}>
              Passwords are stored encrypted — nobody at the school can see yours.
            </Text>
          </View>
          <TextInput mode="outlined" label="Temporary password" value={oldPw} onChangeText={setOld} secureTextEntry={!show}
            left={<TextInput.Icon icon="key-outline" />} style={{ marginBottom: space.md }} />
          <TextInput mode="outlined" label="New password" value={pw} onChangeText={setPw} secureTextEntry={!show}
            left={<TextInput.Icon icon="lock-outline" />} right={<TextInput.Icon icon={show ? 'eye-off' : 'eye'} onPress={() => setShow((s) => !s)} />}
            error={tooShort || sameAsId} />
          <HelperText type={tooShort || sameAsId ? 'error' : 'info'} visible>
            {sameAsId ? "Can't be the same as your login ID" : 'At least 6 characters'}
          </HelperText>
          <TextInput mode="outlined" label="Confirm new password" value={pw2} onChangeText={setPw2} secureTextEntry={!show}
            left={<TextInput.Icon icon="lock-check-outline" />} error={mismatch} />
          <HelperText type="error" visible={mismatch || !!error}>{mismatch ? "Passwords don't match" : error}</HelperText>
          <Button mode="contained" icon="check" onPress={save} loading={busy} disabled={!valid} contentStyle={{ paddingVertical: 8 }}>
            Save and continue
          </Button>
        </Panel>
        <Button onPress={() => { logout(); router.replace('/login'); }}>Sign out</Button>
      </FadeIn>
    </Screen>
  );
}
