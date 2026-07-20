import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';
import { AuditPrintService } from '../../core/services/audit-print.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { MasterService } from '../../core/services/master.service';

@Component({
  selector: 'erp-finance-bs',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent, MoneyPipe],
  templateUrl: './finance-bs.component.html',
  styleUrls: ['./finance-bs.component.scss']
})
export class FinanceBsComponent implements OnInit {
  rows: any[] = [];
  expanded = new Set<string>();
  loading = false;
  error = '';
  /** A balance sheet is a position at a single instant, not a movement over a range, so it
      filters on one asOnDate. To compare two periods you take a second snapshot rather than
      widening the range — a from/to would drop the earlier ledger history the closing
      balances are built from, and the sheet would stop balancing. */
  asOnDate = '';

  /** Optional second snapshot. Blank = single-column report. */
  compareDate = '';
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

  private endpoint = { list: '/FinanceReport/GetBalanceSheetDetails' };
  private readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';

  constructor(private finance: FinanceService, private permissionService: PermissionService,
    private auditPrint: AuditPrintService, private masterService: MasterService) {}

  ngOnInit(): void {
    this.resetDate();
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
    this.masterService.getLocations().subscribe({ next: (res: any) => {
      const locations = res?.data ?? res ?? [];
      const match = Array.isArray(locations) ? locations.find((x: any) =>
        Number(x.id ?? x.locationId ?? x.outletId ?? x.LocationId) === locationId) : null;
      this.loginBranch = match?.name ?? match?.locationName ?? match?.outletName ?? match?.code ?? this.loginBranch;
      if (!this.selectedBranch) this.selectedBranch = this.loginBranch;
    }, error: () => {} });
  }

  resetDate(): void {
    this.asOnDate = this.dateOnly(new Date());
  }

  /** Prior year end — the comparison a balance sheet is normally read against. */
  comparePriorYearEnd(): void {
    const year = Number((this.asOnDate || this.dateOnly(new Date())).substring(0, 4));
    this.compareDate = `${year - 1}-12-31`;
  }

  clearCompare(): void { this.compareDate = ''; }

  get compareOn(): boolean { return !!this.compareDate; }

