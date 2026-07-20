import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { FinanceTrialBalanceComponent } from './finance-trial-balance.component';
import { FinanceLedgerComponent } from './finance-ledger.component';
import { FinanceRegisterReportComponent } from './finance-register-report.component';
import { PermissionService } from '../../core/services/permission.service';

interface ReportCard {
  code: string;
  title: string;
  subtitle: string;
  route?: string;
  /** Gate for this card; matches a permissionChildren entry under Financial > Reports. */
  functionId: string;
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
    { code: 'tb',       title: 'Trial Balance',        subtitle: 'Reports > General Ledger',                                              functionId: 'finance-report-trial-balance' },
    { code: 'ledger',   title: 'Account Ledger',       subtitle: 'Reports > GL Detail',                                                   functionId: 'finance-report-ledger' },
    { code: 'pl',       title: 'Profit & Loss',        subtitle: 'Reports > Profit and Loss',   route: '/app/finance/profit-loss',        functionId: 'finance-report-profit-loss' },
    { code: 'bs',       title: 'Balance Sheet',         subtitle: 'Reports > Balance Sheet',     route: '/app/finance/balance-sheet',      functionId: 'finance-report-balance-sheet' },
    { code: 'aging',    title: 'AR/AP Aging',           subtitle: 'Reports > Aging',             route: '/app/finance/arap-aging',         functionId: 'finance-report-arap-aging' },
    { code: 'gst',      title: 'GST Detail Report',     subtitle: 'Reports > GST > Detail',      route: '/app/finance/gst-detail',         functionId: 'finance-report-gst-detail' },
    { code: 'forecast', title: 'Collections Forecast',  subtitle: 'Reports > AR',                route: '/app/finance/collection-forecast', functionId: 'finance-report-collection-forecast' },
    { code: 'daybook',  title: 'Daybook',               subtitle: 'Reports > Transaction',       route: '/app/finance/daybook',            functionId: 'finance-report-daybook' },
    { code: 'receipts', title: 'Receipts Register',      subtitle: 'Reports > AR',                                                         functionId: 'finance-report-receipts' },
    { code: 'payments', title: 'Payments Register',      subtitle: 'Reports > AP',                                                         functionId: 'finance-report-payments' },
  ];

  /** Cards this role may open; the template iterates this, not `reports`. */
  get visibleReports(): ReportCard[] {
    return this.reports.filter(report => this.permissions.canView(report.functionId));
  }

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private permissions: PermissionService
  ) {
    this.activatedRoute.queryParamMap.subscribe(params => {
      const view = params.get('view');
      const inline = this.reports.find(r => !r.route && r.code === view);
      // A ?view= the role may not open must not render the inline report.
      this.selected = inline && this.permissions.canView(inline.functionId) ? inline.code : null;
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
    // The grid already hides ungranted cards; this also covers a card reached
    // by a stale ?view= query parameter.
    if (!this.permissions.canView(card.functionId)) return;
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
