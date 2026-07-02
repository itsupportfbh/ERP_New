import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  OpenPurchaseOrder
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-open-purchase-orders',
  templateUrl: './open-purchase-orders.component.html',
  styleUrls: ['./open-purchase-orders.component.scss']
})
export class OpenPurchaseOrdersComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  purchaseOrders: OpenPurchaseOrder[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadOpenPurchaseOrders();
  }

  loadOpenPurchaseOrders(): void {
    this.dashboardService.getOpenPurchaseOrders(this.companyId).subscribe({
      next: (res) => {
        this.purchaseOrders = res || [];
        console.log('Open Purchase Orders:', res);
      },
      error: (err) => {
        console.error('Open Purchase Orders error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return `₹${Number(value || 0).toLocaleString('en-IN')}`;
  }

  formatDate(value: string | null): string {
    if (!value) return '-';

    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short'
    });
  }
}