import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  StockMovementRequest
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-stock-movements-today',
  templateUrl: './stock-movements-today.component.html',
  styleUrls: ['./stock-movements-today.component.scss']
})
export class StockMovementsTodayComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  Stockmovement: any[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadStockMovementRequests();
  }

  loadStockMovementRequests(): void {
    this.dashboardService.getStockMovementRequests(this.companyId).subscribe({
      next: (res: StockMovementRequest[]) => {
        this.Stockmovement = (res || []).map(x => ({
          prNo: x.requestNo,
          item: x.item,
          qty: x.qty,
          status: x.status,
          class: this.getStatusClass(x.status)
        }));

        console.log('Stock Movement Requests:', this.Stockmovement);
      },
      error: (err) => {
        console.error('Stock Movement Requests error:', err);
      }
    });
  }

  getStatusClass(status: string): string {
    if (status === 'Pending Approval') return 'badge-sm-warn';
    if (status === 'Approved') return 'badge-sm-success';
    if (status === 'Rejected') return 'badge-sm-danger';
    return 'badge-sm-info';
  }
}