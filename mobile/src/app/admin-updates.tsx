import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, HelperText, Switch, Text, TextInput } from 'react-native-paper';

import { RoleGuard } from '@/components/RoleGuard';
import { APP_BUILD } from '@/components/UpdateGate';
import { ErrorState, FadeIn, Hero, LoadingCards, Panel, Screen, ToneChip } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic, useToast } from '@/lib/feedback';
import { space, useAppTheme } from '@/lib/theme';
import { useLoad } from '@/lib/useLoad';

type AdminVersion = {
  auto_latest: boolean; latest_build: number; min_build: number; message: string; url: string; default_url: string;
  github_build: number | null; effective: { latest_build: number; min_build: number; url: string; source: string };
  updated_at: string | null; updated_by: string;
};

/** F16 · Admin: which app build is newest (optional update) and which is the minimum (forced update). */
export default function AdminUpdates() {
  return (
    <RoleGuard roles={['admin']}>
      <Body />
    </RoleGuard>
  );
}

function Body() {
  const t = useAppTheme();
  const toast = useToast();
  const d = useLoad(() => api<AdminVersion>('/admin/app-version'), []);
  const [auto, setAuto] = useState(true);
  const [latest, setLatest] = useState('');
  const [min, setMin] = useState('');
  const [msg, setMsg] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!d.data) return;
    setAuto(d.data.auto_latest);
    setLatest(String(d.data.latest_build || ''));
    setMin(String(d.data.min_build || ''));
    setMsg(d.data.message);
    setUrl(d.data.url);
  }, [d.data]);

  const newest = d.data ? (auto ? Math.max(d.data.github_build ?? 0, Number(latest) || 0) : Number(latest) || 0) : 0;
  const minN = Number(min) || 0;
  const bad = minN > newest;

  async function save(forceAll = false) {
    haptic.tap();
    setBusy(true);
    try {
      const body = { auto_latest: auto, latest_build: Number(latest) || 0, min_build: forceAll ? newest : minN, message: msg.trim(), url: url.trim() };
      await api('/admin/app-version', { method: 'PUT', body });
      haptic.success();
      toast(forceAll ? `Everyone below build ${newest} must update now` : 'Update settings saved');
      d.reload();
    } catch (e) {
      haptic.error();
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<Hero title="App updates" subtitle="Update popup on everyone's phone" compact />}>
      <View style={{ height: space.lg }} />
      {d.error ? <ErrorState message={d.error} onRetry={d.reload} /> : !d.data ? <LoadingCards /> : (
        <>
          <FadeIn>
            <Panel title="Right now" icon="cellphone-check">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <ToneChip text={`Newest build ${d.data.effective.latest_build || '—'}`} tone="primary" icon="rocket-launch-outline" />
                <ToneChip text={`Forced below ${d.data.effective.min_build || '—'}`} tone={d.data.effective.min_build ? 'danger' : 'neutral'} icon="alert-octagon-outline" />
                {d.data.github_build ? <ToneChip text={`GitHub: build ${d.data.github_build}`} tone="success" icon="github" /> : null}
                {APP_BUILD ? <ToneChip text={`This phone: build ${APP_BUILD}`} tone="neutral" icon="cellphone" /> : null}
              </View>
              {d.data.updated_by ? (
                <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant, marginTop: space.sm }}>
                  Last changed by {d.data.updated_by}
                </Text>
              ) : null}
            </Panel>
          </FadeIn>
          <FadeIn index={1}>
            <Panel title="Optional update" icon="bell-ring-outline"
              subtitle="Phones older than the newest build see “New version available” with Update and Later">
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyLarge" style={{ color: t.colors.onSurface }}>Newest build from GitHub automatically</Text>
                  <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>Every new APK build prompts phones on its own</Text>
                </View>
                <Switch value={auto} onValueChange={setAuto} />
              </View>
              {!auto ? (
                <TextInput mode="outlined" label="Newest build number" keyboardType="number-pad" value={latest} onChangeText={setLatest} />
              ) : null}
              <TextInput mode="outlined" label="What's new (shown in the popup)" value={msg} onChangeText={setMsg} multiline
                style={{ marginTop: space.sm }} maxLength={500} />
            </Panel>
          </FadeIn>
          <FadeIn index={2}>
            <Panel title="Forced update" icon="alert-octagon-outline" tone="danger"
              subtitle="Phones below this build can't use the app until they update — use after a change the old app can't handle">
              <TextInput mode="outlined" label="Minimum build (0 = never force)" keyboardType="number-pad" value={min} onChangeText={setMin} error={bad} />
              <HelperText type="error" visible={bad}>Can't be above the newest build ({newest})</HelperText>
              <Button mode="contained-tonal" icon="alert-decagram-outline" onPress={() => save(true)} disabled={busy || !newest}
                buttonColor={t.colors.errorContainer} textColor={t.colors.onErrorContainer}>
                Force everyone to build {newest || '…'}
              </Button>
            </Panel>
          </FadeIn>
          <FadeIn index={3}>
            <Panel title="Download link" icon="link-variant">
              <TextInput mode="outlined" label="APK link (blank = GitHub latest)" value={url} onChangeText={setUrl} autoCapitalize="none"
                placeholder={d.data.default_url} />
            </Panel>
          </FadeIn>
          <Button mode="contained" icon="content-save-outline" onPress={() => save(false)} loading={busy} disabled={busy || bad}
            contentStyle={{ paddingVertical: 6 }}>Save</Button>
        </>
      )}
    </Screen>
  );
}
