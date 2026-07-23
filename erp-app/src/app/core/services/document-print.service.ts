import { Injectable } from '@angular/core';

export interface PrintField { label: string; value: any; }

export interface PrintColumn {
  header: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  /** text (default) | number (2dp) | qty (trim trailing zeros) | date (dd-MM-yyyy) */
  type?: 'text' | 'number' | 'qty' | 'date';
}

export interface PrintParty { name?: string; lines?: string[]; /** Box heading, defaults to "Bill To :" / "Deliver To :". */ label?: string; }

export interface DocumentPrintConfig {
  docTitle: string;
  docNo: string;
  fields: PrintField[];
  remarks?: string;
  columns: PrintColumn[];
  lines: any[];
  totals?: PrintField[];
  company?: { name?: string; addr1?: string; addr2?: string; phone?: string; email?: string; logo?: string; };
  /** Optional Bill To / Deliver To address blocks. When provided they replace the single "Order To" box. */
  billTo?: PrintParty;
  deliverTo?: PrintParty;
  /** Extra address lines shown under the customer name inside the "Order To" box
   *  (e.g. the Delivery To address captured on the quotation). */
  orderToLines?: string[];
  /** Hide the "Deliver To" box entirely (documents with a single party, e.g. a
   *  Supplier Invoice, only need the supplier block). */
  hideDeliverTo?: boolean;
  /** Prints an acknowledgement block for the customer to sign on the hardcopy.
   *  The signed page is scanned back in and attached to the DO (Confirm Delivery). */
  signature?: {
    /** Caption under the ruled line, e.g. "Received in good order and condition". */
    note?: string;
    /** Pre-printed contact (from the quotation) so the customer knows who should sign. */
    contactName?: string;
    contactNo?: string;
  };
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

  /** Same letterhead details this service prints, for other screens (e.g. the
   *  report exports) that need to render their own layout under one header. */
  getPrintCompany(): { name: string; addr1: string; addr2: string; phone: string; email: string; logo: string } {
    return this.companyFromStore();
  }

  /** Company header sourced from the Company master (cached in localStorage by
   *  MasterService.cacheCompanyLogo), falling back to the built-in defaults. */
  private companyFromStore(): { name: string; addr1: string; addr2: string; phone: string; email: string; logo: string } {
    const ls = (k: string) => (typeof localStorage !== 'undefined' ? (localStorage.getItem(k) || '').trim() : '');
    const name = ls('companyPrintName') || ls('companyName');
    const addr1 = ls('companyPrintAddress1');
    const addr2 = [ls('companyPrintAddress2'), ls('companyPrintCity'), ls('companyPrintState'), ls('companyPrintPostal')]
      .filter(Boolean).join(', ');
    const phone = ls('companyPrintPhone');
    const email = ls('companyPrintEmail');
    const logo  = ls('companyLogoBase64');
    return {
      name:  name  || this.defaultCompany.name,
      addr1: addr1 || this.defaultCompany.addr1,
      addr2: addr2 || this.defaultCompany.addr2,
      phone: phone || this.defaultCompany.phone,
      email: email || this.defaultCompany.email,
      logo:  logo  || this.defaultCompany.logo,
    };
  }

