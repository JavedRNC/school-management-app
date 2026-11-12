// One place that talks to the Prangan API. The address and environment come from build settings, never from code.
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || 'http://127.0.0.1:8000';
export const APP_ENV: string = (import.meta.env.VITE_APP_ENV as string | undefined) || 'prod';

const KEY = 'prangan.session';
let token: string | null = null;
let onExpired: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The session lives in sessionStorage: it ends when the tab is closed and is never shared with other sites. */
export function loadSession(): { token: string; user: User } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { token: string; user: User };
    token = s.token;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: { token: string; user: User } | null) {
  token = s?.token ?? null;
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch { /* private mode: the session simply lasts until reload */ }
}

export function setExpiredHandler(fn: () => void) {
  onExpired = fn;
}

function messageOf(data: unknown, status: number): string {
  const d = (data as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string') {
    if (d === 'PASSWORD_CHANGE_REQUIRED') return 'Please set a new password to continue.';
    if (d.startsWith('MODULE_NOT_ENABLED')) return "This feature isn't part of your school's plan.";
    return d;
  }
  if (Array.isArray(d) && d[0]?.msg) {
    const first = d[0] as { msg: string; loc?: (string | number)[] };
    const field = first.loc?.[first.loc.length - 1];
    return `${typeof field === 'string' ? field.replace(/_/g, ' ') + ': ' : ''}${String(first.msg).replace(/^Value error, /, '')}`;
  }
  if (status === 0) return "Can't reach the server. It may be waking up — wait a minute and try again.";
  return `Something went wrong (${status}).`;
}

type Opts = { method?: string; body?: unknown; form?: FormData; auth?: boolean; query?: Record<string, string | number | undefined | null> };

function urlOf(path: string, query?: Opts['query']) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const qs = q.toString();
  return `${API_URL}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, o: Opts): Promise<Response> {
  const headers: Record<string, string> = {};
  if (o.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(urlOf(path, o.query), {
      method: o.method ?? (o.body !== undefined || o.form ? 'POST' : 'GET'), headers,
      body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ApiError(0, messageOf(null, 0));
  }
  if (res.status === 401 && o.auth !== false && token) {
    saveSession(null);
    onExpired?.();
  }
  return res;
}

export async function api<T>(path: string, o: Opts = {}): Promise<T> {
  const res = await send(path, o);
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(res.status, messageOf(data, res.status));
  return data as T;
}

/** Download a file made by the API and hand it to the browser's normal "save" flow. */
export async function download(path: string, fallbackName: string, query?: Opts['query']): Promise<string> {
  const res = await send(path, { query });
  if (!res.ok) {
    let data: unknown = null;
    try { data = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, messageOf(data, res.status));
  }
  const cd = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[^\w.\- ()]/g, '_');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return name;
}

// ---------------------------------------------------------------- types (only what the portal shows)
export type Role = 'admin' | 'principal' | 'vice_principal' | 'coordinator' | 'teacher' | 'student' | 'parent';
export interface User { id: number; school_id: number | null; login_id: string; name: string; role: Role; must_change_password: boolean; phone?: string; class_id?: number | null; active?: boolean }
export interface Paged<T> { items: T[]; total: number; page: number; size: number }
export interface SchoolRow {
  id: number; code: string; name: string; status: string; plan: string | null; students: number; teachers: number; parents: number;
  monthly_amount: number; is_free: boolean; valid_until: string | null; trial_until: string | null; suspended: boolean;
  reg_no?: string; city?: string; district?: string; state?: string; category?: string; pin?: string; email?: string; contact_name?: string; created_at?: string;
}
export interface Overview {
  schools: number; students: number; teachers: number; parents: number; by_status: Record<string, number>; free_schools: number;
  revenue_this_month: number; expected_monthly: number; expiring_soon: SchoolRow[]; recent: SchoolRow[];
}
export interface Trends { months: string[]; schools_joined: number[]; requests: number[] }
export interface RequestRow {
  id: number; reference: string; status: string; source: string; school_name: string; reg_no: string; city: string; district: string;
  state: string; contact_name: string; mobile: string; email: string; students: number | null; assigned_name: string;
  created_at: string; updated_at: string; school_id: number | null;
}
export interface RequestEvent { id: number; at: string; actor_name: string; kind: string; from_status: string; to_status: string; remarks: string }
export interface RequestDetail extends RequestRow {
  category: string; board: string; address: string; pin: string; principal_name: string; designation: string; alt_phone: string;
  contact_method: string; teachers: number | null; current_software: string; message: string; allowed_next: string[];
  can_onboard: boolean; possible_duplicate: { id: number; code: string; name: string } | null;
  school: { id: number; code: string; name: string } | null; events: RequestEvent[];
}
export interface OnboardingSummary { by_status: Record<string, number>; total: number; pending: number; latest: RequestRow[] }
export interface AuditRow { id: number; at: string; school_id: number | null; actor_name: string; actor_role: string; action: string; detail: string }
export interface ImportReport {
  ok: boolean; saved: boolean; mode: 'merge' | 'replace'; kind: string; errors: { sheet: string; row: number | null; column?: string | null; message: string }[];
  error_count: number; warnings: string[]; sheets: { sheet: string; add: number; update: number; skip: number }[]; new_logins: number;
  credentials?: { name: string; role: string; class?: string | null; login_id: string; password: string }[]; undo_saved?: boolean;
}
