import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import { PermissionService } from '../../../core/services/permission.service';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Picked', 2: 'Packed', 3: 'Closed' };

@Component({
  selector: 'erp-picking-list',
  standalone: false,
  templateUrl: './picking-list.component.html',
  styleUrls: ['./picking-list.component.scss']
})
export class PickingListComponent implements OnInit {
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
  private binMap = new Map<number, string>();
  private itemUomIdMap = new Map<number, number>();
  private itemUomNameMap = new Map<number, string>();

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
    { header: 'Ordered Qty', key: 'orderedQty', align: 'right', type: 'qty' },
    { header: 'Picked Qty', key: 'pickedQty', align: 'right', type: 'qty' },
    { header: 'Warehouse', key: 'warehouseName' },
  ];

  readonly fnId = 'sales-pp-list';
  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService, public perm: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getUOMs().subscribe(r => this.svc.unwrap(r).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? '')));
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => {
      const id = Number(i.id);
      if (i.itemCode) this.itemCodeMap.set(id, i.itemCode);
      const uomId = Number(i.uomId ?? i.UomId ?? i.baseUomId ?? 0);
      if (uomId) this.itemUomIdMap.set(id, uomId);
      const un = i.uomName ?? i.UomName ?? i.uom ?? '';
      if (un) this.itemUomNameMap.set(id, un);
    }));
    this.svc.getWarehouses().subscribe(r => this.svc.unwrap(r).forEach((w: any) => this.warehouseMap.set(Number(w.id), w.warehouseName ?? w.name ?? '')));
  }

  load(): void {
    this.loading = true;
    this.svc.getPackings().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          const statusRaw = Number(r.status ?? r.approvalStatus ?? r.ApprovalStatus ?? 0);
          const status = STATUS_MAP[statusRaw] ? statusRaw : 0;
          return {
            ...r,
            id: r.id ?? r.iD ?? r.Id,
            pickNo: r.pickingNo ?? r.pickNo ?? r.pickingNumber ?? '',
            salesOrderNo: r.salesOrderNo ?? r.soNo ?? '',
            customerName: r.customerName ?? r.CustomerName ?? '',
            requestedDate: r.soDate ?? r.requestedDate ?? r.SoDate ?? null,
            deliveryDate: r.deliveryDate ?? r.DeliveryDate ?? null,
            pickDate: r.pickDate ?? r.soDate ?? r.createdDate ?? null,
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
          (r.pickNo ?? '').toLowerCase().includes(q) ||
          (r.salesOrderNo ?? '').toLowerCase().includes(q) ||
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

  create(): void { this.router.navigate(['/app/sales/picking/new']); }

  edit(row: any): void { this.router.navigate(['/app/sales/picking', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private parseLines(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
      catch { return []; }
    }
    return [];
  }

  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getPackingById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const rawLines = this.parseLines(d.pickLines ?? d.lineItems ?? d.lines ?? d.salesOrderLines);
        const baseLines = rawLines.map((l: any) => {
          const itemId = Number(l.itemId ?? l.ItemId ?? 0);
          const uomName = l.uom ?? l.Uom ?? l.uomName
            ?? this.itemUomNameMap.get(itemId)
            ?? this.uomMap.get(Number(this.itemUomIdMap.get(itemId)))
            ?? '';
          const qty = +(l.quantity ?? l.Quantity ?? l.qty ?? 0) || 0;
          return {
            itemId,
            itemCode: l.itemCode ?? this.itemCodeMap.get(itemId) ?? '',
            itemName: l.itemName ?? l.ItemName ?? '',
            uomName,
            orderedQty: l.orderedQty ?? qty,
            pickedQty: l.pickedQty ?? qty,
            warehouseName: l.warehouseName ?? l.WarehouseName ?? this.warehouseMap.get(Number(l.warehouseId ?? l.WarehouseId)) ?? '',
            binName: l.bin ?? l.Bin ?? l.binName ?? l.binCode ?? '',
          };
        });
        const customer = row.customerName || d.customerName || '—';
        const soId = d.soId ?? d.SoId ?? row.soId ?? row.SoId;
        // Package name/qty come from the source SO's item sets → group children under the header.
        this.svc.getSourceSoItemSets({ soId }).subscribe(itemSets => {
          this.svc.groupViewLinesByPackage(baseLines, itemSets, (s: any) => {
            const setQty = +(s.qty ?? s.Qty ?? 0) || 0;
            return {
              itemId: 0,
              itemCode: '',
              itemName: s.setName ?? s.SetName ?? 'Package',
              uomName: '',
              orderedQty: setQty,
              pickedQty: setQty,
              warehouseName: '',
              binName: '',
            };
          }).subscribe(grouped => {
            this.viewLines = grouped;
            this.viewInfo = [
              { label: 'SO Number', value: row.salesOrderNo || '—' },
              { label: 'Customer', value: customer },
              { label: 'Requested Date', value: this.fmtDate(row.requestedDate) },
              { label: 'Delivery Date', value: this.fmtDate(row.deliveryDate) },
              { label: 'Status', value: row.statusLabel },
            ];
            this.viewTotals = [];
            this.viewTitle = `Picking / Packing Lines — ${row.salesOrderNo || ''}`;
            this.viewSubtitle = `Customer: ${customer} · Sales Order: ${row.salesOrderNo || '—'}`;
            this.viewLoading = false;
            cb();
          });
        });
      },
      error: () => { this.viewLoading = false; cb(); }
    });
  }

  view(row: any): void { this.showView = true; this.buildDetail(row, () => {}); }

  print(row: any): void {
    this.buildDetail(row, () => {
      this.printSvc.print({
        docTitle: 'PICKING / PACKING',
        docNo: this.activeRow?.pickNo ?? '',
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
    this.svc.deletePacking(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
