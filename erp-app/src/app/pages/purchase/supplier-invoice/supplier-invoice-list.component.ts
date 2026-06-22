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
  currentRow: any = null;
  isPosting = false;

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
        Swal.fire('Error', err?.error?.message || 'Unable to load 3-way match data.', 'error');
      }
    });
  }

  closeMatchModal(): void { this.showMatchModal = false; this.threeWay = null; this.currentRow = null; }

  approveAndPostToAp(): void {
    if (!this.currentRow) return;
    if (this.isPosted(this.currentRow)) { Swal.fire('Already Posted', 'This invoice is already posted to A/P.', 'info'); return; }
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
        this.isPosting = false;
        Swal.fire('Posted!', `Invoice ${row.invoiceNo} approved and posted to A/P.`, 'success');
        this.closeMatchModal();
        this.load();
      },
      error: err => {
        this.isPosting = false;
        Swal.fire('Error', err?.error?.message || 'Unable to post to A/P.', 'error');
      }
    });
  }

  delete(row: any): void {
    if (this.isPosted(row)) { Swal.fire('Cannot Delete', 'Posted invoices cannot be deleted.', 'warning'); return; }
    Swal.fire({ title: 'Delete Invoice?', text: `Delete ${row.invoiceNo}? This cannot be undone.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.deleteSupplierInvoice(row.id).subscribe({
          next: () => { Swal.fire('Deleted', 'Invoice deleted.', 'success'); this.load(); },
          error: err => Swal.fire('Error', err?.error?.message || 'Unable to delete.', 'error')
        });
      });
  }
}
