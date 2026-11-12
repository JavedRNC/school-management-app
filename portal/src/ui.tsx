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

export function Select({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: (string | [string, string])[]; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <select id={id} className="input" aria-describedby={d} value={value} onChange={(e) => onChange(e.target.value)}>
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
