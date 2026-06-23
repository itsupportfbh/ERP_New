import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RecipeService } from '../recipe.service';

interface RecipeLine {
  ingredientItemId: number | null;
  ingredientName: string;
  qty: number | null;
  uomId: number | null;
  uom: string;
  yieldPct: number | null;
  unitCost: number | null;
  remarks: string;
}

@Component({
  selector: 'erp-recipe-master-form',
  standalone: false,
  templateUrl: './recipe-master-form.component.html',
  styleUrls: ['./recipe-master-form.component.scss']
})
export class RecipeMasterFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  step = 1;
  loading = false;
  saving = false;
  error = '';
  success = '';

  // Header
  code = '';
  finishedItemId: number | null = null;
  cuisine = '';
  status = 'Active';
  notes = '';

  // Lines
  lines: RecipeLine[] = [];

  // Add-line modal
  showLineModal = false;
  lineError = '';
  editingIndex: number | null = null;
  lineModal: RecipeLine = this.blankLine();

  private blankLine(): RecipeLine {
    return { ingredientItemId: null, ingredientName: '', qty: null, uomId: null, uom: '', yieldPct: 100, unitCost: null, remarks: '' };
  }

  // Dropdowns
  itemOptions: any[] = [];
  uomOptions: any[] = [];
  statusOptions: any[] = [
    { label: 'Active', value: 'Active' },
    { label: 'Inactive', value: 'Inactive' },
    { label: 'Draft', value: 'Draft' }
  ];
  cuisineOptions: any[] = [
    { label: 'South Indian', value: 'South Indian' },
    { label: 'North Indian', value: 'North Indian' },
    { label: 'Chinese', value: 'Chinese' },
    { label: 'Western', value: 'Western' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;

  constructor(
    private svc: RecipeService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    this.loadLookups();
  }

  loadLookups(): void {
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: `${i.itemCode ?? ''} - ${i.itemName ?? i.name}`, value: i.id, raw: i
      })));
    this.svc.getUOMs().subscribe(r =>
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.uomName ?? u.name, value: u.id
      })));
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getRecipeById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.code = d.code ?? d.recipeCode ?? '';
        this.finishedItemId = d.finishedItemId ?? null;
        this.cuisine = d.cuisine ?? '';
        this.status = d.status ?? 'Draft';
        this.notes = d.notes ?? '';

        const rawLines = d.ingredients ?? d.ingredientLines ?? [];
        const parsed: any[] = Array.isArray(rawLines) ? rawLines : [];
        this.lines = parsed.map((l: any) => ({
          ingredientItemId: l.ingredientItemId ?? null,
          ingredientName: l.ingredientItemName ?? l.ingredientName ?? '',
          qty: l.qty ?? null,
          uomId: l.uomId ?? null,
          uom: l.uom ?? l.uomName ?? '',
          yieldPct: l.yieldPct ?? 100,
          unitCost: l.unitCost ?? null,
          remarks: l.remarks ?? ''
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  addLine(): void {
    this.lines.push({
      ingredientItemId: null, ingredientName: '',
      qty: null, uomId: null, uom: '',
      yieldPct: 100, unitCost: null, remarks: ''
    });
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  // ── Add-line modal ───────────────────────────────────
  openLineModal(): void { this.editingIndex = null; this.lineModal = this.blankLine(); this.lineError = ''; this.showLineModal = true; }
  editLine(i: number): void { this.editingIndex = i; this.lineModal = { ...this.lines[i] }; this.lineError = ''; this.showLineModal = true; }
  closeLineModal(): void { this.showLineModal = false; this.editingIndex = null; }

  get isEditingLine(): boolean { return this.editingIndex !== null; }

  onModalItemSelect(): void { this.onItemSelect(this.lineModal); }
  onModalUomSelect(): void { this.onUomSelect(this.lineModal); }

  rowCostModal(): number { return this.rowCost(this.lineModal); }

  private commitModalLine(): boolean {
    if (!this.lineModal.ingredientItemId) { this.lineError = 'Please select an item.'; return false; }
    if (!this.lineModal.qty || this.lineModal.qty <= 0) { this.lineError = 'Quantity must be greater than 0.'; return false; }
    this.lineError = '';
    if (this.editingIndex !== null) {
      this.lines[this.editingIndex] = { ...this.lineModal };
      this.editingIndex = null;
    } else {
      this.lines.push({ ...this.lineModal });
    }
    return true;
  }
  addAnother(): void { if (this.commitModalLine()) { this.lineModal = this.blankLine(); } }
  addAndClose(): void { if (this.commitModalLine()) { this.showLineModal = false; } }

  onItemSelect(line: RecipeLine): void {
    const found = this.itemOptions.find(o => o.value === line.ingredientItemId);
    if (found?.raw) {
      const raw = found.raw;
      line.ingredientName = raw.itemName ?? found.label;
      const cost = raw.standardCost ?? raw.unitCost ?? raw.price;
      if (cost != null) line.unitCost = cost;
    }
  }

  onUomSelect(line: RecipeLine): void {
    line.uom = this.getLabel(this.uomOptions, line.uomId);
  }

  rowCost(line: RecipeLine): number {
    const qty = line.qty ?? 0;
    const unitCost = line.unitCost ?? 0;
    const y = Math.max(Math.min(line.yieldPct ?? 100, 100), 0);
    return y > 0 ? (qty * unitCost) / (y / 100) : qty * unitCost;
  }

  get totalCost(): number {
    return this.lines.reduce((sum, l) => sum + this.rowCost(l), 0);
  }

  next(): void {
    if (this.step === 1) {
      if (!this.finishedItemId) { this.error = 'Please select a Finished Item.'; return; }
      this.error = '';
      this.step = 2;
    } else if (this.step === 2) {
      if (!this.lines.length) { this.error = 'Please add at least one ingredient.'; return; }
      this.error = '';
      this.step = 3;
    }
  }

  prev(): void { this.step = Math.max(1, this.step - 1); this.error = ''; }

  private buildPayload(): any {
    return {
      code: this.code,
      finishedItemId: Number(this.finishedItemId),
      cuisine: this.cuisine,
      status: this.status,
      notes: this.notes,
      ingredients: this.lines.map(l => ({
        ingredientItemId: Number(l.ingredientItemId),
        qty: Number(l.qty ?? 0),
        uomId: l.uomId,
        uom: l.uom,
        yieldPct: Number(l.yieldPct ?? 100),
        unitCost: Number(l.unitCost ?? 0),
        remarks: l.remarks
      }))
    };
  }

  submit(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    const payload = this.buildPayload();

    const obs$ = this.isEdit && this.id != null
      ? this.svc.updateRecipe(this.id, payload)
      : this.svc.createRecipe(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed. Please try again.'; }
    });
  }

  back(): void { this.router.navigate(['/app/recipe/recipes']); }

  getLabel(opts: any[], val: any): string {
    return opts.find(o => o.value === val)?.label ?? '';
  }

  get statusLabel(): string { return this.status || 'Draft'; }

  get title(): string {
    return this.isEdit
      ? `Edit Recipe${this.code ? ' – ' + this.code : ''}`
      : 'New Recipe';
  }
  get today(): string { return new Date().toISOString().substring(0, 10); }
}
