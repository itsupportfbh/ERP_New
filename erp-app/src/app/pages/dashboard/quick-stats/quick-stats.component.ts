import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  InventoryQuickStats
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-quick-stats',
  templateUrl: './quick-stats.component.html',
  styleUrls: ['./quick-stats.component.scss']
})
export class QuickStatsComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  receiptsToday = 0;
  issuesToday = 0;
  transfers = 0;
  adjustments = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadInventoryQuickStats();
  }

  loadInventoryQuickStats(): void {
    this.dashboardService.getInventoryQuickStats(this.companyId).subscribe({
      next: (res: InventoryQuickStats) => {
        this.receiptsToday = res.receiptsToday ?? 0;
        this.issuesToday = res.issuesToday ?? 0;
        this.transfers = res.transfers ?? 0;
        this.adjustments = res.adjustments ?? 0;

        console.log('Inventory Quick Stats:', res);
      },
      error: (err) => {
        console.error('Inventory Quick Stats error:', err);
      }
    });
  }
}