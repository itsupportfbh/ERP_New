import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RecipeService } from '../recipe.service';
import { DocumentPrintService, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import Swal from 'sweetalert2';

const STATUS_CLASS: Record<string, number> = { Draft: 0, Inactive: 1, Active: 2 };

@Component({
  selector: 'erp-recipe-master-list',
  standalone: false,
  templateUrl: './recipe-master-list.component.html',
  styleUrls: ['./recipe-master-list.component.scss']
})
export class RecipeMasterListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  searchText = '';
  pageSize = 10;
  sortField = '';
  sortAsc = true;

  // Base currency of the logged-in company (shown alongside cost figures)
  baseCurrency = localStorage.getItem('companyCurrencyName') || 'SGD';

  showDeleteModal = false;
  itemToDelete: any = null;

  // lookups for resolving line names
  private uomMap = new Map<number, string>();
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
    { header: 'Ingredient', key: 'ingredientName' },
    { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: `Cost (${this.baseCurrency})`, key: 'unitCost', align: 'right', type: 'number' },
    { header: 'Yield %', key: 'yieldPct', align: 'right', type: 'number' },
  ];

  constructor(private svc: RecipeService, private router: Router, private printSvc: DocumentPrintService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getUOMs().subscribe(r => this.svc.unwrap(r).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? '')));
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => { if (i.itemCode) this.itemCodeMap.set(Number(i.id), i.itemCode); }));
  }

  load(): void {
    this.loading = true;
    this.svc.getRecipes().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          code: r.recipeCode ?? r.code,
          finishedItemName: r.finishedItem ?? r.finishedItemName ?? r.itemName ?? '',
          uomName: r.finishedUomName ?? r.uomName ?? r.uom ?? '',
          cuisine: r.cuisine ?? '',
          status: r.status ?? 'Draft',
          cost: r.totalCost ?? r.cost ?? r.recipeCost ?? r.costPrice ?? null,
          ingredientCount: r.ingredientCount ?? (Array.isArray(r.ingredients) ? r.ingredients.length : null),
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
          (r.code ?? '').toLowerCase().includes(q) ||
          (r.finishedItemName ?? '').toLowerCase().includes(q) ||
          (r.cuisine ?? '').toLowerCase().includes(q) ||
          (r.status ?? '').toLowerCase().includes(q))
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

  statusClass(status: string): number { return STATUS_CLASS[status] ?? 0; }

  create(): void { this.router.navigate(['/app/recipe/recipes/new']); }

  edit(row: any): void { this.router.navigate(['/app/recipe/recipes', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getRecipeById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const rawLines = d.ingredients ?? d.ingredientLines ?? d.lines ?? [];
        this.viewLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => {
          const qty = +(l.qty ?? 0) || 0;
          const unitCost = +(l.unitCost ?? 0) || 0;
          const yieldPct = l.yieldPct != null ? +l.yieldPct : 100;
          const y = Math.max(Math.min(yieldPct, 100), 0);
          const lineCost = y > 0 ? (qty * unitCost) / (y / 100) : qty * unitCost;
          return {
            ingredientName: l.ingredientItemName ?? l.ingredientName ?? this.itemCodeMap.get(Number(l.ingredientItemId)) ?? '',
            uomName: l.uom ?? l.uomName ?? this.uomMap.get(Number(l.uomId)) ?? '',
            qty,
            yieldPct,
            unitCost,
            lineCost,
          };
        });
        const totalCost = this.viewLines.reduce((s, l) => s + (+l.unitCost || 0), 0);
        const finishedItem = d.finishedItem ?? d.finishedItemName ?? row.finishedItemName ?? '—';
        const code = d.recipeCode ?? d.code ?? row.code ?? '';
        const status = d.status ?? row.status ?? 'Draft';
        const cuisine = d.cuisine ?? row.cuisine ?? '';
        this.viewInfo = [
          { label: 'Finished Item', value: finishedItem || '—' },
          { label: 'Cuisine', value: cuisine || '—' },
          { label: 'Status', value: status },
          { label: 'Ingredients', value: this.viewLines.length },
        ];
        this.viewTotals = [
          { label: 'Total Cost', value: `${this.baseCurrency} ${totalCost.toFixed(2)}` },
        ];
        this.viewTitle = `Recipe Ingredients — ${finishedItem || '—'}`;
        this.viewSubtitle = `Finished Item: ${finishedItem || '—'} · Cuisine: ${cuisine || '—'}`;
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
        docTitle: 'RECIPE',
        docNo: this.activeRow?.code ?? '',
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
    this.svc.deleteRecipe(this.itemToDelete.id).subscribe({
      next: () => {
        this.showDeleteModal = false;
        this.itemToDelete = null;
        this.load();
        Swal.fire('Deleted', 'Recipe deleted successfully.', 'success');
      },
      error: err => {
        this.showDeleteModal = false;
        Swal.fire('Error', err?.error?.message ?? 'Unable to delete recipe.', 'error');
      }
    });
  }
}
