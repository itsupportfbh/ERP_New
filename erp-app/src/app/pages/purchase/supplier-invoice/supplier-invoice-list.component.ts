import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { DocumentNumberService } from '../../../core/services/document-number.service';
import { ReceivingIntegrationService, OcrReceivingMatchLine } from '../../../core/services/receiving-integration.service';
import { TaxDecisionService } from '../../../core/services/tax-decision.service';
import { PermissionService } from '../../../core/services/permission.service';
import { PurchaseService } from '../purchase.service';
import { DocumentPrintService, DocumentPrintConfig } from '../../../core/services/document-print.service';

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
    private taxDecisionSvc: TaxDecisionService,
    private printSvc: DocumentPrintService
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
        this.printSvc.print(this.buildInvoiceDocConfig(d, lines, row));
      },
      error: () => {
        this.printSvc.print(this.buildInvoiceDocConfig(row, [], row));
      }
    });
  }

  /** Supplier Invoice layout rendered through the shared DocumentPrintService so it
   *  matches the Sales document letterhead (logo, teal header, "For & Behalf of"). */
  private buildInvoiceDocConfig(d: any, lines: any[], row?: any): DocumentPrintConfig {
    const fmt = (dt: any) => {
      if (!dt) return '—';
      const x = new Date(dt);
      return isNaN(x.getTime()) ? '—'
        : `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`;
    };
    const invNo    = d.invoiceNo ?? row?.invoiceNo ?? '';
    const supInvNo = d.supplierInvoiceNo ?? row?.supplierInvoiceNo ?? '';
    const supplier = d.supplierName ?? row?.supplierName ?? '—';
    const currency = d.currencyName ?? d.currency ?? row?.currency ?? '';
    const grnNos   = d.grnNos ?? row?.grnNos ?? '';
    const taxRate  = Number(d.taxRate ?? d.taxPct ?? 0);
    const totalTax = Number(d.tax ?? d.totalTax ?? 0);
    const amount   = Number(d.amount ?? d.netTotal ?? row?.amount ?? 0);

    let subTotal = 0;
    const docLines = (lines || []).map((l: any) => {
      const qty   = Number(l.qty ?? l.quantity ?? 0);
      const price = Number(l.unitPrice ?? l.price ?? 0);
      const disc  = Number(l.discountPct ?? 0);
      const taxAmt = Number(l.taxAmt ?? 0);
      const base  = qty * price * (1 - disc / 100);
      subTotal += base;
      return {
        itemName: l.itemName ?? l.item ?? l.itemSearch ?? l.itemCode ?? '—',
        qty,
        unitPrice: price,
        discountPct: disc,
        taxMode: l.taxMode ?? '',
        taxAmt,
        lineTotal: Number(l.lineGrandTotal ?? l.lineTotal ?? (base + taxAmt)),
      };
    });

    const totals: { label: string; value: string }[] = [];
    if (subTotal) totals.push({ label: 'Sub Total', value: subTotal.toFixed(2) });
    if (totalTax) totals.push({ label: 'Tax', value: totalTax.toFixed(2) });
    totals.push({ label: `Total (${currency || 'SGD'})`, value: amount.toFixed(2) });

    const fields = [
      { label: 'Inv No', value: invNo },
      { label: 'Invoice Date', value: fmt(d.invoiceDate ?? row?.invoiceDate) },
    ];
    if (supInvNo) fields.push({ label: 'Supplier Inv No', value: supInvNo });
    if (grnNos)   fields.push({ label: 'GRN No(s)', value: grnNos });
    if (currency) fields.push({ label: 'Currency', value: currency });
    if (taxRate)  fields.push({ label: 'Tax %', value: `${taxRate}%` });

    return {
      docTitle: 'SUPPLIER INVOICE',
      docNo: invNo,
      billTo: { name: supplier, lines: [], label: 'Supplier :' },
      hideDeliverTo: true,
      fields,
      columns: [
        { header: 'Item', key: 'itemName' },
        { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
        { header: 'Unit Price', key: 'unitPrice', align: 'right', type: 'number' },
        { header: 'Disc %', key: 'discountPct', align: 'right', type: 'number' },
        { header: 'Tax Mode', key: 'taxMode', align: 'center' },
        { header: 'Tax Amt', key: 'taxAmt', align: 'right', type: 'number' },
        { header: `Total (${currency || 'SGD'})`, key: 'lineTotal', align: 'right', type: 'number' },
      ],
      lines: docLines,
      totals,
    };
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

  /**
   * A direct/cash purchase has no purchase order — the invoice lines are the receipt. The
   * 3-way match compares an invoice against a PO and a GRN, so with no PO there is nothing to
   * match and it would always read "Not on PO / Blocked". Such an invoice posts straight to A/P.
   */
  isCashPurchase(row: any): boolean {
    const poId = Number(row?.poid ?? row?.poId ?? row?.POID ?? row?.pOID ?? 0);
    return !(poId > 0);
  }

  /** The action button routes here: 3-way match for a PO-based invoice, a direct post otherwise. */
  onPostAction(row: any): void {
    if (this.isPosted(row)) { this.openMatchModal(row); return; }   // view-only
    if (this.isCashPurchase(row)) { this.confirmDirectPost(row); return; }
    this.openMatchModal(row);
  }

  private async confirmDirectPost(row: any): Promise<void> {
    const ok = await Swal.fire({
      icon: 'question',
      title: 'Post to A/P?',
      html: `Direct purchase <b>${row.invoiceNo}</b> — no PO/GRN to match.<br>Post it straight to Accounts Payable?`,
      showCancelButton: true,
      confirmButtonText: 'Post to A/P',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280'
    });
    if (!ok.isConfirmed) return;

    this.currentRow = row;
    this.isPosting = true;
    // Same approve-then-post as the matched path, minus the 3-way gate.
    this.svc.approveSupplierInvoice(row.id, Number(row.amount ?? 0)).subscribe({
      next: () => this.doPostToAp(row),
      error: () => this.doPostToAp(row)
    });
  }

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

  /** Partial is derived from the quantities, not from the isPartialInvoice flag. */
  get isPartialMatch(): boolean {
    return (this.threeWay?.lines ?? []).some((l: any) => l.status === 'PARTIAL' || l.status === 'NOT_INVOICED');
  }

  private static readonly STATUS_LABELS: Record<string, string> = {
    OK: 'OK',
    PARTIAL: 'Partial',
    NOT_INVOICED: 'Not invoiced',
    FAV_PRICE: 'Below PO rate',
    PRICE_MISMATCH: 'Price mismatch',
    OVER_BILL: 'Over-billed',
    AMOUNT_MISMATCH: 'Amount error',
    NO_PO_LINE: 'Not on PO'
  };

  private static readonly STATUS_BADGES: Record<string, string> = {
    OK: 'b-ok',
    PARTIAL: 'b-info',
    NOT_INVOICED: 'b-muted',
    FAV_PRICE: 'b-warn',
    PRICE_MISMATCH: 'b-danger',
    OVER_BILL: 'b-danger',
    AMOUNT_MISMATCH: 'b-danger',
    NO_PO_LINE: 'b-danger'
  };

  statusLabel(status: string): string {
    return SupplierInvoiceListComponent.STATUS_LABELS[status] ?? status;
  }

  badgeClass(status: string): string {
    return SupplierInvoiceListComponent.STATUS_BADGES[status] ?? 'b-muted';
  }

  priceVarColor(line: any): string {
    if (!line?.invQty) return '#9ca3af';
    if (line.status === 'PRICE_MISMATCH') return '#b91c1c';
    if (line.status === 'FAV_PRICE') return '#d97706';
    return '#1a7a4a';
  }

  approveAndPostToAp(): void {
    if (!this.currentRow) return;
    if (this.isPosted(this.currentRow)) return;
    if (this.threeWay && !this.threeWay.canPostToAp) return;
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
