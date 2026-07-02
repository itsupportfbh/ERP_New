import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  InventoryKpiDashboard
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-inventory-execution',
  templateUrl: './inventory-execution.component.html',
  styleUrls: ['./inventory-execution.component.scss']
})
export class InventoryExecutionComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  availableSKUs = 0;
  belowMin = 0;
  newItems = 0;

  availableSkusChange = 0;
  belowMinChange = 0;
  newItemsChange = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadInventoryKpiDashboard();
  }

  loadInventoryKpiDashboard(): void {
    this.dashboardService.getInventoryKpiDashboard(this.companyId).subscribe({
      next: (res: InventoryKpiDashboard) => {
        this.availableSKUs = res.availableSkus ?? 0;
        this.belowMin = res.belowMin ?? 0;
        this.newItems = res.newItems ?? 0;

        this.availableSkusChange = res.availableSkusChange ?? 0;
        this.belowMinChange = res.belowMinChange ?? 0;
        this.newItemsChange = res.newItemsChange ?? 0;

        console.log('Inventory KPI Dashboard:', res);
      },
      error: (err) => {
        console.error('Inventory KPI Dashboard error:', err);
      }
    });
  }

  absValue(value: number): number {
    return Math.abs(Number(value || 0));
  }
}