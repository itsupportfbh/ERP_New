import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  PurchaseFlowDashboard,
  PurchaseFlowItem
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-purchase-flow',
  templateUrl: './purchase-flow.component.html',
  styleUrls: ['./purchase-flow.component.scss']
})
export class PurchaseFlowComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  purchaseFlow: PurchaseFlowItem[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadPurchaseFlow();
  }

  loadPurchaseFlow(): void {
    this.dashboardService
      .getPurchaseFlowDashboard(this.companyId)
      .subscribe({
        next: (res: PurchaseFlowDashboard) => {
          this.purchaseFlow = [
            {
              name: 'Purchase Requests',
              count: res.purchaseRequests ?? 0,
              percentage: res.purchaseRequestsPercent ?? 0
            },
            {
              name: 'Purchase Orders',
              count: res.purchaseOrders ?? 0,
              percentage: res.purchaseOrdersPercent ?? 0
            },
            {
              name: 'GRN Received',
              count: res.grnReceived ?? 0,
              percentage: res.grnReceivedPercent ?? 0
            },
            {
              name: 'Supplier Invoices',
              count: res.supplierInvoices ?? 0,
              percentage: res.supplierInvoicesPercent ?? 0
            }
          ];

          console.log('Purchase Flow:', res);
        },
        error: (err) => {
          console.error('Purchase flow error:', err);
        }
      });
  }
}