import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RecipeService } from '../recipe.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import Swal from 'sweetalert2';

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
    { header: 'Actual Produced', key: 'actualQty', align: 'right', type: 'qty' },
  ];

  // finishedItemId -> UOM name (resolved from item master)
  private uomByItem = new Map<number, string>();

  user = localStorage.getItem('username') || 'admin';

  constructor(private svc: RecipeService, private router: Router, private printSvc: DocumentPrintService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => {
      const uom = i.uomName ?? i.uom ?? '';
      if (i.id != null && uom) this.uomByItem.set(Number(i.id), uom);
    }));
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
          planDate: r.planDate ?? null,
          postedDate: r.postedDate ?? null,
          outletName: r.name ?? r.outletName ?? r.outlet ?? '',
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
          String(r.outletName ?? '').toLowerCase().includes(q) ||
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

  /** Posted batches are locked from edit/delete. */
  isPosted(row: any): boolean { return String(row?.status ?? '').trim().toLowerCase() === 'posted'; }

  // ── Food Preparation ──────────────────────────────────
  isFoodPrepDone(row: any): boolean { return Number(row?.foodPrepStatus ?? 1) === 2; }
  foodPrepTooltip(row: any): string { return this.isFoodPrepDone(row) ? 'Food Prep Done' : 'Mark Food Prep Completed'; }

  openFoodPrep(row: any): void {
    const id = Number(row?.id || 0);
    if (!id) return;
    if (this.isFoodPrepDone(row)) { void Swal.fire('Info', 'Food Preparation already completed.', 'info'); return; }

    void Swal.fire({
      title: 'Complete Food Preparation',
      html: `
        <div style="text-align:left;font-size:13px;color:#1a3038;">
          <div style="margin-bottom:8px;"><b>Batch:</b> ${row?.batchNo || '-'} &nbsp;·&nbsp; <b>Plan:</b> ${row?.productionPlanNo || '-'}</div>
          <label style="display:block;font-size:12px;color:#5a8290;margin-bottom:4px;">Remarks (optional)</label>
          <textarea id="fpRemarks" rows="4" style="width:100%;border:1px solid #cce8ed;border-radius:8px;padding:8px;font-size:13px;outline:none;" placeholder="Type remarks..."></textarea>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Submit',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#16a34a',
      focusConfirm: false,
      preConfirm: () => ({ remarks: (document.getElementById('fpRemarks') as HTMLTextAreaElement)?.value || '' })
    }).then(res => {
      if (!res.isConfirmed) return;
      this.svc.updateFoodPrepStatus(id, { status: 2, remarks: res.value?.remarks || '', user: this.user }).subscribe({
        next: () => { void Swal.fire({ icon: 'success', title: 'Success', text: 'Food Preparation marked as Completed', timer: 1500, showConfirmButton: false }); this.load(); },
        error: () => { void Swal.fire('Error', 'Failed to update food preparation.', 'error'); }
      });
    });
  }

  create(): void { this.router.navigate(['/app/recipe/batch-production/new']); }

  edit(row: any): void { if (this.isPosted(row)) return; this.router.navigate(['/app/recipe/batch-production', row.id]); }

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
          uom: l.uom ?? l.uomName ?? this.uomByItem.get(Number(l.finishedItemId)) ?? '',
          plannedQty: l.plannedQty ?? 0,
          actualQty: l.actualQty ?? l.plannedQty ?? 0,
          expectedOutput: l.expectedOutput ?? 0,
        }));
        this.viewInfo = [
          { label: 'Batch No', value: header.batchNo ?? row.batchNo ?? '—' },
          { label: 'Production Plan', value: header.productionPlanNo ?? row.productionPlanNo ?? '—' },
          { label: 'Status', value: header.status ?? row.status ?? '—' },
          { label: 'Created Date', value: this.fmtDate(header.createdDate ?? row.createdDate) },
        ];
        this.viewTotals = [];
        this.viewTitle = `Batch Lines — ${row.batchNo}`;
        this.viewSubtitle = `Plan: ${row.productionPlanNo || '—'}`;
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

  openDelete(row: any): void { if (this.isPosted(row)) return; this.itemToDelete = row; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.svc.deleteBatch(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
