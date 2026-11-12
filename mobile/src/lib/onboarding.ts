// School onboarding requests — the same API the web portal uses (one source of truth).
import type { Tone } from './theme';

export const REQ_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending', UNDER_REVIEW: 'Under review', ADDITIONAL_INFORMATION_REQUIRED: 'More information needed', APPROVED: 'Approved',
  REJECTED: 'Rejected', ONBOARDED: 'Onboarded',
};
export const REQ_STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warning', UNDER_REVIEW: 'primary', ADDITIONAL_INFORMATION_REQUIRED: 'warning', APPROVED: 'success', REJECTED: 'danger', ONBOARDED: 'success',
};
export interface RequestRow {
  id: number; reference: string; status: string; source: string; school_name: string; reg_no: string; city: string; district: string; state: string;
  contact_name: string; mobile: string; email: string; students: number | null; assigned_name: string; created_at: string; updated_at: string; school_id: number | null;
}
export interface RequestDetail extends RequestRow {
  category: string; board: string; address: string; pin: string; principal_name: string; designation: string; alt_phone: string; contact_method: string;
  teachers: number | null; current_software: string; message: string; allowed_next: string[]; can_onboard: boolean;
  possible_duplicate: { id: number; code: string; name: string } | null; school: { id: number; code: string; name: string } | null;
  events: { id: number; at: string; actor_name: string; kind: string; from_status: string; to_status: string; remarks: string }[];
}
export interface RequestSummary { by_status: Record<string, number>; total: number; pending: number; latest: RequestRow[] }

/** API timestamps are UTC without a zone. */
export function when(s: string): string {
  const d = new Date(/[zZ]$/.test(s) || !s.includes('T') ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
