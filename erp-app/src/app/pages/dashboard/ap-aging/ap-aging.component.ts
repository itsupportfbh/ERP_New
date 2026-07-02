import { Component, OnInit } from '@angular/core';
import { DashboardService, APAgingDashboard } from '../dashboard.service';

interface AgingRow {
  period: string;
  amount: string;
  overdue?: boolean;
}

@Component({
  standalone: false,
  selector: 'app-ap-aging',
  templateUrl: './ap-aging.component.html',
  styleUrls: ['./ap-aging.component.scss']
})
export class ApAgingComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  agingData: AgingRow[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadAPAging();
  }

  loadAPAging(): void {
    this.dashboardService.getAPAgingDashboard(this.companyId).subscribe({
      next: (res: APAgingDashboard) => {
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
    value = Number(value || 0);

    if (value >= 100000) {
      return `₹${(value / 100000).toFixed(1)}L`;
    }

    return `₹${value.toFixed(2)}`;
  }
}