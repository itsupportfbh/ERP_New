import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  FinanceARAging
} from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-finance-ar-aging',
  templateUrl: './finance-ar-aging.component.html',
  styleUrls: ['./finance-ar-aging.component.scss']
})
export class FinanceArAgingComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  agingData: any[] = [];

  constructor(
    private dashboardService: DashboardService,
    private cur: CurrencyDisplayService
  ) {}

  ngOnInit(): void {
    this.loadFinanceARAging();
  }

  loadFinanceARAging(): void {
    this.dashboardService.getFinanceARAging(this.companyId).subscribe({
      next: (res: FinanceARAging) => {
        this.agingData = [
          {
            period: '0–30 days',
            amount: this.formatAmount(res.days0To30)
          },
          {
            period: '31–60 days',
            amount: this.formatAmount(res.days31To60)
          },
          {
            period: '61–90 days',
            amount: this.formatAmount(res.days61To90)
          },
          {
            period: '>90 days',
            amount: this.formatAmount(res.days90Plus),
            overdue: true
          }
        ];

        console.log('Finance AR Aging:', res);
      },
      error: (err) => {
        console.error('Finance AR Aging error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return this.cur.compactMoney(value);
  }
}