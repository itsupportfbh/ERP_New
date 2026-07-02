import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  FinanceArApAging
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-ar-ap-aging',
  templateUrl: './ar-ap-aging.component.html',
  styleUrls: ['./ar-ap-aging.component.scss']
})
export class ARAPAgingComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  receivables: any[] = [];
  payables: any[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadArApAging();
  }

  loadArApAging(): void {
    this.dashboardService.getFinanceArApAging(this.companyId).subscribe({
      next: (res: FinanceArApAging) => {
        this.receivables = [
          {
            period: '0–30 days',
            amount: this.formatAmount(res.arDays0To30)
          },
          {
            period: '31–90 days',
            amount: this.formatAmount(res.arDays31To90)
          },
          {
            period: '>90 days',
            amount: this.formatAmount(res.arDays90Plus),
            overdue: true
          }
        ];

        this.payables = [
          {
            period: '0–30 days',
            amount: this.formatAmount(res.apDays0To30)
          },
          {
            period: '31–90 days',
            amount: this.formatAmount(res.apDays31To90)
          },
          {
            period: '>90 days',
            amount: this.formatAmount(res.apDays90Plus),
            overdue: true
          }
        ];

        console.log('AR + AP Aging:', res);
      },
      error: (err) => {
        console.error('AR + AP Aging error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return `₹${Number(value || 0).toLocaleString('en-IN')}`;
  }
}