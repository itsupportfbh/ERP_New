import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FinanceActionKey, FinancePageConfig, FinanceService, FINANCE_PAGES } from './finance.service';
import { RowAction, TableColumn } from '../../shared/components/data-table/data-table.component';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';

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
  journalTypeFilter = '';
  fromDate = '';
  toDate = '';
  formOpen = false;
  formMode: 'create' | 'update' = 'create';
  form: any = {};
  showLedgerFilters = false;
  ledgerPageSize = 10;

  // Period Close
  selectedPeriod = '';
  lockPeriod = false;
  fxRevalDate = new Date().toISOString().slice(0, 10);
  lastFxResult: any = null;

  // Year End Close
  fyStartYear = this.currentFiscalYear();
  closeDate = `${this.currentFiscalYear() + 1}-03-31`;

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));
  yearEndPreviewRows: any[] = [];

  get sortedPeriods(): any[] {
    return [...this.rows].sort((a, b) => {
      const da = new Date(b.startDate ?? b.StartDate ?? b.fromDate ?? 0).getTime();
      const db = new Date(a.startDate ?? a.StartDate ?? a.fromDate ?? 0).getTime();
      return da - db;
    });
  }

  getPeriodLabel(p: any): string {
    const raw = p.label || p.periodName || p.period || p.name || p.periodLabel || p.description || '';
    if (raw && !/^\d{6}$/.test(raw.trim())) return raw;
    const d = new Date(p.startDate ?? p.StartDate ?? p.fromDate);
    if (!isNaN(d.getTime())) return d.toLocaleString('en-SG', { month: 'long', year: 'numeric' });
    return 'Period ' + (p.id ?? p.periodId ?? p.periodNo ?? '');
  }

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

  private readonly permFnMap: Record<string, string> = {
    'period-close': 'period',
    'year-end-close': 'year-end',
    'journal': 'journal',
    'chart-of-accounts': 'coa',
    'opening-balance': 'ledger',
    'bank-reconciliation': 'ledger',
    'gst-return': 'tax',
    'gst-report': 'tax',
    'invoice-email': 'ar',
    'collection-forecast': 'ar',
    'daybook': 'ledger',
    'reports': 'reports'
  };

  constructor(private route: ActivatedRoute, private router: Router, private finance: FinanceService, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const key = this.route.snapshot.data['section'] || params.get('section') || 'chart-of-accounts';
      this.config = FINANCE_PAGES.find(p => p.key === key) || FINANCE_PAGES[0];
      this.setDefaultDates();
      this.resetForm();
      this.load();
      if (this.route.snapshot.data['autoCreate']) {
        setTimeout(() => this.openCreate());
      }
      if (this.route.snapshot.data['autoEdit']) {
        const id = params.get('id');
        if (id) this.loadEdit(id);
      }
      const fnId = this.permFnMap[key] ?? key;
      this.permissionService.getFunctionPermission(this.userId, fnId).subscribe({
        next: perm => { this.permission = perm; }
      });
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
    this.finance.list(this.config.endpoint, this.listParams()).subscribe({
      next: res => {
        const list = this.finance.unwrap(res);
        const rows = list.length ? list : [this.finance.unwrapOne(res)].filter(row => row && Object.keys(row).length);
        this.rows = rows.map((r: any) => this.normalizeRow(r));
        this.applyFilter();
        this.loading = false;
        if (this.config.key === 'period-close' && this.rows.length) {
          if (!this.selectedPeriod) {
            const first = this.sortedPeriods[0];
            this.selectedPeriod = String(first.id ?? first.periodId ?? first.periodNo ?? '');
          }
          // Always sync toggle state from DB after load
          const current = this.rows.find(r => String(r.id ?? r.periodId ?? r.periodNo) === String(this.selectedPeriod));
          if (current) {
            this.lockPeriod = !!(current.isLocked || current.IsLocked || current.status === 'Locked');
            const endDate = current.endDate ?? current.EndDate;
            if (endDate && !this.fxRevalDate) this.fxRevalDate = new Date(endDate).toISOString().slice(0, 10);
          }
        }
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
    let result = q
      ? this.rows.filter(row => this.config.searchKeys.some(k => String(this.value(row, k) ?? '').toLowerCase().includes(q)))
      : [...this.rows];
    if (this.config.key === 'journal' && this.journalTypeFilter) {
      result = result.filter(row => (row.entryType ?? '') === this.journalTypeFilter);
    }
    this.filtered = result;
  }

  get journalTypeOptions(): string[] {
    const types = new Set<string>();
    this.rows.forEach(r => { if (r.entryType) types.add(r.entryType); });
    return Array.from(types).sort();
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

  runFxReval(): void {
    const periodId = Number(this.selectedPeriod);
    if (!periodId) { this.error = 'Please select a period first.'; return; }
    if (!this.fxRevalDate) { this.error = 'Please enter FX Revaluation date.'; return; }
    this.error = '';
    const payload = { periodId, fxDate: this.fxRevalDate };
    this.saving = true;
    this.finance.run(this.config.endpoint, 'fx', payload).subscribe({
      next: (res: any) => {
        this.saving = false;
        this.lastFxResult = this.finance.unwrapOne(res);
        this.message = 'FX Revaluation completed successfully.';
        this.load();
      },
      error: (err: any) => { this.saving = false; this.error = err?.error?.message || 'FX Revaluation failed.'; }
    });
  }

  onPeriodChange(): void {
    const row = this.rows.find(r => String(r.id ?? r.periodId ?? r.periodNo) === String(this.selectedPeriod));
    if (row) {
      this.lockPeriod = !!(row.isLocked || row.IsLocked || row.status === 'Locked');
      const endDate = row.endDate ?? row.EndDate;
      if (endDate) this.fxRevalDate = new Date(endDate).toISOString().slice(0, 10);
    }
    this.error = '';
    this.message = '';
  }

  onLockToggle(): void {
    const periodId = Number(this.selectedPeriod);
    if (!periodId) {
      this.error = 'Please select a period first.';
      this.lockPeriod = false;
      return;
    }
    const action = this.lockPeriod ? 'Lock' : 'Unlock';
    const confirmed = confirm(`${action} this accounting period? ${this.lockPeriod ? 'No transactions can be posted to a locked period.' : ''}`);
    if (!confirmed) {
      this.lockPeriod = !this.lockPeriod;
      return;
    }
    this.error = '';
    this.saving = true;
    const payload = { periodId, lock: this.lockPeriod };
    this.finance.run(this.config.endpoint, this.lockPeriod ? 'lock' : 'unlock', payload).subscribe({
      next: () => {
        this.saving = false;
        this.message = `Period ${this.lockPeriod ? 'locked' : 'unlocked'} successfully.`;
        this.load();
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message || `${action} failed.`;
        this.lockPeriod = !this.lockPeriod;
      }
    });
  }

  openTrialBalance(): void {
    this.router.navigate(['/app/finance/trial-balance']);
  }

  previewYearEnd(): void {
    this.error = '';
    this.message = '';
    this.saving = true;
    const payload = { fyStartYear: this.fyStartYear, closeDate: this.closeDate };
    this.finance.run(this.config.endpoint, 'preview', payload).subscribe({
      next: res => {
        this.saving = false;
        const list = this.finance.unwrap(res);
        const one = this.finance.unwrapOne(res);
        this.yearEndPreviewRows = (list.length ? list : (Array.isArray(one) ? one : [one]))
          .filter(row => row && Object.keys(row).length)
          .map(row => this.normalizeRow(row));
        this.rows = this.yearEndPreviewRows;
        this.applyFilter();
        this.message = 'Year end preview loaded.';
      },
      error: err => {
        this.saving = false;
        this.yearEndPreviewRows = [];
        this.error = err?.error?.message || 'Year end preview failed.';
      }
    });
  }

  runYearEndClose(): void {
    if (!confirm(`Run year end close for FY ${this.fyStartYear}?`)) return;
    this.error = '';
    this.message = '';
    this.saving = true;
    const payload = { fyStartYear: this.fyStartYear, fyEndYear: this.fyStartYear + 1, closeDate: this.closeDate };
    this.finance.run(this.config.endpoint, 'run', payload).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Year end close completed.';
        this.load();
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || 'Year end close failed.';
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
        } else if (action === 'preview') {
          const list = this.finance.unwrap(res);
          const one = this.finance.unwrapOne(res);
          this.rows = (list.length ? list : (Array.isArray(one) ? one : [one])).filter((item: any) => item && Object.keys(item).length).map((item: any) => this.normalizeRow(item));
          this.applyFilter();
          this.message = 'Preview loaded.';
        } else {
          this.message = `${this.label(action)} completed.`;
          this.load();
        }
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
    copy.id = copy.id ?? copy.iD ?? copy.ID ?? copy.accountId ?? copy.AccountId ?? copy.journalId ?? copy.JournalId ?? copy.invoiceId ?? copy.InvoiceId ?? copy.receiptId ?? copy.ReceiptId ?? copy.periodId ?? copy.PeriodId ?? copy.returnId ?? copy.ReturnId ?? copy.gstReturnId ?? copy.GstReturnId ?? copy.statementLineId ?? copy.StatementLineId;
    copy.accountCode = copy.accountCode ?? copy.AccountCode ?? copy.headCode ?? copy.HeadCode;
    copy.accountName = copy.accountName ?? copy.AccountName ?? copy.headName ?? copy.HeadName;
    copy.accountType = copy.accountType ?? copy.AccountType ?? copy.rootHeadType ?? copy.RootHeadType;
    copy.parentAccountName = copy.parentAccountName ?? copy.ParentAccountName ?? copy.parentName ?? copy.ParentName;
    copy.isActive = copy.isActive ?? copy.IsActive;
    copy.journalNo = copy.journalNo ?? copy.JournalNo;
    copy.journalDate = copy.journalDate ?? copy.JournalDate;
    copy.description = copy.description ?? copy.Description ?? copy.narration ?? copy.Narration;
    copy.totalDebit = copy.totalDebit ?? copy.TotalDebit;
    copy.totalCredit = copy.totalCredit ?? copy.TotalCredit;
    copy.status = copy.status ?? copy.Status;
    copy.periodName = copy.periodName ?? copy.PeriodName;
    copy.fromDate = copy.fromDate ?? copy.FromDate ?? copy.startDate ?? copy.StartDate;
    copy.toDate = copy.toDate ?? copy.ToDate ?? copy.endDate ?? copy.EndDate;
    copy.closedByName = copy.closedByName ?? copy.ClosedByName;
    copy.fiscalYear = copy.fiscalYear ?? copy.FiscalYear ?? copy.fyStartYear ?? copy.FyStartYear;
    copy.startDate = copy.startDate ?? copy.StartDate ?? copy.fromDate;
    copy.endDate = copy.endDate ?? copy.EndDate ?? copy.toDate;
    copy.closedDate = copy.closedDate ?? copy.ClosedDate;
    copy.balanceDate = copy.balanceDate ?? copy.BalanceDate;
    copy.debit = copy.debit ?? copy.Debit ?? copy.debitAmount ?? copy.DebitAmount;
    copy.credit = copy.credit ?? copy.Credit ?? copy.creditAmount ?? copy.CreditAmount;
    copy.openingBalance = copy.openingBalance ?? copy.OpeningBalance;
    copy.closingBalance = copy.closingBalance ?? copy.ClosingBalance ?? copy.balance ?? copy.Balance;
    copy.bankName = copy.bankName ?? copy.BankName;
    copy.statementDate = copy.statementDate ?? copy.StatementDate;
    copy.referenceNo = copy.referenceNo ?? copy.ReferenceNo;
    copy.ledgerAmount = copy.ledgerAmount ?? copy.LedgerAmount;
    copy.bankAmount = copy.bankAmount ?? copy.BankAmount;
    copy.returnNo = copy.returnNo ?? copy.ReturnNo;
    copy.outputTax = copy.outputTax ?? copy.OutputTax;
    copy.inputTax = copy.inputTax ?? copy.InputTax;
    copy.netTax = copy.netTax ?? copy.NetTax;
    copy.taxCode = copy.taxCode ?? copy.TaxCode;
    copy.taxName = copy.taxName ?? copy.TaxName;
    copy.taxRate = copy.taxRate ?? copy.TaxRate;
    copy.taxType = copy.taxType ?? copy.TaxType;
    copy.taxableAmount = copy.taxableAmount ?? copy.TaxableAmount;
    copy.taxAmount = copy.taxAmount ?? copy.TaxAmount;
    copy.customerName = copy.customerName ?? copy.CustomerName;
    copy.invoiceNo = copy.invoiceNo ?? copy.InvoiceNo;
    copy.dueDate = copy.dueDate ?? copy.DueDate;
    copy.expectedDate = copy.expectedDate ?? copy.ExpectedDate;
    copy.amount = copy.amount ?? copy.Amount ?? copy.totalAmount ?? copy.TotalAmount;
    copy.probability = copy.probability ?? copy.Probability;
    copy.emailTo = copy.emailTo ?? copy.EmailTo;
    copy.sentDate = copy.sentDate ?? copy.SentDate;
    copy.voucherNo = copy.voucherNo ?? copy.VoucherNo;
    copy.postingDate = copy.postingDate ?? copy.PostingDate;
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
      const year = row?.fyStartYear ?? row?.fiscalYear ?? this.currentFiscalYear();
      return { ...row, id, fyStartYear: year, fyEndYear: row?.fyEndYear ?? year + 1, closeDate: row?.closeDate ?? this.toDateString(new Date()) };
    }
    if (action === 'preview') {
      const year = row?.fyStartYear ?? row?.fiscalYear ?? this.currentFiscalYear();
      return { ...row, id, fyStartYear: year, closeDate: row?.closeDate ?? this.toDateString(new Date()) };
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

  private listParams(): Record<string, string | number> {
    const params: Record<string, string | number> = {};
    if (this.fromDate) params['fromDate'] = this.fromDate;
    if (this.toDate) params['toDate'] = this.toDate;
    if (this.config.key === 'year-end-close') params['fyStartYear'] = this.currentFiscalYear();
    return params;
  }

  private setDefaultDates(): void {
    const today = new Date();
    if (!this.toDate) this.toDate = this.toDateString(today);
    if (!this.fromDate) {
      const from = new Date(today);
      from.setDate(today.getDate() - 30);
      this.fromDate = this.toDateString(from);
    }
    this.fyStartYear = this.currentFiscalYear();
    this.closeDate = `${this.fyStartYear + 1}-03-31`;
  }

  private currentFiscalYear(): number {
    const today = new Date();
    return today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
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
