import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  MyPurchaseRequest
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-my-purchase-requests',
  templateUrl: './my-purchase-requests.component.html',
  styleUrls: ['./my-purchase-requests.component.scss']
})
export class MyPurchaseRequestsComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;
  userId = Number(localStorage.getItem('id')) || 0;

  purchaseRequests: MyPurchaseRequest[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadMyPurchaseRequests();
  }

  loadMyPurchaseRequests(): void {
    this.dashboardService
      .getMyPurchaseRequests(this.companyId, this.userId)
      .subscribe({
        next: (res) => {
          this.purchaseRequests = res || [];
          console.log('My Purchase Requests:', res);
        },
        error: (err) => {
          console.error('My Purchase Requests error:', err);
        }
      });
  }

  formatQty(item: MyPurchaseRequest): string {
    const qty = Number(item.qty || 0);

    if (item.uom) {
      return `${qty} ${item.uom}`;
    }

    return qty.toString();
  }
}