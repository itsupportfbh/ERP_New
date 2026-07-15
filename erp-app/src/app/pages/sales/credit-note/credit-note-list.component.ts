import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import { PermissionService } from '../../../core/services/permission.service';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Approved', 3: 'Rejected', 4: 'Posted' };

@Component({
  selector: 'erp-credit-note-list',
  standalone: false,
  templateUrl: './credit-note-list.component.html',
  styleUrls: ['./credit-note-list.component.scss']
})
export class CreditNoteListComponent implements OnInit {
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
  /** Delivery To address captured on the credit note — shown under "Order To" when printing. */
  viewDeliveryTo = '';
  /** Customer's billing address from the Customer master — shown in the print "Bill To" box. */
  viewBillAddress = '';

  readonly lineColumns: PrintColumn[] = [
    { header: 'Item', key: 'itemName' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: 'Delivered', key: 'deliveredQty', align: 'right', type: 'qty' },
    { header: 'Returned', key: 'returnedQty', align: 'right', type: 'qty' },
    { header: 'Price', key: 'unitPrice', align: 'right', type: 'number' },
    { header: 'Disc %', key: 'discountPct', align: 'right', type: 'number' },
    { header: 'Tax', key: 'lineTax', align: 'right', type: 'number' },
    { header: 'Amount', key: 'lineTotal', align: 'right', type: 'number' },
    { header: 'Reason', key: 'reason' },
    { header: 'Disposition', key: 'disposition', align: 'center' },
  ];

  private reasonMap = new Map<number, string>();
  private dispositionMap: Record<number, string> = { 1: 'RESTOCK', 2: 'SCRAP' };
  /** customerId → billing address from the Customer master, for the print "Bill To" box */
  private custAddrMap = new Map<number, string>();

  readonly fnId = 'cn-list';
  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService, public perm: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getReturnReasons().subscribe(r => this.svc.unwrap(r).forEach((x: any) =>
      this.reasonMap.set(Number(x.id ?? x.Id), x.name ?? x.reason ?? x.stockIssueName ?? x.issueName ?? '')));
    this.svc.getCustomers().subscribe(r => this.svc.unwrap(r).forEach((c: any) =>
      this.custAddrMap.set(Number(c.id ?? c.Id), String(c.address ?? c.Address ?? '').trim())));
  }

  load(): void {
    this.loading = true;
    this.svc.getCreditNotes().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          const status = Number(r.status ?? r.Status ?? 0);
          return {
            ...r,
            id: r.id ?? r.Id,
            creditNoteNo: r.creditNoteNo ?? r.CreditNoteNo ?? '',
            doNumber: r.doNumber ?? r.DoNumber ?? '',
            siNumber: r.siNumber ?? r.SiNumber ?? r.invoiceNo ?? r.InvoiceNo ?? '',
            customerName: r.customerName ?? r.CustomerName ?? '',
            creditNoteDate: r.creditNoteDate ?? r.CreditNoteDate ?? null,
            subtotal: Number(r.subtotal ?? r.Subtotal ?? 0),
            currencyName: r.currencyName ?? r.CurrencyName ?? 'SGD',
            currency: r.currency ?? r.currencyName ?? r.CurrencyName ?? '',
            currencyId: r.currencyId ?? r.CurrencyId ?? 0,
            fxRate: Number(r.fxRate ?? r.FxRate ?? 1) || 1,
            status,
            statusLabel: STATUS_MAP[status] ?? 'Draft',
          };
        });
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
          (r.creditNoteNo ?? '').toLowerCase().includes(q) ||
          (r.doNumber ?? '').toLowerCase().includes(q) ||
          (r.siNumber ?? '').toLowerCase().includes(q) ||
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

  create(): void { this.router.navigate(['/app/sales/credit-notes/new']); }

  edit(row: any): void { this.router.navigate(['/app/sales/credit-notes', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getCreditNoteById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.viewDeliveryTo = String(d.deliveryTo ?? d.DeliveryTo ?? '').trim();
        this.viewBillAddress = this.custAddrMap.get(Number(row.customerId ?? d.customerId ?? d.CustomerId)) || '';
        const rawLines = d.lines ?? d.Lines ?? [];
        this.viewLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => {
          const qty = Number(l.returnedQty ?? l.ReturnedQty ?? 0);
          const unitPrice = Number(l.unitPrice ?? l.UnitPrice ?? 0);
          const discountPct = Number(l.discountPct ?? l.DiscountPct ?? 0);
          const gstPct = Number(l.gstPct ?? l.GstPct ?? 0);
          const lineNet = +(qty * unitPrice * (1 - discountPct / 100)).toFixed(2);
          const lineTax = +(lineNet * gstPct / 100).toFixed(2);
          const reasonId = Number(l.reasonId ?? l.ReasonId ?? 0);
          const dispId = Number(l.restockDispositionId ?? l.RestockDispositionId ?? 1) || 1;
          return {
            itemName: l.itemName ?? l.ItemName ?? '',
            uomName: l.uom ?? l.Uom ?? l.uomName ?? '',
            deliveredQty: Number(l.deliveredQty ?? l.DeliveredQty ?? 0),
            returnedQty: qty,
            discountPct,
            reason: l.reason ?? l.reasonName ?? this.reasonMap.get(reasonId) ?? '—',
            disposition: this.dispositionMap[dispId] ?? 'RESTOCK',
            qty,
            unitPrice,
            lineNet,
            lineTax,
            lineTotal: +(lineNet + lineTax).toFixed(2),
          };
        });
        const net = this.viewLines.reduce((s, l) => s + (+l.lineNet || 0), 0);
        const tax = this.viewLines.reduce((s, l) => s + (+l.lineTax || 0), 0);
        const total = this.viewLines.reduce((s, l) => s + (+l.lineTotal || 0), 0);
        this.viewInfo = [
          { label: 'Credit Note No', value: row.creditNoteNo },
          { label: 'DO No', value: row.doNumber || '—' },
          { label: 'Customer', value: row.customerName || '—' },
          { label: 'Date', value: this.fmtDate(row.creditNoteDate) },
          { label: 'Status', value: row.statusLabel },
        ];
        this.viewTotals = [
          { label: 'Subtotal', value: net.toFixed(2) },
          { label: 'Tax', value: tax.toFixed(2) },
          { label: 'Grand Total', value: total.toFixed(2) },
        ];
        this.viewTitle = `Credit Note Lines — ${row.creditNoteNo}`;
        this.viewSubtitle = `Customer: ${row.customerName || '—'} · DO: ${row.doNumber || '—'}`;
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
        docTitle: 'CREDIT NOTE',
        docNo: this.activeRow?.creditNoteNo ?? '',
        fields: this.viewInfo.filter(f => f.label !== 'Remarks'),
        remarks: this.activeRow ? (this.viewInfo.find(f => f.label === 'Remarks')?.value as string) : '',
        columns: this.lineColumns,
        lines: this.viewLines,
        totals: this.viewTotals,
        orderToLines: this.viewDeliveryTo ? [this.viewDeliveryTo] : [],
        billTo: {
          name: this.activeRow?.customerName || '—',
          lines: this.viewBillAddress ? [this.viewBillAddress] : [],
        },
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
    this.svc.deleteCreditNote(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
