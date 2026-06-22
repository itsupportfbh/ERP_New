import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RecipeService } from '../recipe.service';

interface BatchLine {
  recipeId: number | null;
  finishedItemId: number | null;
  recipeName: string;
  finishedItemName: string;
  plannedQty: number | null;
  actualQty: number | null;
  expectedOutput: number | null;
  uom: string;
}

@Component({
  selector: 'erp-batch-production-form',
  standalone: false,
  templateUrl: './batch-production-form.component.html',
  styleUrls: ['./batch-production-form.component.scss']
})
export class BatchProductionFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  posting = false;
  error = '';
  success = '';

  // Header
  productionPlanId: number | null = null;
  warehouseId: number | null = null;
  batchNo = '';
  status = 'Draft';

  // Lines
  lines: BatchLine[] = [];

  // Dropdowns
  planOptions: any[] = [];
  warehouseOptions: any[] = [];

  user = localStorage.getItem('username') || 'admin';

  constructor(
    private svc: RecipeService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    this.loadLookups();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
  }

  loadLookups(): void {
    this.svc.getProductionPlans().subscribe(r => {
      this.planOptions = this.svc.unwrap(r).map((p: any) => ({
        label: `${p.productionPlanNo ?? p.id} - ${p.salesOrderNo ?? ''}`,
        value: p.id,
        raw: p
      }));
    });
    this.svc.getWarehouses().subscribe(r => {
      this.warehouseOptions = this.svc.unwrap(r).map((w: any) => ({ label: w.warehouseName ?? w.name, value: w.id }));
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getBatchById(this.id!).subscribe({
      next: res => {
        const dto = this.svc.unwrapOne(res);
        const header = dto?.header ?? dto?.Header ?? dto ?? {};
        const lines = dto?.lines ?? dto?.Lines ?? [];

        this.productionPlanId = header.productionPlanId ?? null;
        this.warehouseId = header.warehouseId ?? null;
        this.batchNo = header.batchNo ?? '';
        this.status = header.status ?? 'Draft';

        this.lines = (Array.isArray(lines) ? lines : []).map((l: any) => ({
          recipeId: l.recipeId ?? null,
          finishedItemId: l.finishedItemId ?? null,
          recipeName: l.recipeName ?? l.finishedItemName ?? '',
          finishedItemName: l.finishedItemName ?? l.recipeName ?? '',
          plannedQty: l.plannedQty ?? 0,
          actualQty: l.actualQty ?? l.plannedQty ?? 0,
          expectedOutput: l.expectedOutput ?? 0,
          uom: l.uom ?? ''
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPlanChange(): void {
    const found = this.planOptions.find(o => o.value === this.productionPlanId);
    if (!found) { this.lines = []; return; }
    const plan = found.raw ?? {};
    // Adopt warehouse from plan when present
    if (plan.warehouseId != null) this.warehouseId = plan.warehouseId;

    const plines = plan.lines ?? plan.Lines ?? [];
    this.lines = (Array.isArray(plines) ? plines : []).map((l: any) => ({
      recipeId: l.recipeId ?? null,
      finishedItemId: l.finishedItemId ?? null,
      recipeName: l.recipeName ?? l.finishedItemName ?? '',
      finishedItemName: l.finishedItemName ?? l.recipeName ?? '',
      plannedQty: l.plannedQty ?? 0,
      actualQty: l.plannedQty ?? 0,
      expectedOutput: l.expectedOutput ?? 0,
      uom: l.uom ?? ''
    }));
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  save(): void {
    this.error = '';
    this.success = '';
    if (!this.productionPlanId) { this.error = 'Please select a production plan.'; return; }
    if (!this.warehouseId) { this.error = 'Please select a warehouse.'; return; }

    this.saving = true;
    const payload: any = {
      id: this.isEdit ? this.id : null,
      productionPlanId: this.productionPlanId,
      warehouseId: this.warehouseId,
      batchNo: this.batchNo || null,
      status: this.status || 'Draft',
      user: this.user,
      lines: this.lines.map(l => ({
        recipeId: l.recipeId,
        finishedItemId: l.finishedItemId,
        plannedQty: l.plannedQty ?? 0,
        actualQty: l.actualQty ?? 0,
        recipeName: l.recipeName,
        finishedItemName: l.finishedItemName,
        uom: l.uom,
        expectedOutput: l.expectedOutput ?? 0
      }))
    };

    const obs$ = this.isEdit ? this.svc.updateBatch(payload) : this.svc.createBatch(payload);
    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  postToInventory(): void {
    if (!this.id) return;
    if (!confirm('Post this batch to inventory?')) return;
    this.posting = true;
    this.error = '';
    this.success = '';
    this.svc.postBatch({ batchId: this.id, postedBy: this.user }).subscribe({
      next: () => {
        this.posting = false;
        this.success = 'Batch posted to inventory.';
        this.status = 'Posted';
        this.loadForEdit();
      },
      error: err => { this.posting = false; this.error = err?.error?.message ?? 'Post failed.'; }
    });
  }

  back(): void { this.router.navigate(['/app/recipe/batch-production']); }

  get title(): string { return this.isEdit ? 'View / Edit Batch' : 'New Batch Production'; }

  get statusClass(): string {
    const s = (this.status || '').toLowerCase();
    if (s === 'posted' || s === 'completed') return 'approved';
    if (s === 'rejected') return 'rejected';
    return 'pending';
  }
}
