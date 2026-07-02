import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  AdminSummaryDashboard
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-system-admin',
  templateUrl: './system-admin.component.html',
  styleUrls: ['./system-admin.component.scss']
})
export class SystemAdminComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  totalRevenue = '₹0';
  totalPayables = '₹0';
  totalSkus = 0;
  allExceptions = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadAdminSummaryDashboard();
  }

  loadAdminSummaryDashboard(): void {
    this.dashboardService.getAdminSummaryDashboard(this.companyId).subscribe({
      next: (res: AdminSummaryDashboard) => {
        this.totalRevenue = this.formatAmount(res.totalRevenue ?? 0);
        this.totalPayables = this.formatAmount(res.totalPayables ?? 0);
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
    const amount = Number(value || 0);

    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)}Cr`;
    }

    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    }

    return `₹${amount.toLocaleString('en-IN')}`;
  }
}