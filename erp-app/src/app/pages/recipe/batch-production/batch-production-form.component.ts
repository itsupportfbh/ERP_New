import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RecipeService } from '../recipe.service';
import Swal from 'sweetalert2';

interface BatchLine {
  recipeId: number | null;
  finishedItemId: number | null;
  recipeName: string;
  finishedItemName: string;
  plannedQty: number;
  actualQty: number;
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
  posting = false;

  // Header
  productionPlanId: number | null = null;
  warehouseId: number | null = null;
  batchNo = '';
  status = 'Draft';
  postedDate = '';
  minPostedDate = '';

  lines: BatchLine[] = [];
  planOptions: any[] = [];

  // finishedItemId -> UOM name (resolved from item master)
  private uomByItem = new Map<number, string>();

  user = localStorage.getItem('username') || 'admin';

  constructor(
    private svc: RecipeService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.postedDate = this.getTodayLocalDate();
    this.minPostedDate = this.getTodayLocalDate();
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    // When opened from the "Plans ready" alert, preselect that production plan.
    if (!this.isEdit) {
      const planIdParam = Number(this.route.snapshot.queryParamMap.get('planId') || 0);
      if (planIdParam > 0) this.productionPlanId = planIdParam;
    }
    this.loadLookups();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
  }

  loadLookups(): void {
    this.svc.getItems().subscribe(r => {
      this.svc.unwrap(r).forEach((i: any) => {
        const uom = i.uomName ?? i.uom ?? '';
        if (i.id != null && uom) this.uomByItem.set(Number(i.id), uom);
      });
      // re-resolve UOM for any lines already loaded
      this.lines.forEach(l => { if (!l.uom) l.uom = this.uomByItem.get(Number(l.finishedItemId)) ?? ''; });
    });
    this.svc.getProductionPlans().subscribe(r => {
      // Only Pending plans (status 1) are eligible for batch production.
      // Plans still "Awaiting Material" (status 0) must not appear.
      // In edit mode keep the already-selected plan even if its status changed.
      this.planOptions = this.svc.unwrap(r)
        .filter((p: any) => {
          const st = Number(p.status ?? p.Status ?? 0);
          const pid = Number(p.id ?? p.iD ?? 0);
          if (st === 1) return true;
          if (this.productionPlanId && pid === Number(this.productionPlanId)) return true;
          return false;
        })
        .map((p: any) => ({
          label: `${p.productionPlanNo ?? p.id} - ${p.salesOrderNo ?? ''}`,
          value: p.id,
          raw: p
        }));
      // if edit loaded the plan id before options arrived, apply lines now
      if (this.productionPlanId && !this.lines.length) this.applyPlanLines(this.productionPlanId);
    });
  }

  private resolveUom(l: any): string {
    return l.uom ?? l.uomName ?? this.uomByItem.get(Number(l.finishedItemId)) ?? '';
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
        if (header.postedDate) this.postedDate = this.formatDateForInput(header.postedDate);

        this.lines = (Array.isArray(lines) ? lines : []).map((l: any) => ({
          recipeId: l.recipeId ?? null,
          finishedItemId: l.finishedItemId ?? null,
          recipeName: l.recipeName ?? l.finishedItemName ?? '',
          finishedItemName: l.finishedItemName ?? l.recipeName ?? '',
          plannedQty: Number(l.plannedQty ?? 0),
          actualQty: Number(l.actualQty ?? l.plannedQty ?? 0),
          uom: this.resolveUom(l)
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPlanChange(): void {
    if (!this.productionPlanId) { this.lines = []; return; }
    this.applyPlanLines(this.productionPlanId);
  }

  private applyPlanLines(planId: number): void {
    const found = this.planOptions.find(o => Number(o.value) === Number(planId));
    if (!found) { this.lines = []; return; }
    const plan = found.raw ?? {};
    if (plan.warehouseId != null) this.warehouseId = plan.warehouseId;

    const plines = plan.lines ?? plan.Lines ?? [];
    this.lines = (Array.isArray(plines) ? plines : []).map((l: any) => ({
      recipeId: l.recipeId ?? null,
      finishedItemId: l.finishedItemId ?? null,
      recipeName: l.recipeName ?? l.finishedItemName ?? '',
      finishedItemName: l.finishedItemName ?? l.recipeName ?? '',
      plannedQty: Number(l.plannedQty ?? 0),
      actualQty: Number(l.plannedQty ?? 0),
      uom: this.resolveUom(l)
    }));
  }

  onActualChange(i: number, value: any): void {
    const n = Number(value);
    this.lines[i].actualQty = isNaN(n) ? 0 : n;
  }

  variance(l: BatchLine): number { return (l.actualQty ?? 0) - (l.plannedQty ?? 0); }

  varClass(l: BatchLine): string {
    const v = this.variance(l);
    if (v === 0) return 'ok';
    return v < 0 ? 'neg' : 'pos';
  }

  get varianceCount(): number {
    return (this.lines || []).filter(x => Math.abs((x.actualQty ?? 0) - (x.plannedQty ?? 0)) > 0).length;
  }

  get isPosted(): boolean { return (this.status || '').toLowerCase() === 'posted'; }

  canPost(): boolean { return !!this.productionPlanId && this.lines.length > 0 && !this.isPosted && !this.posting; }

  postToInventory(): void {
    if (!this.productionPlanId || !this.lines.length) return;
    if (!this.warehouseId) { void Swal.fire('Error', 'Warehouse not found in selected production plan.', 'error'); return; }

    void Swal.fire({
      title: 'Post & Save?',
      text: 'This will save the batch and reduce ingredient stock.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, post'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.posting = true;
      const payload = {
        id: this.isEdit ? this.id : null,
        productionPlanId: this.productionPlanId,
        warehouseId: this.warehouseId,
        batchNo: this.batchNo || null,
        status: 'Posted',
        postedDate: this.postedDate,
        userId: Number(localStorage.getItem('id') || localStorage.getItem('userId') || 0),
        user: this.user,
        lines: this.lines.map(l => ({
          recipeId: l.recipeId,
          finishedItemId: l.finishedItemId,
          plannedQty: l.plannedQty,
          actualQty: l.actualQty,
          recipeName: l.recipeName,
          finishedItemName: l.finishedItemName
        }))
      };

      this.svc.postBatch(payload).subscribe({
        next: () => {
          this.posting = false;
          this.status = 'Posted';
          void Swal.fire({ icon: 'success', title: 'Posted', text: 'Batch saved and inventory updated', timer: 1500, showConfirmButton: false })
            .then(() => this.back());
        },
        error: err => {
          this.posting = false;
          void Swal.fire('Error', err?.error?.message ?? 'Post failed.', 'error');
        }
      });
    });
  }

  cancel(): void { this.back(); }
  back(): void { this.router.navigate(['/app/recipe/batch-production']); }

  private getTodayLocalDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  private formatDateForInput(v: any): string {
    const d = new Date(v);
    if (isNaN(d.getTime())) return this.getTodayLocalDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
