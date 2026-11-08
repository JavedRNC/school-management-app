import { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, List, Portal, Text, TextInput } from 'react-native-paper';

import { api, getBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';

import { FadeIn, Hero, Panel, Sheet, UserAvatar } from './ui';

export function ProfileView({ extra }: { extra?: string }) {
  const t = useAppTheme();
  const toast = useToast();
  const { user, logout } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [oldPw, setOld] = useState('');
  const [newPw, setNew] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function change() {
    if (newPw.length < 6) return toast('New password must be at least 6 characters', { error: true });
    setBusy(true);
    try {
      await api('/auth/password', { body: { old_password: oldPw, new_password: newPw } });
      setOld(''); setNew(''); setPwOpen(false);
      toast('Password updated');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Hero title="Profile" compact>
        <FadeIn>
          <Panel style={{ alignItems: 'center' }}>
            <View style={{ alignItems: 'center', marginTop: -space.sm }}>
              <UserAvatar name={user.name} size={84} />
              <Text variant="headlineSmall" style={{ fontWeight: '800', marginTop: space.md, color: t.colors.onSurface, textAlign: 'center' }}>{user.name}</Text>
              <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>{user.email}</Text>
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                <View style={{ backgroundColor: t.colors.secondaryContainer, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 }}>
                  <Text variant="labelLarge" style={{ color: t.colors.onSecondaryContainer, textTransform: 'capitalize', fontWeight: '700' }}>{user.role}</Text>
                </View>
                {extra ? (
                  <View style={{ backgroundColor: t.colors.primaryContainer, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 5 }}>
                    <Text variant="labelLarge" style={{ color: t.colors.onPrimaryContainer, fontWeight: '700' }}>{extra}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Panel>
        </FadeIn>
      </Hero>
      <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
        <FadeIn index={1}>
          <Panel style={{ paddingVertical: 0 }}>
            <View style={{ marginHorizontal: -space.lg, marginVertical: -space.sm }}>
              <List.Item title="Change password" left={(p) => <List.Icon {...p} icon="lock-reset" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} onPress={() => setPwOpen(true)} />
              <List.Item title="Server" description={getBaseUrl()} left={(p) => <List.Icon {...p} icon="server-network" />} />
              <List.Item title="Theme" description="Follows your phone's light / dark setting" left={(p) => <List.Icon {...p} icon="theme-light-dark" />} />
            </View>
          </Panel>
        </FadeIn>
        <FadeIn index={2}>
          <Button mode="contained-tonal" icon="logout" onPress={() => setConfirmOut(true)} buttonColor={t.colors.errorContainer} textColor={t.colors.onErrorContainer}
            contentStyle={{ paddingVertical: 6 }}>Log out</Button>
        </FadeIn>
        <Text variant="labelSmall" style={{ textAlign: 'center', color: t.colors.outline, marginTop: space.lg }}>School Hub v0.2</Text>
      </View>

      <Sheet visible={pwOpen} onDismiss={() => setPwOpen(false)} title="Change password">
        <TextInput mode="outlined" label="Current password" value={oldPw} onChangeText={setOld} secureTextEntry={!show} style={{ marginBottom: space.md }} />
        <TextInput mode="outlined" label="New password" value={newPw} onChangeText={setNew} secureTextEntry={!show}
          right={<TextInput.Icon icon={show ? 'eye-off' : 'eye'} onPress={() => setShow((s) => !s)} />} />
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginVertical: space.sm }}>At least 6 characters.</Text>
        <Button mode="contained" onPress={change} loading={busy} contentStyle={{ paddingVertical: 6 }}>Update password</Button>
      </Sheet>
      <Portal>
        <Dialog visible={confirmOut} onDismiss={() => setConfirmOut(false)}>
          <Dialog.Icon icon="logout" />
          <Dialog.Title style={{ textAlign: 'center' }}>Log out?</Dialog.Title>
          <Dialog.Actions>
            <Button onPress={() => setConfirmOut(false)}>Cancel</Button>
            <Button onPress={() => { setConfirmOut(false); logout(); }}>Log out</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
