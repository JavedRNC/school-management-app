import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, List, Text, TextInput } from 'react-native-paper';

import { api, getBaseUrl } from '@/lib/api';
import { ROLE_LABEL, useAuth, useCan } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';
import type { User } from '@/lib/types';

import { useOps } from './OpsGrid';
import { StatusBanner } from './StatusBanner';
import { FadeIn, Hero, IconName, Panel, Screen, Sheet, UserAvatar, TopLayer } from './ui';

type Link = { title: string; desc: string; icon: IconName; to: string };

/** "Me" hub: profile card, school status, links to settings/calendar/etc., password and logout. */
const OP_DESC: Record<string, string> = {
  fees: 'Dues, payments and receipts',
  leaves: 'Apply, approve and track leave',
  staff: 'GPS check-in, daily board, reports',
  transport: 'Buses, routes, stops and riders',
  polls: 'Consent forms and polls',
  banners: 'Home-screen announcements',
};

export function ProfileView({ extra }: { extra?: string }) {
  const t = useAppTheme();
  const toast = useToast();
  const { user, school, logout, setUser } = useAuth();
  const canSettings = useCan('settings', 'view');
  const ops = useOps();
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
      const u = await api<User>('/auth/password', { body: { old_password: oldPw, new_password: newPw } });
      setUser(u);
      setOld(''); setNew(''); setPwOpen(false);
      toast('Password updated');
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  const isPrincipal = user.role === 'principal';
  const links: Link[] = [];
  if (school) {
    links.push({ title: 'School calendar', desc: 'Holidays, vacations & events', icon: 'calendar-month-outline', to: '/more/calendar' });
    for (const o of ops) links.push({ title: o.label, desc: OP_DESC[o.key] ?? '', icon: o.icon, to: o.path });
    if (canSettings) {
      links.push({ title: 'School settings', desc: 'Profile & working days', icon: 'cog-outline', to: '/more/settings' });
      links.push({ title: 'Archive', desc: 'Restore archived items', icon: 'archive-outline', to: '/more/archive' });
    }
    if (isPrincipal) {
      links.push({ title: 'Import & backup', desc: 'Excel template, import, full backup & restore', icon: 'database-sync-outline', to: '/more/data' });
    }
    if (isPrincipal || canSettings) {
      links.push({ title: 'Privacy & audit log', desc: 'What support can see · activity history', icon: 'shield-lock-outline', to: '/more/privacy' });
      if (school.subscription) links.push({ title: 'Plan & usage', desc: `${school.subscription.plan ?? 'Custom'} plan`, icon: 'card-account-details-star-outline', to: '/more/plan' });
    }
  }

  return (
    <Screen header={
      <Hero title="Me" compact>
        <FadeIn>
          <Panel style={{ marginBottom: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <UserAvatar name={user.name} size={64} />
              <View style={{ flex: 1 }}>
                <Text variant="titleLarge" style={{ fontWeight: '800', color: t.colors.onSurface }} numberOfLines={2}>{user.name}</Text>
                <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Login ID: {user.login_id}</Text>
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 6, flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: t.colors.secondaryContainer, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
                    <Text variant="labelLarge" style={{ color: t.colors.onSecondaryContainer, fontWeight: '700' }}>{ROLE_LABEL[user.role]}</Text>
                  </View>
                  {extra ? (
                    <View style={{ backgroundColor: t.colors.primaryContainer, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
                      <Text variant="labelLarge" style={{ color: t.colors.onPrimaryContainer, fontWeight: '700' }}>{extra}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            {school ? (
              <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 0.5, borderTopColor: t.colors.outlineVariant }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: t.colors.onSurface }}>{school.name}</Text>
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>School code {school.code}</Text>
              </View>
            ) : null}
          </Panel>
        </FadeIn>
      </Hero>
    }>
      <View style={{ height: space.lg }} />
      <StatusBanner />
      {links.length ? (
        <FadeIn index={1}>
          <Panel style={{ paddingVertical: 0 }}>
            <View style={{ marginHorizontal: -space.lg, marginVertical: -space.sm }}>
              {links.map((l) => (
                <List.Item key={l.to} title={l.title} description={l.desc} left={(p) => <List.Icon {...p} icon={l.icon} />}
                  right={(p) => <List.Icon {...p} icon="chevron-right" />} onPress={() => { haptic.tap(); router.push(l.to as '/more/calendar'); }} />
              ))}
            </View>
          </Panel>
        </FadeIn>
      ) : null}
      <FadeIn index={2}>
        <Panel style={{ paddingVertical: 0 }}>
          <View style={{ marginHorizontal: -space.lg, marginVertical: -space.sm }}>
            <List.Item title="Change password" left={(p) => <List.Icon {...p} icon="lock-reset" />} right={(p) => <List.Icon {...p} icon="chevron-right" />} onPress={() => setPwOpen(true)} />
            <List.Item title="Server" description={getBaseUrl()} left={(p) => <List.Icon {...p} icon="server-network" />} />
            <List.Item title="Theme" description="Follows your phone's light / dark setting" left={(p) => <List.Icon {...p} icon="theme-light-dark" />} />
          </View>
        </Panel>
      </FadeIn>
      <FadeIn index={3}>
        <Button mode="contained-tonal" icon="logout" onPress={() => setConfirmOut(true)} buttonColor={t.colors.errorContainer} textColor={t.colors.onErrorContainer}
          contentStyle={{ paddingVertical: 6 }}>Log out</Button>
      </FadeIn>
      <Text variant="labelSmall" style={{ textAlign: 'center', color: t.colors.outline, marginTop: space.lg }}>School Hub v0.4</Text>

      <Sheet visible={pwOpen} onDismiss={() => setPwOpen(false)} title="Change password">
        <TextInput mode="outlined" label="Current password" value={oldPw} onChangeText={setOld} secureTextEntry={!show} style={{ marginBottom: space.md }} />
        <TextInput mode="outlined" label="New password" value={newPw} onChangeText={setNew} secureTextEntry={!show}
          right={<TextInput.Icon icon={show ? 'eye-off' : 'eye'} onPress={() => setShow((s) => !s)} />} />
        <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginVertical: space.sm }}>At least 6 characters, not the same as your login ID.</Text>
        <Button mode="contained" onPress={change} loading={busy} contentStyle={{ paddingVertical: 6 }}>Update password</Button>
      </Sheet>
      <TopLayer visible={confirmOut} onDismiss={() => setConfirmOut(false)}>
        <Dialog visible={confirmOut} onDismiss={() => setConfirmOut(false)}>
          <Dialog.Icon icon="logout" />
          <Dialog.Title style={{ textAlign: 'center' }}>Log out?</Dialog.Title>
          <Dialog.Actions>
            <Button onPress={() => setConfirmOut(false)}>Cancel</Button>
            <Button onPress={() => { setConfirmOut(false); logout(); router.replace('/login'); }}>Log out</Button>
          </Dialog.Actions>
        </Dialog>
      </TopLayer>
    </Screen>
  );
}
