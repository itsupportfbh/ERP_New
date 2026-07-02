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
  docTitle: string;
  docNo: string;
  fields: PrintField[];
  remarks?: string;
  columns: PrintColumn[];
  lines: any[];
  totals?: PrintField[];
  company?: { name?: string; addr1?: string; addr2?: string; phone?: string; email?: string; logo?: string; };
}

export interface ClassicParty { name?: string; lines?: string[]; tel?: string; fax?: string; attn?: string; acceptance?: string[]; }
export interface ClassicMetaRow { label: string; value: string; }
export interface ClassicTotalRow { label: string; value: string; bold?: boolean; }
export interface ClassicCompany { name?: string; addrLines?: string[]; tel?: string; fax?: string; gst?: string; logoText?: string; }
export interface ClassicPrintConfig {
  docTitle: string;
  company?: ClassicCompany;
  orderTo?: ClassicParty;
  deliverTo?: ClassicParty;
  meta?: ClassicMetaRow[];
  columns: PrintColumn[];
  lines: any[];
  totals: ClassicTotalRow[];
  remarks?: string;
  signatory?: string;
}

@Injectable({ providedIn: 'root' })
export class DocumentPrintService {
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
      case 'qty':    return this.fmtQty(raw);
      case 'date':   return this.fmtDate(raw);
      default:       return this.escape(raw == null || raw === '' ? '-' : raw);
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
    const storedLogo = typeof localStorage !== 'undefined' ? (localStorage.getItem('companyLogoBase64') || '') : '';
    const co = { ...this.defaultCompany, ...(cfg.company || {}), logo: cfg.company?.logo || storedLogo || this.defaultCompany.logo };

    // Customer goes in left "Order To" box; all other fields go in the right meta table
    const allFields    = cfg.fields || [];
    const customerField = allFields.find(f => f.label === 'Customer');
    const metaFields    = allFields.filter(f => f.label !== 'Customer');

    const headHtml = (cfg.columns || []).map(c =>
      `<th class="${this.alignCls(c.align)}">${this.escape(c.header)}</th>`
    ).join('');

    const bodyHtml = (cfg.lines || []).map((row, i) =>
      `<tr><td class="c">${i + 1}</td>${
        (cfg.columns || []).map(c =>
          `<td class="${this.alignCls(c.align)}">${this.cell(c, row)}</td>`
        ).join('')
      }</tr>`
    ).join('');

    const emptyRow = `<tr><td colspan="${(cfg.columns?.length || 0) + 1}" style="text-align:center;padding:18px;color:#888;font-style:italic;">No lines added.</td></tr>`;

    const totals = cfg.totals || [];
    const totalsHtml = totals.map((t, idx) => {
      const isLast = idx === totals.length - 1;
      return isLast
        ? `<tr class="gt-row"><td class="tot-lbl">${this.escape(t.label)}</td><td class="tot-val">${this.escape(t.value)}</td></tr>`
        : `<tr><td class="tot-lbl">${this.escape(t.label)}</td><td class="tot-val">${this.escape(t.value)}</td></tr>`;
    }).join('');

