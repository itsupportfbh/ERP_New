import { Component, OnInit } from '@angular/core';
import { DashboardService, ARAgingDto } from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-ar-aging',
  templateUrl: './ar-aging.component.html',
  styleUrls: ['./ar-aging.component.scss']
})
export class ARAgingComponent implements OnInit {

  arAging: ARAgingDto = {
    currentAmount: 0,
    days30: 0,
    days60: 0,
    days90: 0
  };

  loading = false;

  constructor(
    private dashboardService: DashboardService,
    private cur: CurrencyDisplayService
  ) { }

  ngOnInit(): void {
    this.loadARAging();
  }

  loadARAging(): void {

    this.loading = true;

    const companyId =
      Number(localStorage.getItem('companyId')) || 0;

    this.dashboardService
      .getARAgingData(companyId)
      .subscribe({
        next: (response) => {

          console.log('AR Aging API Response', response);

          this.arAging = response;
          this.loading = false;
        },

        error: (error) => {
          console.error(error);
          this.loading = false;
        }
      });
  }

  formatCurrency(value: number): string {
    return this.cur.compactMoney(value);
  }
}