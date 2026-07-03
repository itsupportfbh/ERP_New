import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';
import { AuditPrintService } from '../../core/services/audit-print.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TaxNamePipe } from '../../shared/pipes/tax-name.pipe';

@Component({
  selector: 'erp-finance-bs',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent, MoneyPipe, TaxNamePipe],
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
  private readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';

  constructor(private finance: FinanceService, private permissionService: PermissionService, private auditPrint: AuditPrintService) {}

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
        const raw = this.finance.unwrap(res);
        this.rows = raw.map((r: any) => this.normalize(r));
        this.buildLevels();
        this.loading = false;
      },
      error: () => { this.rows = []; this.loading = false; this.error = 'Balance Sheet data unavailable.'; }
    });
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

  get assetRows(): any[] {
    const filtered = this.rows.filter(r => {
      const s = String(r.section ?? '').toLowerCase();
      return s.includes('asset') && r.amount !== 0;
    });
    return this.sortByCode(filtered);
  }

  get liabilityRows(): any[] {
    const filtered = this.rows.filter(r => {
      const s = String(r.section ?? '').toLowerCase();
      return s.includes('liabil') && r.amount !== 0;
    });
    return this.sortByCode(filtered);
  }

  get equityRows(): any[] {
    const filtered = this.rows.filter(r => {
      const s = String(r.section ?? '').toLowerCase();
      return (s.includes('equity') || s.includes('capital')) && r.amount !== 0;
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
      ['Balance Sheet'], [],
      ['Total Liabilities & Equity', this.totalLiabilitiesAndEquity.toFixed(2)],
      ['Total Assets', this.totalAssets.toFixed(2)], [],
      ['Liabilities'], ['Account', 'Amount'],
      ...this.liabilityRows.map(r => [r.accountName, (r.amount || 0).toFixed(2)]),
      [], ['Equity'], ['Account', 'Amount'],
      ...this.equityRows.map(r => [r.accountName, (r.amount || 0).toFixed(2)]),
      [], ['Assets'], ['Account', 'Amount'],
      ...this.assetRows.map(r => [r.accountName, (r.amount || 0).toFixed(2)])
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
    const asAt = this.fmtDate(this.toDate);
    const bal  = this.balancingRow;

    this.auditPrint.print({
      reportTitle: 'Balance Sheet',
      periodLine: `As At ${asAt}`,
      metaLines: [`Date : As At ${asAt}`, 'Sort By : Code;Description', 'Project : All'],
      labelColumnKey: 'name',
      columns: [
        { header: 'Acc Code', key: 'code' },
        { header: 'Description', key: 'name' },
        { header: 'Debit (Assets)', key: 'debit', align: 'right', type: 'number' },
        { header: 'Credit (Liabilities & Equity)', key: 'credit', align: 'right', type: 'number' }
      ],
      rows: this.auditRows,
      totalRows: [
        { label: bal.label, values: { debit: bal.debit, credit: bal.credit } },
        { label: `Grand Total Amount (${this.baseCurrencyName})`, values: { debit: this.grandTotal, credit: this.grandTotal }, grand: true }
      ]
    });
  }
}
