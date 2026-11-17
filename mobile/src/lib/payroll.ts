// Payroll (F36): shapes returned by /payroll and small helpers shared by the payroll screens.
export type PayLine = { name: string; amount: number };
export type Salary = { basic: number; allowances: PayLine[]; deductions: PayLine[]; note: string; gross: number; total_deductions: number; net: number };
export type StaffSalary = { user_id: number; name: string; role: string; login_id: string; salary: Salary | null };
export type StaffSalaries = { rows: StaffSalary[]; people: number; with_salary: number; monthly_gross: number; monthly_net: number };
export type PayrollRun = {
  id: number; month: string; month_label: string; status: 'draft' | 'final'; days_in_month: number; working_days: number; counted_until: string | null;
  lop_enabled: boolean; lop_basis: 'calendar' | 'working'; people: number; gross: number; total_deductions: number; net: number;
  paid_count: number; paid_amount: number; unpaid_count: number; unpaid_amount: number;
};
export type Payslip = {
  id: number; run_id: number; month: string; month_label: string; run_status: 'draft' | 'final'; user_id: number; slip_no: string | null;
  name: string; role: string; login_id: string; basic: number; allowances: PayLine[]; deductions: PayLine[];
  extra_earnings: PayLine[]; extra_deductions: PayLine[]; absent_days: number; lop_days: number; lop_manual: boolean; lop_amount: number;
  gross: number; total_deductions: number; net: number; note: string; status: 'paid' | 'unpaid'; paid_on: string | null; mode: string; reference: string;
  days_in_month: number; working_days: number; lop_basis: 'calendar' | 'working';
};
export type RunDetail = { run: PayrollRun; payslips: Payslip[] };
export type PayrollConfig = { lop_enabled: boolean; lop_basis: 'calendar' | 'working'; slip_prefix: string; attendance_available: boolean };
export type SlipSchool = { name: string; address: string; phone?: string };

export type SalaryMode = 'bank' | 'upi' | 'cash' | 'cheque';
export const SALARY_MODES: { value: SalaryMode; label: string; icon: 'bank-transfer' | 'qrcode-scan' | 'cash' | 'checkbook' }[] = [
  { value: 'bank', label: 'Bank transfer', icon: 'bank-transfer' }, { value: 'upi', label: 'UPI', icon: 'qrcode-scan' },
  { value: 'cash', label: 'Cash', icon: 'cash' }, { value: 'cheque', label: 'Cheque', icon: 'checkbook' },
];
export const salaryModeLabel = (m: string) => SALARY_MODES.find((x) => x.value === m)?.label ?? m;

export type LineDraft = { name: string; amount: string };
export const toDraft = (l: PayLine[]): LineDraft[] => l.map((x) => ({ name: x.name, amount: String(x.amount) }));
/** A typed amount as a number, or null when it is empty or not a proper number. */
export const amount = (v: string): number | null => (/^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
export const draftTotal = (l: LineDraft[]) => l.reduce((a, x) => a + (amount(x.amount) ?? 0), 0);
export const linesTotal = (l: PayLine[]) => l.reduce((a, x) => a + x.amount, 0);
export const cleanLines = (l: LineDraft[]): PayLine[] => l.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), amount: amount(x.amount) ?? 0 }));
/** The first problem in a list of typed lines, or null. Fully empty rows are ignored. */
export function linesError(l: LineDraft[], what: string): string | null {
  const seen = new Set<string>();
  for (const x of l) {
    const name = x.name.trim();
    if (!name && !x.amount.trim()) continue;
    if (!name) return `Name every ${what}`;
    const a = amount(x.amount);
    if (a === null || a <= 0) return `Enter an amount above 0 for "${name}"`;
    if (seen.has(name.toLowerCase())) return `"${name}" is listed twice`;
    seen.add(name.toLowerCase());
  }
  return null;
}
export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const lopBasis = (r: { lop_basis: string; days_in_month: number; working_days: number }) => (r.lop_basis === 'calendar' ? r.days_in_month : r.working_days);
/** True for a real calendar date written as YYYY-MM-DD (so 2026-02-31 is refused). */
export function realDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
