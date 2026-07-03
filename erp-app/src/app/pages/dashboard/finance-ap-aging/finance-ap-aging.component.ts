import { Component, OnInit } from '@angular/core';
import { DashboardService, FinanceAPAging } from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-finance-ap-aging',
  templateUrl: './finance-ap-aging.component.html',
  styleUrls: ['./finance-ap-aging.component.scss']
})
export class FinanceAPAgingComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  agingData: any[] = [];
  
    constructor(
      private dashboardService: DashboardService,
      private cur: CurrencyDisplayService
    ) {}
  
    ngOnInit(): void {
      this.loadAPAging();
    }
  
    loadAPAging(): void {
      this.dashboardService.getFinanceAPAging(this.companyId).subscribe({
        next: (res: FinanceAPAging) => {
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
  
          console.log('AP Aging:', res);
        },
        error: (err) => {
          console.error('AP Aging error:', err);
        }
      });
    }
  
    formatAmount(value: number): string {
      return this.cur.compactMoney(value);
    }
  }