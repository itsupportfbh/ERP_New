import { Component, OnInit } from '@angular/core';
import { DashboardService, PurchaseDashboard } from '../dashboard.service';

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
  apOutstanding = '₹0.0L';

  openPrsChange = 0;
  openPosChange = 0;
  pendingGrnChange = 0;
  apOutstandingChangePercent = 0;

  constructor(private dashboardService: DashboardService) {}

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
  const amount = Number(value || 0);

  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)}Cr`;
  }

  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  }

  return `₹${amount.toLocaleString('en-IN')}`;
}
}