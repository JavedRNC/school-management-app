import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { Button, Dialog, Text } from 'react-native-paper';

import { api } from '@/lib/api';
import { haptic } from '@/lib/feedback';
import { radius, space, useAppTheme } from '@/lib/theme';

import { Icon, TopLayer } from './ui';

/** F16 · In-app update prompt.
 *  The APK carries its build number (stamped by GitHub Actions into extra.buildNumber). On launch and whenever the app
 *  comes back to the foreground we ask the server which build is newest and which is the minimum:
 *  below the minimum → a forced, undismissable "Update now"; older than the newest → an optional prompt with "Later". */
export const APP_BUILD: number | null = Number((Constants.expoConfig?.extra as { buildNumber?: number } | undefined)?.buildNumber) || null;
/** Same text Android shows under App info, e.g. "1.0.0.8" (app.json version + build number). */
export const APP_VERSION_LABEL = `${Constants.expoConfig?.version ?? '1.0.0'}${APP_BUILD ? `.${APP_BUILD}` : ' (test build)'}`;
/** True in the "Prangan Dev" test app (dev branch builds, test server). */
export const IS_DEV_APP = (Constants.expoConfig?.extra as { appEnv?: string } | undefined)?.appEnv === 'dev';
export const APP_NAME_LABEL = `${IS_DEV_APP ? 'Prangan Dev (test app)' : 'Prangan'} v${APP_VERSION_LABEL}`;
const KEY_SKIPPED = 'update_skipped_build';
const CHECK_EVERY_MS = 5 * 60 * 1000;
const RETRY_MS = [15_000, 45_000, 120_000];     // server asleep / no network: try again soon

type Version = { latest_build: number; min_build: number; message: string; url: string };

// Other popups (e.g. banner popups) wait while the update prompt is on screen.
let showing = false;
const listeners = new Set<(v: boolean) => void>();
function setShowing(v: boolean) {
  showing = v;
  listeners.forEach((l) => l(v));
}
export function useUpdatePromptShowing(): boolean {
  const [v, setV] = useState(showing);
  useEffect(() => {
    listeners.add(setV);
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}

export function UpdateGate() {
  const t = useAppTheme();
  const [info, setInfo] = useState<Version | null>(null);
  const [mode, setMode] = useState<'forced' | 'optional' | null>(null);

  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const check = useCallback(async (attempt = 0) => {
    if (!APP_BUILD || Platform.OS === 'web') return;          // Expo Go / web preview: nothing to update
    if (retry.current) { clearTimeout(retry.current); retry.current = null; }
    try {
      const v = await api<Version>('/app/version');
      setInfo(v);
      if (v.min_build && APP_BUILD < v.min_build) return setMode('forced');
      if (v.latest_build && APP_BUILD < v.latest_build) {
        const skipped = Number(await AsyncStorage.getItem(KEY_SKIPPED)) || 0;
        setMode(skipped >= v.latest_build ? null : 'optional');
        return;
      }
      setMode(null);
    } catch {
      // offline or server asleep — try again shortly, then leave it to the next foreground check
      if (attempt < RETRY_MS.length) retry.current = setTimeout(() => { void check(attempt + 1); }, RETRY_MS[attempt]);
    }
  }, []);

  useEffect(() => {
    check();
    let last = Date.now();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - last > CHECK_EVERY_MS) {
        last = Date.now();
        check();
      }
    });
    return () => { sub.remove(); if (retry.current) clearTimeout(retry.current); };
  }, [check]);

  useEffect(() => {
    setShowing(!!mode && !!info);
  }, [mode, info]);

  if (!mode || !info) return null;
  const forced = mode === 'forced';

  async function update() {
    haptic.tap();
    try {
      await Linking.openURL(info!.url);
    } catch {
      /* no browser? nothing else we can do */
    }
  }

  async function later() {
    haptic.tap();
    await AsyncStorage.setItem(KEY_SKIPPED, String(info!.latest_build));
    setMode(null);
  }

  return (
    <TopLayer visible onDismiss={forced ? () => undefined : later}>
      <Dialog visible dismissable={!forced} onDismiss={forced ? undefined : later} style={{ borderRadius: radius.xl }}>
        <View style={{ alignItems: 'center', paddingTop: space.lg }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
            backgroundColor: forced ? t.colors.errorContainer : t.colors.primaryContainer,
            shadowColor: forced ? t.colors.error : t.colors.primary, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 }}>
            <Icon name={forced ? 'cellphone-arrow-down' : 'rocket-launch-outline'} size={32}
              color={forced ? t.colors.onErrorContainer : t.colors.onPrimaryContainer} />
          </View>
        </View>
        <Dialog.Title style={{ textAlign: 'center' }}>{forced ? 'Update required' : 'New version available'}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ textAlign: 'center', color: t.colors.onSurfaceVariant }}>
            {forced
              ? 'This version of Prangan is no longer supported. Please install the latest version to continue.'
              : 'A newer version of Prangan is ready with improvements and fixes.'}
          </Text>
          {info.message ? (
            <View style={{ marginTop: space.md, backgroundColor: t.colors.surfaceVariant, borderRadius: radius.lg, padding: space.md }}>
              <Text variant="labelLarge" style={{ color: t.colors.onSurface, marginBottom: 4 }}>What's new</Text>
              <Text variant="bodySmall" style={{ color: t.colors.onSurfaceVariant }}>{info.message}</Text>
            </View>
          ) : null}
          <Text variant="bodySmall" style={{ textAlign: 'center', color: t.colors.outline, marginTop: space.md }}>
            Tap Update, then open the downloaded file to install. You stay logged in.
            {'\n'}Your version: {APP_BUILD} · Latest: {info.latest_build}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={{ justifyContent: forced ? 'center' : 'flex-end' }}>
          {!forced ? <Button onPress={later}>Later</Button> : null}
          <Button mode="contained" icon="download" onPress={update} contentStyle={{ paddingHorizontal: space.md }}>Update now</Button>
        </Dialog.Actions>
      </Dialog>
    </TopLayer>
  );
}
