import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FinanceService, FINANCE_PAGES } from './finance.service';

@Component({
  selector: 'erp-finance-dashboard',
  standalone: false,
  templateUrl: './finance-dashboard.component.html',
  styleUrls: ['./finance-dashboard.component.scss']
})
export class FinanceDashboardComponent implements OnInit {
  loading = false;
  error = '';
  summary: any = {};
  pages = FINANCE_PAGES;

  kpis = [
    { key: 'cashBalance', label: 'Cash Balance' },
    { key: 'accountsPayable', label: 'Accounts Payable' },
    { key: 'accountsReceivable', label: 'Accounts Receivable' },
    { key: 'profitLoss', label: 'P&L' }
  ];

  constructor(private finance: FinanceService, private router: Router) {}

  ngOnInit(): void {
    this.loading = true;
    this.finance.dashboard().subscribe({
      next: res => {
        this.summary = this.finance.unwrapOne(res);
        this.loading = false;
      },
      error: () => {
        this.error = 'Dashboard summary unavailable. Module links are still ready.';
        this.loading = false;
      }
    });
  }

  open(key: string): void {
    // Map keys that need special routing
    const routeMap: Record<string, string> = {
      'ar-invoices': 'ar', 'ar-advance': 'ar', 'ar-aging': 'ar',
      'ap-aging': 'ap-aging', 'ap-advance': 'ap-advance',
      'gst-return': 'gst-return', 'gst-report': 'gst-report'
    };
    const section = routeMap[key] ?? key;
    this.router.navigate(['/app/finance', section]);
  }

  value(key: string): number {
    return Number(this.summary?.[key] ?? this.summary?.[key[0].toUpperCase() + key.slice(1)] ?? 0);
  }
}
