import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { DocumentNumberService } from '../../../core/services/document-number.service';
import { ReceivingIntegrationService, OcrReceivingMatchLine } from '../../../core/services/receiving-integration.service';
import { TaxDecisionService } from '../../../core/services/tax-decision.service';
import { PermissionService } from '../../../core/services/permission.service';
import { PurchaseService } from '../purchase.service';

@Component({
  selector: 'erp-supplier-invoice-list',
  standalone: false,
  templateUrl: './supplier-invoice-list.component.html',
  styleUrls: ['./supplier-invoice-list.component.scss']
})
export class SupplierInvoiceListComponent implements OnInit {
  readonly fnId = 'pin-list';
  loading = false;
  rows: any[] = [];
  temp: any[] = [];
  search = '';
  companyId = Number(localStorage.getItem('companyId') || 0);

  pageSize = 10;
  currentPage = 1;
  get totalPages(): number { return Math.ceil(this.rows.length / this.pageSize) || 1; }
  get pageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = Math.max(1, this.currentPage - 2); i <= Math.min(this.totalPages, this.currentPage + 2); i++) pages.push(i);
    return pages;
  }
  get pagedRows(): any[] {
    const s = (this.currentPage - 1) * this.pageSize;
    return this.rows.slice(s, s + this.pageSize);
  }
  onPageChange(p: number): void { if (p >= 1 && p <= this.totalPages) this.currentPage = p; }

  get totalPending(): number { return this.temp.filter(r => !this.isPosted(r)).length; }
  get autoMatched(): number { return this.temp.filter(r => r.matchStatus === 'OK' || String(r.listStatusLabel || '').toLowerCase().includes('match')).length; }
  get mismatchCount(): number { return this.temp.filter(r => r.matchStatus === 'Mismatch' || String(r.listStatusLabel || '').toLowerCase().includes('mismatch')).length; }
  get awaitingApproval(): number { return this.temp.filter(r => !this.isPosted(r) && r.numStatus < 2).length; }

  showLinesModal = false;
  modalLines: any[] = [];
  modalInvoiceNo = '';
  modalSupplier = '';
  modalStatus = '';
  modalTotal: number | null = null;
  modalTotalQty = 0;
  modalTotalAmt = 0;
  // Invoice amounts are held in the supplier's currency (e.g. SGD). Without this the modal
  // fell back to the base symbol and rendered SGD figures as "RM 200.00".
  modalCurrency: number | string = '';
  modalFxRate = 1;
  baseCurrencyName = (localStorage.getItem('companyCurrencyName') || '').trim();

  get modalIsForeign(): boolean {
    const cur = String(this.modalCurrencyName || '').trim().toLowerCase();
    return !!cur && !!this.baseCurrencyName && cur !== this.baseCurrencyName.toLowerCase();
  }
  get modalBaseAmt(): number { return +(this.modalTotalAmt * (this.modalFxRate || 1)).toFixed(2); }
  private modalCurrencyName = '';

  showMatchModal = false;
  matchCurrency: number | string = '';
  threeWay: any = null;
  matchLoading = false;
  matchError = '';
  postError = '';
  currentRow: any = null;
  isPosting = false;

  showActionConfirm = false;
  actionRow: any = null;
  actionType = '';
  actionLoading = false;
  actionError = '';

  showOcrModal = false;
  ocrLoading = false;
  ocrResult: any = null;
  ocrError = '';
  ocrDragOver = false;
  ocrGrnOptions: any[] = [];
  ocrGrnSearch = '';
  ocrSelectedGrns: any[] = [];
  ocrGrnDropOpen = false;
  ocrReceivingMatches: OcrReceivingMatchLine[] = [];

  get ocrMatchOkCount(): number { return this.ocrReceivingMatches.filter(x => x.status === 'OK').length; }
  get ocrMatchMismatchCount(): number { return this.ocrReceivingMatches.filter(x => x.status === 'Mismatch').length; }
  get hasReceivingIntegration(): boolean { return this.ocrReceivingMatches.length > 0; }

  constructor(
    private svc: PurchaseService,
    private router: Router,
    public perm: PermissionService,
    private docNoSvc: DocumentNumberService,
    private receivingSvc: ReceivingIntegrationService,
    private taxDecisionSvc: TaxDecisionService
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getSupplierInvoices().subscribe({
      next: res => {
        this.temp = this.svc.unwrap(res).map((r: any) => this.mapRow(r));
        this.rows = [...this.temp];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private mapRow(r: any): any {
    const numStatus = Number(r.approvalStatus ?? r.statusId ?? r.status ?? 0);
    const rawListLabel = String(r.listStatusLabel ?? r.ListStatusLabel ?? '');
    const isPosted = r.isPostedToAp || r.postedToAp || r.apPosted || r.glPosted || r.isGlPosted ||
      r.status === 'Posted' || numStatus >= 4 || rawListLabel.toLowerCase().includes('posted');
    return {
      ...r,
      id: r.id ?? r.iD,
      invoiceNo: r.invoiceNo ?? r.pinNo ?? '',
      supplierInvoiceNo: r.supplierInvoiceNo ?? r.vendorInvoiceNo ?? r.grnInvoiceNos ?? r.invoiceNos ?? '',
      supplierName: r.supplierName ?? '',
      grnNos: r.grnNos ?? r.grnNo ?? '',
      invoiceDate: r.invoiceDate,
      currency: r.currency ?? r.currencyName ?? '',
      currencyId: r.currencyId ?? 0,
      fxRate: Number(r.fxRate ?? r.FxRate ?? 1) || 1,
      amount: Number(r.amount ?? r.netTotal ?? r.totalAmount ?? 0),
      baseAmount: (() => {
        const stored = Number(r.baseAmount ?? 0);
        if (stored > 0) return stored;
        const amt = Number(r.amount ?? r.netTotal ?? r.totalAmount ?? 0);
        const fx = Number(r.fxRate ?? r.FxRate ?? 1) || 1;
        return +(amt * fx).toFixed(2);
      })(),
      isOverseas: !!(r.isOverseas || r.IsOverseas),
      numStatus,
      isPostedFlag: isPosted,
      statusLabel: isPosted ? 'Posted to A/P' : this.numToLabel(numStatus),
      typeLabel: this.toTypeLabel(r),
      matchStatus: r.matchStatus ?? '',
      linkedWithInvoiceNo: r.linkedWithInvoiceNo ?? r.LinkedWithInvoiceNo ?? null
    };
  }

  private numToLabel(n: number): string {
    return ({ 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected', 4: 'Posted' } as any)[n] ?? 'Draft';
  }

  private toTypeLabel(r: any): string {
    const pinCount = Number(r.pinCount ?? r.PinCount ?? 1);
    const grnCount = Number(r.grnCount ?? r.GrnCount ?? 1);
    if (pinCount > 1) return 'Multi Invoice';
    if (grnCount > 1) return 'Multi GRN';
    return 'Single Invoice';
  }

  isPosted(row: any): boolean {
    if (!row) return false;
    return !!row.isPostedFlag ||
      !!(row.glPosted || row.GlPosted || row.isGlPosted) ||
      (row.statusLabel ?? '').toLowerCase().includes('posted') ||
      row.status === 'Posted' ||
      Number(row.numStatus) >= 4;
  }

  applyFilter(): void {
    this.currentPage = 1;
    const q = this.search.toLowerCase();
    this.rows = q
      ? this.temp.filter(r =>
          (r.invoiceNo ?? '').toLowerCase().includes(q) ||
          (r.supplierInvoiceNo ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q) ||
          (r.grnNos ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.temp];
  }

  create(): void { this.router.navigate(['/app/purchase/supplier-invoice/new']); }
  edit(row: any): void { this.router.navigate(['/app/purchase/supplier-invoice', row.id]); }

  print(row: any): void {
    if (!this.perm.canPrint(this.fnId)) return;
    this.svc.getSupplierInvoiceById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        let lines: any[] = [];
        const rawLines = d.linesJson ?? d.LinesJson ?? d.lines ?? '[]';
        try { lines = Array.isArray(rawLines) ? rawLines : JSON.parse(rawLines || '[]'); } catch { lines = []; }
        this.openPrintWindow(this.buildInvoicePrintHtml(d, lines, row));
      },
      error: () => {
        this.openPrintWindow(this.buildInvoicePrintHtml(row, [], row));
      }
    });
  }

  private openPrintWindow(html: string): void {
    const w = window.open('', '_blank', 'width=1050,height=800');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 700);
  }

  private buildInvoicePrintHtml(d: any, lines: any[], row?: any): string {
    const fmt = (dt: any) => {
      if (!dt) return '—';
      try { const x = new Date(dt); return `${String(x.getDate()).padStart(2,'0')}-${String(x.getMonth()+1).padStart(2,'0')}-${x.getFullYear()}`; }
      catch { return '—'; }
    };
    const esc = (s: any) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const n2 = (v: any) => Number(v || 0).toFixed(2);

    const invNo     = esc(d.invoiceNo ?? row?.invoiceNo ?? '');
    const supInvNo  = esc(d.supplierInvoiceNo ?? row?.supplierInvoiceNo ?? '');
    const supplier  = esc(d.supplierName ?? row?.supplierName ?? '—');
    const invDate   = fmt(d.invoiceDate ?? row?.invoiceDate);
    const currency  = esc(d.currencyName ?? d.currency ?? row?.currency ?? '');
    const grnNos    = esc(d.grnNos ?? row?.grnNos ?? '');
    const taxRate   = Number(d.taxRate ?? d.taxPct ?? 0);
    const totalTax  = Number(d.tax ?? d.totalTax ?? 0);
    const amount    = Number(d.amount ?? d.netTotal ?? row?.amount ?? 0);
    const printDate = new Date().toLocaleDateString('en-GB');
    const companyLogo = localStorage.getItem('companyLogoBase64')  || '';
    const coName      = localStorage.getItem('companyPrintName')    || localStorage.getItem('companyName') || '';
    const coAddress1  = localStorage.getItem('companyPrintAddress1') || '';
    const coAddress2  = localStorage.getItem('companyPrintAddress2') || '';
    const coCity      = localStorage.getItem('companyPrintCity')     || '';
    const coState     = localStorage.getItem('companyPrintState')    || '';
    const coPostal    = localStorage.getItem('companyPrintPostal')   || '';
    const coPhone     = localStorage.getItem('companyPrintPhone')    || '';
    const coEmail     = localStorage.getItem('companyPrintEmail')    || '';
    const coAddrLine  = [coAddress1, coAddress2].filter(Boolean).join(', ');
    const coCityLine  = [coCity, coState, coPostal].filter(Boolean).join(', ');

    let lineNo = 0;
    let subTotal = 0;
    const lineRows = lines.map((l: any) => {
      lineNo++;
      const item   = esc(l.itemName ?? l.item ?? l.itemSearch ?? l.itemCode ?? '—');
      const qty    = Number(l.qty ?? l.quantity ?? 0);
      const price  = Number(l.unitPrice ?? l.price ?? 0);
      const disc   = Number(l.discountPct ?? 0);
      const taxMode = esc(l.taxMode ?? '');
      const taxAmt = Number(l.taxAmt ?? 0);
      const base   = qty * price * (1 - disc / 100);
      subTotal += base;
      const total  = Number(l.lineGrandTotal ?? l.lineTotal ?? (base + taxAmt));
      const bg     = lineNo % 2 === 0 ? '#f8fafc' : '#ffffff';
      return `<tr style="background:${bg};">
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;">${lineNo}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${item}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${qty}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${n2(price)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${disc ? disc + '%' : '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-size:11px;">${taxMode || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${n2(taxAmt)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${n2(total)}</td>
      </tr>`;
    }).join('');

    const thStyle = `padding:9px 10px;color:#fff;font-size:11px;font-weight:600;border-right:1px solid rgba(255,255,255,0.2);`;
    const totRow  = (lbl: string, val: string, bold = false) =>
      `<tr><td style="padding:6px 12px;color:#6b7280;font-size:12px;border-bottom:1px solid #f1f5f9;">${lbl}</td>
           <td style="padding:6px 12px;text-align:right;font-size:12px;font-weight:${bold?'700':'600'};border-bottom:1px solid #f1f5f9;">${val}</td></tr>`;

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice - ${invNo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1f2937;background:#fff;padding:24px 28px;}
@page{size:A4;margin:12mm 14mm;}
@media print{
  body{padding:0;}
  -webkit-print-color-adjust:exact !important;
  print-color-adjust:exact !important;
  color-adjust:exact !important;
}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;border-bottom:3px solid #0e4a60;margin-bottom:18px;}
.co-name{font-size:20px;font-weight:800;color:#0e4a60;letter-spacing:.5px;}
.co-sub{font-size:11px;color:#6b7280;margin-top:3px;}
.doc-title{text-align:right;}
.doc-title h1{font-size:24px;font-weight:800;color:#0e4a60;letter-spacing:2px;}
.doc-title .doc-no{font-size:13px;color:#374151;margin-top:4px;}
.doc-title .doc-no span{font-weight:700;color:#0e4a60;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:18px;}
.info-cell{padding:10px 14px;border-bottom:1px solid #e5e7eb;}
.info-cell:nth-child(odd){background:#f8fafc;border-right:1px solid #e5e7eb;}
.info-key{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
.info-val{font-size:13px;font-weight:700;color:#111827;}
table.lines{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;}
table.lines thead tr{background:#0e4a60 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
table.lines thead th{${thStyle}}
table.lines thead th:last-child{border-right:none;}
.tot-wrap{display:flex;justify-content:flex-end;margin-top:14px;}
.tot-table{width:280px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;}
.grand-row td{background:#0e4a60 !important;color:#fff !important;font-weight:700;font-size:14px;padding:8px 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.sig-row{display:flex;justify-content:space-between;margin-top:50px;gap:16px;}
.sig-box{flex:1;text-align:center;border-top:1.5px solid #374151;padding-top:6px;font-size:11px;color:#6b7280;}
.footer{margin-top:24px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #f1f5f9;padding-top:8px;}
</style></head><body>

<div class="hdr">
  <div style="display:flex;align-items:flex-start;gap:12px;">
    ${companyLogo ? `<img src="${companyLogo}" style="height:64px;width:auto;object-fit:contain;border-radius:6px;flex-shrink:0;" alt="logo"/>` : ''}
    <div>
      <div class="co-name">${coName || 'Supplier Invoice'}</div>
      ${coAddrLine ? `<div class="co-sub">${esc(coAddrLine)}</div>` : ''}
      ${coCityLine ? `<div class="co-sub">${esc(coCityLine)}</div>` : ''}
      ${coPhone    ? `<div class="co-sub">Tel: ${esc(coPhone)}${coEmail ? '  |  Email: ' + esc(coEmail) : ''}</div>` : (coEmail ? `<div class="co-sub">Email: ${esc(coEmail)}</div>` : '')}
    </div>
  </div>
  <div class="doc-title">
    <h1>SUPPLIER INVOICE</h1>
    <div class="doc-no">Inv No: <span>${invNo}</span></div>
  </div>
</div>

<div class="info-grid">
  <div class="info-cell"><div class="info-key">Supplier</div><div class="info-val">${supplier}</div></div>
  <div class="info-cell"><div class="info-key">Invoice Date</div><div class="info-val">${invDate}</div></div>
  ${supInvNo ? `<div class="info-cell"><div class="info-key">Supplier Inv No</div><div class="info-val">${supInvNo}</div></div>` : ''}
  ${grnNos   ? `<div class="info-cell"><div class="info-key">GRN No(s)</div><div class="info-val">${grnNos}</div></div>` : ''}
  ${currency ? `<div class="info-cell"><div class="info-key">Currency</div><div class="info-val">${currency}</div></div>` : ''}
  ${taxRate  ? `<div class="info-cell"><div class="info-key">Tax %</div><div class="info-val">${taxRate}%</div></div>` : ''}
</div>

<table class="lines">
  <thead><tr>
    <th style="${thStyle}width:36px;text-align:center;">#</th>
    <th style="${thStyle}">Item</th>
    <th style="${thStyle}width:60px;text-align:right;">Qty</th>
    <th style="${thStyle}width:95px;text-align:right;">Unit Price</th>
    <th style="${thStyle}width:60px;text-align:right;">Disc%</th>
    <th style="${thStyle}width:80px;text-align:center;">Tax Mode</th>
    <th style="${thStyle}width:90px;text-align:right;">Tax Amt</th>
    <th style="${thStyle}width:110px;text-align:right;border-right:none;">Total (${currency})</th>
  </tr></thead>
  <tbody>
    ${lineRows || `<tr><td colspan="8" style="padding:20px;text-align:center;color:#9ca3af;font-style:italic;">No line items found</td></tr>`}
  </tbody>
</table>

<div class="tot-wrap"><table class="tot-table">
  ${subTotal ? totRow('Sub Total', n2(subTotal)) : ''}
  ${totalTax ? totRow('Tax', n2(totalTax)) : ''}
  <tr class="grand-row">
    <td>Total (${currency})</td>
    <td style="text-align:right;">${n2(amount)}</td>
  </tr>
</table></div>

<div class="sig-row">
  <div class="sig-box">Prepared By</div>
  <div class="sig-box">Checked By</div>
  <div class="sig-box">Approved By</div>
</div>

<div class="footer">This is a computer-generated document &nbsp;|&nbsp; Printed on ${printDate}</div>
</body></html>`;
  }

  openOcrModal(): void {
    this.showOcrModal = true;
    this.ocrResult = null;
    this.ocrError = '';
    this.ocrLoading = false;
    this.ocrDragOver = false;
    this.ocrSelectedGrns = [];
    this.ocrGrnSearch = '';
    this.ocrReceivingMatches = [];
    this.svc.getAvailableGRNsForPin().subscribe({
      next: res => {
        this.ocrGrnOptions = this.svc.unwrap(res).map((g: any) => ({
          id: g.id ?? g.iD,
          grnNo: g.grnNo ?? g.grnNumber ?? g.number ?? '',
          supplierName: g.supplierName ?? '',
          poNo: g.poNo ?? '',
          supplierId: Number(g.supplierId ?? g.SupplierId ?? 0),
          supplierCountryId: Number(g.countryId ?? g.CountryId ?? g.supplierCountryId ?? 0) || null,
          currencyId: g.currencyId ?? g.CurrencyId ?? null,
          fxRate: Number(g.fxRate ?? g.FxRate ?? 1)
        }));
      }
    });
  }

  closeOcrModal(): void { this.showOcrModal = false; this.ocrGrnDropOpen = false; }

  get ocrGrnFiltered(): any[] {
    const q = this.ocrGrnSearch.toLowerCase();
    return q ? this.ocrGrnOptions.filter(g =>
      (g.grnNo ?? '').toLowerCase().includes(q) ||
      (g.supplierName ?? '').toLowerCase().includes(q) ||
      (g.poNo ?? '').toLowerCase().includes(q)
    ) : this.ocrGrnOptions;
  }

  toggleOcrGrn(grn: any): void {
    const idx = this.ocrSelectedGrns.findIndex(g => g.id === grn.id);
    if (idx >= 0) this.ocrSelectedGrns.splice(idx, 1);
    else this.ocrSelectedGrns.push(grn);
    this.refreshOcrReceivingMatches();
  }
  isOcrGrnSelected(grn: any): boolean { return this.ocrSelectedGrns.some(g => g.id === grn.id); }
  removeOcrGrn(grn: any): void {
    this.ocrSelectedGrns = this.ocrSelectedGrns.filter(g => g.id !== grn.id);
    this.refreshOcrReceivingMatches();
  }

  onOcrFileSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.runOcr(file);
  }

  onOcrDragOver(e: DragEvent): void { e.preventDefault(); this.ocrDragOver = true; }
  onOcrDragLeave(): void { this.ocrDragOver = false; }
  onOcrDrop(e: DragEvent): void {
    e.preventDefault();
    this.ocrDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this.runOcr(file);
  }

  runOcr(file: File): void {
    this.ocrLoading = true;
    this.ocrError = '';
    this.ocrResult = null;
    this.svc.extractOcr(file).subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res) ? res : [res];
        this.ocrResult = arr[0]?.parsed ?? arr[0] ?? null;
        this.ocrLoading = false;
        this.refreshOcrReceivingMatches();
      },
      error: (err: any) => {
        this.ocrError = err?.error?.message ?? err?.message ?? `OCR failed (${err?.status ?? 'unknown error'}). Please try again.`;
        this.ocrLoading = false;
      }
    });
  }

  private refreshOcrReceivingMatches(): void {
    const poNos = this.ocrSelectedGrns.map(g => String(g.poNo || '').trim()).filter(Boolean);
    this.ocrReceivingMatches = (this.ocrResult?.lines?.length && poNos.length)
      ? this.receivingSvc.matchOcrLines(poNos, this.ocrResult.lines)
      : [];
  }

  createFromOcr(): void {
    if (!this.ocrResult) return;

    // GRN is mandatory — validate here so the user gets a friendly warning
    // instead of a 500 "GRN is required" error from the backend.
    if (!this.ocrSelectedGrns.length) {
      void Swal.fire({
        icon: 'warning',
        title: 'GRN Required',
        text: 'Please select at least one GRN for this invoice before creating.',
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    const grnIds = this.ocrSelectedGrns.map((g: any) => Number(g.id));

    // Don't create directly. Hand the SCANNED (OCR) data + selected GRN(s) to the
    // invoice form (as a draft) so the user can review the scanned lines/amounts,
    // then Save from there.
    const draft = {
      invoiceNo: this.ocrResult.invoiceNo ?? '',
      invoiceDate: this.ocrResult.invoiceDate ? String(this.ocrResult.invoiceDate).substring(0, 10) : '',
      grnIds,
      lines: (this.ocrResult.lines ?? []).map((l: any) => ({
        item: l.item ?? l.itemName ?? '',
        qty: Number(l.qty ?? 0),
        unitPrice: Number(l.unitPrice ?? 0),
        discountPct: Number(l.discountPct ?? 0)
      }))
    };
    sessionStorage.setItem('ocrPinDraft', JSON.stringify(draft));
    this.closeOcrModal();
    this.router.navigate(['/app/purchase/supplier-invoice/new']);
  }

  openLinesModal(row: any): void {
    this.modalInvoiceNo = row.invoiceNo ?? '';
    this.modalSupplier = row.supplierName ?? '';
    this.modalStatus = row.statusLabel ?? '';
    this.modalTotal = row.amount ?? null;
    this.modalCurrency = row.currencyId || row.currency || '';
    this.modalCurrencyName = row.currency ?? '';
    this.modalFxRate = Number(row.fxRate ?? 1) || 1;
    this.modalLines = [];
    this.modalTotalQty = 0;
    this.modalTotalAmt = 0;
    this.showLinesModal = true;

    const parseLines = (src: any): any[] => {
      if (!src) return [];
      if (Array.isArray(src)) return src;
      try { return JSON.parse(src || '[]'); } catch { return []; }
    };

    const linesRaw = row.linesJson ?? row.LinesJson ?? row.pinLines ?? row.invoiceLines ?? null;
    let lines = parseLines(linesRaw);

    if (!lines.length) {
      this.svc.getSupplierInvoiceById(row.id).subscribe({
        next: res => {
          const d = this.svc.unwrapOne(res);
          lines = parseLines(d.linesJson ?? d.LinesJson ?? d.pinLines ?? d.lines ?? '[]');
          this.setModalLines(lines, d.amount ?? d.netTotal ?? this.modalTotal);
        }
      });
    } else {
      this.setModalLines(lines, row.amount);
    }
  }

  private setModalLines(lines: any[], total?: any): void {
    this.modalLines = lines.map((l: any) => ({
      item: l.itemName ?? l.item ?? l.itemSearch ?? '—',
      qty: Number(l.qty ?? l.quantity ?? 0),
      unitPrice: Number(l.unitPrice ?? l.price ?? 0),
      discountPct: Number(l.discountPct ?? 0),
      taxAmt: Number(l.taxAmt ?? 0),
      lineGrandTotal: Number(l.lineGrandTotal ?? l.lineTotal ?? ((l.qty ?? 0) * (l.unitPrice ?? 0))),
      matchStatus: l.matchStatus ?? ''
    }));
    this.modalTotalQty = this.modalLines.reduce((s, l) => s + l.qty, 0);
    this.modalTotalAmt = this.modalLines.reduce((s, l) => s + l.lineGrandTotal, 0);
    if (total != null) this.modalTotal = Number(total);
  }

  closeLinesModal(): void { this.showLinesModal = false; this.modalLines = []; }

  openMatchModal(row: any): void {
    this.currentRow = row;
    // PO and invoice figures in the 3-way match are in the supplier's currency, not the base.
    this.matchCurrency = row.currencyId || row.currency || '';
    this.threeWay = null;
    this.matchLoading = true;
    this.matchError = '';
    this.postError = '';
    this.showMatchModal = true;
    this.svc.getThreeWayMatch(row.id).subscribe({
      next: res => { this.threeWay = this.svc.unwrapOne(res) ?? res; this.matchLoading = false; },
      error: err => {
        this.matchLoading = false;
        this.matchError = err?.error?.message || 'Unable to load 3-way match data.';
      }
    });
  }

  closeMatchModal(): void { this.showMatchModal = false; this.threeWay = null; this.currentRow = null; }

  approveAndPostToAp(): void {
    if (!this.currentRow) return;
    if (this.isPosted(this.currentRow)) return;
    const row = this.currentRow;
    this.isPosting = true;
    const amount = Number(row.amount ?? 0);
    this.svc.approveSupplierInvoice(row.id, amount).subscribe({
      next: () => this.doPostToAp(row),
      error: () => this.doPostToAp(row)
    });
  }

  private doPostToAp(row: any): void {
    this.svc.postPinToAP(row.id).subscribe({
      next: (res: any) => {
        this.isPosting = false;
        this.closeMatchModal();
        this.load();
        if (res && res.glPosted === false) {
          Swal.fire({ icon: 'warning', title: 'Posted to A/P (GL pending)', text: res.message || 'Posted to A/P, but GL posting did not complete — please check the ledger account mappings.', confirmButtonColor: '#d97706' });
        } else {
          Swal.fire({ icon: 'success', title: 'Posted!', text: 'Invoice posted to Accounts Payable successfully.', confirmButtonColor: '#16a34a' });
        }
      },
      error: err => {
        this.isPosting = false;
        this.postError = err?.error?.message || 'Unable to post to A/P.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to post to A/P.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  async delete(row: any): Promise<void> {
    if (this.isPosted(row)) return;
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Delete invoice ${row.invoiceNo}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, delete it!'
    });
    if (!result.isConfirmed) return;
    this.svc.deleteSupplierInvoice(row.id).subscribe({
      next: () => {
        this.load();
        Swal.fire({ icon: 'success', title: 'Deleted!', text: `Invoice ${row.invoiceNo} deleted.`, confirmButtonColor: '#16a34a' });
      },
      error: err => {
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  openActionConfirm(row: any, type: string): void {
    this.actionRow = row;
    this.actionType = type;
    this.actionError = '';
    this.showActionConfirm = true;
  }
  closeActionConfirm(): void { this.showActionConfirm = false; this.actionRow = null; this.actionError = ''; }
  doActionConfirm(): void {
    if (!this.actionRow) return;
    this.actionLoading = true;
    this.actionError = '';
    const row = this.actionRow;
    if (this.actionType === 'delete-invoice') {
      this.svc.deleteSupplierInvoice(row.id).subscribe({
        next: () => {
          this.actionLoading = false;
          this.closeActionConfirm();
          this.load();
          Swal.fire({ icon: 'success', title: 'Deleted!', text: `Invoice ${row.invoiceNo} deleted.`, confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.actionLoading = false;
          this.actionError = err?.error?.message || 'Unable to delete.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete.', confirmButtonColor: '#16a34a' });
        }
      });
    }
  }
}
