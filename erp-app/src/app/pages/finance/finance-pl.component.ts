import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';

@Component({
  selector: 'erp-finance-pl',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent],
  templateUrl: './finance-pl.component.html',
  styleUrls: ['./finance-pl.component.scss']
})
export class FinancePlComponent implements OnInit {
  rows: any[] = [];
  loading = false;
  error = '';
  fromDate = '';
  toDate = '';

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));
  private endpoint = { list: '/FinanceReport/GetProfitLossDetails' };

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

  exportExcel(): void {
    const rows: any[][] = [
      ['Profit & Loss'], [],
      ['Total Expense', this.totalExpense.toFixed(2)],
      ['Total Sales', this.totalIncome.toFixed(2)],
      ['Net Profit', this.netProfit.toFixed(2)], [],
      ['Purchase Accounts'], ['Name', 'Code', 'Amount'],
      ...this.expenseRows.map(r => [r.accountName || r.headName, r.accountCode || r.headCode || '', (r.amount || r.purchase || 0).toFixed(2)]),
      [], ['Sales Accounts'], ['Name', 'Code', 'Amount'],
      ...this.incomeRows.map(r => [r.accountName || r.headName, r.accountCode || r.headCode || '', (r.amount || r.sales || 0).toFixed(2)])
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    this.download(csv, 'ProfitLoss.csv', 'text/csv;charset=utf-8;');
  }

  exportPdf(): void {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>Profit & Loss</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
      h2{color:#2e5f73}table{width:100%;border-collapse:collapse;margin-top:10px}
      th{background:#f3f4f6;padding:6px;text-align:left;border-bottom:1px solid #ddd}
      td{padding:5px 6px;border-bottom:1px solid #f0f0f0}
      .total-row td{font-weight:bold;border-top:1px solid #ccc}
    </style></head><body>
      <h2>Profit &amp; Loss</h2>
      <p>Total Expense: <b>${this.totalExpense.toFixed(2)}</b> &nbsp; Total Sales: <b>${this.totalIncome.toFixed(2)}</b> &nbsp; Net Profit: <b>${this.netProfit.toFixed(2)}</b></p>
      <table><thead><tr><th>Purchase Accounts</th><th>Code</th><th>Amount</th></tr></thead><tbody>
        ${this.expenseRows.map(r => `<tr><td>${r.accountName||r.headName}</td><td>${r.accountCode||r.headCode||''}</td><td>${(r.amount||r.purchase||0).toFixed(2)}</td></tr>`).join('')}
        <tr class="total-row"><td>Total</td><td></td><td>${this.totalExpense.toFixed(2)}</td></tr>
      </tbody></table>
      <table style="margin-top:16px"><thead><tr><th>Sales Accounts</th><th>Code</th><th>Amount</th></tr></thead><tbody>
        ${this.incomeRows.map(r => `<tr><td>${r.accountName||r.headName}</td><td>${r.accountCode||r.headCode||''}</td><td>${(r.amount||r.sales||0).toFixed(2)}</td></tr>`).join('')}
        <tr class="total-row"><td>Total</td><td></td><td>${this.totalIncome.toFixed(2)}</td></tr>
      </tbody></table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  private download(data: string, fileName: string, mime: string): void {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }
}
