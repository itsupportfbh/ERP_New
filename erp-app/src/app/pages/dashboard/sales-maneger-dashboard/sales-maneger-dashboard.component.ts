import { Component, OnInit } from '@angular/core';
import { DashboardService } from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-sales-maneger-dashboard',
  templateUrl: './sales-maneger-dashboard.component.html',
  styleUrls: ['./sales-maneger-dashboard.component.scss']
})
export class SalesManagerDashboardComponent implements OnInit {

  totalRevenue = 0;
  activeCustomers = 0;
  avgDealSize = 0;
  arOverdue = 0;

  loading = false;

  constructor(
    private dashboardService: DashboardService
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {

  const companyId =
    Number(localStorage.getItem('companyId')) || 1;

  this.loading = true;

  this.dashboardService
    .getSalesManagerDashboard(companyId)
    .subscribe({
      next: (res: any) => {

        console.log('Sales Manager Dashboard Response =>', res);

        this.totalRevenue =
          res.totalRevenue ??
          res.TotalRevenue ??
          0;

        this.activeCustomers =
          res.activeCustomers ??
          res.ActiveCustomers ??
          0;

        this.avgDealSize =
          res.avgDealSize ??
          res.AvgDealSize ??
          0;

        this.arOverdue =
          res.arOverdue ??
          res.ArOverdue ??
          0;

        this.loading = false;
      },
      error: err => {
        console.error('Dashboard Error =>', err);
        this.loading = false;
      }
    });
}

  formatCurrency(value: number): string {
    const v = Number(value) || 0;

    if (v >= 10000000) {
      return '₹' + (v / 10000000).toFixed(2) + 'Cr';
    }

    if (v >= 100000) {
      return '₹' + (v / 100000).toFixed(1) + 'L';
    }

    // Show the exact amount for values under a lakh (e.g. ₹2,180.00).
    return '₹' + new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v);
  }
}