    const metaRowsHtml = metaFields.map(f =>
      `<tr>
        <td class="m-lbl">${this.escape(f.label)}</td>
        <td class="m-val">${this.escape(f.value == null || f.value === '' ? '—' : f.value)}</td>
      </tr>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${this.escape(cfg.docTitle)} – ${this.escape(cfg.docNo)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 12mm 16mm 12mm; }
    *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; margin: 0; }

    /* HEADER */
    .doc-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .logo-wrap { display: flex; align-items: center; gap: 10px; }
    .logo-box {
      width: 72px; height: 72px; border: 2px solid #1a5c6e; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 900; color: #1a5c6e; text-align: center; line-height: 1.2;
      overflow: hidden; padding: 4px;
    }
    .logo-box img { width: 100%; height: 100%; object-fit: contain; }
    .co-brand { font-size: 13px; font-weight: 900; color: #1a5c6e; text-transform: uppercase; }
    .co-brand-sub { font-size: 9.5px; color: #555; margin-top: 2px; line-height: 1.5; }
    .co-info-right { text-align: right; font-size: 10.5px; line-height: 1.8; color: #222; }
    .co-info-right .cn { font-size: 13px; font-weight: 900; color: #111; }

    /* TITLE */
    .doc-title {
      text-align: center; font-size: 16px; font-weight: 900; letter-spacing: 3px;
      text-transform: uppercase; padding: 7px 0;
      border-top: 2px solid #111; border-bottom: 2px solid #111; margin: 0 0 8px;
    }

    /* INFO BOXES */
    .info-row { display: grid; grid-template-columns: 1fr 230px; border: 1px solid #aaa; margin-bottom: 8px; }
    .bill-box { padding: 8px 10px; border-right: 1px solid #aaa; }
    .bl { font-size: 10px; font-weight: 900; text-transform: uppercase; color: #555; margin-bottom: 4px; }
    .bn { font-size: 12px; font-weight: 900; color: #111; }
    table.m-tbl { width: 100%; border-collapse: collapse; }
    .m-lbl { padding: 5px 10px; font-weight: 700; color: #444; font-size: 10.5px; border-bottom: 1px solid #eee; width: 110px; }
    .m-val { padding: 5px 10px; font-weight: 700; color: #111; font-size: 10.5px; border-bottom: 1px solid #eee; }
    table.m-tbl tr:last-child .m-lbl,
    table.m-tbl tr:last-child .m-val { border-bottom: none; }

    /* LINES TABLE */
    .tbl { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 0; }
    .tbl thead tr { background: #1a5c6e; }
    .tbl thead th {
      padding: 7px 8px; color: #fff; font-weight: 700;
      font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
      border: 1px solid #1a5c6e; text-align: left;
    }
    .tbl tbody td { padding: 6px 8px; border: 1px solid #ccc; color: #111; vertical-align: middle; }
    .tbl tbody tr:nth-child(even) td { background: #f8f8f8; }
    .c { text-align: center; } .r { text-align: right; }

    /* BOTTOM */
    .bottom-row { display: grid; grid-template-columns: 1fr 230px; border: 1px solid #ccc; border-top: none; }
    .rem-cell { padding: 10px; border-right: 1px solid #ccc; }
    .rem-lbl { font-weight: 900; font-size: 10px; text-transform: uppercase; color: #555; margin-bottom: 5px; }
    .rem-txt { font-size: 11px; color: #222; line-height: 1.6; }
    table.tot-tbl { width: 100%; border-collapse: collapse; }
    .tot-tbl td { padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 11px; }
    .tot-tbl tr:last-child td { border-bottom: none; }
    .tot-lbl { color: #444; font-weight: 600; }
    .tot-val { text-align: right; font-weight: 700; color: #111; }
    .gt-row td { background: #1a5c6e; color: #fff; font-weight: 900; font-size: 12px; border-color: #1a5c6e; }

    /* FOOTER */
    .doc-ftr { margin-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10.5px; color: #333; }
    .behalf { line-height: 1.8; }
    .behalf strong { font-size: 11px; }
    .gen { font-size: 9.5px; color: #999; margin-top: 3px; }
    .pg { font-size: 10px; color: #888; text-align: right; }
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="doc-hdr">
    <div class="logo-wrap">
      <div class="logo-box">${co.logo && co.logo.startsWith('data:image') ? `<img src="${co.logo}" alt="logo"/>` : this.escape(co.logo)}</div>
      <div>
        <div class="co-brand">${this.escape(co.name)}</div>
        <div class="co-brand-sub">${this.escape(co.addr1)}<br/>${this.escape(co.addr2)}</div>
      </div>
    </div>
    <div class="co-info-right">
      <div class="cn">${this.escape(co.name)}</div>
      <div>${this.escape(co.addr1)}</div>
      <div>${this.escape(co.addr2)}</div>
      <div>Tel : ${this.escape(co.phone)}</div>
      <div>Email : ${this.escape(co.email)}</div>
    </div>
  </div>

  <!-- TITLE -->
  <div class="doc-title">${this.escape(cfg.docTitle)}</div>

  <!-- INFO ROW -->
  <div class="info-row">
    <div class="bill-box">
      <div class="bl">Order To :</div>
      <div class="bn">${this.escape(customerField?.value ?? '—')}</div>
    </div>
    <div>
      <table class="m-tbl">${metaRowsHtml}</table>
    </div>
  </div>

  <!-- LINES TABLE -->
  <table class="tbl">
    <thead><tr><th class="c">S.No</th>${headHtml}</tr></thead>
    <tbody>${bodyHtml || emptyRow}</tbody>
  </table>

  <!-- BOTTOM: remarks + totals -->
  <div class="bottom-row">
    <div class="rem-cell">
      <div class="rem-lbl">Remarks :</div>
      <div class="rem-txt">${cfg.remarks ? this.escape(cfg.remarks) : ''}</div>
    </div>
    <div>
      <table class="tot-tbl">${totalsHtml}</table>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="doc-ftr">
    <div class="behalf">
      <div>For &amp; Behalf of</div>
      <strong>${this.escape(co.name)}</strong>
      <div class="gen">Generated by Unity ERP &nbsp;·&nbsp; ${this.fmtDate(new Date())}</div>
    </div>
    <div class="pg">Page 1 of 1</div>
  </div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;
  }
}
