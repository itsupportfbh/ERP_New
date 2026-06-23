import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-finance-coa',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-coa.component.html',
  styleUrls: ['./finance-coa.component.scss']
})
export class FinanceCoaComponent implements OnInit {
  rows: any[] = [];
  rowMap = new Map<any, any>();
  expanded = new Set<any>();
  search = '';
  loading = false;
  error = '';
  message = '';

  pageSize = 10;

  showForm = false;
  editRow: any = null;
  saving = false;
  form: any = { headCode: null, headName: '', headType: '', parentHead: null, isGl: false, isTransaction: false };
  accountTypes = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  private endpoint = {
    list:   '/ChartOfAccount/GetChartOfAccounts',
    get:    '/ChartOfAccount/GetChartOfAccountById/',
    create: '/ChartOfAccount/CreateChartOfAccount',
    update: '/ChartOfAccount/UpdateChartOfAccountById/',
    delete: '/ChartOfAccount/DeleteChartOfAccountById/'
  };

  constructor(private finance: FinanceService, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.permissionService.getFunctionPermission(this.userId, 'coa').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.finance.list(this.endpoint).subscribe({
      next: res => {
        this.rows = this.finance.unwrap(res);
        this.buildMap();
        this.loading = false;
      },
      error: () => { this.rows = []; this.loading = false; this.error = 'Chart of Accounts unavailable.'; }
    });
  }

  private buildMap(): void {
    this.rowMap.clear();
    this.rows.forEach(r => {
      // parentHead references the parent's headCode (not database id)
      r._id    = String(r.headCode);                                              // tree key = headCode
      r._dbId  = r.id;                                                            // keep db id for CRUD
      r._parentId = (r.parentHead && r.parentHead !== 0) ? String(r.parentHead) : null;
      r._level = 0;
      r._hasChildren = false;
      this.rowMap.set(r._id, r);                                                  // map keyed by headCode
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

  get pagedRows(): any[] {
    return this.filteredRows;
  }

  get filteredRows(): any[] {
    if (this.search) {
      const q = this.search.toLowerCase();
      return this.rows.filter(r =>
        String(r.headCode ?? '').toLowerCase().includes(q) ||
        String(r.headName ?? '').toLowerCase().includes(q) ||
        String(r.headType ?? '').toLowerCase().includes(q)
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

  toggle(row: any): void {
    const key = row._id as string;
    this.expanded.has(key) ? this.expanded.delete(key) : this.expanded.add(key);
  }

  isExpanded(row: any): boolean {
    return this.expanded.has(row._id as string);
  }

  openCreate(): void {
    this.editRow = null;
    this.form = { headCode: null, headName: '', headType: '', parentHead: null, isGl: false, isTransaction: false };
    this.showForm = true;
    this.message = '';
    this.error = '';
  }

  openEdit(row: any): void {
    this.editRow = row;
    this.form = {
      headCode: row.headCode,
      headName: row.headName,
      headType: row.headType ?? '',
      parentHead: row.parentHead ?? null,
      isGl: row.isGl ?? false,
      isTransaction: row.isTransaction ?? false
    };
    this.showForm = true;
    this.message = '';
    this.error = '';
  }

  save(): void {
    if (!this.form.headCode || !this.form.headName) {
      Swal.fire('Required', 'Head Code and Name are required.', 'warning');
      return;
    }
    this.saving = true;
    const obs = this.editRow
      ? this.finance.update(this.endpoint, this.editRow._dbId, this.form)
      : this.finance.create(this.endpoint, this.form);
    obs.subscribe({
      next: () => { this.saving = false; this.showForm = false; this.message = 'Account saved.'; this.load(); },
      error: err => { this.saving = false; this.error = err?.error?.message || 'Unable to save.'; }
    });
  }

  delete(row: any): void {
    Swal.fire({ title: 'Delete Account?', text: row.headName, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e74c3c', confirmButtonText: 'Delete' })
      .then(r => {
        if (r.isConfirmed) {
          this.finance.delete(this.endpoint, row._dbId).subscribe({
            next: () => { this.message = 'Account deleted.'; this.load(); },
            error: err => { this.error = err?.error?.message || 'Unable to delete.'; }
          });
        }
      });
  }

  get parentAccounts(): any[] {
    return this.rows.filter(r => !r._parentId);
  }

  indentPx(row: any): string {
    return `${(row._level || 0) * 24}px`;
  }
}
