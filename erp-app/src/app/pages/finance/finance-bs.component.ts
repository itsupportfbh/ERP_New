import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';

@Component({
  selector: 'erp-finance-bs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-bs.component.html',
  styleUrls: ['./finance-bs.component.scss']
})
export class FinanceBsComponent implements OnInit {
  rows: any[] = [];
  expanded = new Set<string>();
  loading = false;
  error = '';
  fromDate = '';
  toDate = '';

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  private endpoint = { list: '/FinanceReport/GetBalanceSheetDetails' };

  constructor(private finance: FinanceService, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.permissionService.getFunctionPermission(this.userId, 'reports').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.finance.list(this.endpoint, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        this.rows = this.finance.unwrap(res);
        this.buildLevels();
        this.loading = false;
      },
      error: () => { this.rows = []; this.loading = false; this.error = 'Balance Sheet data unavailable.'; }
    });
  }

  private buildLevels(): void {
    this.rows.forEach(r => {
      r._level = r.level ?? 0;
      r._hasChildren = false;
      r._id = r.id ?? r.accountId ?? r.accountCode ?? r.accountName;
      r._parentId = r.parentAccountId ?? r.parentId ?? null;
    });
    this.rows.forEach(r => {
      if (r._parentId != null) {
        const parent = this.rows.find(p => p._id === r._parentId);
        if (parent) parent._hasChildren = true;
      }
    });
  }

  get assetRows(): any[] {
    return this.rows.filter(r => {
      const s = String(r.section ?? r.accountType ?? r.category ?? '').toLowerCase();
      return s.includes('asset') || s.includes('1');
    });
  }

  get liabilityRows(): any[] {
    return this.rows.filter(r => {
      const s = String(r.section ?? r.accountType ?? r.category ?? '').toLowerCase();
      return s.includes('liabil') || s.includes('equity') || s.includes('capital') || s.includes('2') || s.includes('3');
    });
  }

  get totalAssets():      number { return this.assetRows.reduce((s, r)     => s + (r.amount || 0), 0); }
  get totalLiabilities(): number { return this.liabilityRows.reduce((s, r) => s + (r.amount || 0), 0); }

  toggle(row: any): void {
    const key = String(row._id);
    this.expanded.has(key) ? this.expanded.delete(key) : this.expanded.add(key);
  }

  isExpanded(row: any): boolean { return this.expanded.has(String(row._id)); }

  visibleIn(list: any[]): any[] {
    return list.filter(r => {
      if (!r._parentId) return true;
      const parent = list.find(p => p._id === r._parentId);
      if (!parent) return true;
      return this.isExpanded(parent);
    });
  }

  indentPx(row: any): string { return `${12 + (row._level || 0) * 16}px`; }

  initials(name: string): string {
    return (name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  }
}
