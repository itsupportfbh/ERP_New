import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FinanceActionKey, FinancePageConfig, FinanceService, FINANCE_PAGES } from './finance.service';
import { RowAction, TableColumn } from '../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-finance-workspace',
  standalone: false,
  templateUrl: './finance-workspace.component.html',
  styleUrls: ['./finance-workspace.component.scss']
})
export class FinanceWorkspaceComponent implements OnInit {
  config!: FinancePageConfig;
  loading = false;
  saving = false;
  error = '';
  message = '';
  rows: any[] = [];
  filtered: any[] = [];
  search = '';
  fromDate = '';
  toDate = '';
  formOpen = false;
  formMode: 'create' | 'update' = 'create';
  form: any = {};
  showLedgerFilters = false;
  ledgerPageSize = 10;

  badgeMap = {
    Draft: 'default',
    Pending: 'warning',
    Submitted: 'warning',
    Sent: 'warning',
    Approved: 'success',
    Posted: 'success',
    Paid: 'success',
    Open: 'warning',
    Closed: 'success',
    Locked: 'danger',
    Reconciled: 'success',
    Rejected: 'danger',
    true: 'success',
    false: 'default'
  } as any;

  private reportRows = [
    { id: 'trial-balance', reportName: 'Trial Balance', description: 'Account debit, credit and closing balance', module: 'Financial', route: '/app/finance/trial-balance' },
    { id: 'profit-loss', reportName: 'Profit and Loss', description: 'Income and expense statement', module: 'Financial', route: '/app/finance/profit-loss' },
    { id: 'balance-sheet', reportName: 'Balance Sheet', description: 'Assets, liabilities and equity statement', module: 'Financial', route: '/app/finance/balance-sheet' },
    { id: 'gst-report', reportName: 'GST Report', description: 'Input/output tax report', module: 'Tax & GST', route: '/app/finance/gst-report' },
    { id: 'ap-aging', reportName: 'AP Aging', description: 'Supplier payable aging', module: 'Accounts Payable', route: '/app/finance/ap-aging' },
    { id: 'ar-aging', reportName: 'AR Aging', description: 'Customer receivable aging', module: 'Accounts Receivable', route: '/app/finance/ar-aging' },
    { id: 'daybook', reportName: 'Daybook', description: 'Daily accounting transaction report', module: 'General Ledger', route: '/app/finance/daybook' },
    { id: 'collection-forecast', reportName: 'Collection Forecast', description: 'Expected collections by customer and date', module: 'Accounts Receivable', route: '/app/finance/collection-forecast' },
    { id: 'bank-reconciliation', reportName: 'Bank Reconciliation', description: 'Bank statement and ledger matching', module: 'Bank', route: '/app/finance/bank-reconciliation' },
    { id: 'opening-balance', reportName: 'Opening Balance', description: 'Opening account balance maintenance', module: 'General Ledger', route: '/app/finance/opening-balance' },
    { id: 'gst-return', reportName: 'GST Returns', description: 'GST return preparation and filing', module: 'Tax & GST', route: '/app/finance/gst-return' },
    { id: 'invoice-email', reportName: 'Invoice Email', description: 'Invoice email queue and resend', module: 'Accounts Receivable', route: '/app/finance/invoice-email' }
  ];

