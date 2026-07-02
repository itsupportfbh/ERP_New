import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  AdminArApHealth
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-admin-ar-ap-health',
  templateUrl: './admin-ar-ap-health.component.html',
  styleUrls: ['./admin-ar-ap-health.component.scss']
})
export class AdminARAPHealthComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  receivablePercent = 0;
  payablePercent = 0;

  activeUsers = 0;
  pendingApprovals = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadAdminArApHealth();
  }

  loadAdminArApHealth(): void {
    this.dashboardService.getAdminArApHealth(this.companyId).subscribe({
      next: (res: AdminArApHealth) => {
        this.receivablePercent = Math.round(Number(res.receivablePercent || 0));
        this.payablePercent = Math.round(Number(res.payablePercent || 0));

        this.activeUsers = res.activeUsers ?? 0;
        this.pendingApprovals = res.pendingApprovals ?? 0;

        console.log('Admin AR AP Health:', res);
      },
      error: (err) => {
        console.error('Admin AR AP Health error:', err);
      }
    });
  }
}
