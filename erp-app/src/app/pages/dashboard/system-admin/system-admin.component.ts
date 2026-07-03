import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  AdminSummaryDashboard
} from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-system-admin',
  templateUrl: './system-admin.component.html',
  styleUrls: ['./system-admin.component.scss']
})
export class SystemAdminComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  totalRevenue = '';
  totalPayables = '';
  arInvoices = 0;
  apInvoices = 0;
  totalSkus = 0;
  allExceptions = 0;

  constructor(
    private dashboardService: DashboardService,
    private cur: CurrencyDisplayService
  ) {}

  ngOnInit(): void {
    this.loadAdminSummaryDashboard();
  }

  loadAdminSummaryDashboard(): void {
    this.dashboardService.getAdminSummaryDashboard(this.companyId).subscribe({
      next: (res: AdminSummaryDashboard) => {
        this.totalRevenue = this.formatAmount(res.totalRevenue ?? 0);
        this.totalPayables = this.formatAmount(res.totalPayables ?? 0);
        this.arInvoices = res.arInvoices ?? 0;
        this.apInvoices = res.apInvoices ?? 0;
        this.totalSkus = res.totalSkus ?? 0;
        this.allExceptions = res.allExceptions ?? 0;

        console.log('Admin Summary Dashboard:', res);
      },
      error: (err) => {
        console.error('Admin Summary Dashboard error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return this.cur.compactMoney(value);
  }
}