import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  FinanceOpsDashboard
} from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-finance-executive',
  templateUrl: './finance-executive.component.html',
  styleUrls: ['./finance-executive.component.scss']
})
export class FinanceExecutiveComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  openARInvoices = 0;
  totalReceivables = '';
  apDueToday = 0;
  _3WayMismatch = '';

  totalReceivablesChange = 0;
  openArInvoicesChange = 0;
  apDueTodayChange = 0;
  threeWayMismatchChangePercent = 0;

  constructor(
    private dashboardService: DashboardService,
    private cur: CurrencyDisplayService
  ) {}

  ngOnInit(): void {
    this.loadFinanceOpsDashboard();
  }

  loadFinanceOpsDashboard(): void {
    this.dashboardService.getFinanceOpsDashboard(this.companyId).subscribe({
      next: (res: FinanceOpsDashboard) => {
        this.openARInvoices = res.openArInvoices ?? 0;
        this.totalReceivables = this.formatAmount(res.totalReceivables ?? 0);
        this.apDueToday = res.apDueToday ?? 0;
        this._3WayMismatch = this.formatAmount(res.threeWayMismatch ?? 0);

        this.totalReceivablesChange = res.totalReceivablesChange ?? 0;
        this.openArInvoicesChange = res.openArInvoicesChange ?? 0;
        this.apDueTodayChange = res.apDueTodayChange ?? 0;
        this.threeWayMismatchChangePercent =
          res.threeWayMismatchChangePercent ?? 0;

        console.log('Finance Ops Dashboard:', res);
      },
      error: (err) => {
        console.error('Finance Ops Dashboard error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return this.cur.compactMoney(value);
  }

  positiveValue(value: number): number {
    return Math.abs(Number(value || 0));
  }
}