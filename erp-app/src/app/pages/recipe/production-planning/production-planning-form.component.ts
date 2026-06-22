import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RecipeService } from '../recipe.service';
import { DropdownOption } from '../../../shared/components/dropdown/dropdown.component';

@Component({
  selector: 'erp-production-planning-form',
  standalone: false,
  templateUrl: './production-planning-form.component.html',
  styleUrls: ['./production-planning-form.component.scss']
})
export class ProductionPlanningFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';
  success = '';

  // Header
  salesOrderId: number | null = null;
  warehouseId: number | null = null;
  outletId = 0;
  status: number = 1;
  planDate = '';

  // Derived (read-only) tables
  planRows: any[] = [];
  ingredients: any[] = [];
  productionPlanId: number | null = null;

  // Dropdowns
  salesOrderOptions: DropdownOption[] = [];
  warehouseOptions: DropdownOption[] = [];

  loginUserId = Number(localStorage.getItem('id')) || null;

  constructor(
    private svc: RecipeService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    this.loadWarehouses();
    if (this.isEdit) {
      this.id = Number(paramId);
      this.loadSalesOrders(this.id ?? undefined);
      this.loadForEdit();
    } else {
      this.loadSalesOrders();
    }
  }

  loadWarehouses(): void {
    this.svc.getWarehouses().subscribe(r => {
      this.warehouseOptions = this.svc.unwrap(r).map((w: any) => ({
        label: w.warehouseName ?? w.name,
        value: w.id
      }));
    });
  }

  loadSalesOrders(includeSoId?: number): void {
    this.svc.getProductionSalesOrders(includeSoId).subscribe(r => {
      this.salesOrderOptions = this.svc.unwrap(r).map((so: any) => ({
        label: `${so.salesOrderNo ?? so.soNo} - ${so.status ?? ''}`,
        value: so.id,
        raw: so
      }));
    });
  }

  loadForEdit(): void {
    if (!this.id) return;
    this.loading = true;
    this.svc.getPlanById(this.id).subscribe({
      next: res => {
        const data = this.svc.unwrapOne(res) ?? {};
        const h = data.header ?? data.Header ?? data;

        this.productionPlanId = h.id ?? h.Id ?? this.id;
        this.salesOrderId = h.salesOrderId ?? h.SalesOrderId ?? null;
        this.warehouseId = h.warehouseId ?? h.WarehouseId ?? null;
        this.outletId = h.outletId ?? h.OutletId ?? 0;
        this.status = Number(h.status ?? h.Status ?? 1);
        if (![0, 1, 2, 8, 9].includes(this.status)) this.status = 1;
        this.planDate = h.planDate ? String(h.planDate).substring(0, 10) : this.today;

        const lines = (data.lines ?? data.Lines ?? data.planRows ?? []) as any[];
        this.planRows = lines.map((l: any) => ({
          recipeId: l.recipeId ?? l.RecipeId ?? null,
          finishedItemId: l.finishedItemId ?? l.FinishedItemId ?? null,
          recipeName: l.recipeName ?? l.finishedItemName ?? l.RecipeName ?? '',
          finishedItemName: l.finishedItemName ?? l.FinishedItemName ?? l.recipeName ?? '',
          plannedQty: l.plannedQty ?? l.PlannedQty ?? 0,
          expectedOutput: l.expectedOutput ?? l.ExpectedOutput ?? 0,
          batchQty: l.batchQty ?? l.BatchQty ?? 0,
          headerYieldPct: l.headerYieldPct ?? l.HeaderYieldPct ?? 0
        }));

        // Pull ingredient preview if we can
        if (this.salesOrderId && this.warehouseId) {
          this.fetchPlan(false);
        } else {
          this.ingredients = (data.ingredients ?? []).map((g: any) => this.mapIngredient(g));
          this.loading = false;
        }
      },
      error: err => { this.loading = false; this.error = err?.error?.message ?? 'Failed to load plan.'; }
    });
  }

  onSelectionChange(): void {
    if (this.salesOrderId && this.warehouseId) {
      this.fetchPlan(true);
    } else {
      this.planRows = [];
      this.ingredients = [];
    }
  }

  fetchPlan(showError: boolean): void {
    if (!this.salesOrderId || !this.warehouseId) return;
    this.loading = true;
    this.error = '';
    this.svc.getPlanBySo(this.salesOrderId, this.warehouseId).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res) ?? {};
        this.productionPlanId = d.productionPlanId ?? this.productionPlanId;
        const rows = (d.planRows ?? []) as any[];
        if (rows.length) {
          this.planRows = rows.map((l: any) => ({
            recipeId: l.recipeId ?? null,
            finishedItemId: l.finishedItemId ?? null,
            recipeName: l.recipeName ?? '',
            finishedItemName: l.finishedItemName ?? l.recipeName ?? '',
            plannedQty: l.plannedQty ?? 0,
            expectedOutput: l.expectedOutput ?? 0,
            batchQty: l.batchQty ?? 0,
            headerYieldPct: l.headerYieldPct ?? 0
          }));
        }
        this.ingredients = (d.ingredients ?? []).map((g: any) => this.mapIngredient(g));
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        if (showError) this.error = err?.error?.message ?? 'Failed to load plan.';
      }
    });
  }

  private mapIngredient(g: any): any {
    return {
      itemId: g.itemId ?? null,
      itemName: g.itemName ?? '',
      uom: g.uom ?? '',
      requiredQty: g.requiredQty ?? 0,
      availableQty: g.availableQty ?? 0,
      status: g.status ?? 'OK'
    };
  }

  get shortageCount(): number {
    return (this.ingredients || []).filter(i => (i?.status ?? '') !== 'OK').length;
  }

  save(): void {
    if (!this.salesOrderId || !this.warehouseId) {
      this.error = 'Please select Sales Order and Warehouse.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.svc.savePlan({
      salesOrderId: this.salesOrderId,
      warehouseId: this.warehouseId,
      outletId: this.outletId,
      createdBy: this.loginUserId
    }).subscribe({
      next: () => { this.saving = false; this.success = 'Production plan saved.'; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  setStatus(status: number): void {
    if (!this.id) return;
    this.saving = true;
    this.svc.updatePlanStatus(this.id, { status, updatedBy: this.loginUserId }).subscribe({
      next: () => { this.saving = false; this.status = status; this.success = 'Status updated.'; },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Status update failed.'; }
    });
  }

  getLabel(options: DropdownOption[], value: any): string {
    return options.find(o => String(o.value) === String(value))?.label ?? '';
  }

  back(): void { this.router.navigate(['/app/recipe/production-planning']); }

  get today(): string { return new Date().toISOString().substring(0, 10); }

  get title(): string { return this.isEdit ? 'View Production Plan' : 'New Production Plan'; }

  get statusLabel(): string {
    switch (Number(this.status)) {
      case 0: return 'Awaiting Material';
      case 1: return 'Pending';
      case 2: return 'Completed';
      case 8: return 'Deleted';
      case 9: return 'Cancelled';
      default: return 'Pending';
    }
  }

  get statusClass(): string {
    switch (Number(this.status)) {
      case 2: return 'approved';
      case 8:
      case 9: return 'rejected';
      default: return 'pending';
    }
  }
}
