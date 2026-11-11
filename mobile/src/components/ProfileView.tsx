import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Text, TextInput } from 'react-native-paper';

import { api, getBaseUrl } from '@/lib/api';
import { ROLE_LABEL, useAuth, useCan } from '@/lib/auth';
import { haptic, useToast } from '@/lib/feedback';
import { fieldOutline, space, Tone, useAppTheme } from '@/lib/theme';
import type { User } from '@/lib/types';

import { useOps } from './OpsGrid';
import { StatusBanner } from './StatusBanner';
import { FadeIn, Hero, IconBadge, IconName, Panel, Row, Screen, Sheet, ToneChip, UserAvatar, TopLayer } from './ui';

type Link = { title: string; desc: string; icon: IconName; to: string };
const LINK_TONES: Tone[] = ['primary', 'warning', 'success'];

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
                <Text variant="titleLarge" style={{ fontWeight: '700', color: t.colors.onSurface }} numberOfLines={2}>{user.name}</Text>
                <Text variant="bodyMedium" style={{ color: t.colors.onSurfaceVariant }}>Login ID: {user.login_id}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <ToneChip text={ROLE_LABEL[user.role]} tone="warning" icon="shield-account-outline" compact={false} />
                  {extra ? <ToneChip text={extra} tone="primary" compact={false} /> : null}
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
            <View style={{ marginVertical: -space.sm }}>
              {links.map((l, i) => (
                <Row key={l.to} title={l.title} subtitle={l.desc} divider={i < links.length - 1}
                  left={<IconBadge icon={l.icon} tone={LINK_TONES[i % LINK_TONES.length]} size={38} />}
                  onPress={() => router.push(l.to as '/more/calendar')} />
              ))}
            </View>
          </Panel>
        </FadeIn>
      ) : null}
      <FadeIn index={2}>
        <Panel style={{ paddingVertical: 0 }}>
          <View style={{ marginVertical: -space.sm }}>
            <Row title="Change password" left={<IconBadge icon="lock-reset" tone="neutral" size={38} />} onPress={() => setPwOpen(true)} />
            <Row title="Server" subtitle={getBaseUrl()} left={<IconBadge icon="server-network" tone="neutral" size={38} />} />
            <Row title="Theme" subtitle="Follows your phone's light / dark setting" divider={false} left={<IconBadge icon="theme-light-dark" tone="neutral" size={38} />} />
          </View>
        </Panel>
      </FadeIn>
      <FadeIn index={3}>
        <Button mode="contained-tonal" icon="logout" onPress={() => setConfirmOut(true)} buttonColor={t.colors.errorContainer} textColor={t.colors.onErrorContainer}
          contentStyle={{ paddingVertical: 6 }}>Log out</Button>
      </FadeIn>
      <Text variant="labelSmall" style={{ textAlign: 'center', color: t.colors.outline, marginTop: space.lg }}>School Hub v0.5</Text>

      <Sheet visible={pwOpen} onDismiss={() => setPwOpen(false)} title="Change password">
        <TextInput mode="outlined" outlineStyle={fieldOutline} label="Current password" value={oldPw} onChangeText={setOld} secureTextEntry={!show} style={{ marginBottom: space.md }} />
        <TextInput mode="outlined" outlineStyle={fieldOutline} label="New password" value={newPw} onChangeText={setNew} secureTextEntry={!show}
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
