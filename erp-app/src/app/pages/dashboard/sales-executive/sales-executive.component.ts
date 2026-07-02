import { Component, OnInit } from '@angular/core';
import { DashboardService, SalesExecutiveData } from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-sales-executive',
  templateUrl: './sales-executive.component.html',
  styleUrls: ['./sales-executive.component.scss']
})
export class SalesExecutiveComponent implements OnInit {

  salesExecutiveData: SalesExecutiveData = {
    quotation: 0,
    salesOrders: 0,
    deliveries: 0,
    invoices: 0
  };

  loading = false;

  constructor(
    private salesexecutiveService: DashboardService
  ) {}

  ngOnInit(): void {
    this.getSalesExecutive();
  }

 getSalesExecutive(): void {

  const companyId = Number(localStorage.getItem('companyId')) || 0;

  this.salesexecutiveService.getSalesExecutive(companyId)
    .subscribe({
      next: (res: any) => {

        console.log('Sales Executive Response =>', res);

        this.salesExecutiveData = {
          quotation: res?.quotation || 0,
          salesOrders: res?.salesOrders || 0,
          deliveries: res?.deliveries || 0,
          invoices: res?.invoices || 0
        };
      },
      error: (err) => {
        console.error(err);
      }
    });

 }


}