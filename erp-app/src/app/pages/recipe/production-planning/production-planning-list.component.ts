import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RecipeService } from '../recipe.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';

@Component({
  selector: 'erp-production-planning-list',
  standalone: false,
  templateUrl: './production-planning-list.component.html',
  styleUrls: ['./production-planning-list.component.scss']
})
export class ProductionPlanningListComponent implements OnInit {
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
    { header: 'Planned Qty', key: 'plannedQtyDisp', align: 'right' },
    { header: 'Available', key: 'availableQtyDisp', align: 'right' },
    { header: 'Shortage', key: 'shortageQtyDisp', align: 'right' },
  ];

  constructor(private svc: RecipeService, private router: Router, private printSvc: DocumentPrintService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.svc.getProductionPlans().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          const statusLabel = this.statusLabel(r.status);
          return {
            ...r,
            id: r.id ?? r.iD,
            productionPlanNo: r.productionPlanNo ?? r.id ?? r.iD,
            salesOrderNo: r.salesOrderNo ?? r.soNo ?? '',
            planDate: r.planDate ?? null,
            statusLabel,
            statusCls: this.statusCls(statusLabel),
            totalShortage: r.totalShortage ?? 0,
          };
        });
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  statusLabel(v: any): string {
    if (typeof v === 'string' && v.trim() && isNaN(Number(v))) return v;
    const n = Number(v);
    switch (n) {
      case 0: return 'Awaiting Material';
      case 1: return 'Pending';
      case 2: return 'Completed';
      case 8: return 'Deleted';
      case 9: return 'Cancelled';
      default: return 'Pending';
    }
  }

  statusCls(label: string): number {
    switch (label) {
      case 'Pending': return 1;
      case 'Awaiting Material': return 1;
      case 'Completed': return 2;
      case 'Cancelled': return 3;
      case 'Deleted': return 3;
      default: return 0;
    }
  }

  applyFilter(): void {
    const q = this.searchText.trim().toLowerCase();
    let list = q
      ? this.rows.filter(r =>
          String(r.productionPlanNo ?? '').toLowerCase().includes(q) ||
          (r.salesOrderNo ?? '').toLowerCase().includes(q) ||
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

  create(): void { this.router.navigate(['/app/recipe/production-planning/new']); }

  edit(row: any): void { this.router.navigate(['/app/recipe/production-planning', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getPlanById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res) ?? {};
        const h = d.header ?? d.Header ?? d;
        const planDate = h.planDate ?? h.PlanDate ?? h.createdDate ?? h.CreatedDate ?? row.planDate ?? null;
        const soId = h.salesOrderId ?? h.SalesOrderId ?? null;
        const whId = h.warehouseId ?? h.WarehouseId ?? null;

        const finalize = () => {
          const totalPlanned = this.viewLines.reduce((s, l) => s + (+l.plannedQty || 0), 0);
          const totalShortage = this.viewLines.reduce((s, l) => s + (+l.shortageQty || 0), 0);
          this.viewInfo = [
            { label: 'Plan No', value: row.productionPlanNo },
            { label: 'SO No', value: row.salesOrderNo || '—' },
            { label: 'Plan Date', value: this.fmtDate(planDate) },
            { label: 'Status', value: row.statusLabel },
          ];
          this.viewTotals = [
            { label: 'Total Planned', value: totalPlanned.toFixed(2) },
            { label: 'Total Shortage', value: totalShortage.toFixed(2) },
          ];
          this.viewTitle = `Production Plan — ${row.productionPlanNo}`;
          this.viewSubtitle = `SO No: ${row.salesOrderNo || '—'} · Status: ${row.statusLabel}`;
          this.viewLoading = false;
          cb();
        };

        const rawIngredients = d.ingredients ?? d.Ingredients ?? [];
        if (Array.isArray(rawIngredients) && rawIngredients.length) {
          this.viewLines = rawIngredients.map((l: any) => this.mapViewLine(l));
          finalize();
          return;
        }

        // Detail has no ingredient lines → compute them from the plan's SO + warehouse.
        if (soId && whId) {
          this.svc.getPlanBySo(soId, whId).subscribe({
            next: r2 => {
              const d2 = this.svc.unwrapOne(r2) ?? {};
              const ing = d2.ingredients ?? d2.Ingredients ?? [];
              this.viewLines = (Array.isArray(ing) ? ing : []).map((l: any) => this.mapViewLine(l));
              finalize();
            },
            error: () => { this.viewLines = []; finalize(); }
          });
        } else {
          finalize();
        }
      },
      error: () => { this.viewLoading = false; cb(); }
    });
  }

  private mapViewLine(l: any): any {
    const required = +(l.requiredQty ?? l.RequiredQty ?? l.plannedQty ?? 0) || 0;
    const available = +(l.availableQty ?? l.AvailableQty ?? 0) || 0;
    const shortage = Math.max(0, required - available);
    const uom = l.uom ?? l.uomName ?? l.Uom ?? '';
    const qtyUom = l.baseUomName ?? l.BaseUomName ?? l.baseUom ?? uom ?? '';
    const suffix = qtyUom ? ' ' + qtyUom : '';
    return {
      itemName: l.itemName ?? l.ItemName ?? '',
      uomName: uom || qtyUom,
      plannedQty: required,
      availableQty: available,
      shortageQty: shortage,
      plannedQtyDisp: this.fmtNum(required) + suffix,
      availableQtyDisp: this.fmtNum(available) + suffix,
      shortageQtyDisp: this.fmtNum(shortage) + suffix,
    };
  }

  private fmtNum(n: number): string {
    return (Math.round((+n || 0) * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 });
  }

  view(row: any): void { this.showView = true; this.buildDetail(row, () => {}); }

  print(row: any): void {
    this.buildDetail(row, () => {
      this.printSvc.print({
        docTitle: 'PRODUCTION PLAN',
        docNo: String(this.activeRow?.productionPlanNo ?? ''),
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
    this.svc.deletePlan(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
