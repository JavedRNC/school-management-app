import type { AppTheme, Tone } from './theme';
import type { FeeItemStatus, PayMode, PayStatus } from './types';
import type { IconName } from '@/components/ui';

/** ₹1,25,000 (Indian grouping); paise shown only when present. */
export function inr(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  const v = Number(n ?? 0);
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : opts.sign && v > 0 ? '+' : ''}₹${s}`;
}

/** Compact: ₹1.2L, ₹12.5K. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `₹${Math.round(n)}`;
}

export const MODE_LABEL: Record<PayMode, string> = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank: 'Bank transfer', online: 'Online' };
export const MODE_ICON: Record<PayMode, IconName> = { cash: 'cash', upi: 'qrcode-scan', cheque: 'checkbook', bank: 'bank-transfer', online: 'web' };
/** Reference field label per mode ('' = not needed). */
export const MODE_REF: Record<PayMode, string> = { cash: '', upi: 'UPI reference / UTR', cheque: 'Cheque number', bank: 'Bank reference', online: 'Transaction ID' };

export const ITEM_TONE: Record<FeeItemStatus, Tone> = { paid: 'success', partial: 'warning', due: 'primary', overdue: 'danger' };
export const ITEM_LABEL: Record<FeeItemStatus, string> = { paid: 'Paid', partial: 'Part paid', due: 'Due', overdue: 'Overdue' };
export const PAY_TONE: Record<PayStatus, Tone> = { confirmed: 'success', pending: 'warning', rejected: 'danger', cancelled: 'neutral' };
export const PAY_LABEL: Record<PayStatus, string> = { confirmed: 'Paid', pending: 'Awaiting check', rejected: 'Rejected', cancelled: 'Cancelled' };

export const KIND_ICON: Record<string, IconName> = { monthly: 'school-outline', transport: 'bus-school', extra: 'star-four-points-outline', fine: 'receipt-text-outline' };

/** 'YYYY-MM' → 'Nov 2026' */
export function monthLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function shiftMonth(p: string, by: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** upi://pay deep link — opens GPay/PhonePe/Paytm/BHIM with amount filled in. */
export function upiLink(o: { upiId: string; payee: string; amount: number; note: string }): string {
  const q = [`pa=${encodeURIComponent(o.upiId)}`, `pn=${encodeURIComponent(o.payee)}`, `am=${o.amount.toFixed(2)}`, 'cu=INR',
    `tn=${encodeURIComponent(o.note.slice(0, 60))}`];
  return `upi://pay?${q.join('&')}`;
}

export function statusColor(t: AppTheme, s: 'clear' | 'due' | 'overdue') {
  return s === 'overdue' ? t.custom.danger : s === 'due' ? t.custom.warning : t.custom.success;
}
