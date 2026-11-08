import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const KEY_URL = 'api_url';
const KEY_TOKEN = 'token';

let baseUrl: string = (Constants.expoConfig?.extra?.apiUrl as string) || 'http://localhost:8000';
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function loadStored() {
  const [u, t] = await Promise.all([AsyncStorage.getItem(KEY_URL), AsyncStorage.getItem(KEY_TOKEN)]);
  if (u) baseUrl = u;
  token = t;
  return { url: baseUrl, token };
}

export const getBaseUrl = () => baseUrl;

export async function setBaseUrl(url: string) {
  baseUrl = url.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(KEY_URL, baseUrl);
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await AsyncStorage.setItem(KEY_TOKEN, t);
  else await AsyncStorage.removeItem(KEY_TOKEN);
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
  try {
    res = await fetch(baseUrl + path + qs, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${baseUrl}. Check the server address and your internet.`);
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
    throw new ApiError(res.status, errorMessage(data, res.status));
  }
  return data as T;
}
