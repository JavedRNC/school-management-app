import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------- icons (inline, no icon font)
const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M9.5 19.5v-5h5v5',
  school: 'M3 9.5 12 5l9 4.5-9 4.5-9-4.5ZM7 12v4.5c1.5 1.3 3.2 2 5 2s3.5-.7 5-2V12M21 9.500V15',
  inbox: 'M4 13.5 6.5 5h11L20 13.5V19H4v-5.500Zm0 0h5a3 3 0 0 0 6 0h5',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 9a6.5 6.5 0 0 1 13 0M16 4.500a3.5 3.5 0 0 1 0 6.500M17.5 14a6.5 6.5 0 0 1 4 6',
  data: 'M12 3v11m0 0-4-4m4 4 4-4M4 16v4h16v-4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  key: 'M14.5 9.500a4 4 0 1 0-3.2 3.900L9 15.700V18H6.500v2.500H3V18l6.1-6.100a4 4 0 0 0 5.4-2.400Z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4m-4-4h11',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.3-4.3',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  upload: 'M12 20V9m0 0-4 4m4-4 4 4M5 4h14',
  check: 'm5 12.5 4.5 4.500L19 7',
  alert: 'M12 8v5m0 3.500h.01M10.3 3.9 2.6 17.500A2 2 0 0 0 4.3 20.500h15.400a2 2 0 0 0 1.7-3L13.7 3.900a2 2 0 0 0-3.4 0Z',
  sort: 'M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4',
  trash: 'M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13M10 11v6m4-6v6',
  calendar: 'M4 6h16v14H4V6Zm0 4h16M8 3v4m8-4v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11',
  rupee: 'M7 5h10M7 9h10M7 5c7 0 7 8 0 8l7 7',
  bus: 'M5 16V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10M5 16h14M5 16v2.500M19 16v2.500M5 11h14M8 13.500h.01M16 13.500h.01',
  megaphone: 'M4 10v4h3l8 4V6l-8 4H4Zm14-1a4 4 0 0 1 0 6M8 14v5h3',
  vote: 'M5 12.500 9 16.500l6-7M4 4h16v16H4V4Z',
  image: 'M4 5h16v14H4V5Zm0 11 5-5 4 4 3-3 4 4M15 9.500h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3-2 .700-.6 1.500.9 1.900-1.600 1.600-1.900-.900-1.500.600L12.600 20h-2.200l-.700-2-1.500-.600-1.900.900-1.600-1.600.9-1.900-.600-1.500L3 12.600v-2.200l2-.700.6-1.500-.900-1.900 1.600-1.600 1.900.9 1.500-.600L10.400 3h2.200l.7 2 1.500.6 1.900-.900 1.600 1.600-.900 1.900.6 1.500 2 .700V12Z',
  shield: 'M12 3 5 6v6c0 4.500 3 7.500 7 9 4-1.500 7-4.500 7-9V6l-7-3Zm-3 9 2 2 4-4',
  restore: 'M4 12a8 8 0 1 0 2.500-5.800M4 4v5h5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2',
  print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7v-6Z',
  copy: 'M9 9h10v11H9V9Zm-4 6V4h10',
  tag: 'M4 4h7l9 9-7 7-9-9V4Zm4.500 4.500h.01',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  leaf: 'M5 19c0-9 5-14 14-14 0 9-5 14-14 14Zm0 0 8-8',
  pin: 'M12 21s-6-5.500-6-10.500a6 6 0 1 1 12 0C18 15.500 12 21 12 21Zm0-8.500a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  layers: 'm12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 16l8 4 8-4',
  refresh: 'M20 12a8 8 0 1 1-2.500-5.800M20 4v5h-5',
};
export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.list} />
    </svg>
  );
}

// ---------------------------------------------------------------- formatting
export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('en-IN').format(n));
export const fmtMoney = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`);
/** The API sends UTC timestamps without a zone; show them in the viewer's local time. */
export function parseTime(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || !s.includes('T') ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const fmtDate = (s: string | null | undefined) => parseTime(s)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? '—';
export const fmtDateTime = (s: string | null | undefined) => parseTime(s)?.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) ?? '—';
export const words = (s: string) => s.replace(/[_.]/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const STATUS_TONE: Record<string, string> = {
  active: 'ok', free: 'info', trial: 'gold', grace: 'warn', expired: 'bad', suspended: 'bad',
  PENDING: 'gold', UNDER_REVIEW: 'info', ADDITIONAL_INFORMATION_REQUIRED: 'warn', APPROVED: 'ok', REJECTED: 'bad', ONBOARDED: 'ok',
};
export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending', UNDER_REVIEW: 'Under review', ADDITIONAL_INFORMATION_REQUIRED: 'More information needed', APPROVED: 'Approved',
  REJECTED: 'Rejected', ONBOARDED: 'Onboarded',
};
export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  return <span className={`badge ${status ? STATUS_TONE[status] ?? '' : ''}`}>{children ?? (status ? STATUS_LABEL[status] ?? words(status) : '')}</span>;
}

// ---------------------------------------------------------------- basics
export function Button({ kind = '', busy, icon, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: string; busy?: boolean; icon?: string }) {
  return (
    <button type="button" {...rest} className={`btn ${kind} ${rest.className ?? ''}`} disabled={rest.disabled || busy} aria-busy={busy || undefined}>
      {busy ? <span className="spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId();
  const desc = error ? `${id}-e` : hint ? `${id}-h` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}><span>{label}</span></label>
      {children(id, desc)}
      {error ? <span className="err" id={`${id}-e`} role="alert">{error}</span> : hint ? <small id={`${id}-h`}>{hint}</small> : null}
    </div>
  );
}

export function Text({ label, hint, error, value, onChange, ...rest }: { label: string; hint?: string; error?: string | null; value: string; onChange: (v: string) => void }
  & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => <input id={id} className="input" aria-describedby={d} aria-invalid={error ? true : undefined} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />}
    </Field>
  );
}

export function Select({ label, value, onChange, options, hint, error, disabled }: { label: string; value: string; onChange: (v: string) => void; options: (string | [string, string])[]; hint?: string; error?: string | null; disabled?: boolean }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, d) => (
        <select id={id} className="input" aria-describedby={d} aria-invalid={error ? true : undefined} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o || '—'}</option> : <option key={o[0]} value={o[0]}>{o[1]}</option>))}
        </select>
      )}
    </Field>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  useEffect(() => { document.title = `${title} · Prangan Portal`; }, [title]);
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub ? <p>{sub}</p> : null}</div>
      {children ? <div className="row">{children}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="sr">Loading…</span>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert bad" role="alert">
      <span className="grow">{message}</span>
      {onRetry ? <button type="button" className="btn small" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (page - 1) * size + 1 : 0;
  return (
    <div className="pager">
      <span className="muted small">{total ? `${fmtInt(from)}–${fmtInt(Math.min(total, page * size))} of ${fmtInt(total)}` : 'Nothing to show'}</span>
      <div className="row">
        <button type="button" className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="small num">Page {page} of {pages}</span>
        <button type="button" className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- data loading
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    fn().then((d) => { if (n === seq.current) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (n === seq.current) { setError(e.message); setLoading(false); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Debounced copy of a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, bad }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), bad ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.bad ? 'bad' : ''}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- modal (focus kept inside, Escape closes)
export function Modal({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const focusables = () => Array.from(box?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []).filter((e) => !e.hasAttribute('disabled'));
    (focusables()[0] ?? box)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <h2 id={id}>{title}</h2>
        {children}
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </div>
  );
}
