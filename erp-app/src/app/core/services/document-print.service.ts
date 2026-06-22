import { Injectable } from '@angular/core';

export interface PrintField { label: string; value: any; }

export interface PrintColumn {
  header: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  /** text (default) | number (2dp) | qty (trim trailing zeros) | date (dd-MM-yyyy) */
  type?: 'text' | 'number' | 'qty' | 'date';
}

export interface DocumentPrintConfig {
  /** Big document heading e.g. "QUOTATION" */
  docTitle: string;
  /** Document number shown in the title bar / meta */
  docNo: string;
  /** Header meta rows (Customer, Currency, Dates, …) */
  fields: PrintField[];
  /** Optional free-text remarks block */
  remarks?: string;
  /** Line table columns */
  columns: PrintColumn[];
  /** Line table rows */
  lines: any[];
  /** Optional totals rows (Subtotal, Tax, Grand Total, …) */
  totals?: PrintField[];
  /** Override company header (otherwise defaults below are used) */
  company?: { name?: string; addr1?: string; addr2?: string; phone?: string; email?: string; logo?: string; };
}

/**
 * Generic, document-agnostic print helper. Builds a self-contained HTML
 * document and opens it in a new window that auto-triggers the print dialog.
 * Shared by every Sales / Recipe list page so the look is identical.
 */
