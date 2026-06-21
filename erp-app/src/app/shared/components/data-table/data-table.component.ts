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

  sort: SortState = { key: '', dir: 'asc' };
  selectedRows = new Set<any>();

  ngOnChanges(): void { this.selectedRows.clear(); }

  /** Total visible columns including optional checkbox and action columns */
  get totalCols(): number {
    return this.columns.length + (this.selectable ? 1 : 0) + (this.rowActions.length ? 1 : 0);
  }

  onAction(key: string, row: any, e: Event): void {
    e.stopPropagation();
    this.actionClick.emit({ action: key, row });
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
    const iconWidth = Math.max(this.rowActions.length * 36, 88);
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
}
