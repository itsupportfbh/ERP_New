import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';

@Component({
  selector: 'erp-finance-bs',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent],
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
      return (s.includes('liabil') || s.includes('equity') || s.includes('capital')) && r.amount !== 0;
    });
    return this.sortByCode(filtered);
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

  avatarColor(name: string): string {
    const colors = ['#FFE1E1','#FFEAD1','#E8F2FF','#EAF7E5','#F5E1FF','#E1F5FF'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  exportExcel(): void {
    const rows: any[][] = [
      ['Balance Sheet'], [],
      ['Total Liabilities', this.totalLiabilities.toFixed(2)],
      ['Total Assets', this.totalAssets.toFixed(2)], [],
      ['Liabilities'], ['Account', 'Amount'],
      ...this.liabilityRows.map(r => [r.accountName, (r.amount || 0).toFixed(2)]),
      [], ['Assets'], ['Account', 'Amount'],
      ...this.assetRows.map(r => [r.accountName, (r.amount || 0).toFixed(2)])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'BalanceSheet.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  exportPdf(): void {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>Balance Sheet</title><style>body{font-family:Arial;font-size:12px;margin:20px}h2{color:#2e5f73}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#f3f4f6;padding:6px;text-align:left;border-bottom:1px solid #ddd}td{padding:5px 6px;border-bottom:1px solid #f0f0f0}.total-row td{font-weight:bold;border-top:1px solid #ccc}</style></head><body>
      <h2>Balance Sheet</h2><p>Total Liabilities: <b>${this.totalLiabilities.toFixed(2)}</b> &nbsp; Total Assets: <b>${this.totalAssets.toFixed(2)}</b></p>
      <table><thead><tr><th>Liabilities</th><th style="text-align:right">Amount</th></tr></thead><tbody>
        ${this.liabilityRows.map(r=>`<tr><td>${r.accountName}</td><td style="text-align:right">${(r.amount||0).toFixed(2)}</td></tr>`).join('')}
        <tr class="total-row"><td>Total Liabilities</td><td style="text-align:right">${this.totalLiabilities.toFixed(2)}</td></tr>
      </tbody></table>
      <table style="margin-top:16px"><thead><tr><th>Assets</th><th style="text-align:right">Amount</th></tr></thead><tbody>
        ${this.assetRows.map(r=>`<tr><td>${r.accountName}</td><td style="text-align:right">${(r.amount||0).toFixed(2)}</td></tr>`).join('')}
        <tr class="total-row"><td>Total Assets</td><td style="text-align:right">${this.totalAssets.toFixed(2)}</td></tr>
      </tbody></table>
    </body></html>`);
    w.document.close(); w.print();
  }
}
