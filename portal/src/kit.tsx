// Interactive building blocks shared by the management screens: tabs, switches, side drawers, confirmations,
// chips, avatars, animated numbers and the "run an action with feedback" helper.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, Modal, useLayer, useToast } from './ui';

// ---------------------------------------------------------------- run an action: busy state + toast on success/failure
export function useAct() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const act = useCallback(async <T,>(key: string, fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> => {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
      return r;
    } catch (e) {
      toast((e as Error).message, true);
      return undefined;
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [toast]);
  return { busy, act };
}

// ---------------------------------------------------------------- confirmation dialog (promise based)
type Ask = { title: string; body?: ReactNode; confirm?: string; danger?: boolean };
const ConfirmCtx = createContext<(a: Ask) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<(Ask & { done: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((a: Ask) => new Promise<boolean>((done) => setAsk({ ...a, done })), []);
  const close = (v: boolean) => { ask?.done(v); setAsk(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {ask ? (
        <Modal title={ask.title} onClose={() => close(false)}
          actions={<><Button onClick={() => close(false)}>Cancel</Button><Button kind={ask.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{ask.confirm ?? 'Confirm'}</Button></>}>
          {ask.body ? <div className="muted">{ask.body}</div> : null}
        </Modal>
      ) : null}
    </ConfirmCtx.Provider>
  );
}

// ---------------------------------------------------------------- tabs (arrow keys move between tabs)
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string; count?: number }[]; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].id);
    box.current?.querySelectorAll<HTMLElement>('[role=tab]')[to]?.focus();     // focus follows the selection
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey} ref={box}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.label}{t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- switch
export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="switchrow">
      <div className="grow"><label htmlFor={id}><b>{label}</b></label>{hint ? <p className="small muted">{hint}</p> : null}</div>
      <button id={id} type="button" role="switch" aria-checked={checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)}><i /></button>
    </div>
  );
}

// ---------------------------------------------------------------- drawer: a side panel for add/edit forms (full screen on phones)
export function Drawer({ title, sub, onClose, children, footer, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayer(ref, onClose, true);
  return (
    <div className="drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <header><div className="grow"><h2 id={id}>{title}</h2>{sub ? <p className="small muted">{sub}</p> : null}</div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- small pieces
const HUES = [222, 262, 12, 152, 32, 192, 322, 92];
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.replace(/^(Mr|Mrs|Ms|Dr|Shri|Smt)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${HUES[h % HUES.length]} 55% 42%)` }}>{initials || '?'}</span>;
}

export function Chips<T extends string | number>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  const toggle = (id: T) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="field"><span>{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => <button key={String(o.id)} type="button" className="chip" aria-pressed={value.includes(o.id)} onClick={() => toggle(o.id)}>{o.label}</button>)}
      </div>
    </div>
  );
}

export function TextArea({ label, value, onChange, hint, error, ...rest }: { label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string | null }
  & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>) {
  const id = useId();
  return (
    <div className="field"><label htmlFor={id}><span>{label}</span></label>
      <textarea id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} {...rest} />
      {error ? <span className="err" role="alert">{error}</span> : hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** A number that counts up to its value the first time it appears (skipped when the user prefers less motion). */
export function CountUp({ value, format = (n: number) => new Intl.NumberFormat('en-IN').format(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || Math.abs(value - from.current) < 2) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, d = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / d);
      setShown(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="num">{format(shown)}</span>;
}

export function RowActions({ children }: { children: ReactNode }) {
  return <div className="rowactions" onClick={(e) => e.stopPropagation()}>{children}</div>;
}
export function IconButton({ icon, label, onClick, danger, disabled }: { icon: string; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return <button type="button" className={`iconbtn ${danger ? 'danger' : ''}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}><Icon name={icon} /></button>;
}

/** Client-side search over a list. */
export function useFilter<T>(rows: T[] | null | undefined, q: string, text: (r: T) => string) {
  return useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || text(r).toLowerCase().includes(s));
  }, [rows, q, text]);
}

/** A typed amount or count as a number, or null when it is empty or not a proper number ("1.2.3", "."). */
export function num(v: string): number | null {
  return /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null;
}

/** Print one part of the page (a receipt) on its own: a copy is placed beside the app, and the app is hidden while printing. */
export function printNode(el: HTMLElement | null) {
  if (!el) return;
  const holder = document.createElement('div');
  holder.id = 'print-root';
  holder.appendChild(el.cloneNode(true));
  document.body.appendChild(holder);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); holder.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 60000);       // browsers that never fire afterprint
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
