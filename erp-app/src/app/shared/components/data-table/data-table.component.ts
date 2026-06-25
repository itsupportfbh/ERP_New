import { Component, Input, Output, EventEmitter, OnChanges, ChangeDetectionStrategy } from '@angular/core';

export interface TableColumn {
  key: string;
  header: string;
  type?: 'text' | 'number' | 'date' | 'badge' | 'boolean' | 'action';
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  badgeMap?: { [val: string]: 'success' | 'danger' | 'warning' | 'default' };
}

export interface RowAction {
  key: string;
  label: string;
  btnClass?: string;
  icon?: string;
}


export interface SortState { key: string; dir: 'asc' | 'desc'; }

@Component({
  selector: 'erp-table',
  standalone: false,
  templateUrl: './data-table.component.html',
  styleUrls: ['./data-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataTableComponent implements OnChanges {
  @Input() columns: TableColumn[] = [];
  @Input() data: any[] = [];
  @Input() loading = false;
  @Input() selectable = false;
  @Input() rowKey = 'id';
  @Input() rowActions: RowAction[] = [];
  @Input() rowActionsHeader = 'Action';
  @Output() sortChange = new EventEmitter<SortState>();
  @Output() rowClick = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<any[]>();
  @Output() actionClick = new EventEmitter<{ action: string; row: any }>();
  @Input() rowActionFilter: ((action: string, row: any) => boolean) | null = null;
  @Input() rowActionDisabled: ((action: string, row: any) => boolean) | null = null;
  @Input() eyeFirst = false;
  @Input() pageSize = 10;
  @Input() showControls = true;

  sort: SortState = { key: '', dir: 'asc' };
  selectedRows = new Set<any>();
  currentPage = 1;
  pageSizeInternal = 10;
  searchQuery = '';
  pageSizeOptions = [10, 25, 50, 100];

  ngOnChanges(): void {
    this.selectedRows.clear();
    this.currentPage = 1;
    this.pageSizeInternal = this.pageSize;
  }

  get filteredData(): any[] {
    if (!this.searchQuery.trim()) return this.data;
    const q = this.searchQuery.toLowerCase();
    return this.data.filter(row =>
      this.columns.some(col => {
        const val = this.getCellValue(row, col);
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }

  get totalPages(): number { return Math.ceil(this.filteredData.length / this.pageSizeInternal) || 1; }

  get pagedData(): any[] {
    const start = (this.currentPage - 1) * this.pageSizeInternal;
    return this.filteredData.slice(start, start + this.pageSizeInternal);
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = Math.max(1, this.currentPage - 2); i <= Math.min(this.totalPages, this.currentPage + 2); i++) pages.push(i);
    return pages;
  }

  get showingFrom(): number { return this.filteredData.length ? (this.currentPage - 1) * this.pageSizeInternal + 1 : 0; }
  get showingTo(): number { return Math.min(this.currentPage * this.pageSizeInternal, this.filteredData.length); }

  onPageChange(p: number): void { if (p >= 1 && p <= this.totalPages) this.currentPage = p; }
  onPageSizeChange(e: Event): void { this.pageSizeInternal = Number((e.target as HTMLSelectElement).value); this.currentPage = 1; }
  onPageSizeChangeVal(val: number): void { this.pageSizeInternal = val; this.currentPage = 1; }
  onSearch(e: Event): void { this.searchQuery = (e.target as HTMLInputElement).value; this.currentPage = 1; }

  /** Total visible columns including optional checkbox and action columns */
  get totalCols(): number {
    return this.columns.length + (this.selectable ? 1 : 0) + (this.rowActions.length || this.eyeFirst ? 1 : 0);
  }

  onAction(key: string, row: any, e: Event): void {
    e.stopPropagation();
    if (this.isActionDisabled(key, row)) return;
    this.actionClick.emit({ action: key, row });
  }

  isActionDisabled(action: string, row: any): boolean {
    return !!this.rowActionDisabled?.(action, row);
  }

  /**
   * Dynamic font size: shrinks as column count grows so content
   * fits in viewport without horizontal scroll or "..." truncation.
   * 4 cols → 12.5px, 20 cols → 9px
   */
  get fontSize(): string {
    const n = this.totalCols;
    if (n <= 4)  return '12.5px';
    if (n <= 6)  return '12px';
    if (n <= 8)  return '11px';
    if (n <= 10) return '10.5px';
    if (n <= 12) return '10px';
    if (n <= 15) return '9.5px';
    if (n <= 18) return '9px';
    return '8.5px';
  }

  /** Dynamic cell padding: tighter as columns increase */
  get cellPad(): string {
    const n = this.totalCols;
    if (n <= 4)  return '6px 10px';
    if (n <= 6)  return '5px 8px';
    if (n <= 8)  return '5px 7px';
    if (n <= 10) return '4px 6px';
    if (n <= 12) return '4px 5px';
    if (n <= 15) return '3px 4px';
    if (n <= 18) return '3px 3px';
    return '2px 3px';
  }

  /** Header font slightly smaller than body font */
  get headerFontSize(): string {
    const body = parseFloat(this.fontSize);
    return `${Math.max(body - 0.5, 7.5)}px`;
  }

  get actionColWidth(): string {
    const count = this.rowActions.length + (this.eyeFirst ? 1 : 0);
    const iconWidth = Math.max(count * 36, 88);
    return `${iconWidth}px`;
  }

  onSort(col: TableColumn): void {
    if (!col.sortable) return;
    this.sort = this.sort.key === col.key
      ? { key: col.key, dir: this.sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: 'asc' };
    this.sortChange.emit({ ...this.sort });
  }

  onRowClick(row: any): void { this.rowClick.emit(row); }

  toggleSelectAll(checked: boolean): void {
    if (checked) this.data.forEach(r => this.selectedRows.add(r[this.rowKey]));
    else this.selectedRows.clear();
    this.selectionChange.emit(this.getSelected());
  }

  toggleRow(row: any): void {
    const k = row[this.rowKey];
    this.selectedRows.has(k) ? this.selectedRows.delete(k) : this.selectedRows.add(k);
    this.selectionChange.emit(this.getSelected());
  }

  isSelected(row: any): boolean { return this.selectedRows.has(row[this.rowKey]); }
  get allSelected(): boolean { return this.data.length > 0 && this.selectedRows.size === this.data.length; }
  get someSelected(): boolean { return this.selectedRows.size > 0 && this.selectedRows.size < this.data.length; }
  getSelected(): any[] { return this.data.filter(r => this.selectedRows.has(r[this.rowKey])); }

  getCellValue(row: any, col: TableColumn): any {
    return col.key.split('.').reduce((o: any, k: string) => o?.[k], row);
  }

  getBadgeClass(col: TableColumn, val: any): string {
    return col.badgeMap?.[val] ?? 'default';
  }

  sortIcon(col: TableColumn): string {
    if (this.sort.key !== col.key) return '⇅';
    return this.sort.dir === 'asc' ? '↑' : '↓';
  }
   displayValue(row: any, col: TableColumn): any {
    const v = this.getCellValue(row, col);
    if (col.type === 'date' && v) {
      try {
        const d = new Date(v);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const mo  = String(d.getMonth() + 1).padStart(2, '0');
          return `${day}-${mo}-${d.getFullYear()}`;
        }
      } catch {}
    }
    return v;
  }

  iconPath(icon: string): string {
    const p: Record<string, string> = {
      view:    'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
      edit:    'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
      delete:  'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6',
      email:   'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
      print:   'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
      qr:      'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M17 17h4v4h-4z',
      approve:  'M20 6L9 17l-5-5',
      reject:   'M18 6L6 18 M6 6l12 12',
      send:     'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
      convert:  'M5 12h14 M12 5l7 7-7 7',
      match:    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
      post:     'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
      flag:     'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
      receive:  'M12 15V3 M8 11l4 4 4-4 M20 19H4',
      truck:    'M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M18.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    };
    return p[icon] ?? '';
  }
}
