import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';

@Component({
  selector: 'erp-finance-pl',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  get incomeRows(): any[] {
    return this.rows.filter(r => {
      const cat = String(r.category ?? r.accountType ?? r.section ?? '').toLowerCase();
      return cat.includes('income') || cat.includes('revenue') || cat.includes('sale') || cat.includes('4');
    });
  }

  get expenseRows(): any[] {
    return this.rows.filter(r => {
      const cat = String(r.category ?? r.accountType ?? r.section ?? '').toLowerCase();
      return cat.includes('expense') || cat.includes('cost') || cat.includes('purchase') || cat.includes('5');
    });
  }

  get totalIncome():  number { return this.incomeRows.reduce((s, r) => s + (r.amount || 0), 0); }
  get totalExpense(): number { return this.expenseRows.reduce((s, r) => s + (r.amount || 0), 0); }
  get netProfit():    number { return this.totalIncome - this.totalExpense; }

  initials(name: string): string {
    return (name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  }
}
