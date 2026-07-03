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
  selector: 'erp-finance-pl',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent, MoneyPipe, TaxNamePipe],
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
    const net = this.netRow;
    const rows: any[][] = [
      [localStorage.getItem('companyPrintName') || localStorage.getItem('companyName') || ''],
      ['Profit and Loss'],
      [`For The Period From ${this.fmtDate(this.fromDate)} To ${this.fmtDate(this.toDate)}`], [],
      ['Acc Code', 'Description', 'Debit', 'Credit'],
      ...this.auditRows.map(r => [r.code, r.name, r.debit ? r.debit.toFixed(2) : '', r.credit ? r.credit.toFixed(2) : '']),
      ['', net.label, net.debit ? net.debit.toFixed(2) : '', net.credit ? net.credit.toFixed(2) : ''],
      ['', `Grand Total Amount (${this.baseCurrencyName})`, this.grandTotal.toFixed(2), this.grandTotal.toFixed(2)]
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    this.download(csv, 'ProfitLoss.csv', 'text/csv;charset=utf-8;');
  }

  exportPdf(): void {
    const fromTxt = this.fmtDate(this.fromDate);
    const toTxt   = this.fmtDate(this.toDate);
    const net     = this.netRow;
    const grand   = this.grandTotal;

    this.auditPrint.print({
      reportTitle: 'Profit and Loss',
      periodLine: `For The Period From ${fromTxt} To ${toTxt}`,
      metaLines: [`Date : From ${fromTxt} to ${toTxt}`, 'Sort By : Code;Description', 'Project : All'],
      labelColumnKey: 'name',
      columns: [
        { header: 'Acc Code', key: 'code' },
        { header: 'Description', key: 'name' },
        { header: 'Debit', key: 'debit', align: 'right', type: 'number' },
        { header: 'Credit', key: 'credit', align: 'right', type: 'number' }
      ],
      rows: this.auditRows,
      totalRows: [
        { label: net.label, values: { debit: net.debit, credit: net.credit } },
        { label: `Grand Total Amount (${this.baseCurrencyName})`, values: { debit: grand, credit: grand }, grand: true }
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
