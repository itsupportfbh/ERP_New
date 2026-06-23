import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-supplier-invoice-list',
  standalone: false,
  templateUrl: './supplier-invoice-list.component.html',
  styleUrls: ['./supplier-invoice-list.component.scss']
})
export class SupplierInvoiceListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  temp: any[] = [];
  search = '';

  // Pagination
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

  // KPI
  get totalPending(): number { return this.temp.filter(r => !this.isPosted(r)).length; }
  get autoMatched(): number { return this.temp.filter(r => r.matchStatus === 'OK' || String(r.listStatusLabel || '').toLowerCase().includes('match')).length; }
  get mismatchCount(): number { return this.temp.filter(r => r.matchStatus === 'Mismatch' || String(r.listStatusLabel || '').toLowerCase().includes('mismatch')).length; }
  get awaitingApproval(): number { return this.temp.filter(r => !this.isPosted(r) && r.numStatus < 2).length; }

  // Lines modal
  showLinesModal = false;
  modalLines: any[] = [];
  modalInvoiceNo = '';
  modalSupplier = '';
  modalStatus = '';
  modalTotal: number | null = null;
  modalTotalQty = 0;
  modalTotalAmt = 0;

  // 3-Way Match modal
  showMatchModal = false;
  threeWay: any = null;
  matchLoading = false;
  matchError = '';
  postError = '';
  currentRow: any = null;
  isPosting = false;

  // Action confirm modal (delete)
  showActionConfirm = false;
  actionRow: any = null;
  actionType = '';
  actionLoading = false;
  actionError = '';

  // OCR
  showOcrModal = false;
  ocrLoading = false;
  ocrResult: any = null;
  ocrError = '';
  ocrDragOver = false;
  ocrGrnOptions: any[] = [];
  ocrGrnSearch = '';
  ocrSelectedGrns: any[] = [];
  ocrGrnDropOpen = false;

  constructor(private svc: PurchaseService, private router: Router) {}

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
    const isPosted = r.isPostedToAp || r.postedToAp || r.apPosted || r.glPosted || r.isGlPosted || r.status === 'Posted' || numStatus >= 4;
    return {
      ...r,
      id: r.id ?? r.iD,
      invoiceNo: r.invoiceNo ?? r.pinNo ?? '',
      supplierInvoiceNo: r.supplierInvoiceNo ?? r.grnInvoiceNos ?? r.invoiceNos ?? '',
      supplierName: r.supplierName ?? '',
      grnNos: r.grnNos ?? r.grnNo ?? '',
      invoiceDate: r.invoiceDate,
      amount: Number(r.amount ?? r.netTotal ?? r.totalAmount ?? 0),
      baseAmount: Number(r.baseAmount ?? r.amount ?? 0),
      isOverseas: !!(r.isOverseas || r.IsOverseas),
      numStatus,
      isPostedFlag: isPosted,
      statusLabel: isPosted ? 'Posted to A/P' : (r.statusLabel ?? r.listStatusLabel ?? this.numToLabel(numStatus)),
      matchStatus: r.matchStatus ?? ''
    };
  }

  private numToLabel(n: number): string {
    return ({ 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected', 4: 'Posted' } as any)[n] ?? 'Draft';
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

  // ── OCR ──────────────────────────────────────────────
  openOcrModal(): void {
    this.showOcrModal = true;
    this.ocrResult = null; this.ocrError = ''; this.ocrLoading = false;
    this.ocrDragOver = false; this.ocrSelectedGrns = []; this.ocrGrnSearch = '';
    this.svc.getAvailableGRNsForPin().subscribe({
      next: res => {
        this.ocrGrnOptions = this.svc.unwrap(res).map((g: any) => ({
          id: g.id ?? g.iD,
          grnNo: g.grnNo ?? g.grnNumber ?? g.number ?? '',
          supplierName: g.supplierName ?? '',
          poNo: g.poNo ?? '',
          supplierId: Number(g.supplierId ?? g.SupplierId ?? 0),
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
  }
  isOcrGrnSelected(grn: any): boolean { return this.ocrSelectedGrns.some(g => g.id === grn.id); }
  removeOcrGrn(grn: any): void { this.ocrSelectedGrns = this.ocrSelectedGrns.filter(g => g.id !== grn.id); }

  onOcrFileSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.runOcr(file);
  }

  onOcrDragOver(e: DragEvent): void { e.preventDefault(); this.ocrDragOver = true; }
  onOcrDragLeave(): void { this.ocrDragOver = false; }
  onOcrDrop(e: DragEvent): void {
    e.preventDefault(); this.ocrDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this.runOcr(file);
  }

  runOcr(file: File): void {
    this.ocrLoading = true; this.ocrError = ''; this.ocrResult = null;
    this.svc.extractOcr(file).subscribe({
      next: (res: any) => {
        const arr = Array.isArray(res) ? res : [res];
        this.ocrResult = arr[0]?.parsed ?? arr[0] ?? null;
        this.ocrLoading = false;
      },
      error: (err: any) => {
        this.ocrError = err?.error?.message ?? err?.message ?? `OCR failed (${err?.status ?? 'unknown error'}). Please try again.`;
        this.ocrLoading = false;
      }
    });
  }

  createFromOcr(): void {
    if (!this.ocrResult) return;

    const grnIds = this.ocrSelectedGrns.map((g: any) => Number(g.id));
    const grnNos = this.ocrSelectedGrns.map((g: any) => g.grnNo as string);
    const firstGrn = this.ocrSelectedGrns[0] as any;

    const ocrLines: any[] = this.ocrResult.lines ?? [];
    const linesData = ocrLines.map((l: any) => {
      const qty       = Number(l.qty ?? 0);
      const unitPrice = Number(l.unitPrice ?? 0);
      const discPct   = Number(l.discountPct ?? 0);
      const base      = qty * unitPrice * (1 - discPct / 100);
      return {
        itemId: null,
        itemName: l.item ?? l.itemName ?? '',
        locationId: null,
        poQty: 0,
        grnQty: qty,
        qty,
        unitPrice,
        discountPct: discPct,
        taxMode: 'Exclusive',
        lineTotal: +base.toFixed(2),
        taxAmt: 0,
        lineGrandTotal: +base.toFixed(2),
        budgetLineId: null,
        dcNoteNo: '',
        remarks: '',
        matchStatus: ''
      };
    });

    const grandTotal  = +linesData.reduce((s: number, l: any) => s + l.lineGrandTotal, 0).toFixed(2);
    const loginUserId = Number(localStorage.getItem('id')) || 0;
    const today       = new Date().toISOString().substring(0, 10);

    const payload = {
      InvoiceNo   : this.ocrResult.invoiceNo ?? '',
      InvoiceDate : this.ocrResult.invoiceDate ? String(this.ocrResult.invoiceDate).substring(0, 10) : today,
      SupplierId  : firstGrn?.supplierId ?? 0,
      CurrencyId  : firstGrn?.currencyId ?? 0,
      FxRate      : firstGrn?.fxRate ?? 1,
      TaxRate     : Number(this.ocrResult.taxPercent ?? 0),
      Tax         : Number(this.ocrResult.taxAmount ?? 0),
      Amount      : grandTotal,
      GrnNos      : grnNos.join(','),
      Status      : 1,
      LinesJson   : JSON.stringify(linesData),
      GrnId       : grnIds[0] ?? null,
      GrnIds      : grnIds,
      IsPartial   : false,
      CreatedBy   : loginUserId,
      UpdatedBy   : loginUserId
    };

    this.ocrLoading = true;
    this.ocrError   = '';
    this.svc.createSupplierInvoice(payload).subscribe({
      next: () => {
        this.ocrLoading = false; this.closeOcrModal(); this.load();
        Swal.fire({ icon: 'success', title: 'Invoice Created!', text: 'Supplier invoice created successfully from OCR.', confirmButtonColor: '#16a34a' });
      },
      error: (err: any) => {
        this.ocrLoading = false;
        this.ocrError = err?.error?.message ?? err?.message ?? 'Failed to create invoice. Please try again.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? err?.message ?? 'Failed to create invoice. Please try again.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  // ── Lines Modal ──────────────────────────────────────
  openLinesModal(row: any): void {
    this.modalInvoiceNo = row.invoiceNo ?? '';
    this.modalSupplier = row.supplierName ?? '';
    this.modalStatus = row.statusLabel ?? '';
    this.modalTotal = row.amount ?? null;
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

  // ── 3-Way Match Modal ────────────────────────────────
  openMatchModal(row: any): void {
    this.currentRow = row;
    this.threeWay = null;
    this.matchLoading = true;
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
      next: () => {
        this.isPosting = false; this.closeMatchModal(); this.load();
        Swal.fire({ icon: 'success', title: 'Posted!', text: 'Invoice posted to Accounts Payable successfully.', confirmButtonColor: '#16a34a' });
      },
      error: err => {
        this.isPosting = false; this.postError = err?.error?.message || 'Unable to post to A/P.';
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
    this.actionRow = row; this.actionType = type; this.actionError = ''; this.showActionConfirm = true;
  }
  closeActionConfirm(): void { this.showActionConfirm = false; this.actionRow = null; this.actionError = ''; }
  doActionConfirm(): void {
    if (!this.actionRow) return;
    this.actionLoading = true; this.actionError = '';
    const row = this.actionRow;
    if (this.actionType === 'delete-invoice') {
      this.svc.deleteSupplierInvoice(row.id).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.load();
          Swal.fire({ icon: 'success', title: 'Deleted!', text: `Invoice ${row.invoiceNo} deleted.`, confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete.', confirmButtonColor: '#16a34a' });
        }
      });
    }
  }
}
