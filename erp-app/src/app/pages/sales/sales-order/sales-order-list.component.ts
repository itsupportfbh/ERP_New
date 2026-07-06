import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import { PermissionService } from '../../../core/services/permission.service';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Completed', 4: 'Rejected' };

@Component({
  selector: 'erp-sales-order-list',
  standalone: false,
  templateUrl: './sales-order-list.component.html',
  styleUrls: ['./sales-order-list.component.scss']
})
export class SalesOrderListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  searchText = '';
  pageSize = 10;
  sortField = '';
  sortAsc = true;

  showDeleteModal = false;
  itemToDelete: any = null;

  // lookups for resolving line names
  private uomMap = new Map<number, string>();
  private itemNameMap = new Map<number, string>();
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
    { header: 'Qty', key: 'qty', align: 'center', type: 'qty' },
    { header: 'Unit Price', key: 'unitPrice', align: 'center', type: 'number' },
    { header: 'Allocated', key: 'allocated', align: 'center', type: 'qty' },
    { header: 'Shortage', key: 'shortage', align: 'center', type: 'qty' },
    { header: 'Total', key: 'lineTotal', align: 'center', type: 'number' },
    { header: 'Proc. Status', key: 'procStatus', align: 'center' },
  ];

  /** Procurement status code → label (matches the legacy Sales Order list) */
  private getProcStatusText(l: any): string {
    const s = +(l.procurementStatus ?? l.ProcurementStatus ?? l.status ?? 0);
    return s === 1 ? 'Pending'
      : s === 2 ? 'PO Created'
      : s === 3 ? 'Partially Received'
      : s === 4 ? 'Fully Received'
      : s === 5 ? 'Shortage Identified'
      : '—';
  }

  readonly fnId = 'so-list';
  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService, public perm: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getUOMs().subscribe(r => this.svc.unwrap(r).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? '')));
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => {
      this.itemNameMap.set(Number(i.id), i.itemName ?? i.name ?? '');
      if (i.itemCode) this.itemCodeMap.set(Number(i.id), i.itemCode);
    }));
  }

  load(): void {
    this.loading = true;
    this.svc.getSalesOrders().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          const lineItems: any[] = r.lineItems ?? r.LineItems ?? r.salesOrderLines ?? r.SalesOrderLines ?? [];
          const allFullyReceived = lineItems.length > 0 &&
            lineItems.every((l: any) => +(l.procurementStatus ?? l.ProcurementStatus ?? 0) === 4);
          return {
            ...r,
            id: r.id ?? r.iD,
            salesOrderNo: r.salesOrderNo ?? r.soNo ?? r.sO_No ?? '',
            customerName: (r.customerId === 0 || r.customerId == null) && (r.isCashSales)
              ? 'Cash Sales' : (r.customerName ?? ''),
            orderDate: r.orderDate ?? r.requestedDate ?? r.poDate ?? null,
            deliveryDate: r.deliveryDate ?? null,
            currencyName: r.currencyName ?? r.currencyCode ?? '',
            currency: r.currency ?? r.currencyName ?? r.currencyCode ?? '',
            currencyId: r.currencyId ?? r.currencyID ?? 0,
            fxRate: Number(r.fxRate ?? r.fxrate ?? 1) || 1,
            netTotal: r.netTotal ?? r.grandTotal ?? 0,
            status: r.approvalStatus ?? r.status ?? 0,
            statusLabel: allFullyReceived
              ? 'Completed'
              : (STATUS_MAP[r.approvalStatus ?? r.status] ?? 'Pending'),
            statusClass: allFullyReceived
              ? 'st-completed'
              : ('st-' + (r.approvalStatus ?? r.status ?? 0)),
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
          (r.salesOrderNo ?? '').toString().toLowerCase().includes(q) ||
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

  create(): void { this.router.navigate(['/app/sales/orders/new']); }

  edit(row: any): void { this.router.navigate(['/app/sales/orders', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getSalesOrderById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const rawLines = d.salesOrderLines ?? d.SalesOrderLines ?? d.lineItems ?? d.lines ?? [];
        const parsed: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);

        const baseLines = parsed.map((l: any) => {
          const qty = +(l.qty ?? l.quantity ?? 0) || 0;
          const unitPrice = +(l.unitPrice ?? 0) || 0;
          const discountPct = +(l.discountPct ?? l.discount ?? 0) || 0;
          const base = qty * unitPrice;
          const lineNet = base - base * (discountPct / 100);
          const allocated = +(l.lockedQty ?? l.allocated ?? l.allocatedQty ?? 0) || 0;
          const shortageRaw = l.shortageQty ?? l.ShortageQty ?? l.shortage ?? l.Shortage;
          const shortage = shortageRaw != null ? (+shortageRaw || 0) : Math.max(qty - allocated, 0);
          const lineTotal = +(l.total ?? l.lineTotal ?? lineNet) || 0;
          return {
            itemId: Number(l.itemId ?? l.ItemId ?? 0) || 0,
            itemCode: l.itemCode ?? this.itemCodeMap.get(Number(l.itemId)) ?? '',
            itemName: l.itemName ?? l.item ?? this.itemNameMap.get(Number(l.itemId)) ?? '',
            uomName: l.uomName ?? l.uom ?? this.uomMap.get(Number(l.uomId)) ?? '',
            qty,
            unitPrice,
            discountPct,
            allocated,
            shortage,
            lineNet,
            lineTotal,
            procStatus: this.getProcStatusText(l),
          };
        });

        const cur = row.currencyName || d.currencyName || 'SGD';
        // Replace package child lines with the "Executive Lunch Buffet" header (money on the header).
        this.svc.groupViewLinesByPackage(baseLines, d.itemSets ?? d.ItemSets ?? [], (s: any, children: any[]) => {
          const setNet = +(s.lineNet ?? s.LineNet ?? 0) || 0;
          const setTotal = +(s.lineTotal ?? s.LineTotal ?? 0) || 0;
          // The package's procurement status mirrors its child items.
          const childStatuses = Array.from(new Set((children ?? []).map(c => c.procStatus).filter(Boolean)));
          return {
            itemId: 0,
            itemCode: '',
            itemName: s.setName ?? s.SetName ?? 'Package',
            uomName: '',
            qty: +(s.qty ?? s.Qty ?? 0) || 0,
            unitPrice: +(s.unitPrice ?? s.UnitPrice ?? 0) || 0,
            discountPct: +(s.discountPct ?? s.DiscountPct ?? 0) || 0,
            allocated: (children ?? []).reduce((sum, c) => sum + (+c.allocated || 0), 0),
            shortage: (children ?? []).reduce((sum, c) => sum + (+c.shortage || 0), 0),
            lineNet: setNet,
            lineTotal: setTotal || setNet,
            procStatus: childStatuses.length ? childStatuses.join(', ') : '',
          };
        }).subscribe(grouped => {
          this.viewLines = grouped;
          const net = grouped.reduce((s, l) => s + (+l.lineNet || 0), 0);
          const total = grouped.reduce((s, l) => s + (+l.lineTotal || 0), 0);
          this.viewInfo = [
            { label: 'SO No', value: row.salesOrderNo },
            { label: 'Status', value: row.statusLabel },
            { label: 'Customer', value: row.customerName || '—' },
            { label: 'Currency', value: cur },
            { label: 'Order Date', value: this.fmtDate(row.orderDate) },
            { label: 'Delivery Date', value: this.fmtDate(row.deliveryDate) },
            { label: 'Remarks', value: d.remarks ?? '—' },
          ];
          this.viewTotals = [
            { label: 'Subtotal', value: net.toFixed(2) },
            { label: 'Tax', value: Math.max(total - net, 0).toFixed(2) },
            { label: `Grand Total (${cur})`, value: total.toFixed(2) },
          ];
          this.viewTitle = `Sales Order Lines — ${row.salesOrderNo}`;
          this.viewSubtitle = `Customer: ${row.customerName || '—'} · Currency: ${cur}`;
          this.viewLoading = false;
          cb();
        });
      },
      error: () => { this.viewLoading = false; cb(); }
    });
  }

  view(row: any): void { this.showView = true; this.buildDetail(row, () => {}); }

  print(row: any): void {
    this.buildDetail(row, () => {
      this.printSvc.print({
        docTitle: 'SALES ORDER',
        docNo: this.activeRow?.salesOrderNo ?? '',
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
    this.svc.deleteSalesOrder(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
