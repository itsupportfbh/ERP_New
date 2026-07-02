import { Component, OnInit, AfterViewInit } from '@angular/core';
import * as feather from 'feather-icons';
import {
  DashboardService,
  FinanceSummaryDashboard
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-finance-manager-dashboard',
  templateUrl: './finance-manager-dashboard.component.html',
  styleUrls: ['./finance-manager-dashboard.component.scss']
})
export class FinanceManagerDashboardComponent implements OnInit, AfterViewInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  totalRevenue = '₹0';
  collections = '₹0';
  totalPayables = '₹0';
  exceptions = 0;

  totalRevenueChangePercent = 0;
  collectionsChangePercent = 0;
  totalPayablesChangePercent = 0;
  exceptionsChange = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
  this.loadFinanceSummaryDashboard();
}

  ngAfterViewInit(): void {
    feather.replace();
  }

 loadFinanceSummaryDashboard(): void {
  this.dashboardService.getFinanceSummaryDashboard(this.companyId).subscribe({
    next: (res: any) => {
      console.log('Finance Summary Response:', res);

      this.totalRevenue = this.formatAmount(res.totalRevenue ?? res.TotalRevenue ?? 0);
      this.collections = this.formatAmount(res.collections ?? res.Collections ?? 0);
      this.totalPayables = this.formatAmount(res.totalPayables ?? res.TotalPayables ?? 0);
      this.exceptions = res.exceptions ?? res.Exceptions ?? 0;

      this.totalRevenueChangePercent =
        res.totalRevenueChangePercent ?? res.TotalRevenueChangePercent ?? 0;

      this.collectionsChangePercent =
        res.collectionsChangePercent ?? res.CollectionsChangePercent ?? 0;

      this.totalPayablesChangePercent =
        res.totalPayablesChangePercent ?? res.TotalPayablesChangePercent ?? 0;

      this.exceptionsChange =
        res.exceptionsChange ?? res.ExceptionsChange ?? 0;
    },
    error: (err) => {
      console.error('Finance Summary Error:', err);
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

  absValue(value: number): number {
    return Math.abs(Number(value || 0));
  }
}