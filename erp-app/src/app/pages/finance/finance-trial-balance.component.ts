import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';

@Component({
  selector: 'erp-finance-trial-balance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-trial-balance.component.html',
  styleUrls: ['./finance-trial-balance.component.scss']
})
export class FinanceTrialBalanceComponent implements OnInit {
  Math = Math;
  rows: any[] = [];
  rowMap = new Map<any, any>();
  expanded = new Set<any>();
  expandedDetail = new Set<any>();
  loading = false;
  error = '';
  fromDate = '';
  toDate = '';
  search = '';

  summary = { openDebit: 0, openCredit: 0, closeDebit: 0, closeCredit: 0 };

  private endpoint = { list: '/financereport/trial-balance', listMethod: 'POST' as const, listBody: {} };

  constructor(private finance: FinanceService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.error = '';
    const body = this.fromDate || this.toDate ? { fromDate: this.fromDate, toDate: this.toDate } : {};
    this.finance.list(this.endpoint, body).subscribe({
      next: res => {
        this.rows = this.finance.unwrap(res);
        this.buildMap();
        this.calcSummary();
        this.loading = false;
      },
      error: () => { this.rows = []; this.loading = false; this.error = 'Trial Balance unavailable.'; }
    });
  }

  private buildMap(): void {
    this.rowMap.clear();
    this.rows.forEach(r => {
      const id = r.id ?? r.accountId ?? r.accountCode;
      r._id = id;
      r._parentId = r.parentAccountId ?? r.parentId ?? null;
      r._level = r.level ?? 0;
      r._hasChildren = false;
      this.rowMap.set(id, r);
    });
    this.rows.forEach(r => {
      if (r._parentId != null) {
        const parent = this.rowMap.get(r._parentId);
        if (parent) parent._hasChildren = true;
      }
    });
  }

  get filteredRows(): any[] {
    if (this.search) {
      const q = this.search.toLowerCase();
      return this.rows.filter(r =>
        String(r.accountCode ?? '').toLowerCase().includes(q) ||
        String(r.accountName ?? '').toLowerCase().includes(q)
      );
    }
    return this.rows.filter(r => this.isVisible(r));
  }

  private isVisible(row: any): boolean {
    if (!row._parentId) return true;
    const parent = this.rowMap.get(row._parentId);
    if (!parent) return true;
    return this.expanded.has(row._parentId) && this.isVisible(parent);
  }

  toggle(row: any): void {
    this.expanded.has(row._id) ? this.expanded.delete(row._id) : this.expanded.add(row._id);
  }

  toggleDetail(row: any): void {
    this.expandedDetail.has(row._id) ? this.expandedDetail.delete(row._id) : this.expandedDetail.add(row._id);
  }

  private calcSummary(): void {
    this.summary.openDebit   = this.rows.reduce((s, r) => s + Math.max(r.openingBalance ?? 0, 0), 0);
    this.summary.openCredit  = this.rows.reduce((s, r) => s + Math.abs(Math.min(r.openingBalance ?? 0, 0)), 0);
    this.summary.closeDebit  = this.rows.reduce((s, r) => s + Math.max(r.closingBalance ?? 0, 0), 0);
    this.summary.closeCredit = this.rows.reduce((s, r) => s + Math.abs(Math.min(r.closingBalance ?? 0, 0)), 0);
  }

  get totalOpenDebit():   number { return this.rows.reduce((s, r) => s + Math.max(r.openingBalance ?? r.debit ?? 0, 0), 0); }
  get totalOpenCredit():  number { return this.rows.reduce((s, r) => s + (r.credit ?? 0), 0); }
  get totalCloseDebit():  number { return this.rows.reduce((s, r) => s + Math.max(r.closingBalance ?? 0, 0), 0); }
  get totalCloseCredit(): number { return this.rows.reduce((s, r) => s + Math.abs(Math.min(r.closingBalance ?? 0, 0)), 0); }

  indentPx(row: any): string { return `${(row._level || 0) * 20}px`; }
}
