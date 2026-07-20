import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { FinanceTrialBalanceComponent } from './finance-trial-balance.component';
import { FinanceLedgerComponent } from './finance-ledger.component';
import { FinanceRegisterReportComponent } from './finance-register-report.component';

interface ReportCard {
  code: string;
  title: string;
  subtitle: string;
  route?: string;
}

@Component({
  selector: 'erp-finance-reports-hub',
  standalone: true,
  imports: [CommonModule, FinanceTrialBalanceComponent, FinanceLedgerComponent, FinanceRegisterReportComponent],
  templateUrl: './finance-reports-hub.component.html',
  styleUrls: ['./finance-reports-hub.component.scss']
})
export class FinanceReportsHubComponent {
  selected: string | null = null;

  reports: ReportCard[] = [
    { code: 'tb',       title: 'Trial Balance',        subtitle: 'Reports > General Ledger' },
    { code: 'ledger',   title: 'Account Ledger',       subtitle: 'Reports > GL Detail' },
    { code: 'pl',       title: 'Profit & Loss',        subtitle: 'Reports > Profit and Loss',   route: '/app/finance/profit-loss' },
    { code: 'bs',       title: 'Balance Sheet',         subtitle: 'Reports > Balance Sheet',     route: '/app/finance/balance-sheet' },
    { code: 'aging',    title: 'AR/AP Aging',           subtitle: 'Reports > Aging',             route: '/app/finance/arap-aging' },
    { code: 'gst',      title: 'GST Detail Report',     subtitle: 'Reports > GST > Detail',      route: '/app/finance/gst-detail' },
    { code: 'forecast', title: 'Collections Forecast',  subtitle: 'Reports > AR',                route: '/app/finance/collection-forecast' },
    { code: 'daybook',  title: 'Daybook',               subtitle: 'Reports > Transaction',       route: '/app/finance/daybook' },
    { code: 'receipts', title: 'Receipts Register',      subtitle: 'Reports > AR' },
    { code: 'payments', title: 'Payments Register',      subtitle: 'Reports > AP' },
  ];

  constructor(private router: Router, private activatedRoute: ActivatedRoute) {
    this.activatedRoute.queryParamMap.subscribe(params => {
      const view = params.get('view');
      this.selected = ['tb', 'ledger', 'receipts', 'payments'].includes(view || '') ? view : null;
    });
  }

  get isReportsPage(): boolean {
    return this.router.url.split('?')[0] === '/app/finance/reports';
  }

  isActive(card: ReportCard): boolean {
    if (!card.route) return this.isReportsPage && this.selected === card.code;
    return this.router.url.includes(card.route.split('/app/')[1] ?? card.route);
  }

  open(card: ReportCard): void {
    if (card.route) {
      this.router.navigate([card.route]);
      return;
    }
    if (this.isReportsPage) {
      this.selected = card.code;
      this.router.navigate([], { relativeTo: this.activatedRoute, queryParams: { view: card.code }, queryParamsHandling: 'merge' });
    } else {
      this.router.navigate(['/app/finance/reports'], { queryParams: { view: card.code } });
    }
  }
}