  // ── html ──────────────────────────────────────────────
  private buildHtml(cfg: DocumentPrintConfig): string {
    const stored = this.companyFromStore();
    // Explicit cfg.company wins over the store, which wins over the built-in defaults.
    const co = { ...stored, ...(cfg.company || {}), logo: cfg.company?.logo || stored.logo };

    // Customer goes in left "Order To" box; all other fields go in the right meta table
    const allFields    = cfg.fields || [];
    const customerField = allFields.find(f => f.label === 'Customer');
    const metaFields    = allFields.filter(f => f.label !== 'Customer');

    const headHtml = (cfg.columns || []).map(c =>
      `<th class="${this.alignCls(c.align)}">${this.escape(c.header)}</th>`
    ).join('');

    // Package sub-items (isPackageChild) sit under their package header and are not
    // numbered; only top-level lines advance the S.No counter.
    let seq = 0;
    const bodyHtml = (cfg.lines || []).map((row) =>
      `<tr><td class="c">${row?.isPackageChild ? '' : ++seq}</td>${
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

    const hasBillTo = !!(cfg.billTo && ((cfg.billTo.name && String(cfg.billTo.name).trim()) ||
      (cfg.billTo.lines || []).some(l => l != null && String(l).trim() !== '')));
    const showDeliver = !cfg.hideDeliverTo;
    const billToLabel = cfg.billTo?.label ?? 'Bill To :';
    // billTo box (if any) + Deliver To box (unless hidden) + fixed-width meta column.
    const infoGridCols = [hasBillTo ? '1fr' : '', showDeliver ? '1fr' : '', '230px'].filter(Boolean).join(' ');

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
    /* Fill exactly one A4 content area (297mm − 12mm top − 16mm bottom = 269mm,
       trimmed ~2mm so rounding can't spill a blank second page). The flex column
       lets the lines table grow to a standard height and pins the totals/footer
       to the bottom regardless of how many rows there are. */
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; margin: 0;
      display: flex; flex-direction: column; min-height: 267mm; }

    /* HEADER */
    .doc-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .logo-wrap { display: flex; align-items: center; gap: 10px; }
    .logo-box {
      width: 72px; height: 72px; border: 2px solid #1a5c6e; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 900; color: #1a5c6e; text-align: center; line-height: 1.2;
      overflow: hidden; padding: 4px;
    }
    .logo-box.logo-img { border: none; border-radius: 0; padding: 0; width: auto; min-width: 72px; }
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
    .baddr { font-size: 10.5px; color: #333; line-height: 1.6; margin-top: 2px; white-space: pre-line; }
    table.m-tbl { width: 100%; border-collapse: collapse; }
    .m-lbl { padding: 5px 10px; font-weight: 700; color: #444; font-size: 10.5px; border-bottom: 1px solid #eee; width: 110px; }
    .m-val { padding: 5px 10px; font-weight: 700; color: #111; font-size: 10.5px; border-bottom: 1px solid #eee; }
    table.m-tbl tr:last-child .m-lbl,
    table.m-tbl tr:last-child .m-val { border-bottom: none; }

    /* LINES TABLE */
    /* Wrapper grows to fill the leftover page height; the filler continues the
       table's side borders down so a short table still reads as a full-page box. */
    .lines-wrap { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
    .tbl-filler { flex: 1 1 auto; border-left: 1px solid #ccc; border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; }
    .tbl { flex: 0 0 auto; width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 0; }
    .tbl thead { display: table-header-group; }        /* repeat header when rows overflow to a new page */
    .tbl tbody tr { page-break-inside: avoid; }         /* don't split a row across pages */
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
    .sig-row { margin-top: 34px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
    .sig-line { border-bottom: 1px solid #333; height: 46px; }
    .sig-lbl { margin-top: 4px; font-size: 10.5px; font-weight: 700; color: #333; }
    .sig-meta { font-size: 10px; color: #555; }
    .sig-note { font-size: 9.5px; color: #777; margin-top: 2px; }
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
      <div class="logo-box${co.logo && co.logo.startsWith('data:image') ? ' logo-img' : ''}">${co.logo && co.logo.startsWith('data:image') ? `<img src="${co.logo}" alt="logo"/>` : this.escape(co.logo)}</div>
      <div>
        <div class="co-brand">${this.escape(co.name)}</div>
        <div class="co-brand-sub">${this.escape(co.addr1)}<br/>${this.escape(co.addr2)}<br/>Tel : ${this.escape(co.phone)}<br/>Email : ${this.escape(co.email)}</div>
      </div>
    </div>
  </div>

  <!-- TITLE -->
  <div class="doc-title">${this.escape(cfg.docTitle)}</div>

  <!-- INFO ROW -->
  <div class="info-row" style="grid-template-columns:${infoGridCols};">
    ${hasBillTo ? `<div class="bill-box">
      <div class="bl">${this.escape(billToLabel)}</div>
      <div class="bn">${this.escape(cfg.billTo?.name ?? '—')}</div>
      ${(cfg.billTo?.lines || []).filter(l => l != null && String(l).trim() !== '')
        .map(l => `<div class="baddr">${this.escape(l)}</div>`).join('')}
    </div>` : ''}
    ${showDeliver ? `<div class="bill-box">
      <div class="bl">Deliver To :</div>
      <div class="bn">${this.escape(customerField?.value ?? '—')}</div>
      ${(cfg.orderToLines || []).filter(l => l != null && String(l).trim() !== '')
        .map(l => `<div class="baddr">${this.escape(l)}</div>`).join('')}
    </div>` : ''}
    <div>
      <table class="m-tbl">${metaRowsHtml}</table>
    </div>
  </div>

  <!-- LINES TABLE -->
  <div class="lines-wrap">
    <table class="tbl">
      <thead><tr><th class="c">S.No</th>${headHtml}</tr></thead>
      <tbody>${bodyHtml || emptyRow}</tbody>
    </table>
    <div class="tbl-filler"></div>
  </div>

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

  ${cfg.signature ? `
  <!-- Acknowledgement: the customer signs this on the hardcopy, which is scanned back in. -->
  <div class="sig-row">
    <div class="sig-cell">
      <div class="sig-line"></div>
      <div class="sig-lbl">Received By (Customer)</div>
      ${cfg.signature.contactName ? `<div class="sig-meta">${this.escape(cfg.signature.contactName)}${cfg.signature.contactNo ? ' · ' + this.escape(cfg.signature.contactNo) : ''}</div>` : ''}
      ${cfg.signature.note ? `<div class="sig-note">${this.escape(cfg.signature.note)}</div>` : ''}
    </div>
    <div class="sig-cell">
      <div class="sig-line"></div>
      <div class="sig-lbl">Name &amp; Date</div>
    </div>
  </div>` : ''}

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

    /**
   * Render the same layout used by print() to a PDF Blob, so a document can be
   * emailed with an attachment identical to what the user sees in Print preview.
   * Renders the markup off-screen, rasterises it with html2canvas and paginates
   * the image across A4 pages with jsPDF.
   */
  async generatePdfBlob(cfg: DocumentPrintConfig): Promise<Blob> {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    // Reuse the exact print document as the single source of truth, but strip its
    // auto-print <script> so rendering it off-screen doesn't pop a print dialog.
    const html = this.buildHtml(cfg).replace(/<script[\s\S]*?<\/script>/gi, '');

    // Render inside an isolated, off-screen iframe (A4 portrait ≈ 794px @96dpi) so
    // the document's global styles can't leak onto the live app during capture.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;background:#ffffff;';
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentDocument || iframe.contentWindow!.document;
      doc.open();
      doc.write(html);
      doc.close();

      // Let the iframe lay out and any images (company logo) finish loading.
      await new Promise<void>(resolve => {
        const pending = Array.from(doc.images || []).filter(i => !i.complete);
        if (!pending.length) { setTimeout(resolve, 50); return; }
        let left = pending.length;
        const done = () => { if (--left <= 0) resolve(); };
        pending.forEach(img => { img.onload = done; img.onerror = done; });
        setTimeout(resolve, 1500); // safety net so a stuck image can't hang the send
      });

      // Capture only the real content height so trailing whitespace can't spill
      // onto an extra blank page.
      const contentH = Math.ceil(doc.body.scrollHeight);
      iframe.style.height = contentH + 'px';

      const canvas = await html2canvas(doc.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 794,
        windowWidth: 794,
        height: contentH,
        windowHeight: contentH,
      });

      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();   // 210mm
      const pageH = pdf.internal.pageSize.getHeight();  // 297mm

      // Mirror the print's @page margin (12mm) so the emailed PDF is framed like
      // Print instead of running edge-to-edge (which reads oversized).
      const margin = 12;
      const imgW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      const pxPerMm = canvas.width / imgW;
      const pageSlicePx = Math.max(1, Math.floor(usableH * pxPerMm));

      // Slice the tall capture into page-height chunks — one addImage per page,
      // stopping exactly at the content bottom (no blank trailing page).
      let rendered = 0;
      let first = true;
      while (rendered < canvas.height) {
        const slicePx = Math.min(pageSlicePx, canvas.height - rendered);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = slicePx;
        const ctx = pageCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, rendered, canvas.width, slicePx, 0, 0, canvas.width, slicePx);

        if (!first) pdf.addPage();
        // JPEG, not PNG: a full-page lossless bitmap is ~10 MB per page, so a three-document
        // email came to 37 MB and the mail server bounced it (35 MB limit). At this quality a
        // text document stays crisp but the page drops to a few hundred KB.
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', margin, margin, imgW, slicePx / pxPerMm);
        rendered += slicePx;
        first = false;
      }
      return pdf.output('blob');
    } finally {
      document.body.removeChild(iframe);
    }
  }
}
