import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  OpenSalesOrder
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-open-sales-order',
  templateUrl: './open-sales-order.component.html',
  styleUrls: ['./open-sales-order.component.scss']
})
export class OpenSalesOrderComponent implements OnInit {

  openSalesOrders: OpenSalesOrder[] = [];

  constructor(
    private dashboardService: DashboardService
  ) { }

  ngOnInit(): void {
    this.getOpenSalesOrders();
  }

  getOpenSalesOrders(): void {

    const companyId =
      Number(localStorage.getItem('companyId')) || 0;

    this.dashboardService
      .getOpenSalesOrders(companyId)
      .subscribe({
        next: (res) => {

          console.log('Open Sales Orders =>', res);

          this.openSalesOrders = res;
        },
        error: (err) => {
          console.error(err);
        }
      });
  }

 getStatusText(status: number): string {

  switch (+status) {

    case 1:
      return 'Draft';

    case 2:
      return 'Approved';

    case 3:
      return 'Pending DO';

    case 4:
      return 'DO Created';

    case 5:
      return 'Invoiced';

    default:
      return 'Open';
  }
}

badgeClass(status: string): string {

  switch (status) {

    case 'Pending DO':
      return 'badge-sm-warn';

    case 'Approved':
      return 'badge-sm-success';

    case 'DO Created':
    case 'Invoiced':
      return 'badge-sm-info';

    case 'Overdue':
      return 'badge-sm-danger';

    default:
      return 'badge-sm-info';
  }
}
}