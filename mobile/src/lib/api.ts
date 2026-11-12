import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const KEY_URL = 'api_url_admin';      // F33: only an Admin sign-in can store a server override
const KEY_URL_OLD = 'api_url';        // pre-F33 override anyone could set: dropped on first start
const KEY_TOKEN = 'token';

export const DEFAULT_URL: string = (Constants.expoConfig?.extra?.apiUrl as string) || 'http://localhost:8000';
let baseUrl: string = DEFAULT_URL;
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
let onPasswordChange: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  /** Machine codes from the server: PASSWORD_CHANGE_REQUIRED, MODULE_NOT_ENABLED:<module>, READ_ONLY */
  code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Friendly text for server codes. */
function friendly(status: number, msg: string): { text: string; code: string | null } {
  if (msg === 'PASSWORD_CHANGE_REQUIRED') return { text: 'Please set a new password to continue.', code: msg };
  if (msg.startsWith('MODULE_NOT_ENABLED:')) {
    return { text: "This feature isn't part of your school's plan. Contact support to enable it.", code: msg };
  }
  if (status === 402) return { text: msg, code: 'READ_ONLY' };
  return { text: msg, code: null };
}

export function setPasswordChangeHandler(fn: () => void) {
  onPasswordChange = fn;
}

export async function loadStored() {
  const [u, t, old] = await Promise.all([AsyncStorage.getItem(KEY_URL), AsyncStorage.getItem(KEY_TOKEN), AsyncStorage.getItem(KEY_URL_OLD)]);
  token = t;
  if (old !== null) {
    await AsyncStorage.removeItem(KEY_URL_OLD).catch(() => {});
    // A sign-in made against another server can't be used on the built-in one.
    if (!u && old.replace(/\/+$/, '') !== DEFAULT_URL.replace(/\/+$/, '')) {
      token = null;
      await AsyncStorage.removeItem(KEY_TOKEN).catch(() => {});
    }
  }
  if (u && !onTrial) baseUrl = u;
  if (u) keptUrl = u;
  return { url: baseUrl, token };
}

export const getBaseUrl = () => baseUrl;

export const cleanUrl = (url: string) => url.trim().replace(/\/+$/, '');
export const isCustomServer = () => cleanUrl(baseUrl) !== cleanUrl(DEFAULT_URL);

// F33 · Only an Admin can move this phone to another server. A new address is used
// "on trial" until an Admin signs in on it; anyone else puts the phone back.
let keptUrl: string = DEFAULT_URL;
let onTrial = false;

/** Try another server (not remembered yet). Empty = the built-in server. */
export function tryServer(url: string) {
  baseUrl = cleanUrl(url) || DEFAULT_URL;
  onTrial = cleanUrl(baseUrl) !== cleanUrl(keptUrl);
}

export const serverOnTrial = () => onTrial;

/** Remember the server being tried. Call only after an Admin has signed in on it. */
export async function keepServer() {
  keptUrl = baseUrl;
  onTrial = false;
  if (isCustomServer()) await AsyncStorage.setItem(KEY_URL, baseUrl);
  else await AsyncStorage.removeItem(KEY_URL);
}

/** Give up the server being tried and go back to the remembered one. */
export function revertServer() {
  baseUrl = keptUrl;
  onTrial = false;
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem(KEY_TOKEN, t);
  else await AsyncStorage.removeItem(KEY_TOKEN);
}

/** Headers for requests made outside api() (file downloads). */
export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function errorMessage(data: unknown, status: number): string {
  const d = (data as { detail?: unknown })?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return `Request failed (${status})`;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; params?: Record<string, string | number | undefined | null> } = {},
): Promise<T> {
  const qs = opts.params
    ? '?' +
      Object.entries(opts.params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  let res: Response;
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;   // file uploads
  try {
    res = await fetch(baseUrl + path + qs, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. If you haven't used the app for a while it may be waking up — wait a minute and try again. Also check your internet.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    const f = friendly(res.status, errorMessage(data, res.status));
    if (f.code === 'PASSWORD_CHANGE_REQUIRED' && onPasswordChange) onPasswordChange();
    throw new ApiError(res.status, f.text, f.code);
  }
  return data as T;
}
