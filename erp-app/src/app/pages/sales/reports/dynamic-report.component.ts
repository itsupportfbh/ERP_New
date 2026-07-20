import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { ReportsService } from './reports.service';
import {
  ReportDef, ReportFieldDef, ReportKpi,
  DEFAULT_FILTER_KEYS, DEFAULT_FILTER_LABELS
} from '../../../shared/reports/report-def';
import { SavedViewsService, SavedView } from './saved-views.service';
import { DocumentPrintService } from '../../../core/services/document-print.service';
import { FunctionPermission, PermissionService } from '../../../shared/permission.service';

interface GroupBlock {
  label: string;
  rows: any[];
  totals: Record<string, number>;
}

@Component({
  selector: 'erp-dynamic-report',
  standalone: false,
  templateUrl: './dynamic-report.component.html',
  styleUrls: ['./dynamic-report.component.scss']
})
export class DynamicReportComponent implements OnChanges {
  @Input() def!: ReportDef;
  /**
   * Data service handed to `def.fetch`. Defaults to the sales ReportsService,
   * so other modules (purchase) pass their own without forking the renderer.
   */
  @Input() service?: any;

  loading = false;
  errorMsg: string | null = null;

  allRows: any[] = [];
  filteredRows: any[] = [];
  pagedRows: any[] = [];
  groups: GroupBlock[] = [];
  grandTotals: Record<string, number> = {};

  /** Headline tiles and chart bars, recomputed whenever the filters change. */
  kpis: ReportKpi[] = [];
  chartBars: Array<{ label: string; value: number; display: string; heightPct: number }> = [];

  /** field keys the API allowed for this user; null until the first response */
  private allowedKeys: string[] | null = null;
  /** branch the API has locked this user to, if any */
  branchLock: string | null = null;

  selectedKeys = new Set<string>();
  searchValue = '';
  groupKey = '';
  sortKey = '';
  sortDir: 'asc' | 'desc' = 'asc';
  pageSize = 10;
  page = 1;

  // inline toolbar filters
  fFrom = '';
  fTo = '';
  fCustomer = '';
  fBranch = '';
  fCategory = '';
  fSalesPerson = '';
  fStatus = '';

