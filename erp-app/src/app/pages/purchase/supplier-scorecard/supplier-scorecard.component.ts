import { Component, OnInit } from '@angular/core';
import { PurchaseService } from '../purchase.service';

interface ScorecardRow {
  supplierId: number;
  supplierName: string;
  supplierCode: string;
  purchaseType: string;
  incotermsName: string;
  poCount: number;
  approvedPoCount: number;
  localPoCount: number;
  overseasPoCount: number;
  poValueBase: number;
  localPoValueBase: number;
  overseasPoValueBase: number;
  grnCount: number;
  fullGrnCount: number;
  partialGrnCount: number;
  closedGrnCount: number;
  orderedQty: number;
  receivedQty: number;
  pendingQty: number;
  fulfillmentPct: number;
  invoiceCount: number;
  invoiceValueBase: number;
  paidValueBase: number;
  outstandingValueBase: number;
  paymentPct: number;
  approvalScore: number;
  fulfillmentScore: number;
  paymentScore: number;
  overallScore: number;
  rating: string;
}

@Component({
  selector: 'erp-supplier-scorecard',
  standalone: false,
  templateUrl: './supplier-scorecard.component.html',
  styleUrls: ['./supplier-scorecard.component.scss']
})
export class SupplierScorecardComponent implements OnInit {
  loading = false;
  allRows: ScorecardRow[] = [];
  rows: ScorecardRow[] = [];
  search = '';

  // Filters
  fromDate = '';
  toDate = '';
  supplierId: number | null = null;
  supplierOptions: any[] = [];

