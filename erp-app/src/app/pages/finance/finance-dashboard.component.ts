import { Component, OnInit } from '@angular/core';
import { FinanceService } from './finance.service';
import { CurrencyDisplayService } from '../../core/services/currency-display.service';
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

  constructor(private finance: FinanceService, private cur: CurrencyDisplayService) {}

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
    // Base-currency symbol + K/M/B scaling, derived per-company (no hardcoded $/Cr/L).
    return this.cur.compactMoney(value);
  }

  absValue(value: number): number {
    return Math.abs(Number(value || 0));
  }
}
