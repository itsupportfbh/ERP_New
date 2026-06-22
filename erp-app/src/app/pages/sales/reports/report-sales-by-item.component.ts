import { Component, OnInit } from '@angular/core';
import { ReportsService } from './reports.service';
import { FilterApplyPayload } from './report-filters.component';

@Component({
  selector: 'erp-report-sales-by-item',
  standalone: false,
  templateUrl: './report-sales-by-item.component.html',
  styleUrls: ['./report-sales-by-item.component.scss']
})
export class ReportSalesByItemComponent implements OnInit {
  loading = false;

  allRows: any[] = [];       // raw API data
  filteredRows: any[] = [];  // after filters + sort + search
  pagedRows: any[] = [];     // current page slice

  searchValue = '';
  pageSize = 10;
  page = 1;

  // sort
  sortBy: '' | 'itemName' | 'category' | 'quantity' | 'netSales' | 'grossSales' | 'marginPct' = '';
  sortDir: 'asc' | 'desc' = 'asc';

  // filter modal
  filtersOpen = false;
  lastFilters: FilterApplyPayload | null = null;

  // dropdown lists for filters (built from data)
  categories: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; name: string }> = [];
  salespersons: Array<{ id: string; name: string }> = [];

  constructor(private svc: ReportsService) {}

  ngOnInit(): void {
    this.load();
  }

  // ================== LOAD DATA ==================
  load(): void {
    this.loading = true;
    this.svc.getSalesByItem().subscribe({
      next: res => {
        this.allRows = this.svc.unwrap(res);
        this.buildFilterLists();
        this.applyFiltersSortSearch();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private buildFilterLists(): void {
    const catSet = new Set<string>();
    const branchSet = new Set<string>();
    const spSet = new Set<string>();

    this.allRows.forEach((r: any) => {
      if (r.category) catSet.add(r.category);
      if (r.location) branchSet.add(r.location);
      if (r.salesPerson) spSet.add(r.salesPerson);
    });

    this.categories = Array.from(catSet).map(c => ({ id: c, name: c }));
    this.branches = Array.from(branchSet).map(b => ({ id: b, name: b }));
    this.salespersons = Array.from(spSet).map(s => ({ id: s, name: s }));
  }

  // ================== CONTROLS ==================
  onPageSizeChange(): void {
    this.pageSize = +this.pageSize;
    this.page = 1;
    this.repage();
  }

  onSearch(): void {
    this.page = 1;
    this.applyFiltersSortSearch();
  }

  onSortChange(): void {
    this.page = 1;
    this.applyFiltersSortSearch();
  }

  toggleSortDir(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.applyFiltersSortSearch();
  }

  sortByField(field: ReportSalesByItemComponent['sortBy']): void {
    if (this.sortBy === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDir = 'asc';
    }
    this.applyFiltersSortSearch();
  }

  // ================== FILTER MODAL ==================
  openFilters(): void { this.filtersOpen = true; }

  onFiltersApplied(payload: FilterApplyPayload): void {
    this.lastFilters = payload;
    this.filtersOpen = false;
    this.page = 1;
    this.applyFiltersSortSearch();
  }

  onFilterCanceled(): void { this.filtersOpen = false; }

  // ================== PIPELINE ==================
  private applyFiltersSortSearch(): void {
    // 1) FILTERS (date / category / branch / salesperson)
    let data = [...this.allRows];

    if (this.lastFilters) {
      const f = this.lastFilters;

      if (f.startDate || f.endDate) {
        const start = f.startDate ? new Date(f.startDate) : null;
        const end = f.endDate ? new Date(f.endDate) : null;

        data = data.filter(r => {
          const dtRaw = r.createdDate;
          if (!dtRaw) return false;
          const dt = new Date(dtRaw);

          if (start && dt < start) return false;
          if (end) {
            const endPlus = new Date(end);
            endPlus.setHours(23, 59, 59, 999);
            if (dt > endPlus) return false;
          }
          return true;
        });
      }

      if (f.categoryId) {
        data = data.filter(r => r.category === f.categoryId);
      }
      if (f.branchId) {
        data = data.filter(r => r.location === f.branchId);
      }
      if (f.salespersonId) {
        data = data.filter(r => r.salesPerson === f.salespersonId);
      }
    }

    // 2) SORT
    data = this.applySort(data);

    // 3) SEARCH (all fields)
    const val = this.searchValue.trim().toLowerCase();
    if (val) {
      data = data.filter((r: any) =>
        Object.values(r).some(v => v != null && String(v).toLowerCase().includes(val))
      );
    }

    this.filteredRows = data;
    this.repage();
  }

  private applySort(data: any[]): any[] {
    if (!this.sortBy) return data;
    const key = this.sortBy;
    const dir = this.sortDir === 'asc' ? 1 : -1;

    return [...data].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls last
      if (bv == null) return -1;

      const aNum = typeof av === 'number' ? av : parseFloat(av);
      const bNum = typeof bv === 'number' ? bv : parseFloat(bv);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum === bNum ? 0 : (aNum > bNum ? dir : -dir);
      }

      const aStr = String(av).toLowerCase();
      const bStr = String(bv).toLowerCase();
      if (aStr === bStr) return 0;
      return aStr > bStr ? dir : -dir;
    });
  }

  // ================== PAGING ==================
  private repage(): void {
    const total = this.filteredRows.length;
    const maxPage = Math.max(1, Math.ceil(total / this.pageSize));
    if (this.page > maxPage) this.page = maxPage;
    const start = (this.page - 1) * this.pageSize;
    this.pagedRows = this.filteredRows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.repage(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages) { this.page++; this.repage(); }
  }
}
