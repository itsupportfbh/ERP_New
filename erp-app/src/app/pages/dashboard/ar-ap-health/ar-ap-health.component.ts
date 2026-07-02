import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  FinanceArApHealth
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-ar-ap-health',
  templateUrl: './ar-ap-health.component.html',
  styleUrls: ['./ar-ap-health.component.scss']
})
export class ArApHealthComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  receivablePercent = 0;
  payablePercent = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadArApHealth();
  }

  loadArApHealth(): void {
    this.dashboardService.getFinanceArApHealth(this.companyId).subscribe({
      next: (res: FinanceArApHealth) => {
        this.receivablePercent = Math.round(Number(res.receivablesCollectedPercent || 0));
        this.payablePercent = Math.round(Number(res.payablesPaidPercent || 0));
      },
      error: (err) => {
        console.error('AR AP Health error:', err);
      }
    });
  }
}