  // Pagination
  pageSize = 10;
  currentPage = 1;
  get totalPages(): number { return Math.ceil(this.rows.length / this.pageSize) || 1; }
  get pageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = Math.max(1, this.currentPage - 2); i <= Math.min(this.totalPages, this.currentPage + 2); i++) {
      pages.push(i);
    }
    return pages;
  }
  get pagedRows(): ScorecardRow[] {
    return this.rows.slice((this.currentPage - 1) * this.pageSize, this.currentPage * this.pageSize);
  }
  onPageChange(p: number): void { if (p >= 1 && p <= this.totalPages) { this.currentPage = p; } }

  // KPI
  get totalSuppliers(): number { return this.rows.length; }
  get avgScore(): number {
    if (!this.rows.length) return 0;
    return +(this.rows.reduce((s, r) => s + r.overallScore, 0) / this.rows.length).toFixed(2);
  }
  get totalPoValue(): number { return +this.rows.reduce((s, r) => s + r.poValueBase, 0).toFixed(2); }
  get totalOutstanding(): number { return +this.rows.reduce((s, r) => s + r.outstandingValueBase, 0).toFixed(2); }

  constructor(private svc: PurchaseService) {}

  ngOnInit(): void {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    this.fromDate = this.isoDate(start);
    this.toDate = this.isoDate(today);
    this.svc.getSuppliers().subscribe(r => {
      this.supplierOptions = [
        { label: 'All Suppliers', value: null },
        ...this.svc.unwrap(r).map((s: any) => ({ label: s.supplierName ?? s.name ?? '', value: s.id }))
      ];
    });
    this.loadReport();
  }

  loadReport(): void {
    this.loading = true;
    this.svc.getScorecardReport(this.fromDate, this.toDate, this.supplierId ?? undefined).subscribe({
      next: res => {
        this.allRows = this.svc.unwrap(res).map((x: any) => this.normalize(x));
        this.applySearch();
        this.loading = false;
      },
      error: () => { this.allRows = []; this.rows = []; this.loading = false; }
    });
  }

  applySearch(): void {
    const q = this.search.toLowerCase().trim();
    this.rows = q
      ? this.allRows.filter(r =>
          r.supplierName.toLowerCase().includes(q) ||
          r.supplierCode.toLowerCase().includes(q) ||
          r.rating.toLowerCase().includes(q)
        )
      : [...this.allRows];
    this.currentPage = 1;
  }

  resetFilters(): void {
    this.supplierId = null;
    const today = new Date();
    this.fromDate = this.isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
    this.toDate = this.isoDate(today);
    this.search = '';
    this.loadReport();
  }

  scoreClass(row: ScorecardRow): string {
    if (row.overallScore >= 85) return 'score-a';
    if (row.overallScore >= 70) return 'score-b';
    if (row.overallScore >= 50) return 'score-c';
    return 'score-d';
  }

  exportCsv(): void {
    const headers = [
      'Supplier', 'Code', 'Purchase Type', 'Incoterms', 'Rating', 'Score',
      'PO Count', 'Local PO', 'Overseas PO', 'PO Value Base', 'Local PO Value', 'Overseas PO Value',
      'GRN Count', 'Full GRN', 'Partial GRN', 'Closed GRN',
      'Ordered Qty', 'Received Qty', 'Pending Qty', 'Fulfillment %',
      'Invoice Count', 'Invoice Value', 'Paid Value', 'Outstanding', 'Payment %'
    ];
    const lines = this.rows.map(r => [
      r.supplierName, r.supplierCode, r.purchaseType, r.incotermsName, r.rating, r.overallScore,
      r.poCount, r.localPoCount, r.overseasPoCount, r.poValueBase, r.localPoValueBase, r.overseasPoValueBase,
      r.grnCount, r.fullGrnCount, r.partialGrnCount, r.closedGrnCount,
      r.orderedQty, r.receivedQty, r.pendingQty, r.fulfillmentPct,
      r.invoiceCount, r.invoiceValueBase, r.paidValueBase, r.outstandingValueBase, r.paymentPct
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-scorecard-${this.fromDate}-${this.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private normalize(x: any): ScorecardRow {
    return {
      supplierId:         Number(x.supplierId ?? x.SupplierId ?? 0),
      supplierName:       x.supplierName ?? x.SupplierName ?? '',
      supplierCode:       x.supplierCode ?? x.SupplierCode ?? '',
      purchaseType:       x.purchaseType ?? x.PurchaseType ?? 'Local',
      incotermsName:      x.incotermsName ?? x.IncotermsName ?? '',
      poCount:            Number(x.poCount ?? x.PoCount ?? 0),
      approvedPoCount:    Number(x.approvedPoCount ?? x.ApprovedPoCount ?? 0),
      localPoCount:       Number(x.localPoCount ?? x.LocalPoCount ?? 0),
      overseasPoCount:    Number(x.overseasPoCount ?? x.OverseasPoCount ?? 0),
      poValueBase:        Number(x.poValueBase ?? x.PoValueBase ?? 0),
      localPoValueBase:   Number(x.localPoValueBase ?? x.LocalPoValueBase ?? 0),
      overseasPoValueBase:Number(x.overseasPoValueBase ?? x.OverseasPoValueBase ?? 0),
      grnCount:           Number(x.grnCount ?? x.GrnCount ?? 0),
      fullGrnCount:       Number(x.fullGrnCount ?? x.FullGrnCount ?? 0),
      partialGrnCount:    Number(x.partialGrnCount ?? x.PartialGrnCount ?? 0),
      closedGrnCount:     Number(x.closedGrnCount ?? x.ClosedGrnCount ?? 0),
      orderedQty:         Number(x.orderedQty ?? x.OrderedQty ?? 0),
      receivedQty:        Number(x.receivedQty ?? x.ReceivedQty ?? 0),
      pendingQty:         Number(x.pendingQty ?? x.PendingQty ?? 0),
      fulfillmentPct:     Number(x.fulfillmentPct ?? x.FulfillmentPct ?? 0),
      invoiceCount:       Number(x.invoiceCount ?? x.InvoiceCount ?? 0),
      invoiceValueBase:   Number(x.invoiceValueBase ?? x.InvoiceValueBase ?? 0),
      paidValueBase:      Number(x.paidValueBase ?? x.PaidValueBase ?? 0),
      outstandingValueBase:Number(x.outstandingValueBase ?? x.OutstandingValueBase ?? 0),
      paymentPct:         Number(x.paymentPct ?? x.PaymentPct ?? 0),
      approvalScore:      Number(x.approvalScore ?? x.ApprovalScore ?? 0),
      fulfillmentScore:   Number(x.fulfillmentScore ?? x.FulfillmentScore ?? 0),
      paymentScore:       Number(x.paymentScore ?? x.PaymentScore ?? 0),
      overallScore:       Number(x.overallScore ?? x.OverallScore ?? 0),
      rating:             x.rating ?? x.Rating ?? 'D'
    };
  }

  private isoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
