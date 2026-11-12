// Push notifications (Firebase Cloud Messaging on Android). Everything here is best-effort: if the phone has no
// Google services, the user says no, or anything fails, the app carries on exactly as before.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { api } from './api';

const KEY = 'push_token';
let handlerSet = false;

async function mod() {
  if (Platform.OS !== 'android') return null;        // iPhone and web builds are not set up for push yet
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/** Ask once for permission, get this phone's token and tell the server it belongs to the signed-in user. */
export async function registerPush(): Promise<void> {
  try {
    const N = await mod();
    if (!N) return;
    if (!handlerSet) {
      handlerSet = true;
      N.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
    }
    await N.setNotificationChannelAsync('default', { name: 'General', importance: N.AndroidImportance.DEFAULT });
    let perm = await N.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return;
    const { data } = await N.getDevicePushTokenAsync();
    if (typeof data !== 'string' || data.length < 20) return;
    await api('/push/register', { body: { token: data, platform: 'android' } });
    await AsyncStorage.setItem(KEY, data);
  } catch {
    /* no push on this phone */
  }
}

/** On log out: this phone stops getting the user's notifications. Call BEFORE the session token is cleared. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(KEY);
    if (!token) return;
    await AsyncStorage.removeItem(KEY);
    await api('/push/unregister', { body: { token, platform: 'android' } });
  } catch {
    /* ignore */
  }
}
