import { Component, OnInit } from '@angular/core';
import { DashboardService, PurchaseDashboard } from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-procurement-manager',
  templateUrl: './procurement-manager.component.html',
  styleUrls: ['./procurement-manager.component.scss']
})
export class ProcurementManagerComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  openPRs = 0;
  openPOs = 0;
  pendingGRN = 0;
  apOutstanding = '';

  openPrsChange = 0;
  openPosChange = 0;
  pendingGrnChange = 0;
  apOutstandingChangePercent = 0;

  constructor(
    private dashboardService: DashboardService,
    private cur: CurrencyDisplayService
  ) {}

  ngOnInit(): void {
    this.loadPurchaseDashboard();
  }

  loadPurchaseDashboard(): void {
    this.dashboardService.getPurchaseDashboard(this.companyId).subscribe({
      next: (res: PurchaseDashboard) => {
       this.openPRs = res?.openPrs ?? 0;
this.openPOs = res?.openPos ?? 0;
this.pendingGRN = res?.pendingGrn ?? 0;

this.openPrsChange = res?.openPrsChange ?? 0;
this.openPosChange = res?.openPosChange ?? 0;
this.pendingGrnChange = res?.pendingGrnChange ?? 0;
this.apOutstandingChangePercent = res?.apOutstandingChangePercent ?? 0;

this.apOutstanding = this.formatAmount(res?.apOutstanding ?? 0);
      },
      error: (err) => {
        console.error('Purchase dashboard error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return this.cur.compactMoney(value);
  }
}