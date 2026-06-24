import { Component, OnInit } from '@angular/core';
import { FinanceService } from './finance.service';
import Swal from 'sweetalert2';

interface FinanceSummary {
  totalRevenue: number;
  totalRevenueChangePercent: number;
  collections: number;
  collectionsChangePercent: number;
  totalPayables: number;
  totalPayablesChangePercent: number;
  exceptions: number;
  exceptionsChange: number;
}

@Component({
  selector: 'erp-finance-dashboard',
  standalone: false,
  templateUrl: './finance-dashboard.component.html',
  styleUrls: ['./finance-dashboard.component.scss']
})
export class FinanceDashboardComponent implements OnInit {
  loading = false;
  summary: FinanceSummary | null = null;

  private readonly companyId = Number(localStorage.getItem('companyId')) || 0;

  constructor(private finance: FinanceService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.finance.financeSummaryDashboard(this.companyId).subscribe({
      next: res => {
        this.summary = this.finance.unwrapOne(res);
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Load Failed', text: err?.error?.message || 'Dashboard unavailable.', confirmButtonColor: '#0e4a60' });
      }
    });
  }

  formatAmount(value: number): string {
    const amount = Number(value || 0);
    if (amount >= 10000000) return `$${(amount / 10000000).toFixed(2)}Cr`;
    if (amount >= 100000)   return `$${(amount / 100000).toFixed(1)}L`;
    return new Intl.NumberFormat('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  }

  absValue(value: number): number {
    return Math.abs(Number(value || 0));
  }
}
