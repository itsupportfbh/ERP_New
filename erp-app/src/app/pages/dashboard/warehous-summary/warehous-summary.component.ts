import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  WarehouseDashboard,
  WarehouseSummary
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-warehous-summary',
  templateUrl: './warehous-summary.component.html',
  styleUrls: ['./warehous-summary.component.scss']
})
export class WarehousSummaryComponent implements OnInit {

  warehouses: WarehouseSummary[] = [];

  newItems = 0;
  pendingDOs = 0;

  loading = false;

  constructor(
    private dashboardService: DashboardService
  ) { }

  ngOnInit(): void {
    this.loadWarehouseSummary();
  }

  loadWarehouseSummary(): void {

    this.loading = true;

    const companyId =
      Number(localStorage.getItem('companyId')) || 1;

    this.dashboardService
      .getWarehouseSummary(companyId)
      .subscribe({
        next: (res: WarehouseDashboard) => {

          console.log('Warehouse Summary', res);

          this.warehouses = res.warehouses;
          this.newItems = res.newItems;
          this.pendingDOs = res.pendingDOs;

          this.loading = false;
        },
        error: (err) => {

          console.error(err);

          this.loading = false;
        }
      });
  }
}