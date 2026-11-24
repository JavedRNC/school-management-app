import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The sign-in token lives in the phone's secure storage: on Android it is encrypted with a key held by the Android
 * Keystore (hardware-backed on most phones), so copying the app's files — from a rooted or stolen phone, or a backup —
 * does not give the token. The key never leaves the phone and the token is readable only by Prangan.
 * The web build used by the browser tests has no Keystore, so there it falls back to ordinary storage.
 */
const KEY = 'prangan_token';
const OLD_KEY = 'token';            // where earlier builds kept it (plain AsyncStorage); also the web build's key
const native = Platform.OS === 'android' || Platform.OS === 'ios';
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function readToken(): Promise<string | null> {
  if (!native) return AsyncStorage.getItem(OLD_KEY);
  let t: string | null = null;
  try {
    t = await SecureStore.getItemAsync(KEY, OPTS);
  } catch {
    t = null;                        // unreadable (e.g. the phone's lock was reset): sign in again
  }
  const old = await AsyncStorage.getItem(OLD_KEY).catch(() => null);
  if (old !== null) {
    // one-time move from the old plain storage; the plain copy is removed either way
    if (!t) {
      try {
        await SecureStore.setItemAsync(KEY, old, OPTS);
        t = old;
      } catch {
        t = null;
      }
    }
    await AsyncStorage.removeItem(OLD_KEY).catch(() => {});
  }
  return t;
}

export async function writeToken(t: string | null): Promise<void> {
  if (!native) {
    if (t) await AsyncStorage.setItem(OLD_KEY, t);
    else await AsyncStorage.removeItem(OLD_KEY);
    return;
  }
  if (t) await SecureStore.setItemAsync(KEY, t, OPTS);
  else await SecureStore.deleteItemAsync(KEY, OPTS).catch(() => {});
  await AsyncStorage.removeItem(OLD_KEY).catch(() => {});
}