  private dateOnly(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  get rangeLabel(): string {
    const base = this.asOnDate ? `As at ${this.asOnDate}` : 'Latest position';
    return this.compareOn ? `${base} vs ${this.compareDate}` : base;
  }

  load(): void {
    this.loading = true;
    this.error = '';
    // The param must be named asOnDate: it previously sent fromDate/toDate, which the
    // controller does not bind, so every run silently reported the all-time position.
    const primary$ = this.finance.list(this.endpoint, { asOnDate: this.asOnDate });
    const compare$ = this.compareOn
      ? this.finance.list(this.endpoint, { asOnDate: this.compareDate })
      : of(null);

    forkJoin([primary$, compare$]).subscribe({
      next: ([primaryRes, compareRes]) => {
        const primary = this.finance.unwrap(primaryRes).map((r: any) => this.normalize(r));
        const compare = compareRes ? this.finance.unwrap(compareRes).map((r: any) => this.normalize(r)) : [];
        this.rows = this.mergeSnapshots(primary, compare);
        this.buildLevels();
        this.loading = false;
      },
      error: () => { this.rows = []; this.loading = false; this.error = 'Balance Sheet data unavailable.'; }
    });
  }

  private rowKey(r: any): string {
    return String(r.accountId ?? r.accountCode ?? r.accountName);
  }

  /**
   * Joins the two snapshots into one row per account. The union matters in both directions:
   * an account can hold a balance at one date and not the other (opened since, or cleared
   * out), and dropping either side would misreport the change as zero.
   */
  private mergeSnapshots(primary: any[], compare: any[]): any[] {
    if (!this.compareOn) {
      return primary.map(r => ({ ...r, compareAmount: 0, change: 0 }));
    }

    const cmp = new Map<string, any>(compare.map(r => [this.rowKey(r), r]));
    const merged = primary.map(r => {
      const key = this.rowKey(r);
      const compareAmount = Number(cmp.get(key)?.amount ?? 0);
      cmp.delete(key);
      return { ...r, compareAmount, change: (r.amount || 0) - compareAmount };
    });

    cmp.forEach(c => merged.push({
      ...c,
      amount: 0,
      compareAmount: Number(c.amount ?? 0),
      change: -Number(c.amount ?? 0)
    }));

    return merged;
  }

  private normalize(r: any): any {
    return {
      ...r,
      accountName: r.headName   ?? r.HeadName   ?? r.accountName   ?? r.GroupHeadName ?? r.groupHeadName ?? '-',
      accountCode: r.headCode   ?? r.HeadCode   ?? r.accountCode   ?? '',
      amount:      Number(r.balance ?? r.Balance ?? r.amount ?? 0),
      section:     r.side       ?? r.Side       ?? r.section       ?? r.rootHeadType  ?? r.RootHeadType ?? '',
      parentId:    r.parentHead ?? r.ParentHead ?? r.parentId      ?? r.groupHeadId   ?? r.GroupHeadId  ?? null,
      accountId:   r.headId     ?? r.HeadId     ?? r.accountId     ?? null,
    };
  }

  private buildLevels(): void {
    this.rows.forEach(r => {
      r._level = r.level ?? 0;
      r._hasChildren = false;
      r._id = r.accountId ?? r.accountCode ?? r.accountName;
      r._parentId = r.parentId ?? null;
    });
    this.rows.forEach(r => {
      if (r._parentId != null && r._parentId !== 0) {
        const parent = this.rows.find(p => p._id === r._parentId);
        if (parent) parent._hasChildren = true;
      }
    });
  }

  private sortByCode(rows: any[]): any[] {
    return [...rows].sort((a, b) => {
      const ca = String(a.accountCode ?? '');
      const cb = String(b.accountCode ?? '');
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });
  }

  /** An account is worth a row if it moved at either date — a balance that fell to zero
      since the compare date is exactly what the reader is looking for. */
  private hasBalance(r: any): boolean {
    return (r.amount || 0) !== 0 || (r.compareAmount || 0) !== 0;
  }

  get assetRows(): any[] {
    const filtered = this.rows.filter(r => {
      const s = String(r.section ?? '').toLowerCase();
      return s.includes('asset') && this.hasBalance(r);
    });
    return this.sortByCode(filtered);
  }

  get liabilityRows(): any[] {
    const filtered = this.rows.filter(r => {
      const s = String(r.section ?? '').toLowerCase();
      return s.includes('liabil') && this.hasBalance(r);
    });
    return this.sortByCode(filtered);
  }

  get equityRows(): any[] {
    const filtered = this.rows.filter(r => {
      const s = String(r.section ?? '').toLowerCase();
      return (s.includes('equity') || s.includes('capital')) && this.hasBalance(r);
    });
    return this.sortByCode(filtered);
  }

  /** Liabilities + Equity combined, for the left column of the T-format layout. */
  get liabilityAndEquityRows(): any[] {
    return this.sortByCode([...this.liabilityRows, ...this.equityRows]);
  }

  get totalAssets():      number { return this.assetRows.reduce((s, r)     => s + (r.amount || 0), 0); }
  get totalLiabilities(): number { return this.liabilityRows.reduce((s, r) => s + (r.amount || 0), 0); }
  get totalEquity():      number { return this.equityRows.reduce((s, r)    => s + (r.amount || 0), 0); }
  get totalLiabilitiesAndEquity(): number { return this.totalLiabilities + this.totalEquity; }

  get visibleColumns(): typeof this.reportColumns { return this.reportColumns.filter(c => c.selected); }
  get filteredColumnOptions(): typeof this.reportColumns {
    const q = this.columnSearch.trim().toLowerCase();
    return q ? this.reportColumns.filter(c => c.label.toLowerCase().includes(q)) : this.reportColumns;
  }
  get reportRows(): any[] {
    const all = [
      ...this.assetRows.map(r => this.toReportRow(r, true)),
      ...this.liabilityAndEquityRows.map(r => this.toReportRow(r, false))
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
  private toReportRow(row: any, isAsset: boolean): any {
    return { code: row.accountCode ?? '', account: row.accountName ?? '', section: row.section ?? (isAsset ? 'Assets' : 'Liabilities & Equity'),
      branch: row.branchName ?? row.branch ?? row.locationName ?? row.outletName ?? this.loginBranch,
      debit: isAsset ? Number(row.amount || 0) : 0, credit: isAsset ? 0 : Number(row.amount || 0) };
  }
  toggleColumn(key: string): void { const c = this.reportColumns.find(x => x.key === key); if (!c || (c.selected && this.visibleColumns.length === 1)) return; c.selected = !c.selected; }
  setAllColumns(selected: boolean): void { this.reportColumns.forEach(c => c.selected = selected); if (!selected) this.reportColumns[0].selected = true; }

  get cmpTotalAssets():      number { return this.assetRows.reduce((s, r)     => s + (r.compareAmount || 0), 0); }
  get cmpTotalLiabilities(): number { return this.liabilityRows.reduce((s, r) => s + (r.compareAmount || 0), 0); }
  get cmpTotalEquity():      number { return this.equityRows.reduce((s, r)    => s + (r.compareAmount || 0), 0); }
  get cmpTotalLiabilitiesAndEquity(): number { return this.cmpTotalLiabilities + this.cmpTotalEquity; }

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

  avatarColor(name: string): string {
    const colors = ['#FFE1E1','#FFEAD1','#E8F2FF','#EAF7E5','#F5E1FF','#E1F5FF'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  exportExcel(): void {
    const rows: any[][] = [
      ['Balance Sheet'],
      [`As at ${this.asOnDate}`], [], this.visibleColumns.map(c => c.label),
      ...this.reportRows.map(r => this.visibleColumns.map(c => c.key === 'debit' || c.key === 'credit' ? (r[c.key] ? Number(r[c.key]).toFixed(2) : '') : r[c.key])),
      [], this.visibleColumns.map(c => c.key === 'account' ? 'Grand Total' : c.key === 'debit' ? this.totalAssets.toFixed(2) : c.key === 'credit' ? this.totalLiabilitiesAndEquity.toFixed(2) : '')
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'BalanceSheet.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  /** Combined Acc Code / Description / Debit (Assets) / Credit (Liabilities & Equity) ledger rows for the auditing-format export. */
  private get auditRows(): Array<{ code: string; name: string; debit: number; credit: number }> {
    const rows = [
      ...this.assetRows.map(r => ({ code: String(r.accountCode ?? ''), name: r.accountName ?? '', debit: r.amount || 0, credit: 0 })),
      ...this.liabilityAndEquityRows.map(r => ({ code: String(r.accountCode ?? ''), name: r.accountName ?? '', debit: 0, credit: r.amount || 0 }))
    ];
    return rows.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  }

  /** Balancing figure so Debit (Assets) and Credit (Liabilities & Equity) foot to the same Grand Total. */
  private get balancingRow(): { label: string; debit: number; credit: number } {
    const diff = this.totalAssets - this.totalLiabilitiesAndEquity;
    return {
      label: 'Balancing Figure',
      debit: diff < 0 ? -diff : 0,
      credit: diff > 0 ? diff : 0
    };
  }

  private get grandTotal(): number { return Math.max(this.totalAssets, this.totalLiabilitiesAndEquity); }

  private fmtDate(d: string): string {
    if (!d) return 'All';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }

  exportPdf(): void {
    const asAt = this.fmtDate(this.asOnDate);
    const bal  = this.balancingRow;

    this.auditPrint.print({
      reportTitle: 'Balance Sheet',
      periodLine: `As At ${asAt}`,
      metaLines: [`Date : As At ${asAt}`, 'Sort By : Code;Description', 'Project : All'],
      labelColumnKey: this.visibleColumns.find(c => c.key === 'account') ? 'account' : this.visibleColumns[0].key,
      columns: this.visibleColumns.map(c => ({ header: c.label, key: c.key,
        align: c.key === 'debit' || c.key === 'credit' ? 'right' as const : undefined,
        type: c.key === 'debit' || c.key === 'credit' ? 'number' as const : undefined })),
      rows: this.reportRows,
      totalRows: [
        { label: bal.label, values: { debit: bal.debit, credit: bal.credit } },
        { label: `Grand Total Amount (${this.baseCurrencyName})`, values: { debit: this.grandTotal, credit: this.grandTotal }, grand: true }
      ]
    });
  }
}