  constructor(private route: ActivatedRoute, private router: Router, private finance: FinanceService) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const key = this.route.snapshot.data['section'] || params.get('section') || 'chart-of-accounts';
      this.config = FINANCE_PAGES.find(p => p.key === key) || FINANCE_PAGES[0];
      this.resetForm();
      this.load();
      if (this.route.snapshot.data['autoCreate']) {
        setTimeout(() => this.openCreate());
      }
      if (this.route.snapshot.data['autoEdit']) {
        const id = params.get('id');
        if (id) this.loadEdit(id);
      }
    });
  }

  get columns(): TableColumn[] {
    return this.config.columns.map(col => ({
      ...col,
      sortable: true,
      type: col.type,
      badgeMap: col.type === 'badge' ? this.badgeMap : undefined
    }));
  }

  get rowActions(): RowAction[] {
    return this.config.actions
      .filter(action => action !== 'create')
      .map(action => ({
        key: action,
        label: this.label(action),
        btnClass: action === 'delete' ? 'danger' : action === 'post' || action === 'pay' || action === 'reconcile' || action === 'email' ? 'success' : 'warning'
      }));
  }

  get ledgerSummaryRows(): any[] {
    const buckets = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];
    const summaries = buckets.map((name, index) => {
      const matching = this.rows.filter(row => this.ledgerBucket(row) === name);
      const opening = matching.reduce((sum, row) => sum + this.amount(row, ['openingBalance', 'openingBal', 'opening']), 0);
      const debit = matching.reduce((sum, row) => sum + this.amount(row, ['debit', 'debitAmount']), 0);
      const credit = matching.reduce((sum, row) => sum + this.amount(row, ['credit', 'creditAmount']), 0);
      const balance = matching.length
        ? matching.reduce((sum, row) => sum + this.amount(row, ['balance', 'closingBalance']) + this.amount(row, ['debit', 'debitAmount']) - this.amount(row, ['credit', 'creditAmount']), 0)
        : 0;
      return {
        code: index + 1,
        accountName: name,
        opening,
        debit,
        credit,
        balance: Math.abs(balance)
      };
    });
    return summaries.slice(0, this.ledgerPageSize);
  }

  load(): void {
    if (this.config.endpoint.static === 'reports') {
      this.rows = [...this.reportRows];
      this.applyFilter();
      return;
    }
    this.loading = true;
    this.error = '';
    this.message = '';
    this.finance.list(this.config.endpoint, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        const list = this.finance.unwrap(res);
        const rows = list.length ? list : [this.finance.unwrapOne(res)].filter(row => row && Object.keys(row).length);
        this.rows = rows.map((r: any) => this.normalizeRow(r));
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.rows = [];
        this.filtered = [];
        this.error = err?.error?.message || `${this.config.title} data unavailable.`;
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(row => this.config.searchKeys.some(k => String(this.value(row, k) ?? '').toLowerCase().includes(q)))
      : [...this.rows];
  }

  openCreate(): void {
    if (this.config.key === 'journal') {
      this.router.navigate(['/app/finance/create-journal']);
      return;
    }
    this.formMode = 'create';
    this.resetForm();
    this.formOpen = true;
  }

  openEdit(row: any): void {
    if (this.config.key === 'journal') {
      this.router.navigate(['/app/finance/create-journal'], { queryParams: { id: row.id } });
      return;
    }
    this.formMode = 'update';
    this.form = { ...row };
    this.formOpen = true;
  }

  loadEdit(id: number | string): void {
    if (!this.config.endpoint.get) {
      this.formMode = 'update';
      this.form = { id };
      this.formOpen = true;
      return;
    }
    this.finance.get(this.config.endpoint, id).subscribe({
      next: res => {
        this.formMode = 'update';
        this.form = this.normalizeRow(this.finance.unwrapOne(res));
        this.formOpen = true;
      },
      error: err => {
        this.error = err?.error?.message || `Unable to load ${this.config.title}.`;
      }
    });
  }

  save(): void {
    if (!this.config.actions.includes(this.formMode)) return;
    this.saving = true;
    this.error = '';
    const request$ = this.formMode === 'create'
      ? this.finance.create(this.config.endpoint, this.form)
      : this.finance.update(this.config.endpoint, this.form.id, this.form);
    request$.subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.message = `${this.config.title} saved.`;
        this.load();
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || `Unable to save ${this.config.title}.`;
      }
    });
  }

  onRowClick(row: any): void {
    if (row.route) {
      this.router.navigateByUrl(row.route);
      return;
    }
    if (this.config.actions.includes('update')) this.openEdit(row);
  }

  onAction(e: { action: string; row: any }): void {
    const action = e.action as FinanceActionKey;
    if (action === 'update') this.openEdit(e.row);
    else if (action === 'delete') this.delete(e.row);
    else this.run(action, e.row);
  }

  delete(row: any): void {
    if (!confirm(`Delete ${this.config.title} record?`)) return;
    this.finance.delete(this.config.endpoint, row.id).subscribe({
      next: () => {
        this.message = 'Record deleted.';
        this.load();
      },
      error: err => { this.error = err?.error?.message || 'Unable to delete record.'; }
    });
  }

  run(action: FinanceActionKey, row: any): void {
    if (!confirm(`${this.label(action)} this ${this.config.title} record?`)) return;
    const payload = this.actionPayload(action, row);
    this.finance.run(this.config.endpoint, action, payload).subscribe({
      next: res => {
        if (action === 'export') {
          this.downloadBlob(res, `${this.config.key}-${this.toDateString(new Date())}.xlsx`);
          this.message = 'Export downloaded.';
        } else {
          this.message = `${this.label(action)} completed.`;
        }
        this.load();
      },
      error: err => { this.error = err?.error?.message || `${this.label(action)} failed.`; }
    });
  }

  resetForm(): void {
    this.form = {};
    (this.config?.formFields ?? []).forEach(field => {
      this.form[field.key] = field.type === 'number' ? 0 : '';
    });
  }

  value(row: any, key: string): any {
    return key.split('.').reduce((o: any, k: string) => o?.[k], row);
  }

  private normalizeRow(row: any): any {
    const copy = { ...row };
    copy.id = copy.id ?? copy.iD ?? copy.ID ?? copy.accountId ?? copy.journalId ?? copy.invoiceId ?? copy.receiptId ?? copy.periodId;
    this.config.columns.forEach(col => {
      const value = this.value(copy, col.key);
      if (col.type === 'badge') copy[col.key] = this.toBadgeValue(value);
    });
    return copy;
  }

  private toBadgeValue(value: any): string {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return ({ 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected', 4: 'Posted' } as any)[value] ?? String(value);
    return value ?? 'Draft';
  }

  private ledgerBucket(row: any): string {
    const text = [
      row?.accountType,
      row?.accountGroup,
      row?.accountName,
      row?.accountCode
    ].filter(Boolean).join(' ').toLowerCase();
    if (text.includes('asset') || text.startsWith('1')) return 'Assets';
    if (text.includes('liabil') || text.startsWith('2')) return 'Liabilities';
    if (text.includes('equity') || text.includes('capital') || text.startsWith('3')) return 'Equity';
    if (text.includes('income') || text.includes('revenue') || text.startsWith('4')) return 'Income';
    if (text.includes('expense') || text.startsWith('5')) return 'Expenses';
    return 'Assets';
  }

  private amount(row: any, keys: string[]): number {
    const found = keys.map(key => this.value(row, key)).find(value => value !== undefined && value !== null && value !== '');
    return Number(found ?? 0) || 0;
  }

  private actionPayload(action: FinanceActionKey, row: any): any {
    const id = row?.id ?? row?.periodId ?? row?.statementLineId ?? row?.returnId ?? row?.gstReturnId ?? row?.journalId;
    if (action === 'post' && this.config.key === 'journal') return { ...row, id, ids: [id].filter(Boolean) };
    if (action === 'post') return { ...row, id };
    if (action === 'lock') return { ...row, id, periodId: id, lock: true };
    if (action === 'unlock') return { ...row, id, periodId: id, lock: false };
    if (action === 'fx') return { ...row, id, periodId: id, fxDate: this.toDateString(new Date()) };
    if (action === 'run') {
      const year = new Date().getFullYear();
      return { ...row, id, fyStartYear: row?.fyStartYear ?? year, fyEndYear: row?.fyEndYear ?? year + 1, closeDate: this.toDateString(new Date()) };
    }
    if (action === 'preview') {
      const year = new Date().getFullYear();
      return { ...row, id, fyStartYear: row?.fyStartYear ?? year, closeDate: this.toDateString(new Date()) };
    }
    if (action === 'file') return { ...row, id, filingNo: row?.filingNo ?? `FILE-${id ?? Date.now()}` };
    if (action === 'pay') return { ...row, id, invoiceId: id, amount: row?.balance ?? row?.amount ?? 0, paymentDate: this.toDateString(new Date()) };
    if (action === 'reconcile') return { ...row, id, statementLineId: id };
    if (action === 'unreconcile') return { ...row, id, statementLineId: id };
    if (action === 'import') return { ...row, id, lines: row?.lines ?? [] };
    return { ...row, id };
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private label(action: FinanceActionKey): string {
    return ({
      create: 'Create',
      update: 'Edit',
      delete: 'Delete',
      post: 'Post',
      pay: 'Pay',
      lock: 'Lock',
      unlock: 'Unlock',
      reconcile: 'Reconcile',
      email: 'Email',
      close: 'Close',
      run: 'Run',
      preview: 'Preview',
      file: 'Mark Filed',
      reopen: 'Reopen',
      export: 'Export',
      fx: 'FX Reval',
      unreconcile: 'Unreconcile',
      import: 'Import'
    } as Record<FinanceActionKey, string>)[action];
  }
}
