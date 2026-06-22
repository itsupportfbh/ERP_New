import { Component, OnInit } from '@angular/core';
import { ReportsService } from './reports.service';
import { FilterApplyPayload } from './report-filters.component';

type SortKey =
  | ''
  | 'salesInvoiceDate'
  | 'customerName'
  | 'netSales'
  | 'costOfSales'
  | 'marginAmount'
  | 'marginPct'
  | 'location'
  | 'salesPerson';

@Component({
  selector: 'erp-report-average-margin',
  standalone: false,
  templateUrl: './report-average-margin.component.html',
  styleUrls: ['./report-average-margin.component.scss']
})
export class ReportAverageMarginComponent implements OnInit {
  rows: any[] = [];          // shown in table after filter + sort + search
  filteredRows: any[] = [];  // after filter + sort (no search)
  allRows: any[] = [];       // original data from API

  selectedOption = 10;
  searchValue = '';
  currentPage = 1;

  // dropdown data (id == name, the filter component matches on names)
  customers: Array<{ id: string; name: string }> = [];
  branches: Array<{ id: string; name: string }> = [];
  salespersons: Array<{ id: string; name: string }> = [];

  lastFilters: FilterApplyPayload | null = null;
  filterOpen = false;

  // sort
  sortBy: SortKey = '';
  sortDir: 'asc' | 'desc' = 'asc';

  constructor(private svc: ReportsService) {}

  ngOnInit(): void {
    this.loadAverageMarginReport();
  }

  // ===== paging =====
  get totalPages(): number {
    return Math.ceil(this.rows.length / this.selectedOption) || 1;
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const cur = this.currentPage;
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) {
      pages.push(i);
    }
    return pages;
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) { this.currentPage = page; }
  }

  // ===== controls =====
  onLimitChange(): void {
    this.currentPage = 1;
  }

  filterUpdate(): void {
    this.currentPage = 1;
    this.applyFiltersSortSearch();
  }

  onSortChange(): void {
    this.applyFiltersSortSearch();
  }

  toggleSortDir(): void {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.applyFiltersSortSearch();
  }

  // ===== filter modal =====
  openFilters(): void {
    this.filterOpen = true;
  }

  onFiltersApplied(payload: FilterApplyPayload): void {
    this.lastFilters = payload;
    this.currentPage = 1;
    this.applyFiltersSortSearch();
    this.filterOpen = false;
  }

  onFilterCanceled(): void {
    this.filterOpen = false;
  }

  // ===== load data =====
  loadAverageMarginReport(): void {
    this.svc.getSalesMargin().subscribe((res: any) => {
      const data = this.svc.unwrap(res);

      this.allRows = (data || []).map((r: any) => ({
        ...r,
        qty: this.toNum(r.qty),
        netSales: this.toNum(r.netSales),
        costOfSales: this.toNum(r.costOfSales),
        marginAmount: this.toNum(r.marginAmount),
        marginPct: this.toNum(r.marginPct),
        salesInvoiceDate: r.salesInvoiceDate || null
      }));

      this.buildFilterLists();
      this.applyFiltersSortSearch();
    });
  }

  private buildFilterLists(): void {
    const custSet = new Set<string>();
    const branchSet = new Set<string>();
    const spSet = new Set<string>();

    this.allRows.forEach((r: any) => {
      if (r.customerName) custSet.add(r.customerName);
      if (r.location) branchSet.add(r.location);
      if (r.salesPerson) spSet.add(r.salesPerson);
    });

    this.customers = Array.from(custSet).map(c => ({ id: c, name: c }));
    this.branches = Array.from(branchSet).map(b => ({ id: b, name: b }));
    this.salespersons = Array.from(spSet).map(s => ({ id: s, name: s }));
  }

  // ===== filter + sort + search pipeline =====
  private applyFiltersSortSearch(): void {
    let data = [...this.allRows];

    // 1) FILTERS
    if (this.lastFilters) {
      const f = this.lastFilters;

      // date range on salesInvoiceDate (fallback createdDate)
      if (f.startDate || f.endDate) {
        const start = f.startDate ? new Date(f.startDate) : null;
        const end = f.endDate ? new Date(f.endDate) : null;

        data = data.filter(r => {
          const dtRaw = r.salesInvoiceDate || r.createdDate;
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

      // filter component sends id == name
      if (f.customerId) data = data.filter(r => r.customerName === f.customerId);
      if (f.branchId) data = data.filter(r => r.location === f.branchId);
      if (f.salespersonId) data = data.filter(r => r.salesPerson === f.salespersonId);
    }

    // 2) SORT
    data = this.applySort(data);
    this.filteredRows = data;

    // 3) SEARCH
    const val = (this.searchValue || '').toLowerCase().trim();
    if (val) {
      this.rows = this.filteredRows.filter((r: any) => {
        const invoice = (r.salesInvoiceNo || '').toLowerCase();
        const cust = (r.customerName || '').toLowerCase();
        const item = (r.itemName || '').toLowerCase();
        const cat = (r.category || '').toLowerCase();
        return invoice.includes(val) || cust.includes(val) || item.includes(val) || cat.includes(val);
      });
    } else {
      this.rows = [...this.filteredRows];
    }
  }

  private applySort(data: any[]): any[] {
    if (!this.sortBy) return data;

    const dir = this.sortDir === 'asc' ? 1 : -1;
    const key = this.sortBy;

    return data.sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (key === 'salesInvoiceDate') {
        const ad = new Date(av).getTime();
        const bd = new Date(bv).getTime();
        if (ad === bd) return 0;
        return ad > bd ? 1 * dir : -1 * dir;
      }

      const aNum = this.toNum(av);
      const bNum = this.toNum(bv);
      const bothNum = !isNaN(aNum) && !isNaN(bNum) &&
        String(av).trim() !== '' && !isNaN(parseFloat(String(av))) &&
        String(bv).trim() !== '' && !isNaN(parseFloat(String(bv)));

      if (bothNum) {
        if (aNum === bNum) return 0;
        return aNum > bNum ? 1 * dir : -1 * dir;
      }

      const aStr = String(av).toLowerCase();
      const bStr = String(bv).toLowerCase();
      if (aStr === bStr) return 0;
      return aStr > bStr ? 1 * dir : -1 * dir;
    });
  }

  // ===== formatting helpers =====
  toNum(v: any): number {
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  }

  formatMoney(v: any): string {
    const n = this.toNum(v);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatPct(v: any): string {
    const n = this.toNum(v);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  getMarginClass(v: any): string {
    const n = this.toNum(v);
    if (n < 0) return 'margin-neg';
    if (n > 0) return 'margin-pos';
    return 'margin-zero';
  }
}