  customers: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; name: string }> = [];
  salespersons: Array<{ id: string; name: string }> = [];
  categories: Array<{ id: string; name: string }> = [];
  statuses: Array<{ id: string; name: string }> = [];

  // --- columns picker modal ---
  colsOpen = false;
  tempKeys = new Set<string>();
  activeTab = 'All';
  colSearch = '';

  // --- saved views ---
  views: SavedView[] = [];
  saveOpen = false;
  saveName = '';
  saveError: string | null = null;
  saving = false;
  deleteTarget: SavedView | null = null;
  deleteError: string | null = null;

  /** Non-blocking status line; replaces the browser alert dialogs. */
  toastMsg: string | null = null;
  private toastTimer: any = null;

  private showToast(message: string): void {
    this.toastMsg = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastMsg = null; }, 3000);
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toastMsg = null;
  }

  /**
   * This report's permission row. Resolved per report through the same
   * per-function endpoint the sidebar and the route guard use, so the three
   * never disagree about whether a report is available.
   */
  private permission: FunctionPermission | null = null;

  constructor(
    private svc: ReportsService,
    private viewsSvc: SavedViewsService,
    private perm: PermissionService,
    private docPrint: DocumentPrintService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['def'] && this.def) {
      this.resetForDef();
      this.loadPermission();
      this.loadViews();
    }
  }

  /** Resolve View/Export/Print for this report, then fetch its rows. */
  private loadPermission(): void {
    const userId = Number(localStorage.getItem('id') || 0);
    if (!userId) { this.permission = null; this.load(); return; }

    this.loading = true;
    this.perm.getFunctionPermission(userId, this.def.functionId)
      .pipe(catchError(() => of(null)))
      .subscribe(permission => {
        this.permission = permission;
        this.load();
      });
  }

  // ================== column model ==================
  private resetForDef(): void {
    this.allowedKeys = null;
    this.branchLock = null;
    this.fFrom = '';
    this.fTo = '';
    this.fCustomer = '';
    this.fBranch = '';
    this.fCategory = '';
    this.fSalesPerson = '';
    this.fStatus = '';
    this.searchValue = '';
    this.groupKey = this.def.defaultGroup ?? '';
    this.sortKey = '';
    this.sortDir = 'asc';
    this.page = 1;
    this.activeTab = 'All';
    this.selectedKeys = new Set(this.def.fields.filter(f => f.def).map(f => f.key));
  }

  /** fields this user is permitted to see (API-driven; all fields until the API says otherwise) */
  get allowedFields(): ReportFieldDef[] {
    if (!this.allowedKeys) return this.def.fields;
    const allow = new Set(this.allowedKeys);
    return this.def.fields.filter(f => allow.has(f.key));
  }

  get visibleFields(): ReportFieldDef[] {
    return this.allowedFields.filter(f => this.selectedKeys.has(f.key));
  }

  get groupableFields(): ReportFieldDef[] {
    return this.allowedFields.filter(f => f.grp);
  }

  get sumFields(): ReportFieldDef[] {
    return this.visibleFields.filter(f => f.sum);
  }

  get hasTotals(): boolean {
    return this.sumFields.length > 0;
  }

  get canExport(): boolean {
    return this.perm.hasExport(this.permission);
  }

  get canPrint(): boolean {
    return this.perm.hasPrint(this.permission);
  }

  isNumeric(f: ReportFieldDef): boolean {
    return f.type === 'num' || f.type === 'money' || f.type === 'pct';
  }

  // ================== load ==================
  load(): void {
    // Only block when the lookup actually came back and said no. A null
    // permission means the check could not be made, and the host page has
    // already gated access - refusing here would strand the user instead.
    if (this.permission && !this.perm.hasView(this.permission)) {
      this.loading = false;
      this.allRows = [];
      this.filteredRows = [];
      this.pagedRows = [];
      this.errorMsg = 'You do not have permission to view this report.';
      return;
    }
    this.loading = true;
    this.errorMsg = null;

    const dataSvc = this.service ?? this.svc;

    this.def.fetch(dataSvc).subscribe({
      next: (res: any) => {
        const data = dataSvc.unwrap(res);
        const meta = dataSvc.unwrapMeta(res);

        this.allowedKeys = meta?.allowedFields?.length ? meta.allowedFields : null;
        this.branchLock = meta?.branchLock ?? null;

        // drop any selected column the API is no longer returning
        const allow = new Set(this.allowedFields.map(f => f.key));
        this.selectedKeys = new Set([...this.selectedKeys].filter(k => allow.has(k)));
        if (!this.selectedKeys.size) {
          this.selectedKeys = new Set(this.allowedFields.filter(f => f.def).map(f => f.key));
        }

        this.allRows = this.def.derive ? data.map(r => this.def.derive!(r)) : data;
        this.buildFilterLists();
        this.recompute();
        this.loading = false;
      },
      error: () => {
        this.allRows = [];
        this.recompute();
        this.loading = false;
        this.errorMsg = `Failed to load ${this.def.name}.`;
      }
    });
  }

  /** Row property each filter slot matches on, per report (sales defaults). */
  get filterKeys() {
    return { ...DEFAULT_FILTER_KEYS, ...(this.def.filterKeys ?? {}) };
  }

  /** Slot labels, so one panel can read "Supplier" or "Customer" as needed. */
  get filterLabels() {
    return { ...DEFAULT_FILTER_LABELS, ...(this.def.filterLabels ?? {}) };
  }

  private buildFilterLists(): void {
    const uniq = (key: string) =>
      Array.from(new Set(this.allRows.map(r => r[key]).filter(v => v != null && v !== '')))
        .map(v => String(v)).sort().map(name => ({ id: name, name }));

    const k = this.filterKeys;
    this.customers = uniq(k.customer);
    this.branches = uniq(k.branch);
    this.salespersons = uniq(k.salesperson);
    this.categories = uniq(k.category);
    this.statuses = uniq(k.status);
  }

  // ================== filter / sort / search pipeline ==================
  private recompute(): void {
    let data = [...this.allRows];

    // Aggregate reports (stage counts, scorecards) declare no date field —
    // filtering them by date would discard every row rather than narrow them.
    if (this.def.dateField && (this.fFrom || this.fTo)) {
      const start = this.fFrom ? new Date(this.fFrom).getTime() : null;
      let end: number | null = null;
      if (this.fTo) {
        const e = new Date(this.fTo);
        e.setHours(23, 59, 59, 999);
        end = e.getTime();
      }
      data = data.filter(r => {
        const raw = r[this.def.dateField];
        if (!raw) return false;
        const t = new Date(raw).getTime();
        if (start != null && t < start) return false;
        if (end != null && t > end) return false;
        return true;
      });
    }

    const k = this.filterKeys;
    if (this.fCustomer) data = data.filter(r => String(r[k.customer] ?? '') === this.fCustomer);
    if (this.fBranch) data = data.filter(r => String(r[k.branch] ?? '') === this.fBranch);
    if (this.fCategory) data = data.filter(r => String(r[k.category] ?? '') === this.fCategory);
    if (this.fSalesPerson) data = data.filter(r => String(r[k.salesperson] ?? '') === this.fSalesPerson);
    if (this.fStatus) data = data.filter(r => String(r[k.status] ?? '') === this.fStatus);

    const q = this.searchValue.trim().toLowerCase();
    if (q) {
      const keys = this.allowedFields.map(k => k.key);
      data = data.filter(r => keys.some(k => String(r[k] ?? '').toLowerCase().includes(q)));
    }

    data = this.applySort(data);
    this.filteredRows = data;
    this.buildGroups();
    this.buildSummary();
    this.repage();
  }

  /**
   * KPI tiles and chart bars describe what is currently on screen, so they are
   * rebuilt from filteredRows rather than the full result set.
   */
  private buildSummary(): void {
    this.kpis = this.def.kpis ? this.def.kpis(this.filteredRows) : [];

    if (!this.def.chart) { this.chartBars = []; return; }

    const data = this.def.chart.fn(this.filteredRows) || {};
    const entries = Object.entries(data)
      .filter(([, v]) => this.toNum(v) !== 0)
      .sort((a, b) => this.toNum(b[1]) - this.toNum(a[1]))
      .slice(0, 8);   // beyond ~8 bars the labels stop being readable

    const max = Math.max(1, ...entries.map(([, v]) => this.toNum(v)));
    const money = !!this.def.chart.money;

    this.chartBars = entries.map(([label, raw]) => {
      const value = this.toNum(raw);
      return {
        label,
        value,
        display: money && value >= 1000
          ? `${(value / 1000).toFixed(1)}k`
          : value.toLocaleString(undefined, { maximumFractionDigits: money ? 2 : 0 }),
        // Floor at 2% so a tiny-but-present value is still visible as a bar.
        heightPct: Math.max(2, (value / max) * 100)
      };
    });
  }

  get hasChart(): boolean {
    return !!this.def.chart && this.chartBars.length > 0;
  }

  kpiClass(kpi: ReportKpi): string {
    return `dyn-kpi dyn-kpi-${kpi.tone || 'default'}`;
  }

  private applySort(data: any[]): any[] {
    if (!this.sortKey) return data;
    const key = this.sortKey;
    const field = this.def.fields.find(f => f.key === key);
    const dir = this.sortDir === 'asc' ? 1 : -1;

    return [...data].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls last regardless of direction
      if (bv == null) return -1;

      if (field?.type === 'date') {
        const at = new Date(av).getTime();
        const bt = new Date(bv).getTime();
        return at === bt ? 0 : (at > bt ? dir : -dir);
      }
      if (field && this.isNumeric(field)) {
        const an = this.toNum(av);
        const bn = this.toNum(bv);
        return an === bn ? 0 : (an > bn ? dir : -dir);
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return as === bs ? 0 : (as > bs ? dir : -dir);
    });
  }

  private totalsFor(rows: any[]): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const f of this.sumFields) {
      totals[f.key] = rows.reduce((sum, r) => sum + this.toNum(r[f.key]), 0);
    }
    return totals;
  }

  private buildGroups(): void {
    this.grandTotals = this.totalsFor(this.filteredRows);
    if (!this.groupKey) { this.groups = []; return; }

    const map = new Map<string, any[]>();
    for (const r of this.filteredRows) {
      const label = String(r[this.groupKey] ?? '(blank)');
      const bucket = map.get(label);
      if (bucket) { bucket.push(r); } else { map.set(label, [r]); }
    }
    this.groups = Array.from(map.keys()).sort().map(label => {
      const rows = map.get(label)!;
      return { label, rows, totals: this.totalsFor(rows) };
    });
  }

  // ================== controls ==================
  onSearch(): void { this.page = 1; this.recompute(); }
  onGroupChange(): void { this.page = 1; this.recompute(); }

  onPageSizeChange(): void {
    this.pageSize = +this.pageSize;
    this.page = 1;
    this.repage();
  }

  sortByField(key: string): void {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = 'asc';
    }
    this.page = 1;
    this.recompute();
  }

  onFilterChange(): void { this.page = 1; this.recompute(); }

  clearFilters(): void {
    this.fFrom = '';
    this.fTo = '';
    this.fCustomer = '';
    this.fBranch = '';
    this.fCategory = '';
    this.fSalesPerson = '';
    this.fStatus = '';
    this.searchValue = '';
    this.groupKey = this.def.defaultGroup ?? '';
    this.sortKey = '';
    this.page = 1;
    this.recompute();
  }

  // ================== paging (flat mode only) ==================
  private repage(): void {
    const maxPage = this.totalPages;
    if (this.page > maxPage) this.page = maxPage;
    const start = (this.page - 1) * this.pageSize;
    this.pagedRows = this.filteredRows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  prevPage(): void { if (this.page > 1) { this.page--; this.repage(); } }
  nextPage(): void { if (this.page < this.totalPages) { this.page++; this.repage(); } }

  // ================== columns picker ==================
  // The picker lists every field the report defines, including ones this role
  // may not see. Hiding them outright makes columns look like they do not exist;
  // showing them locked tells the user what to ask an administrator for.
  get tabs(): string[] {
    return ['All', ...Array.from(new Set(this.def.fields.map(f => f.tab)))];
  }

  get pickerFields(): ReportFieldDef[] {
    const q = this.colSearch.trim().toLowerCase();
    return this.def.fields.filter(f =>
      (this.activeTab === 'All' || f.tab === this.activeTab) &&
      (!q || f.label.toLowerCase().includes(q))
    );
  }

  /** True once the API has told us this field is off-limits for this role. */
  isDenied(f: ReportFieldDef): boolean {
    return !!this.allowedKeys && !this.allowedKeys.includes(f.key);
  }

  /** Commercially sensitive, i.e. worth flagging with a lock even when allowed. */
  isSensitive(f: ReportFieldDef): boolean {
    return !!f.sens;
  }

  get tempCount(): number { return this.tempKeys.size; }

  openColumns(): void {
    this.tempKeys = new Set(this.selectedKeys);
    this.activeTab = 'All';
    this.colSearch = '';
    this.colsOpen = true;
  }

  closeColumns(): void { this.colsOpen = false; }

  toggleTemp(key: string): void {
    const field = this.def.fields.find(f => f.key === key);
    if (field && this.isDenied(field)) return;   // the checkbox is disabled, but do not rely on that alone
    if (this.tempKeys.has(key)) { this.tempKeys.delete(key); } else { this.tempKeys.add(key); }
  }

  isTemp(key: string): boolean { return this.tempKeys.has(key); }

  selectAll(on: boolean): void {
    this.tempKeys = on ? new Set(this.allowedFields.map(f => f.key)) : new Set<string>();
  }

  tabBulk(on: boolean): void {
    // Bulk actions must not select a column the role is not allowed to see.
    for (const f of this.pickerFields.filter(x => !this.isDenied(x))) {
      if (on) { this.tempKeys.add(f.key); } else { this.tempKeys.delete(f.key); }
    }
  }

  applyColumns(): void {
    if (!this.tempKeys.size) {
      this.showToast('Select at least one column.');
      return;
    }
    this.selectedKeys = new Set(this.tempKeys);
    // a hidden column can no longer drive sorting or grouping
    if (this.sortKey && !this.selectedKeys.has(this.sortKey)) this.sortKey = '';
    if (this.groupKey && !this.selectedKeys.has(this.groupKey)) this.groupKey = '';
    this.colsOpen = false;
    this.recompute();
  }

  // ================== saved views ==================
  private loadViews(): void {
    this.viewsSvc.list(this.def.key).subscribe({
      next: views => { this.views = views; },
      error: () => { this.views = []; }
    });
  }

  openSaveView(): void {
    this.saveName = '';
    this.saveError = null;
    this.saveOpen = true;
  }

  closeSaveView(): void { this.saveOpen = false; }

  saveView(): void {
    const name = this.saveName.trim();
    if (!name) {
      this.saveError = 'Give the view a name.';
      return;
    }
    if (this.views.some(v => v.name.toLowerCase() === name.toLowerCase())) {
      this.saveError = 'A view with that name already exists — it will be overwritten.';
    }

    this.saving = true;
    const view: SavedView = {
      reportKey: this.def.key,
      name,
      config: {
        columns: Array.from(this.selectedKeys),
        groupKey: this.groupKey,
        sortKey: this.sortKey,
        sortDir: this.sortDir,
        pageSize: this.pageSize,
        search: this.searchValue,
        filters: {
          from: this.fFrom,
          to: this.fTo,
          customer: this.fCustomer,
          branch: this.fBranch,
          category: this.fCategory,
          salesPerson: this.fSalesPerson,
          status: this.fStatus
        }
      }
    };

    this.viewsSvc.save(view).subscribe({
      next: saved => {
        // the API overwrites a same-named view, so replace rather than append
        this.views = [...this.views.filter(v => v.name !== saved.name), saved];
        this.saving = false;
        this.saveOpen = false;
        this.showToast(`View "${saved.name}" saved.`);
      },
      error: () => {
        this.saving = false;
        this.saveError = 'Could not save. Check that the API is running, then try again.';
      }
    });
  }

  loadView(view: SavedView): void {
    const c = view.config || {};
    const allow = new Set(this.allowedFields.map(f => f.key));
    const cols = (c.columns || []).filter((k: string) => allow.has(k));

    this.selectedKeys = cols.length
      ? new Set(cols)
      : new Set(this.allowedFields.filter(f => f.def).map(f => f.key));
    this.groupKey = allow.has(c.groupKey) ? c.groupKey : '';
    this.sortKey = allow.has(c.sortKey) ? c.sortKey : '';
    this.sortDir = c.sortDir === 'desc' ? 'desc' : 'asc';
    this.pageSize = c.pageSize || 10;
    this.searchValue = c.search || '';

    const f = c.filters || {};
    this.fFrom = f.from || '';
    this.fTo = f.to || '';
    // a locked branch always wins over whatever the view was saved with
    this.fBranch = this.branchLock ? '' : (f.branch || '');
    this.fCustomer = f.customer || '';
    this.fCategory = f.category || '';
    this.fSalesPerson = f.salesPerson || '';
    this.fStatus = f.status || '';
    this.page = 1;
    this.recompute();
    this.showToast(`Loaded view "${view.name}".`);
  }

  askDeleteView(view: SavedView, ev: Event): void {
    ev.stopPropagation();
    this.deleteTarget = view;
    this.deleteError = null;
  }

  cancelDeleteView(): void { this.deleteTarget = null; }

  confirmDeleteView(): void {
    const view = this.deleteTarget;
    if (!view || view.id == null) { this.deleteTarget = null; return; }

    this.viewsSvc.remove(view.id).subscribe({
      next: () => {
        this.views = this.views.filter(v => v.id !== view.id);
        this.deleteTarget = null;
        this.showToast(`View "${view.name}" deleted.`);
      },
      error: () => { this.deleteError = 'Could not delete. Check that the API is running, then try again.'; }
    });
  }

  // ================== export ==================
  private exportMeta(): { title: string; metaLines: string[] } {
    const bits: string[] = [];
    if (this.searchValue.trim()) bits.push(`Search: ${this.searchValue.trim()}`);
    if (this.fFrom || this.fTo) bits.push(`Period: ${this.fFrom || '...'} to ${this.fTo || '...'}`);
    const lbl = this.filterLabels;
    if (this.fCustomer) bits.push(`${lbl.customer}: ${this.fCustomer}`);
    if (this.fBranch) bits.push(`${lbl.branch}: ${this.fBranch}`);
    if (this.fCategory) bits.push(`${lbl.category}: ${this.fCategory}`);
    if (this.fSalesPerson) bits.push(`${lbl.salesperson}: ${this.fSalesPerson}`);
    if (this.fStatus) bits.push(`${lbl.status}: ${this.fStatus}`);
    if (this.groupKey) {
      const g = this.def.fields.find(x => x.key === this.groupKey);
      bits.push(`Grouped by: ${g?.label || this.groupKey}`);
    }
    if (this.branchLock) bits.push(`Branch locked to: ${this.branchLock}`);

    return {
      title: this.def.name,
      metaLines: [
        `Generated: ${new Date().toLocaleString()}`,
        `Filters: ${bits.length ? bits.join(' | ') : 'None'}`,
        `${this.filteredRows.length} rows | ${this.visibleFields.length} columns`
      ]
    };
  }

  /** value as it should appear in an export cell (numbers stay numeric) */
  private exportValue(f: ReportFieldDef, row: any): any {
    const v = row[f.key];
    if (v == null || v === '') return '';
    if (f.type === 'date') return new Date(v).toLocaleDateString();
    if (this.isNumeric(f)) return this.toNum(v);
    return String(v);
  }

  exportExcel(): void {
    if (!this.canExport) return;
    const cols = this.visibleFields;
    const m = this.exportMeta();

    const aoa: any[][] = [[m.title], ...m.metaLines.map(l => [l]), [], cols.map(f => f.label)];

    const pushTotals = (label: string, totals: Record<string, number>) =>
      aoa.push(cols.map((f, i) => (i === 0 ? label : (f.sum ? totals[f.key] : ''))));

    if (this.groups.length) {
      for (const g of this.groups) {
        aoa.push([g.label + ` (${g.rows.length})`]);
        for (const r of g.rows) aoa.push(cols.map(f => this.exportValue(f, r)));
        if (this.hasTotals) pushTotals(`Subtotal - ${g.label}`, g.totals);
      }
    } else {
      for (const r of this.filteredRows) aoa.push(cols.map(f => this.exportValue(f, r)));
    }
    if (this.hasTotals) pushTotals('Grand total', this.grandTotals);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${this.def.name.replace(/\W+/g, '_').toLowerCase()}.xlsx`);
    this.showToast('Excel downloaded (visible columns and rows only).');
  }

  exportPdf(): void {
    if (!this.canPrint) return;
    const cols = this.visibleFields;
    const m = this.exportMeta();
    const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

    const cell = (f: ReportFieldDef, row: any) => {
      const v = row[f.key];
      if (v == null || v === '') return '-';
      if (f.type === 'date') return new Date(v).toLocaleDateString();
      if (this.isNumeric(f)) return this.fmt(v, f);
      return esc(v);
    };
    // The document layout carries an S.No column, so every row spans cols + 1.
    const span = cols.length + 1;

    const subtotalCells = (label: string, totals: Record<string, number>) =>
      `<tr class="sub"><td></td>` + cols.map((f, i) => {
        if (i === 0) return `<td>${esc(label)}</td>`;
        if (f.sum) return `<td class="n">${this.fmt(totals[f.key], f)}</td>`;
        return '<td></td>';
      }).join('') + '</tr>';

    let seq = 0;
    const dataRow = (r: any) =>
      `<tr><td class="c">${++seq}</td>` + cols.map(f =>
        `<td class="${this.isNumeric(f) ? 'n' : ''}">${cell(f, r)}</td>`).join('') + '</tr>';

    let body = '';
    if (this.groups.length) {
      for (const g of this.groups) {
        body += `<tr class="g"><td colspan="${span}">${esc(g.label)} (${g.rows.length})</td></tr>`;
        body += g.rows.map(dataRow).join('');
        if (this.hasTotals) body += subtotalCells(`Subtotal - ${g.label}`, g.totals);
      }
    } else {
      body = this.filteredRows.map(dataRow).join('');
    }
    if (!body) {
      body = `<tr><td colspan="${span}" style="text-align:center;padding:18px;color:#888;font-style:italic;">No records for the selected filters.</td></tr>`;
    }

    // Column totals go in the bottom-right block, mirroring the Subtotal / Tax /
    // Grand Total box on the Sales Order rather than trailing off the table.
    const totalsHtml = this.sumFields.map((f, i) => {
      const isLast = i === this.sumFields.length - 1;
      return `<tr class="${isLast ? 'gt-row' : ''}">
        <td class="tot-lbl">${esc(f.label)}</td>
        <td class="tot-val">${this.fmt(this.grandTotals[f.key], f)}</td>
      </tr>`;
    }).join('');

    // Same letterhead the document prints (Delivery Order, Invoice) use, so a
    // report reads as part of the same stationery set.
    const co = this.docPrint.getPrintCompany();
    const isImgLogo = !!co.logo && co.logo.startsWith('data:image');
    const metaRows = [
      ['Generated', new Date().toLocaleString()],
      ['Filters', m.metaLines[1].replace(/^Filters:\s*/, '')],
      ['Rows', `${this.filteredRows.length}`],
      ['Columns', `${cols.length}`]
    ];

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${esc(m.title)}</title><style>
  /* Portrait, matching the Sales Order stationery. Landscape here made the
     browser scale the whole document down onto portrait paper, which is what
     left the report shrunk into the top-left corner of the sheet. */
  @page { size: A4 portrait; margin: 12mm 12mm 16mm 12mm; }
  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  /* Fill exactly one A4 content area (297mm - 12mm top - 16mm bottom = 269mm,
     trimmed ~2mm so rounding can't spill a blank page). The flex column lets the
     table box grow and pins the totals/footer to the bottom on a short report. */
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; margin: 0;
    display: flex; flex-direction: column; min-height: 267mm; }

  .doc-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .logo-wrap { display: flex; align-items: center; gap: 10px; }
  .logo-box { width: 72px; height: 72px; border: 2px solid #1a5c6e; border-radius: 6px;
    display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 4px;
    font-size: 14px; font-weight: 900; color: #1a5c6e; text-align: center; line-height: 1.2; }
  .logo-box.logo-img { border: none; border-radius: 0; padding: 0; width: auto; min-width: 72px; }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .co-brand { font-size: 13px; font-weight: 900; color: #1a5c6e; text-transform: uppercase; }
  .co-brand-sub { font-size: 9.5px; color: #555; margin-top: 2px; line-height: 1.5; }

  .doc-title { text-align: center; font-size: 16px; font-weight: 900; letter-spacing: 3px;
    text-transform: uppercase; padding: 7px 0; border-top: 2px solid #111; border-bottom: 2px solid #111; margin: 0 0 8px; }

  .info-row { display: grid; grid-template-columns: 1fr 230px; border: 1px solid #aaa; margin-bottom: 8px; }
  .scope-box { padding: 8px 10px; border-right: 1px solid #aaa; }
  .bl { font-size: 10px; font-weight: 900; text-transform: uppercase; color: #555; margin-bottom: 4px; }
  .bn { font-size: 12px; font-weight: 900; color: #111; }
  .baddr { font-size: 10.5px; color: #333; line-height: 1.6; margin-top: 2px; }
  table.m-tbl { width: 100%; border-collapse: collapse; }
  .m-lbl { padding: 5px 10px; font-weight: 700; color: #444; font-size: 10.5px; border-bottom: 1px solid #eee; width: 90px; }
  .m-val { padding: 5px 10px; font-weight: 700; color: #111; font-size: 10.5px; border-bottom: 1px solid #eee; }
  table.m-tbl tr:last-child .m-lbl, table.m-tbl tr:last-child .m-val { border-bottom: none; }

  /* The wrapper grows to fill the leftover page height; the filler continues the
     table's side borders down so a short report still reads as a full-page box. */
  .lines-wrap { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
  .tbl-filler { flex: 1 1 auto; border-left: 1px solid #ccc; border-right: 1px solid #ccc; border-bottom: 1px solid #ccc; }

  .tbl { flex: 0 0 auto; width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .tbl thead { display: table-header-group; }
  .tbl tbody tr { page-break-inside: avoid; }
  .tbl thead tr { background: #1a5c6e; }
  .tbl thead th { padding: 7px 8px; color: #fff; font-weight: 700; font-size: 10px;
    text-transform: uppercase; letter-spacing: .04em; border: 1px solid #1a5c6e; text-align: left; }
  .tbl tbody td { padding: 6px 8px; border: 1px solid #ccc; color: #111; vertical-align: middle; }
  .tbl tbody tr:nth-child(even) td { background: #f8f8f8; }
  th.n, td.n { text-align: right; }

  /* Must out-specify the :nth-child(even) striping above, or the banded rows
     win and the total rows render as invisible white-on-white text. */
  .tbl tbody tr.g td { background: #e0f5f8; font-weight: 900; color: #1a5c6e; }
  .tbl tbody tr.sub td { background: #eef4f6; font-weight: 700; font-style: italic; color: #1a5c6e; }
  .tbl tbody tr.grand td { background: #1a5c6e; color: #fff; font-weight: 900; border-color: #1a5c6e; }

  /* BOTTOM: scope notes + column totals, laid out like the Sales Order's
     remarks + Subtotal/Tax/Grand Total block. */
  .bottom-row { display: grid; grid-template-columns: 1fr 230px; border: 1px solid #ccc; border-top: none; }
  .rem-cell { padding: 10px; border-right: 1px solid #ccc; }
  .rem-lbl { font-weight: 900; font-size: 10px; text-transform: uppercase; color: #555; margin-bottom: 5px; }
  .rem-txt { font-size: 10.5px; color: #222; line-height: 1.7; }
  table.tot-tbl { width: 100%; border-collapse: collapse; }
  .tot-tbl td { padding: 6px 12px; border-bottom: 1px solid #eee; font-size: 11px; }
  .tot-tbl tr:last-child td { border-bottom: none; }
  .tot-lbl { color: #444; font-weight: 600; }
  .tot-val { text-align: right; font-weight: 700; color: #111; }
  .gt-row td { background: #1a5c6e; color: #fff; font-weight: 900; font-size: 12px; border-color: #1a5c6e; }
  .tot-none { padding: 10px 12px; font-size: 10.5px; color: #888; font-style: italic; }

  .doc-ftr { margin-top: 12px; display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 10.5px; color: #333; border-top: 1px solid #ccc; padding-top: 8px; }
  .behalf { line-height: 1.8; }
  .behalf strong { font-size: 11px; }
  .gen { font-size: 9.5px; color: #999; margin-top: 3px; }
  .pg { font-size: 10px; color: #888; text-align: right; }
</style></head><body>

  <div class="doc-hdr">
    <div class="logo-wrap">
      <div class="logo-box${isImgLogo ? ' logo-img' : ''}">${isImgLogo ? `<img src="${co.logo}" alt="logo"/>` : esc(co.logo)}</div>
      <div>
        <div class="co-brand">${esc(co.name)}</div>
        <div class="co-brand-sub">${esc(co.addr1)}<br/>${esc(co.addr2)}<br/>Tel : ${esc(co.phone)}<br/>Email : ${esc(co.email)}</div>
      </div>
    </div>
  </div>

  <div class="doc-title">${esc(m.title)}</div>

  <div class="info-row">
    <div class="scope-box">
      <div class="bl">Report :</div>
      <div class="bn">${esc(m.title)}</div>
      <div class="baddr">${esc(this.def.crumb)}</div>
    </div>
    <div>
      <table class="m-tbl">
        ${metaRows.map(([l, v]) => `<tr><td class="m-lbl">${esc(l)}</td><td class="m-val">${esc(v)}</td></tr>`).join('')}
      </table>
    </div>
  </div>

  <div class="lines-wrap">
    <table class="tbl">
      <thead><tr><th class="c">S.No</th>${cols.map(f => `<th class="${this.isNumeric(f) ? 'n' : ''}">${esc(f.label)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="tbl-filler"></div>
  </div>

  <div class="bottom-row">
    <div class="rem-cell">
      <div class="rem-lbl">Notes :</div>
      <div class="rem-txt">${esc(m.metaLines[1])}</div>
    </div>
    <div>
      ${totalsHtml
        ? `<table class="tot-tbl">${totalsHtml}</table>`
        : '<div class="tot-none">No totalled columns.</div>'}
    </div>
  </div>

  <div class="doc-ftr">
    <div class="behalf">
      <div>For &amp; Behalf of</div>
      <strong>${esc(co.name)}</strong>
      <div class="gen">Generated by Unity ERP &nbsp;&middot;&nbsp; ${esc(new Date().toLocaleDateString())}</div>
    </div>
    <!-- No "Page 1 of 1" here: unlike a Sales Order a report can run to many
         pages, and Chrome cannot fill @page margin boxes, so a hardcoded count
         would simply be wrong. The browser's own footer numbers the pages. -->
    <div class="pg">Confidential</div>
  </div>

<script>window.onload=function(){window.print();}<\/script></body></html>`;

    const w = window.open('', '_blank');
    if (!w) { this.showToast('Popup blocked - allow popups to print this report.'); return; }
    w.document.write(html);
    w.document.close();
  }

  // ================== formatting ==================
  toNum(v: any): number {
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  }

  fmt(v: any, f: ReportFieldDef): string {
    if (v == null || v === '') return '-';
    if (f.type === 'money' || f.type === 'num') {
      return this.toNum(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (f.type === 'pct') {
      return this.toNum(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    }
    return String(v);
  }

  statusClass(status: any): string {
    switch (String(status).toUpperCase()) {
      // sales / logistics
      case 'DELIVERED': return 'pill pill-success';
      case 'IN TRANSIT': return 'pill pill-info';
      case 'PLANNED': return 'pill pill-neutral';
      case 'DELAYED': return 'pill pill-warning';
      case 'CANCELLED': return 'pill pill-danger';
      // purchase document + QC states
      case 'APPROVED':
      case 'POSTED':
      case 'POSTED TO A/P':
      case 'PAID':
      case 'SETTLED':
      case 'CLOSED':
      case 'PASSED':
      case 'MATCHED':
      case 'OK':
      case 'A': return 'pill pill-success';
      case 'PENDING APPROVAL':
      case 'PARTIAL':
      case 'OPEN':
      case 'ON HOLD':
      case 'FLAGGED':
      case 'MISMATCH':
      case 'B':
      case 'C': return 'pill pill-warning';
      case 'REJECTED':
      case 'FAILED':
      case 'D': return 'pill pill-danger';
      case 'DRAFT':
      case 'NOT CHECKED': return 'pill pill-neutral';
      default: return 'pill';
    }
  }

  trackByKey = (_: number, f: ReportFieldDef) => f.key;
}