// ── Classic (formal document) layout ───────────────────
export interface ClassicParty { name?: string; lines?: string[]; tel?: string; fax?: string; attn?: string; acceptance?: string[]; }
export interface ClassicMetaRow { label: string; value: string; }
export interface ClassicTotalRow { label: string; value: string; bold?: boolean; }
export interface ClassicCompany { name?: string; addrLines?: string[]; tel?: string; fax?: string; gst?: string; logoText?: string; }
export interface ClassicPrintConfig {
  docTitle: string;                 // e.g. "QUOTATION"
  company?: ClassicCompany;
  orderTo?: ClassicParty;           // left box (customer)
  deliverTo?: ClassicParty;         // middle box (delivery)
  meta?: ClassicMetaRow[];          // right box rows (No, Date, Terms, …)
  columns: PrintColumn[];           // line columns (S.No auto-prepended)
  lines: any[];
  totals: ClassicTotalRow[];        // Sub Total / Discount / Add GST / Total
  remarks?: string;
  signatory?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentPrintService {
  private readonly brand = '#2E5F73';
  private readonly dark = '#0f172a';
  private readonly text = '#111827';
  private readonly muted = '#6b7280';
  private readonly line = '#d1d5db';

  private readonly defaultCompany = {
    name: 'FBH UnityWorks ERP',
    addr1: 'No: 3/8, Church Street',
    addr2: 'Nungambakkam, Chennai - 600034',
    phone: '+91 98765 43210',
    email: 'info@unityworks.com',
    logo: 'UW',
  };

  print(cfg: DocumentPrintConfig): void {
    const html = this.buildHtml(cfg);
    const w = window.open('', 'DOC_PRINT_' + new Date().getTime(), 'width=1200,height=780');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ── formatting ────────────────────────────────────────
  private fmtDate(d: any): string {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${dt.getFullYear()}`;
  }
  private fmtNum(v: any): string { return (Number(v ?? 0)).toFixed(2); }
  private fmtQty(v: any): string { return (Number(v ?? 0)).toFixed(3).replace(/\.?0+$/, ''); }

  private cell(col: PrintColumn, row: any): string {
    const raw = row?.[col.key];
    switch (col.type) {
      case 'number': return this.fmtNum(raw);
      case 'qty': return this.fmtQty(raw);
      case 'date': return this.fmtDate(raw);
      default: return this.escape(raw == null || raw === '' ? '-' : raw);
    }
  }

  private alignCls(a?: string): string { return a === 'right' ? 'r' : a === 'center' ? 'c' : ''; }

  private escape(s: any): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // ── html ──────────────────────────────────────────────
  private buildHtml(cfg: DocumentPrintConfig): string {
    const co = { ...this.defaultCompany, ...(cfg.company || {}) };
    const { brand, dark, text, muted, line } = this;

    const metaHtml = (cfg.fields || []).map(f =>
      `<div class="row"><div class="k">${this.escape(f.label)}</div><div class="v">${this.escape(f.value == null || f.value === '' ? '-' : f.value)}</div></div>`
    ).join('');

    const headHtml = (cfg.columns || []).map(c =>
      `<th class="${this.alignCls(c.align)}">${this.escape(c.header)}</th>`
    ).join('');

    const bodyHtml = (cfg.lines || []).map((row, i) => {
      const cells = (cfg.columns || []).map(c => {
        const cls = this.alignCls(c.align);
        return `<td class="${cls}">${this.cell(c, row)}</td>`;
      }).join('');
      return `<tr><td class="c">${i + 1}</td>${cells}</tr>`;
    }).join('');

    const emptyRow = `<tr><td class="c" colspan="${(cfg.columns?.length || 0) + 1}">No lines</td></tr>`;

    const totalsHtml = (cfg.totals || []).map(t =>
      `<tr><td>${this.escape(t.label)}</td><td class="r b">${this.escape(t.value)}</td></tr>`
    ).join('');

    const remarksHtml = cfg.remarks
      ? `<div class="note"><div class="t">Remarks</div><div>${this.escape(cfg.remarks)}</div></div>`
      : '';

    return `
    <html>
    <head>
      <title>${this.escape(cfg.docTitle)} - ${this.escape(cfg.docNo)}</title>
      <style>
        @page { margin: 8mm 10mm 14mm 10mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: ${text}; background: #fff; }
        .hdr { display: flex; gap: 16px; padding-bottom: 14px; margin-bottom: 14px; border-bottom: 2px solid ${brand}; }
        .logo { width: 48px; height: 48px; border-radius: 14px; background: ${brand}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; }
        .cname { font-size: 20px; font-weight: 900; }
        .doc { font-size: 14px; font-weight: 900; color: ${dark}; letter-spacing: 1px; margin-top: 2px; }
        .cmeta { font-size: 12px; color: ${muted}; margin-top: 4px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; padding: 14px; border: 1px solid ${line}; border-radius: 12px; margin-bottom: 12px; }
        .row { display: grid; grid-template-columns: 150px 1fr; gap: 10px; }
        .k { color: ${muted}; font-weight: 700; }
        .v { font-weight: 800; }
        .note { border: 1px solid ${line}; border-radius: 12px; padding: 10px 12px; margin-bottom: 14px; }
        .note .t { font-weight: 900; color: ${dark}; margin-bottom: 4px; }
        .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
        .tbl th, .tbl td { border: 1px solid ${line}; padding: 9px 10px; }
        .tbl thead th { background: ${brand}; color: #fff; font-weight: 900; text-transform: uppercase; }
        .c { text-align: center; } .r { text-align: right; } .b { font-weight: 900; }
        .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
        .totTbl { width: 300px; border-collapse: collapse; }
        .totTbl td { border: 1px solid ${line}; padding: 10px 12px; }
        .footer { position: fixed; left: 10mm; right: 10mm; bottom: 6mm; font-size: 11px; color: ${muted}; display: flex; justify-content: space-between; }
      </style>
    </head>
    <body>
      <div class="hdr">
        <div class="logo">${this.escape(co.logo)}</div>
        <div>
          <div class="cname">${this.escape(co.name)}</div>
          <div class="doc">${this.escape(cfg.docTitle)}</div>
          <div class="cmeta">${this.escape(co.addr1)}<br/>${this.escape(co.addr2)}<br/>${this.escape(co.phone)} · ${this.escape(co.email)}</div>
        </div>
      </div>

      <div class="meta">${metaHtml}</div>
      ${remarksHtml}

      <table class="tbl">
        <thead><tr><th class="c">S.NO</th>${headHtml}</tr></thead>
        <tbody>${bodyHtml || emptyRow}</tbody>
      </table>

      ${totalsHtml ? `<div class="totals"><table class="totTbl">${totalsHtml}</table></div>` : ''}

      <div class="footer">
        <div>Generated by ERP · ${this.fmtDate(new Date())}</div>
        <div>Page 1</div>
      </div>

      <script>window.onload = () => window.print();</script>
    </body>
    </html>`;
  }
}
