import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'erp-sales-report',
  standalone: false,
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.scss']
})
export class ReportComponent {
  activeReport: 'sales' | 'margin' | 'delivery' | null = null;

  constructor(private router: Router) {}

  openReport(type: 'sales' | 'margin' | 'delivery'): void {
    this.activeReport = this.activeReport === type ? null : type;
  }

  goToDeliveryNote(): void {
    this.router.navigate(['/app/sales/reports/delivery-note']);
  }
}
