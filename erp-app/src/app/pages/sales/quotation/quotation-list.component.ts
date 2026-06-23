import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Approved', 3: 'Rejected', 4: 'Posted' };

@Component({
  selector: 'erp-quotation-list',
  standalone: false,
  templateUrl: './quotation-list.component.html',
  styleUrls: ['./quotation-list.component.scss']
})
export class QuotationListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  searchText = '';
  pageSize = 10;
  sortField = '';
  sortAsc = true;

  // lookups for resolving line names
  private uomMap = new Map<number, string>();
  private itemCodeMap = new Map<number, string>();

  // view-details modal
  showView = false;
  viewLoading = false;
  activeRow: any = null;
  viewTitle = '';
  viewSubtitle = '';
  viewInfo: PrintField[] = [];
  viewLines: any[] = [];
  viewTotals: PrintField[] = [];

  readonly lineColumns: PrintColumn[] = [
    { header: 'Item', key: 'itemName' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
    { header: 'Unit Price', key: 'unitPrice', align: 'right', type: 'number' },
    { header: 'Disc %', key: 'discountPct', align: 'right', type: 'number' },
    { header: 'Net', key: 'lineNet', align: 'right', type: 'number' },
    { header: 'Tax', key: 'lineTax', align: 'right', type: 'number' },
    { header: 'Total', key: 'lineTotal', align: 'right', type: 'number' },
  ];

  readonly fnId = 'qt-list';
  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService, public perm: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getUOMs().subscribe(r => this.svc.unwrap(r).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? '')));
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => { if (i.itemCode) this.itemCodeMap.set(Number(i.id), i.itemCode); }));
  }

  load(): void {
    this.loading = true;
    this.svc.getQuotations().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          number: r.number ?? r.quotationNo ?? '',
          customerName: r.customerName ?? r.customer ?? '',
          currency: r.currency ?? r.currencyName ?? r.currencyCode ?? '',
          grandTotal: r.grandTotal ?? 0,
          deliveryDate: r.deliveryDate ?? null,
          validityDate: r.validityDate ?? null,
          status: r.status ?? 0,
          statusLabel: STATUS_MAP[r.status] ?? 'Draft',
        }));
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.searchText.trim().toLowerCase();
    let list = q
      ? this.rows.filter(r =>
          (r.number ?? '').toLowerCase().includes(q) ||
          (r.customerName ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];

    if (this.sortField) {
      const f = this.sortField;
      list = [...list].sort((a, b) => {
        const va = (a[f] ?? '').toString().toLowerCase();
        const vb = (b[f] ?? '').toString().toLowerCase();
        return this.sortAsc ? va.localeCompare(vb, undefined, { numeric: true }) : vb.localeCompare(va, undefined, { numeric: true });
      });
    }
    this.filtered = list;
  }

  get pagedItems(): any[] { return this.filtered.slice(0, this.pageSize); }

  sortBy(field: string): void {
    if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; }
    this.applyFilter();
  }

  create(): void { this.router.navigate(['/app/sales/quotations/new']); }

  /** Approved (2) or Posted (4) quotations are locked from edit/delete. */
  isLocked(row: any): boolean { return Number(row?.status) === 2 || Number(row?.status) === 4; }

  edit(row: any): void {
    if (this.isLocked(row)) return;
    this.router.navigate(['/app/sales/quotations', row.id]);
  }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getQuotationById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const rawLines = d.lines ?? d.Lines ?? [];
        this.viewLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => ({
          itemCode: l.itemCode ?? this.itemCodeMap.get(Number(l.itemId)) ?? '',
          itemName: l.itemName ?? '',
          uomName: l.uomName ?? this.uomMap.get(Number(l.uomId)) ?? '',
          qty: l.qty ?? 0,
          unitPrice: l.unitPrice ?? 0,
          discountPct: l.discountPct ?? 0,
          lineNet: l.lineNet ?? 0,
          lineTax: l.lineTax ?? 0,
          lineTotal: l.lineTotal ?? 0,
        }));
        const net = this.viewLines.reduce((s, l) => s + (+l.lineNet || 0), 0);
        const tax = this.viewLines.reduce((s, l) => s + (+l.lineTax || 0), 0);
        const total = this.viewLines.reduce((s, l) => s + (+l.lineTotal || 0), 0);
        const cur = row.currency || 'SGD';
        this.viewInfo = [
          { label: 'QT No', value: row.number },
          { label: 'Status', value: row.statusLabel },
          { label: 'Customer', value: row.customerName || '—' },
          { label: 'Currency', value: cur },
          { label: 'Delivery Date', value: this.fmtDate(row.deliveryDate) },
          { label: 'Validity Date', value: this.fmtDate(row.validityDate) },
          { label: 'Remarks', value: d.remarks ?? '—' },
        ];
        this.viewTotals = [
          { label: 'Subtotal', value: net.toFixed(2) },
          { label: 'Tax', value: tax.toFixed(2) },
          { label: `Grand Total (${cur})`, value: total.toFixed(2) },
        ];
        this.viewTitle = `Quotation Lines — ${row.number}`;
        this.viewSubtitle = `Customer: ${row.customerName || '—'} · Currency: ${cur}`;
        this.viewLoading = false;
        cb();
      },
      error: () => { this.viewLoading = false; cb(); }
    });
  }

  view(row: any): void { this.showView = true; this.buildDetail(row, () => {}); }

  print(row: any): void {
    this.buildDetail(row, () => {
      this.printSvc.print({
        docTitle: 'QUOTATION',
        docNo: this.activeRow?.number ?? '',
        fields: this.viewInfo.filter(f => f.label !== 'Remarks'),
        remarks: this.activeRow ? (this.viewInfo.find(f => f.label === 'Remarks')?.value as string) : '',
        columns: this.lineColumns,
        lines: this.viewLines,
        totals: this.viewTotals,
      });
    });
  }

  printActive(): void { if (this.activeRow) this.print(this.activeRow); }

  private fmtDate(d: any): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
  }

  // ── Delete ────────────────────────────────────────────
  async deleteRow(row: any): Promise<void> {
    if (this.isLocked(row)) return;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Confirm Delete',
      text: 'Delete this quotation?',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d33'
    });
    if (!result.isConfirmed) return;
    this.svc.deleteQuotation(row.id).subscribe({
      next: () => { void Swal.fire('Deleted', 'Quotation deleted.', 'success').then(() => this.load()); },
      error: () => { void Swal.fire('Error', 'Unable to delete quotation.', 'error'); }
    });
  }
}
