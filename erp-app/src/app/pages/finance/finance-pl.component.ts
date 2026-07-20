import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';
import { AuditPrintService } from '../../core/services/audit-print.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { MasterService } from '../../core/services/master.service';

@Component({
  selector: 'erp-finance-pl',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent, MoneyPipe],
  templateUrl: './finance-pl.component.html',
  styleUrls: ['./finance-pl.component.scss']
})
export class FinancePlComponent implements OnInit {
  rows: any[] = [];
  loading = false;
  error = '';
  fromDate = '';
  toDate = '';
  searchTerm = '';
  columnsOpen = false;
  columnSearch = '';
  loginBranch = '';
  selectedBranch = '';
  groupBy = 'none';
  readonly reportColumns = [
    { key: 'code', label: 'Code', group: 'Basic', selected: true },
    { key: 'account', label: 'Account', group: 'Basic', selected: true },
    { key: 'section', label: 'Section', group: 'Basic', selected: true },
    { key: 'branch', label: 'Branch', group: 'Basic', selected: true },
    { key: 'debit', label: `Debit (${localStorage.getItem('companyCurrencyName') || 'SGD'})`, group: 'Amounts', selected: true },
    { key: 'credit', label: `Credit (${localStorage.getItem('companyCurrencyName') || 'SGD'})`, group: 'Amounts', selected: true }
  ];

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));
  private endpoint = { list: '/FinanceReport/GetProfitLossDetails' };
  private readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';

  constructor(private finance: FinanceService, private permissionService: PermissionService,
    private auditPrint: AuditPrintService, private masterService: MasterService) {}

  ngOnInit(): void {
    this.resetDates();
    this.loadLoginBranch();
    this.load();
    this.permissionService.getFunctionPermission(this.userId, 'reports').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  private loadLoginBranch(): void {
    const locationId = Number(localStorage.getItem('locationId') || 0);
    this.loginBranch = locationId ? `Outlet ${locationId}` : 'All';
    if (!locationId) return;
    this.masterService.getLocations().subscribe({
      next: (res: any) => {
        const locations = res?.data ?? res ?? [];
        const match = Array.isArray(locations) ? locations.find((x: any) =>
          Number(x.id ?? x.locationId ?? x.outletId ?? x.LocationId) === locationId) : null;
        this.loginBranch = match?.name ?? match?.locationName ?? match?.outletName ?? match?.code ?? this.loginBranch;
        if (!this.selectedBranch) this.selectedBranch = this.loginBranch;
      }, error: () => {}
    });
  }

  /** P&L reports movement over a period, so it defaults to year-to-date rather than all time. */
  resetDates(): void {
    const today = new Date();
    this.fromDate = `${today.getFullYear()}-01-01`;
    this.toDate = this.dateOnly(today);
  }

  private dateOnly(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  get dateError(): string {
    return this.fromDate && this.toDate && this.fromDate > this.toDate
      ? 'From date cannot be after To date.'
      : '';
  }

  get rangeLabel(): string {
    if (!this.fromDate && !this.toDate) return 'All dates';
    if (this.fromDate && !this.toDate) return `From ${this.fromDate}`;
    if (!this.fromDate && this.toDate) return `Up to ${this.toDate}`;
    return `${this.fromDate} to ${this.toDate}`;
  }

  load(): void {
    if (this.dateError) return;
    this.loading = true;
    this.error = '';
    this.finance.list(this.endpoint, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => { this.rows = this.finance.unwrap(res); this.loading = false; },
      error: () => { this.rows = []; this.loading = false; this.error = 'Profit & Loss data unavailable.'; }
    });
  }

  private sortByCode(rows: any[]): any[] {
    return [...rows].sort((a, b) => {
      const ca = String(a.accountCode ?? a.headCode ?? '');
      const cb = String(b.accountCode ?? b.headCode ?? '');
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });
  }

  get incomeRows(): any[] {
    const filtered = this.rows.filter(r => {
      const cat = String(r.category ?? r.accountType ?? r.section ?? r.headType ?? '').toLowerCase();
      const isIncome = cat.includes('income') || cat.includes('revenue') || cat.includes('sale') ||
             Number(r.sales ?? 0) !== 0 || String(r.headCode ?? '').startsWith('4');
      const hasValue = Number(r.amount ?? r.sales ?? 0) !== 0;
      return isIncome && hasValue;
    });
    return this.sortByCode(filtered);
  }

  get expenseRows(): any[] {
    const filtered = this.rows.filter(r => {
      const cat = String(r.category ?? r.accountType ?? r.section ?? r.headType ?? '').toLowerCase();
      const isExpense = cat.includes('expense') || cat.includes('cost') || cat.includes('purchase') ||
             Number(r.purchase ?? 0) !== 0 || String(r.headCode ?? '').startsWith('5');
      const hasValue = Number(r.amount ?? r.purchase ?? 0) !== 0;
      return isExpense && hasValue;
    });
    return this.sortByCode(filtered);
  }

  get totalIncome():  number { return this.incomeRows.reduce((s, r) => s + (Number(r.amount ?? r.sales ?? 0)), 0); }
  get totalExpense(): number { return this.expenseRows.reduce((s, r) => s + (Number(r.amount ?? r.purchase ?? 0)), 0); }
  get netProfit():    number { return this.totalIncome - this.totalExpense; }

  get visibleColumns(): typeof this.reportColumns { return this.reportColumns.filter(c => c.selected); }
  get filteredColumnOptions(): typeof this.reportColumns {
    const q = this.columnSearch.trim().toLowerCase();
    return q ? this.reportColumns.filter(c => c.label.toLowerCase().includes(q)) : this.reportColumns;
  }
  get reportRows(): any[] {
    const all = [
      ...this.expenseRows.map(r => this.toReportRow(r, 'Expense', Number(r.amount ?? r.purchase ?? 0))),
      ...this.incomeRows.map(r => this.toReportRow(r, 'Income', Number(r.amount ?? r.sales ?? 0)))
    ];
    const branchRows = this.selectedBranch ? all.filter(r => r.branch === this.selectedBranch) : all;
    const q = this.searchTerm.trim().toLowerCase();
    return q ? branchRows.filter(r => [r.code, r.account, r.section, r.branch, r.debit, r.credit]
      .some(v => String(v ?? '').toLowerCase().includes(q))) : branchRows;
  }
  get branchOptions(): string[] {
    const values = [...this.rows.map(r => r.branchName ?? r.branch ?? r.locationName ?? r.outletName).filter(Boolean), this.loginBranch].filter(Boolean);
    return [...new Set(values.map(String))].sort();
  }
  get displayRows(): any[] {
    if (this.groupBy === 'none') return this.reportRows;
    const groups = new Map<string, any[]>();
    this.reportRows.forEach(r => { const key = String(r[this.groupBy] || 'Unspecified'); groups.set(key, [...(groups.get(key) || []), r]); });
    return [...groups.entries()].flatMap(([label, rows]) => [
      { _rowType: 'group', label, count: rows.length }, ...rows,
      { _rowType: 'subtotal', label, debit: rows.reduce((s, r) => s + r.debit, 0), credit: rows.reduce((s, r) => s + r.credit, 0) }
    ]);
  }
  clearFilters(): void { this.searchTerm = ''; this.selectedBranch = ''; this.groupBy = 'none'; }
  private toReportRow(row: any, kind: 'Income' | 'Expense', actual: number): any {
    return {
      code: row.accountCode ?? row.headCode ?? '', account: row.accountName ?? row.headName ?? '',
      section: row.category ?? row.accountType ?? row.section ?? row.headType ?? kind,
      branch: row.branchName ?? row.branch ?? row.locationName ?? row.outletName ?? this.loginBranch,
      debit: kind === 'Expense' ? actual : 0,
      credit: kind === 'Income' ? actual : 0,
      kind: kind.toLowerCase()
    };
  }
  toggleColumn(key: string): void {
    const col = this.reportColumns.find(c => c.key === key);
    if (!col || (col.selected && this.visibleColumns.length === 1)) return;
    col.selected = !col.selected;
  }
  setAllColumns(selected: boolean): void {
    this.reportColumns.forEach(c => c.selected = selected);
    if (!selected) this.reportColumns[0].selected = true;
  }

  indentLevel(code: string): number {
    const len = String(code ?? '').trim().length;
    if (len <= 1) return 0;
    if (len <= 3) return 1;
    if (len <= 5) return 2;
    return 3;
  }

  isGroupHeader(code: string): boolean {
    return String(code ?? '').trim().length <= 3;
  }

  initials(name: string): string {
    return (name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  }

  avatarColor(name: string): string {
    const colors = ['#FFE1E1','#FFEAD1','#E8F2FF','#EAF7E5','#F5E1FF','#E1F5FF'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  /** Combined Acc Code / Description / Debit / Credit ledger rows, sorted by code, for the auditing-format exports. */
  private get auditRows(): Array<{ code: string; name: string; debit: number; credit: number }> {
    const rows = [
      ...this.expenseRows.map(r => ({
        code: String(r.accountCode ?? r.headCode ?? ''),
        name: r.accountName ?? r.headName ?? '',
        debit: Number(r.amount ?? r.purchase ?? 0),
        credit: 0
      })),
      ...this.incomeRows.map(r => ({
        code: String(r.accountCode ?? r.headCode ?? ''),
        name: r.accountName ?? r.headName ?? '',
        debit: 0,
        credit: Number(r.amount ?? r.sales ?? 0)
      }))
    ];
    return rows.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  }

  /** Balancing "Net Profit/Loss" line so the Debit and Credit columns foot to the same Grand Total, ledger-style. */
  private get netRow(): { label: string; debit: number; credit: number } {
    const isProfit = this.netProfit >= 0;
    return {
      label: isProfit ? 'Net Profit for the period' : 'Net Loss for the period',
      debit: isProfit ? this.netProfit : 0,
      credit: isProfit ? 0 : -this.netProfit
    };
  }

  private get grandTotal(): number { return this.totalExpense + (this.netProfit >= 0 ? this.netProfit : 0); }

  private fmtDate(d: string): string {
    if (!d) return 'All';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }

  exportExcel(): void {
    const rows: any[][] = [
      [localStorage.getItem('companyPrintName') || localStorage.getItem('companyName') || ''],
      ['Profit and Loss'],
      [`For The Period From ${this.fmtDate(this.fromDate)} To ${this.fmtDate(this.toDate)}`], [],
      this.visibleColumns.map(c => c.label),
      ...this.reportRows.map(r => this.visibleColumns.map(c =>
        c.key === 'debit' || c.key === 'credit' ? (Number(r[c.key]) ? Number(r[c.key]).toFixed(2) : '') : r[c.key])),
      [], this.visibleColumns.map(c => c.key === 'account' ? 'Total' : c.key === 'debit' ? this.totalExpense.toFixed(2) : c.key === 'credit' ? this.totalIncome.toFixed(2) : ''),
      this.visibleColumns.map(c => c.key === 'account' ? 'Net Profit / (Loss)' : c.key === 'debit' && this.netProfit < 0 ? (-this.netProfit).toFixed(2) : c.key === 'credit' && this.netProfit >= 0 ? this.netProfit.toFixed(2) : '')
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    this.download(csv, 'ProfitLoss.csv', 'text/csv;charset=utf-8;');
  }

  exportPdf(): void {
    const fromTxt = this.fmtDate(this.fromDate);
    const toTxt   = this.fmtDate(this.toDate);
    this.auditPrint.print({
      reportTitle: 'Profit and Loss',
      periodLine: `For The Period From ${fromTxt} To ${toTxt}`,
      metaLines: [`Date : From ${fromTxt} to ${toTxt}`, 'Sort By : Code;Description', 'Project : All'],
      labelColumnKey: this.visibleColumns.find(c => c.key === 'account') ? 'account' : this.visibleColumns[0].key,
      columns: this.visibleColumns.map(c => ({ header: c.label, key: c.key,
        align: c.key === 'debit' || c.key === 'credit' ? 'right' as const : undefined,
        type: c.key === 'debit' || c.key === 'credit' ? 'number' as const : undefined,
        colorByKey: c.key === 'debit' || c.key === 'credit' ? 'kind' : undefined })),
      rows: this.reportRows,
      totalRows: [
        { label: 'Total', values: { debit: this.totalExpense, credit: this.totalIncome } },
        { label: 'Net Profit / (Loss)', values: {
          debit: this.netProfit < 0 ? -this.netProfit : 0,
          credit: this.netProfit >= 0 ? this.netProfit : 0
        }, grand: true }
      ]
    });
  }

  private download(data: string, fileName: string, mime: string): void {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }
}
