import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The sign-in token lives in the phone's secure storage. On Android it is encrypted with a key kept by the Android
 * Keystore (hardware-backed on most phones) and is excluded from backups, so copying the app's files — from a backup or
 * a stolen phone — does not give a working token. It is not a defence against someone with full (root) control of an
 * unlocked phone while the app runs; changing the password ends every session for that case.
 * The web build used by the browser tests has no Keystore, so there it uses ordinary storage.
 */
const KEY = 'prangan_token';
const OLD_KEY = 'token';            // where earlier builds kept it (plain AsyncStorage); also the web build's key
const native = Platform.OS === 'android' || Platform.OS === 'ios';
// AFTER_FIRST_UNLOCK: still readable when the app is woken in the background (a notification) while the phone is locked
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export async function readToken(): Promise<string | null> {
  if (!native) return AsyncStorage.getItem(OLD_KEY);
  let t: string | null = null;
  try {
    t = await SecureStore.getItemAsync(KEY, OPTS);
  } catch {
    t = null;                        // unreadable (e.g. the phone's lock was reset): sign in again
  }
  const old = await AsyncStorage.getItem(OLD_KEY).catch(() => null);
  if (old === null) return t;
  if (t) {
    await AsyncStorage.removeItem(OLD_KEY).catch(() => {});      // already moved earlier
    return t;
  }
  // one-time move from the old plain storage; the plain copy goes only once the secure copy is written
  try {
    await SecureStore.setItemAsync(KEY, old, OPTS);
    await AsyncStorage.removeItem(OLD_KEY).catch(() => {});
  } catch {
    /* secure storage unavailable right now: keep the session, try the move again next start */
  }
  return old;
}

export async function writeToken(t: string | null): Promise<void> {
  if (!native) {
    if (t) await AsyncStorage.setItem(OLD_KEY, t);
    else await AsyncStorage.removeItem(OLD_KEY);
    return;
  }
  // remove the previous account's token first, so a failed write can never bring the old sign-in back
  await SecureStore.deleteItemAsync(KEY, OPTS).catch(() => {});
  await AsyncStorage.removeItem(OLD_KEY).catch(() => {});
  if (t) await SecureStore.setItemAsync(KEY, t, OPTS);
}
