import { Component, OnInit } from '@angular/core';

import {
  DashboardService,
  SalesOverviewData
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-sales-overview',
  templateUrl: './sales-overview.component.html',
  styleUrls: ['./sales-overview.component.scss']
})
export class SalesOverviewComponent implements OnInit {

  salesOverviewData: SalesOverviewData = {
    quotation: 0,
    salesOrders: 0,
    deliveries: 0,
    invoices: 0
  };

  constructor(
    private salesOverviewService: DashboardService
  ) {}

  ngOnInit(): void {
    this.getSalesOverview();
  }

  /** Largest value across buckets, used to scale the progress bars. */
  get maxCount(): number {
    return Math.max(
      1,
      this.salesOverviewData.quotation,
      this.salesOverviewData.salesOrders,
      this.salesOverviewData.deliveries,
      this.salesOverviewData.invoices
    );
  }

  pct(value: number): number {
    return Math.round((value / this.maxCount) * 100);
  }

  getSalesOverview(): void {

    const companyId =
      Number(localStorage.getItem('companyId')) || 0;

    this.salesOverviewService
      .getSalesOverview(companyId)
      .subscribe({
        next: (res: any) => {

          console.log('Sales Overview Response =>', res);

          this.salesOverviewData = {
            quotation: res?.quotation || 0,
            salesOrders: res?.salesOrders || 0,
            deliveries: res?.deliveries || 0,
            invoices: res?.invoices || 0
          };
        },
        error: err => {
          console.error(err);
        }
      });
  }
}