import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { PDF_FILE, saveToPhone, type Saved } from '@/lib/saveFile';

import { fmtDate, inr, MODE_LABEL } from '@/lib/fees';
import type { FeeReceipt } from '@/lib/types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Printable fee receipt (A5-friendly, prints fine on A4). */
export function buildReceiptHtml(r: FeeReceipt): string {
  const cancelled = r.status === 'cancelled';
  const sub = [r.school.address, r.school.phone ? `Ph: ${r.school.phone}` : '', r.school.board ? `${r.school.board} affiliated` : '']
    .filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
  const lines = r.lines.map((l, i) => `
      <tr><td>${i + 1}</td><td>${esc(l.title)}</td><td class="n">${esc(inr(l.charge))}</td><td class="n">${esc(inr(l.amount))}</td></tr>`).join('');
  const ref = r.reference ? ` &nbsp;·&nbsp; Ref: <b>${esc(r.reference)}</b>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(r.receipt_no)}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1c1e; margin: 0; font-size: 12px; }
  .wrap { position: relative; border: 1.5px solid #123A6E; border-radius: 10px; padding: 18px 20px; overflow: hidden; }
  .head { text-align: center; border-bottom: 2px solid #123A6E; padding-bottom: 10px; margin-bottom: 12px; }
  .head h1 { margin: 0; font-size: 20px; color: #123A6E; letter-spacing: .3px; }
  .head .sub { color: #555; font-size: 10.5px; margin-top: 4px; }
  .title { display: inline-block; margin-top: 10px; background: #123A6E; color: #fff; padding: 4px 16px; border-radius: 999px;
           font-weight: 700; letter-spacing: 2px; font-size: 11px; }
  .meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .meta div { line-height: 1.6; }
  .lbl { color: #666; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; }
  th { background: #EEF3FB; color: #123A6E; text-align: left; font-size: 11px; padding: 7px 8px; border-bottom: 1px solid #c9d6ea; }
  td { padding: 7px 8px; border-bottom: 1px solid #e6e9ef; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 800; font-size: 14px; border-bottom: none; border-top: 2px solid #123A6E; }
  .words { background: #FFF6E5; border-left: 4px solid #F5A623; padding: 8px 10px; border-radius: 4px; margin-bottom: 10px; font-style: italic; }
  .row { display: flex; justify-content: space-between; gap: 12px; margin: 4px 0; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign .line { border-top: 1px solid #999; padding-top: 4px; min-width: 150px; text-align: center; color: #555; }
  .foot { margin-top: 14px; font-size: 10px; color: #666; text-align: center; }
  .stamp { position: absolute; right: 22px; top: 92px; border: 3px solid #1E7A46; color: #1E7A46; font-weight: 900; font-size: 20px;
           padding: 4px 14px; border-radius: 8px; transform: rotate(-12deg); opacity: .75; letter-spacing: 3px; }
  .wm { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 72px; font-weight: 900;
        color: rgba(186, 26, 26, .16); letter-spacing: 8px; white-space: nowrap; pointer-events: none; }
  .cx { color: #BA1A1A; font-weight: 700; margin-bottom: 8px; }
</style></head><body>
<div class="wrap">
  ${cancelled ? '<div class="wm">CANCELLED</div>' : '<div class="stamp">PAID</div>'}
  <div class="head">
    <h1>${esc(r.school.name)}</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
    <div class="title">FEE RECEIPT</div>
  </div>
  ${cancelled ? `<div class="cx">This receipt was cancelled${r.cancel_reason ? `: ${esc(r.cancel_reason)}` : ''}.</div>` : ''}
  <div class="meta">
    <div><span class="lbl">Receipt no.</span> <b>${esc(r.receipt_no)}</b><br><span class="lbl">Date</span> <b>${esc(fmtDate(r.paid_on))}</b><br>
      <span class="lbl">Academic year</span> ${esc(r.academic_year)}</div>
    <div style="text-align:right"><span class="lbl">Student</span> <b>${esc(r.student.name)}</b><br>
      <span class="lbl">Adm. no.</span> ${esc(r.student.admission_no)}<br>
      <span class="lbl">Class</span> ${esc(r.student.class_name || '—')}${r.student.roll_no != null ? ` &nbsp;·&nbsp; <span class="lbl">Roll</span> ${esc(r.student.roll_no)}` : ''}
      ${r.parent_name ? `<br><span class="lbl">Parent</span> ${esc(r.parent_name)}` : ''}</div>
  </div>
  <table>
    <thead><tr><th style="width:28px">#</th><th>Particulars</th><th class="n">Charge</th><th class="n">Paid</th></tr></thead>
    <tbody>${lines || '<tr><td></td><td>Fee payment</td><td class="n"></td><td class="n">' + esc(inr(r.amount)) + '</td></tr>'}</tbody>
    <tfoot><tr><td></td><td>Total received</td><td></td><td class="n">${esc(inr(r.amount))}</td></tr></tfoot>
  </table>
  <div class="words">${esc(r.amount_words)}</div>
  <div class="row"><span><span class="lbl">Paid by</span> <b>${esc(MODE_LABEL[r.mode] ?? r.mode)}</b>${ref}</span>
    <span><span class="lbl">Balance due</span> <b>${esc(inr(r.balance_after))}</b></span></div>
  ${r.note ? `<div class="row"><span><span class="lbl">Note</span> ${esc(r.note)}</span></div>` : ''}
  <div class="sign"><div class="lbl">Issued ${esc(fmtDate(r.issued_at))}</div>
    <div class="line">${r.received_by_name ? esc(r.received_by_name) + '<br>' : ''}Received by</div></div>
  <div class="foot">${r.footer ? esc(r.footer) + '<br>' : ''}This is a computer-generated receipt and does not need a signature.</div>
</div></body></html>`;
}

/** PDF → system share sheet (WhatsApp, Drive, print…). Web falls back to the print dialog. */
export async function shareReceipt(r: FeeReceipt): Promise<void> {
  const html = buildReceiptHtml(r);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Receipt ${r.receipt_no}`, UTI: 'com.adobe.pdf' });
}

export async function printReceipt(r: FeeReceipt): Promise<void> {
  await Print.printAsync({ html: buildReceiptHtml(r) });
}

/** PDF saved into the phone's chosen folder (Android); share sheet on iPhone. */
export async function saveReceipt(r: FeeReceipt): Promise<Saved | null> {
  const html = buildReceiptHtml(r);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return null;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const name = `Receipt-${String(r.receipt_no).replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
  return saveToPhone(uri, name, PDF_FILE, `Receipt ${r.receipt_no}`);
}
