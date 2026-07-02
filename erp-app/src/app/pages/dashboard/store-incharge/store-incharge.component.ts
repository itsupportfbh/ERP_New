import { Component, OnInit } from '@angular/core';
import { DashboardService } from '../dashboard.service';

export interface InventorySummaryDto {
  totalSkus: number;
  grnPending: number;
  negativeStock: number;
}

@Component({
  standalone: false,
  selector: 'app-store-incharge',
  templateUrl: './store-incharge.component.html',
  styleUrls: ['./store-incharge.component.scss']
})
export class StoreInchargeComponent implements OnInit {

  totalSkus = 0;
  grnPending = 0;
  negativeStock = 0;

  loading = false;

  constructor(
    private dashboardService: DashboardService
  ) { }

  ngOnInit(): void {
    this.loadInventorySummary();
  }

  loadInventorySummary(): void {

    this.loading = true;

    const companyId =
      Number(localStorage.getItem('companyId')) || 1;

    this.dashboardService
      .getInventorySummary(companyId)
      .subscribe({
        next: (res: InventorySummaryDto) => {

          this.totalSkus = res.totalSkus;
          this.grnPending = res.grnPending;
          this.negativeStock = res.negativeStock;

          this.loading = false;
        },
        error: err => {
          console.error(err);
          this.loading = false;
        }
      });
  }
}