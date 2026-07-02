import { Injectable } from '@angular/core';

export interface AuditColumn {
  header: string;
  key: string;
  align?: 'left' | 'right' | 'center';
  /** text (default) | number (2dp, blank when 0) | date (dd/mm/yyyy) */
  type?: 'text' | 'number' | 'date';
}

export interface AuditTotalRow {
  label: string;
  /** column key -> value; only columns present here get a value printed */
  values: Record<string, number | string>;
  /** grand total gets a heavier double-line border, like a Trial Balance footing line */
  grand?: boolean;
}

export interface AuditPrintConfig {
  /** e.g. "Profit and Loss", "Balance Sheet", "GST Detail Report" */
  reportTitle: string;
  /** e.g. "For The Period From 01/04/2023 To 31/03/2024" or "As At 31/03/2024" */
  periodLine?: string;
  /** left-side header block lines, e.g. ["Date : From ... to ...", "Sort By : Code;Description", "Project : All"] */
  metaLines?: string[];
  columns: AuditColumn[];
  rows: any[];
  totalRows?: AuditTotalRow[];
  companyName?: string;
  /** first column is usually a code/label column that spans when no numeric value applies to a total row */
  labelColumnKey?: string;
}

/** Formal ledger/auditing-style print layout shared by all finance reports (Trial Balance, P&L, Balance Sheet, Aging, GST, etc). */
@Injectable({ providedIn: 'root' })
export class AuditPrintService {

  print(cfg: AuditPrintConfig): void {
    const w = window.open('', '_blank', 'width=1100,height=780');
    if (!w) return;
    w.document.write(this.buildHtml(cfg));
    w.document.close();
  }

  private fmtNum(v: any): string {
    const n = Number(v ?? 0);
    return n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  }

  private fmtDate(v: any): string {
    if (!v) return '';
    const dt = new Date(v);
    if (isNaN(dt.getTime())) return String(v);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }

  private cell(col: AuditColumn, row: any): string {
    const raw = row?.[col.key];
    switch (col.type) {
      case 'number': return this.fmtNum(raw);
      case 'date':   return this.fmtDate(raw);
      default:       return this.escape(raw == null || raw === '' ? '' : raw);
    }
  }

  private alignCls(a?: string): string { return a === 'right' ? 'r' : a === 'center' ? 'c' : ''; }

  private escape(s: any): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  private buildHtml(cfg: AuditPrintConfig): string {
    const companyName = cfg.companyName || localStorage.getItem('companyPrintName') || localStorage.getItem('companyName') || 'Company Name';
    const userName     = (localStorage.getItem('username') || 'ADMIN').toUpperCase();
    const printedAt    = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const meta         = cfg.metaLines || [];
    const labelKey     = cfg.labelColumnKey || cfg.columns[0]?.key;

    const headHtml = cfg.columns.map(c => `<th class="${this.alignCls(c.align)}">${this.escape(c.header)}</th>`).join('');

    const bodyHtml = (cfg.rows || []).map(row =>
      `<tr>${cfg.columns.map(c => `<td class="${this.alignCls(c.align)}">${this.cell(c, row)}</td>`).join('')}</tr>`
    ).join('');

    const emptyRow = cfg.rows?.length ? '' :
      `<tr><td colspan="${cfg.columns.length}" style="text-align:center;padding:14px;color:#888;font-style:italic;">No data.</td></tr>`;

    const totalsHtml = (cfg.totalRows || []).map(t => {
      const cellsHtml = cfg.columns.map(c => {
        if (c.key === labelKey) return `<td>${this.escape(t.label)}</td>`;
        const v = t.values[c.key];
        return `<td class="${this.alignCls(c.align)}">${v === undefined ? '' : (typeof v === 'number' ? this.fmtNum(v) : this.escape(v))}</td>`;
      }).join('');
      return `<tr class="${t.grand ? 'grand-row' : 'sub-row'}">${cellsHtml}</tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${this.escape(cfg.reportTitle)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .hdr { display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 6px; }
  .hdr-left div, .hdr-right div { margin-bottom: 2px; }
  .hdr-right { text-align: right; }
  .co-name { text-align: center; font-size: 15px; font-weight: 700; margin: 10px 0 2px; }
  .rpt-title { text-align: center; font-size: 14px; font-weight: 700; margin: 0 0 2px; }
  .rpt-period { text-align: center; font-size: 11px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; padding: 4px 4px; border-bottom: 1px solid #111; font-size: 10.5px; }
  thead th.r, td.r { text-align: right; }
  thead th.c, td.c { text-align: center; }
  tbody td { padding: 2px 4px; font-size: 10.5px; }
  .sub-row td { border-top: 1px solid #111; font-weight: 700; padding-top: 5px; }
  .grand-row td { border-top: 2px solid #111; border-bottom: 3px double #111; font-weight: 700; padding-top: 5px; }
  .pg { text-align: right; font-size: 10px; color: #444; margin-top: 10px; }
</style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">${meta.map(m => `<div>${this.escape(m)}</div>`).join('')}</div>
    <div class="hdr-right"><div>${printedAt}</div><div>${this.escape(userName)}</div></div>
  </div>
  <div class="co-name">${this.escape(companyName)}</div>
  <div class="rpt-title">${this.escape(cfg.reportTitle)}</div>
  ${cfg.periodLine ? `<div class="rpt-period">${this.escape(cfg.periodLine)}</div>` : ''}
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>
      ${bodyHtml || emptyRow}
      ${totalsHtml}
    </tbody>
  </table>
  <div class="pg">Page 1 of 1</div>
<script>window.onload = () => window.print();<\/script>
</body>
</html>`;
  }
}
