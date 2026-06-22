import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';

// Status -> badge code: 0 Draft (grey), 1 Printed/Pending (amber), 4 Posted (blue)
const STATUS_CODE: Record<string, number> = { Draft: 0, Printed: 1, Posted: 4 };

@Component({
  selector: 'erp-sales-invoice-list',
  standalone: false,
  templateUrl: './sales-invoice-list.component.html',
  styleUrls: ['./sales-invoice-list.component.scss']
})
export class SalesInvoiceListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  searchText = '';
  pageSize = 10;
  sortField = '';
  sortAsc = true;

  showDeleteModal = false;
  itemToDelete: any = null;

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

  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.svc.getSalesInvoices().subscribe({
      next: res => {
        const items = (res as any)?.data?.items;
        const list = Array.isArray(items) ? items : this.svc.unwrap(res);
        this.rows = (list ?? []).map((r: any) => {
          const statusLabel = this.statusOf(r);
          return {
            ...r,
            id: r.id ?? r.iD,
            invoiceNo: r.invoiceNo ?? r.siNo ?? r.invoiceNumber ?? '',
            customerName: r.customerName ?? '',
            invoiceDate: r.invoiceDate ?? null,
            total: Number(r.total ?? 0),
            sourceRef: r.sourceRef ?? r.SourceRef ?? r.sourceNo ?? r.soNo ?? r.doNo ?? '',
            statusLabel,
            statusCode: STATUS_CODE[statusLabel] ?? 0,
          };
        });
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private statusOf(r: any): string {
    if (r.glPosted === true || r.glPosted === 1 || r.posted === true) return 'Posted';
    if (Number(r.printCount ?? 0) > 0 || r.printed === true) return 'Printed';
    return r.statusLabel ?? r.status ?? 'Draft';
  }

  applyFilter(): void {
    const q = this.searchText.trim().toLowerCase();
    let list = q
      ? this.rows.filter(r =>
          (r.invoiceNo ?? '').toLowerCase().includes(q) ||
          (r.customerName ?? '').toLowerCase().includes(q) ||
          (r.sourceRef ?? '').toLowerCase().includes(q) ||
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

  create(): void { this.router.navigate(['/app/sales/invoices/new']); }

  edit(row: any): void { this.router.navigate(['/app/sales/invoices', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getSalesInvoiceById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const hdr = d.header ?? d;
        const rawLines = d.lines ?? hdr.lines ?? [];
        this.viewLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => {
          const qty = Number(l.qty ?? 0);
          const price = Number(l.unitPrice ?? 0);
          const disc = Number(l.discountPct ?? 0);
          const lineNet = l.lineAmount != null ? Number(l.lineAmount) : +(qty * price * (1 - disc / 100)).toFixed(2);
          const lineTax = Number(l.taxAmount ?? 0);
          return {
            itemName: l.itemName ?? '',
            uomName: l.uom ?? l.uomName ?? '',
            qty,
            unitPrice: price,
            discountPct: disc,
            lineNet,
            lineTax,
            lineTotal: +(lineNet + lineTax).toFixed(2),
          };
        });
        const net = this.viewLines.reduce((s, l) => s + (+l.lineNet || 0), 0);
        const tax = this.viewLines.reduce((s, l) => s + (+l.lineTax || 0), 0);
        const total = this.viewLines.reduce((s, l) => s + (+l.lineTotal || 0), 0);
        const cur = row.currency ?? hdr.currency ?? hdr.currencyName ?? hdr.currencyCode ?? 'SGD';
        const invDate = hdr.invoiceDate ?? row.invoiceDate;
        this.viewInfo = [
          { label: 'Invoice No', value: row.invoiceNo },
          { label: 'Customer', value: (hdr.customerName ?? row.customerName) || '—' },
          { label: 'Invoice Date', value: this.fmtDate(invDate) },
          { label: 'Currency', value: cur },
        ];
        this.viewTotals = [
          { label: 'Subtotal', value: net.toFixed(2) },
          { label: 'Tax', value: tax.toFixed(2) },
          { label: `Grand Total (${cur})`, value: total.toFixed(2) },
        ];
        this.viewTitle = `Invoice Lines — ${row.invoiceNo}`;
        this.viewSubtitle = `Customer: ${(hdr.customerName ?? row.customerName) || '—'} · Currency: ${cur}`;
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
        docTitle: 'SALES INVOICE',
        docNo: this.activeRow?.invoiceNo ?? '',
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
  openDelete(row: any): void { this.itemToDelete = row; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.svc.deleteSalesInvoice(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
