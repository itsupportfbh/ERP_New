import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { SharedModule } from '../../shared/shared.module';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-finance-coa',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule],
  templateUrl: './finance-coa.component.html',
  styleUrls: ['./finance-coa.component.scss']
})
export class FinanceCoaComponent implements OnInit {
  rows: any[] = [];
  displayRows: any[] = [];
  /** Parent Head choices, searchable by code or name (e.g. "1200 – Trade Debtors"). */
  parentHeadOptions: { label: string; value: any }[] = [];
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
  form: any = { headCode: null, headName: '', headType: '', headLevel: null, parentHead: null, isGl: false, isTransaction: false, systemAccountType: '' };
  systemAccountOptions = [
    { label: 'None', value: '' },
    { label: 'Cash Account', value: 'cash' },
    { label: 'Advance Payment Account', value: 'advance' },
    { label: 'Retained Earnings Account', value: 'retainedearnings' },
    { label: 'Output Tax Account', value: 'outputtax' },
    { label: 'Input Tax Account', value: 'inputtax' },
    { label: 'GST Payable Account', value: 'gstpayable' },
    { label: 'GST Receivable Account', value: 'gstreceivable' },
    { label: 'Supplier Deposit Account', value: 'supplierdeposit' }
  ];
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
        this.buildParentHeadOptions();
        this.rebuildDisplayRows();
        this.loading = false;
      },
      error: () => { this.rows = []; this.loading = false; this.error = 'Chart of Accounts unavailable.'; }
    });
  }

  private buildParentHeadOptions(): void {
    this.parentHeadOptions = this.rows
      .map(r => ({ label: `${r.headCode} – ${r.headName}`, value: r.headCode }))
      .sort((a, b) => String(a.value).localeCompare(String(b.value), undefined, { numeric: true }));
  }

  private buildMap(): void {
    this.rowMap.clear();
    this.rows.forEach(r => {
      r._id       = String(r.headCode);
      r._dbId     = r.id;
      r._parentId = (r.parentHead && r.parentHead !== 0) ? String(r.parentHead) : null;
      r._level    = 0;
      r._hasChildren = false;
      if (!this.rowMap.has(r._id)) this.rowMap.set(r._id, r);  // first-wins — no overwrite on dup headCode
    });
    // Scan all rows directly so duplicate-headCode overwrites don't lose _hasChildren on the original
    this.rows.forEach(r => {
      if (r._parentId) {
        this.rows.forEach(p => { if (p._id === r._parentId) p._hasChildren = true; });
      }
    });
    this.rows.forEach(r => { r._level = this.computeLevel(r); });
  }

  private computeLevel(row: any, depth = 0, visited = new Set<any>()): number {
    if (depth > 20 || !row._parentId) return depth;
    if (visited.has(row._parentId)) return depth; // circular reference guard
    visited.add(row._parentId);
    const parent = this.rowMap.get(row._parentId);
    if (!parent) return depth;
    return this.computeLevel(parent, depth + 1, visited);
  }

  get pagedRows(): any[] {
    if (this.search) {
      const q = this.search.toLowerCase();
      return this.rows.filter(r =>
        String(r.headCode ?? '').toLowerCase().includes(q) ||
        String(r.headName ?? '').toLowerCase().includes(q) ||
        String(r.headType ?? '').toLowerCase().includes(q)
      );
    }
    return this.displayRows;
  }

  private rebuildDisplayRows(): void {
    const result: any[] = [];
    this.addVisible(null, result);
    this.displayRows = result;
  }

  private addVisible(parentId: string | null, result: any[]): void {
    this.rows
      .filter(r => r._parentId === parentId)
      .forEach(r => {
        result.push(r);
        if (r._hasChildren && this.expanded.has(r._id)) {
          this.addVisible(r._id, result);
        }
      });
  }

  toggle(row: any): void {
    const key = row._id;
    this.expanded.has(key) ? this.expanded.delete(key) : this.expanded.add(key);
    this.rebuildDisplayRows();
  }

  isExpanded(row: any): boolean {
    return this.expanded.has(row._id);
  }

  openCreate(): void {
    this.editRow = null;
    this.form = { headCode: null, headName: '', headType: '', headLevel: null, parentHead: null, pHeadName: 'COA', isGl: false, isTransaction: false, systemAccountType: '' };
    this.applyTopLevelDefaults();
    this.showForm = true;
    this.message = '';
    this.error = '';
  }

  openEdit(row: any): void {
    this.editRow = row;
    const parent = row.parentHead ? this.rows.find(r => Number(r.headCode) === Number(row.parentHead)) : null;
    this.form = {
      headCode:          row.headCode,
      headName:          row.headName,
      headType:          row.headType ?? '',
      headLevel:         row.headLevel ?? (row._level + 1),
      parentHead:        row.parentHead ?? null,
      pHeadName:         parent ? parent.headName : 'COA',
      isGl:              row.isGl ?? false,
      isTransaction:     row.isTransaction ?? false,
      systemAccountType: row.systemAccountType ?? ''
    };
    this.showForm = true;
    this.message = '';
    this.error = '';
  }

  onParentHeadChange(): void {
    if (this.editRow) return;
    const parentCode = this.form.parentHead;
    if (!parentCode) {
      this.applyTopLevelDefaults();
    } else {
      this.applyChildDefaults(Number(parentCode));
    }
  }

  private applyTopLevelDefaults(): void {
    const levelOneItems = this.rows.filter(r => !r._parentId || r._parentId === '0' || r._parentId === 0);
    const nextCode = (levelOneItems.length || 0) + 1;
    this.form.headCode  = nextCode;
    this.form.headLevel = 1;
    this.form.pHeadName = 'COA';
  }

  private applyChildDefaults(parentCode: number): void {
    const parent = this.rows.find(r => Number(r.headCode) === parentCode);
    if (!parent) return;

    const parentCodeStr = String(parent.headCode ?? '');
    const parentLevel   = Number(parent.headLevel ?? (parent._level + 1));

    const childCodes = this.rows
      .filter(r =>
        String(r.headCode ?? '').startsWith(parentCodeStr) &&
        Number(r.headLevel ?? (r._level + 1)) === parentLevel + 1
      )
      .map(r => String(r.headCode ?? ''));

    const suffixes = childCodes
      .map(code => parseInt(code.substring(parentCodeStr.length) || '0', 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    const nextSeq = suffixes.length ? suffixes[suffixes.length - 1] + 1 : 1;
    const maxLen  = Math.max(2, ...childCodes.map(code => Math.max(0, code.length - parentCodeStr.length)));
    const seqStr  = String(nextSeq).padStart(maxLen, '0');

    this.form.headCode  = parentCodeStr + seqStr;
    this.form.headLevel = parentLevel + 1;
    this.form.headType  = parent.headType ?? '';
    this.form.pHeadName = parent.headName ?? '';
  }

  save(): void {
    if (!this.form.headCode || !this.form.headName) {
      Swal.fire('Required', 'Head Code and Name are required.', 'warning');
      return;
    }
    this.saving = true;
    const isEdit = !!this.editRow;
    const obs = isEdit
      ? this.finance.update(this.endpoint, this.editRow._dbId, this.form)
      : this.finance.create(this.endpoint, this.form);
    const systemType = this.form.systemAccountType;
    const headName   = this.form.headName;

    obs.subscribe({
      next: (res: any) => {
        this.saving = false;
        this.showForm = false;
        this.load();

        // On create: only map when a type is chosen. On edit: always sync so
        // changing the type to "None" clears the previous mapping too.
        const newId = res?.data ?? (isEdit ? this.editRow._dbId : null);
        if (newId && (systemType || isEdit)) {
          this.finance.setSystemAccount(newId, systemType || '').subscribe();
        }

        Swal.fire({
          icon: 'success',
          title: isEdit ? 'Updated!' : 'Created!',
          text: isEdit
            ? `"${headName}" updated successfully.`
            : `"${headName}" created successfully.`,
          timer: 2000,
          showConfirmButton: false
        });
      },
      error: err => {
        this.saving = false;
        Swal.fire('Error', err?.error?.message || 'Unable to save.', 'error');
      }
    });
  }

  delete(row: any): void {
    Swal.fire({
      title: 'Delete Account?',
      text: `"${row.headName}" will be permanently deleted.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e74c3c',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel'
    }).then(r => {
      if (r.isConfirmed) {
        this.finance.delete(this.endpoint, row._dbId).subscribe({
          next: () => {
            this.load();
            Swal.fire({
              icon: 'success',
              title: 'Deleted!',
              text: `"${row.headName}" has been deleted.`,
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: err => {
            Swal.fire('Error', err?.error?.message || 'Unable to delete.', 'error');
          }
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
