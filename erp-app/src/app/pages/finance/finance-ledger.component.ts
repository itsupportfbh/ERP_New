import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';

@Component({
  selector: 'erp-finance-ledger',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-ledger.component.html',
  styleUrls: ['./finance-ledger.component.scss']
})
export class FinanceLedgerComponent implements OnInit {
  rows: any[] = [];
  rowMap = new Map<string, any>();
  expanded = new Set<string>();
  loading = false;
  error = '';
  fromDate = '';
  toDate = '';
  showFilter = false;
  search = '';
  pageSize = 10;
  currentPage = 1;

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  private endpoint = { list: '/GeneralLedger/GetGeneralLedger' };

  constructor(private finance: FinanceService, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.permissionService.getFunctionPermission(this.userId, 'ledger').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.showFilter = false;
    this.expanded.clear();
    this.finance.list(this.endpoint, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        this.rows = this.finance.unwrap(res);
        this.buildMap();
        this.loading = false;
      },
      error: () => { this.rows = []; this.loading = false; this.error = 'General Ledger data unavailable.'; }
    });
  }

  private buildMap(): void {
    this.rowMap.clear();
    this.rows.forEach(r => {
      r._id = String(r.headCode);   // key by headCode — parentHead references headCode
      r._parentId = (r.parentHead && r.parentHead !== 0) ? String(r.parentHead) : null;
      r._level = 0;
      r._hasChildren = false;
      this.rowMap.set(r._id, r);
    });
    this.rows.forEach(r => {
      if (r._parentId) {
        const parent = this.rowMap.get(r._parentId);
        if (parent) parent._hasChildren = true;
      }
    });
    this.rows.forEach(r => { r._level = this.computeLevel(r); });
  }

  private computeLevel(row: any, depth = 0): number {
    if (depth > 15 || !row._parentId) return depth;
    const parent = this.rowMap.get(row._parentId);
    if (!parent) return depth;
    return this.computeLevel(parent, depth) + 1;
  }

  // Build visible list in tree order: parent first, then expanded children
  get visibleRows(): any[] {
    if (this.search) {
      const q = this.search.toLowerCase();
      return this.rows.filter(r =>
        String(r.headCode ?? '').toLowerCase().includes(q) ||
        String(r.headName ?? '').toLowerCase().includes(q)
      );
    }
    const result: any[] = [];
    this.addVisible(null, result);
    return result;
  }

  private addVisible(parentId: string | null, result: any[]): void {
    this.rows
      .filter(r => r._parentId === parentId)
      .forEach(r => {
        result.push(r);
        if (r._hasChildren && this.expanded.has(r._id as string)) {
          this.addVisible(r._id, result);
        }
      });
  }

  // Current page slice of visibleRows
  get pagedRows(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.visibleRows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.visibleRows.length / this.pageSize));
  }

  get pageFrom(): number {
    return this.visibleRows.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageTo(): number {
    return Math.min(this.currentPage * this.pageSize, this.visibleRows.length);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  setPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.currentPage = p;
  }

  toggle(row: any): void {
    const key = row._id as string;
    this.expanded.has(key) ? this.expanded.delete(key) : this.expanded.add(key);
    this.currentPage = 1;
  }

  isExpanded(row: any): boolean {
    return this.expanded.has(row._id as string);
  }

  levelClass(row: any): string {
    const l = row._level ?? 0;
    if (l === 0) return 'lvl-0';
    if (l === 1) return 'lvl-1';
    if (l === 2) return 'lvl-2';
    if (l === 3) return 'lvl-3';
    return 'lvl-deep';
  }

  get totalDebit():   number { return this.rows.reduce((s, r) => s + (r.debit || 0), 0); }
  get totalCredit():  number { return this.rows.reduce((s, r) => s + (r.credit || 0), 0); }
  get totalBalance(): number { return this.rows.reduce((s, r) => s + (r.balance || r.closingBalance || 0), 0); }

  indentPx(row: any): string { return `${(row._level || 0) * 24}px`; }
}
