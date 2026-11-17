import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { ROLE_LABEL } from '@/lib/auth';
import { fmtDate, inr } from '@/lib/fees';
import { salaryModeLabel, type PayLine, type Payslip, type SlipSchool } from '@/lib/payroll';
import { PDF_FILE, saveToPhone, type Saved } from '@/lib/saveFile';
import type { Role } from '@/lib/types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function slipLines(p: Payslip): { earnings: PayLine[]; deductions: PayLine[] } {
  return {
    earnings: [{ name: 'Basic pay', amount: p.basic }, ...p.allowances, ...p.extra_earnings],
    deductions: [...p.deductions, ...p.extra_deductions, ...(p.lop_amount ? [{ name: `Unpaid days (${p.lop_days})`, amount: p.lop_amount }] : [])],
  };
}

/** Printable payslip (A5-friendly). */
export function buildPayslipHtml(p: Payslip, school: SlipSchool): string {
  const { earnings, deductions } = slipLines(p);
  const n = Math.max(earnings.length, deductions.length);
  const rows = Array.from({ length: n }, (_, i) => `<tr><td>${esc(earnings[i]?.name ?? '')}</td><td class="n">${earnings[i] ? esc(inr(earnings[i].amount)) : ''}</td>
    <td>${esc(deductions[i]?.name ?? '')}</td><td class="n">${deductions[i] ? esc(inr(deductions[i].amount)) : ''}</td></tr>`).join('');
  const paid = p.status === 'paid'
    ? `Paid on <b>${esc(fmtDate(p.paid_on))}</b> by ${esc(salaryModeLabel(p.mode).toLowerCase())}${p.reference ? ` &nbsp;·&nbsp; Ref: <b>${esc(p.reference)}</b>` : ''}`
    : p.run_status === 'draft' ? 'Not final yet' : 'Not paid yet';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payslip ${esc(p.slip_no ?? p.month_label)}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1c1e; margin: 0; font-size: 12px; }
  .wrap { border: 1.5px solid #123A6E; border-radius: 10px; padding: 18px 20px; }
  .head { text-align: center; border-bottom: 2px solid #123A6E; padding-bottom: 10px; margin-bottom: 12px; }
  .head h1 { margin: 0; font-size: 20px; color: #123A6E; }
  .head .sub { color: #555; font-size: 10.5px; margin-top: 4px; }
  .title { display: inline-block; margin-top: 10px; background: #123A6E; color: #fff; padding: 4px 16px; border-radius: 999px; font-weight: 700; font-size: 11px; }
  .meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; line-height: 1.6; }
  .lbl { color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  th { background: #EEF3FB; color: #123A6E; text-align: left; font-size: 11px; padding: 7px 8px; border-bottom: 1px solid #c9d6ea; }
  td { padding: 7px 8px; border-bottom: 1px solid #e6e9ef; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #123A6E; border-bottom: none; }
  .net { background: #FFF6E5; border-left: 4px solid #F5A623; padding: 10px 12px; border-radius: 4px; font-size: 15px; font-weight: 800; margin-bottom: 10px; }
  .foot { margin-top: 14px; font-size: 10px; color: #666; text-align: center; }
</style></head><body><div class="wrap">
  <div class="head"><h1>${esc(school.name)}</h1>${school.address ? `<div class="sub">${esc(school.address)}</div>` : ''}
    <div class="title">Payslip for ${esc(p.month_label)}</div></div>
  <div class="meta">
    <div><span class="lbl">Name</span> <b>${esc(p.name)}</b><br><span class="lbl">Role</span> ${esc(ROLE_LABEL[p.role as Role] ?? p.role)}</div>
    <div style="text-align:right"><span class="lbl">Employee code</span> <b>${esc(p.login_id)}</b><br><span class="lbl">Payslip no.</span> ${esc(p.slip_no ?? '—')}</div>
  </div>
  <table><thead><tr><th>Earnings</th><th class="n">Amount</th><th>Deductions</th><th class="n">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total pay</td><td class="n">${esc(inr(p.gross))}</td><td>Total deductions</td><td class="n">${esc(inr(p.total_deductions))}</td></tr></tfoot></table>
  <div class="net">Net pay: ${esc(inr(p.net))}</div>
  <div>${paid}</div>
  ${p.note ? `<div style="margin-top:6px"><span class="lbl">Note</span> ${esc(p.note)}</div>` : ''}
  <div class="foot">This payslip is made by the school in Prangan and needs no signature.</div>
</div></body></html>`;
}

/** PDF → system share sheet. Web falls back to the print dialog. */
export async function sharePayslip(p: Payslip, school: SlipSchool): Promise<void> {
  const html = buildPayslipHtml(p, school);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Payslip ${p.month_label}`, UTI: 'com.adobe.pdf' });
}

/** PDF saved into the phone's chosen folder (Android); share sheet on iPhone. */
export async function savePayslip(p: Payslip, school: SlipSchool): Promise<Saved | null> {
  const html = buildPayslipHtml(p, school);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return null;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const name = `Payslip-${p.month}-${String(p.login_id).replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
  return saveToPhone(uri, name, PDF_FILE, `Payslip ${p.month_label}`);
}
