import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RecipeService } from '../recipe.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';

const FOOD_PREP_MAP: Record<number, string> = { 1: 'Pending', 2: 'Completed' };

const STATUS_CLASS_MAP: Record<string, number> = {
  Draft: 0, Pending: 1, Completed: 2, Posted: 4, Rejected: 3
};

@Component({
  selector: 'erp-batch-production-list',
  standalone: false,
  templateUrl: './batch-production-list.component.html',
  styleUrls: ['./batch-production-list.component.scss']
})
export class BatchProductionListComponent implements OnInit {
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
    { header: 'Recipe / Item', key: 'finishedItemName' },
    { header: 'UOM', key: 'uom', align: 'center' },
    { header: 'Planned Qty', key: 'plannedQty', align: 'right', type: 'qty' },
    { header: 'Actual Qty', key: 'actualQty', align: 'right', type: 'qty' },
    { header: 'Expected Output', key: 'expectedOutput', align: 'right', type: 'qty' },
  ];

  constructor(private svc: RecipeService, private router: Router, private printSvc: DocumentPrintService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.svc.getBatches().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          batchNo: r.batchNo ?? r.id,
          productionPlanNo: r.productionPlanNo ?? r.productionPlanId ?? '',
          warehouseName: r.warehouseName ?? r.warehouse ?? '',
          status: r.status ?? 'Draft',
          foodPrepLabel: FOOD_PREP_MAP[Number(r.foodPrepStatus)] ?? '',
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
          String(r.batchNo ?? '').toLowerCase().includes(q) ||
          String(r.productionPlanNo ?? '').toLowerCase().includes(q) ||
          String(r.warehouseName ?? '').toLowerCase().includes(q) ||
          String(r.status ?? '').toLowerCase().includes(q))
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

  statusClass(status: string): number { return STATUS_CLASS_MAP[status] ?? 0; }

  create(): void { this.router.navigate(['/app/recipe/batch-production/new']); }

  edit(row: any): void { this.router.navigate(['/app/recipe/batch-production', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getBatchById(row.id).subscribe({
      next: res => {
        const dto = this.svc.unwrapOne(res);
        const header = dto?.header ?? dto?.Header ?? dto ?? {};
        const rawLines = dto?.lines ?? dto?.Lines ?? [];
        this.viewLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => ({
          finishedItemName: l.finishedItemName ?? l.recipeName ?? '',
          uom: l.uom ?? '',
          plannedQty: l.plannedQty ?? 0,
          actualQty: l.actualQty ?? l.plannedQty ?? 0,
          expectedOutput: l.expectedOutput ?? 0,
        }));
        this.viewInfo = [
          { label: 'Batch No', value: header.batchNo ?? row.batchNo ?? '—' },
          { label: 'Production Plan', value: header.productionPlanNo ?? row.productionPlanNo ?? '—' },
          { label: 'Warehouse', value: header.warehouseName ?? row.warehouseName ?? '—' },
          { label: 'Status', value: header.status ?? row.status ?? '—' },
          { label: 'Created Date', value: this.fmtDate(header.createdDate ?? row.createdDate) },
        ];
        this.viewTotals = [];
        this.viewTitle = `Batch Lines — ${row.batchNo}`;
        this.viewSubtitle = `Plan: ${row.productionPlanNo || '—'} · Warehouse: ${row.warehouseName || '—'}`;
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
        docTitle: 'BATCH PRODUCTION',
        docNo: this.activeRow?.batchNo ?? '',
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

  openDelete(row: any): void { this.itemToDelete = row; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.svc.deleteBatch(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
