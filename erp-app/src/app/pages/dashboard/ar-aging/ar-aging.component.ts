import { Component, OnInit } from '@angular/core';
import { DashboardService, ARAgingDto } from '../dashboard.service';

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
    private dashboardService: DashboardService
  ) { }

  ngOnInit(): void {
    this.loadARAging();
  }

  loadARAging(): void {

    this.loading = true;

    const companyId =
      Number(localStorage.getItem('companyId')) || 1;

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

    if (!value) {
      return '₹0';
    }

    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(1)}Cr`;
    }

    if (value >= 100000) {
      return `₹${(value / 100000).toFixed(1)}L`;
    }

    return `₹${value.toLocaleString('en-IN')}`;
  }
}