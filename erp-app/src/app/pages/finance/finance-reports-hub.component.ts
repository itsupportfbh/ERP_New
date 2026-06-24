import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface ReportCard {
  code: string;
  title: string;
  subtitle: string;
  route: string;
}

@Component({
  selector: 'erp-finance-reports-hub',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './finance-reports-hub.component.html',
  styleUrls: ['./finance-reports-hub.component.scss']
})
export class FinanceReportsHubComponent {
  selected: string | null = null;

  reports: ReportCard[] = [
    { code: 'pl',       title: 'Profit & Loss',        subtitle: 'Reports > Profit and Loss',   route: '/app/finance/profit-loss' },
    { code: 'bs',       title: 'Balance Sheet',         subtitle: 'Reports > Balance Sheet',     route: '/app/finance/balance-sheet' },
    { code: 'aging',    title: 'AR/AP Aging',           subtitle: 'Reports > Aging',             route: '/app/finance/arap-aging' },
    { code: 'gst',      title: 'GST Detail Report',     subtitle: 'Reports > GST > Detail',      route: '/app/finance/gst-detail' },
    { code: 'forecast', title: 'Collections Forecast',  subtitle: 'Reports > AR',                route: '/app/finance/collection-forecast' },
    { code: 'daybook',  title: 'Daybook',               subtitle: 'Reports > Transaction',       route: '/app/finance/daybook' },
  ];

  constructor(private router: Router) {}

  isActive(route: string): boolean {
    return this.router.url.includes(route.split('/app/')[1] ?? route);
  }

  open(card: ReportCard): void {
    this.selected = card.code;
    this.router.navigate([card.route]);
  }
}
