import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  PurchaseUserDashboard
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-procurement-executive',
  templateUrl: './procurement-executive.component.html',
  styleUrls: ['./procurement-executive.component.scss']
})
export class ProcurementExecutiveComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;
  userId = Number(localStorage.getItem('id')) || 0;

  myOpenPRs = 0;
  pendingGRN = 0;
  openPINs = 0;

  myOpenPrsChange = 0;
  pendingGrnChange = 0;
  openPinsChange = 0;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadPurchaseUserDashboard();
  }

  loadPurchaseUserDashboard(): void {
    this.dashboardService
      .getPurchaseUserDashboard(this.companyId, this.userId)
      .subscribe({
        next: (res: PurchaseUserDashboard) => {
          this.myOpenPRs = res.myOpenPrs ?? 0;
          this.pendingGRN = res.pendingGrn ?? 0;
          this.openPINs = res.openPins ?? 0;

          this.myOpenPrsChange = res.myOpenPrsChange ?? 0;
          this.pendingGrnChange = res.pendingGrnChange ?? 0;
          this.openPinsChange = res.openPinsChange ?? 0;

          console.log('Purchase User Dashboard:', res);
        },
        error: (err) => {
          console.error('Purchase User Dashboard error:', err);
        }
      });
  }
}