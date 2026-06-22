import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';

const STATUS_MAP: Record<number, string> = {
  0: 'Draft',
  1: 'Submitted',
  2: 'Approved',
  3: 'Rejected',
  4: 'Posted'
};

@Component({
  selector: 'erp-delivery-order-list',
  standalone: false,
  templateUrl: './delivery-order-list.component.html',
  styleUrls: ['./delivery-order-list.component.scss']
})
export class DeliveryOrderListComponent implements OnInit {
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
  private itemCodeMap = new Map<number, string>();
  private warehouseMap = new Map<number, string>();
  private driverMap = new Map<number, string>();

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
    { header: 'Item Code', key: 'itemCode', align: 'center' },
    { header: 'Item', key: 'itemName' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
    { header: 'Warehouse', key: 'warehouseName' },
    { header: 'Bin', key: 'binName', align: 'center' },
    { header: 'Notes', key: 'notes' },
  ];

  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getUOMs().subscribe(r => this.svc.unwrap(r).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? '')));
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => { if (i.itemCode) this.itemCodeMap.set(Number(i.id), i.itemCode); }));
    this.svc.getWarehouses().subscribe(r => this.svc.unwrap(r).forEach((w: any) => this.warehouseMap.set(Number(w.id), w.warehouseName ?? w.name ?? '')));
    this.svc.getDrivers().subscribe(r => this.svc.unwrap(r).forEach((d: any) => this.driverMap.set(Number(d.id ?? d.Id), String(d.name ?? d.Name ?? d.driverName ?? '').trim())));
  }

  getDriverName(id: any): string {
    const n = Number(id);
    return n ? (this.driverMap.get(n) ?? '') : '';
  }

  load(): void {
    this.loading = true;
    this.svc.getDeliveryOrders().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          const status = Number(r.status ?? r.Status ?? 0);
          const posted = !!(r.isPosted ?? r.IsPosted ?? (status === 4));
          return {
            ...r,
            id: r.id ?? r.Id,
            doNumber: r.doNumber ?? r.DoNumber ?? '',
            salesOrderNo: r.salesOrderNo ?? r.SalesOrderNo ?? r.soNo ?? '',
            driverId: r.driverId ?? r.DriverId ?? null,
            routeName: r.routeName ?? r.RouteName ?? '',
            deliveryDate: r.deliveryDate ?? r.DeliveryDate ?? null,
            status,
            statusLabel: STATUS_MAP[status] ?? 'Draft',
            posted,
            postedLabel: posted ? 'Yes' : 'No'
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
          (r.doNumber ?? '').toLowerCase().includes(q) ||
          (r.salesOrderNo ?? '').toLowerCase().includes(q) ||
          this.getDriverName(r.driverId).toLowerCase().includes(q) ||
          (r.routeName ?? '').toLowerCase().includes(q) ||
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

  create(): void { this.router.navigate(['/app/sales/delivery-orders/new']); }

  edit(row: any): void { this.router.navigate(['/app/sales/delivery-orders', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private mapLine(l: any): any {
    const itemId = l.itemId ?? l.ItemId;
    const uomId = l.uomId ?? l.UomId ?? l.uom ?? l.Uom;
    const warehouseId = l.warehouseId ?? l.WarehouseId;
    return {
      itemCode: l.itemCode ?? l.ItemCode ?? this.itemCodeMap.get(Number(itemId)) ?? '',
      itemName: l.itemName ?? l.ItemName ?? '',
      uomName: l.uomName ?? l.UomName ?? this.uomMap.get(Number(uomId)) ?? '',
      qty: l.qty ?? l.Qty ?? 0,
      warehouseName: l.warehouseName ?? l.WarehouseName ?? this.warehouseMap.get(Number(warehouseId)) ?? '',
      binName: l.binName ?? l.BinName ?? l.binCode ?? l.BinCode ?? '',
      notes: l.notes ?? l.Notes ?? '',
    };
  }

  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getDeliveryOrderById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const hdr = d.header ?? d;
        const embedded = d.lines ?? d.Lines ?? hdr.lines ?? hdr.Lines ?? null;

        const finish = (rawLines: any[]) => {
          this.viewLines = (Array.isArray(rawLines) ? rawLines : []).map(l => this.mapLine(l));
          this.viewInfo = [
            { label: 'DO No', value: row.doNumber },
            { label: 'SO No', value: row.salesOrderNo || '—' },
            { label: 'Route', value: row.routeName || '—' },
            { label: 'Customer', value: hdr.customerName ?? hdr.CustomerName ?? '—' },
            { label: 'Delivery Date', value: this.fmtDate(row.deliveryDate) },
            { label: 'Status', value: row.statusLabel },
            { label: 'Posted', value: row.postedLabel },
          ];
          this.viewTotals = [];
          this.viewTitle = `Delivery Order Lines — ${row.doNumber}`;
          this.viewSubtitle = `SO: ${row.salesOrderNo || '—'} · Route: ${row.routeName || '—'}`;
          this.viewLoading = false;
          cb();
        };

        if (Array.isArray(embedded) && embedded.length) {
          finish(embedded);
        } else {
          this.svc.getDeliveryOrderLines(row.id).subscribe({
            next: lres => finish(this.svc.unwrap(lres)),
            error: () => finish([])
          });
        }
      },
      error: () => { this.viewLoading = false; cb(); }
    });
  }

  view(row: any): void { this.showView = true; this.buildDetail(row, () => {}); }

  print(row: any): void {
    this.buildDetail(row, () => {
      this.printSvc.print({
        docTitle: 'DELIVERY ORDER',
        docNo: this.activeRow?.doNumber ?? '',
        fields: this.viewInfo,
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
    this.svc.deleteDeliveryOrder(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
