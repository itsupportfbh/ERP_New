import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  PlanningOrder
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-planning-orders',
  templateUrl: './planning-orders.component.html',
  styleUrls: ['./planning-orders.component.scss']
})
export class PlanningOrdersComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  planningOrders: any[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadPlanningOrders();
  }

  loadPlanningOrders(): void {
    this.dashboardService.getPlanningOrders(this.companyId).subscribe({
      next: (res: PlanningOrder[]) => {
        this.planningOrders = (res || []).map(x => ({
          orderNo: x.orderNo,
          product: x.product,
          qty: x.qty,
          status: x.status,
          date: this.formatDate(x.date),
          class: this.getStatusClass(x.status)
        }));

        console.log('Planning Orders:', this.planningOrders);
      },
      error: (err) => {
        console.error('Planning Orders error:', err);
      }
    });
  }

  getStatusClass(status: string): string {
    const value = (status || '').toLowerCase();

    if (value === 'completed') return 'st-done';
    if (value === 'in progress') return 'st-progress';
    if (value === 'delayed') return 'st-overdue';
    return 'st-pending';
  }

  formatDate(value: string | null): string {
    if (!value) return '-';

    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short'
    });
  }
}