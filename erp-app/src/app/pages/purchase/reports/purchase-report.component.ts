import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ReportDef } from '../../../shared/reports/report-def';
import { PURCHASE_REPORTS } from './purchase-report-defs';
import { PurchaseReportsService } from './purchase-reports.service';
import { PermissionService as MenuPermissionService } from '../../../shared/permission.service';

interface ReportGroup {
  label: string;
  reports: ReportDef[];
}

/**
 * Purchase reports hub. Mirrors the sales hub — a card grid that opens the
 * shared <erp-dynamic-report> inline — but with sixteen reports the cards are
 * split into the five sections of the purchase cycle.
 *
 * Card visibility is resolved through the same service the sidebar uses, one
 * call per report, so what the menu promises and what this page shows always
 * agree. The core PermissionService is deliberately not used here: it is fed by
 * `User/organization-role/{userId}`, which returns a single OrganizationRole row
 * and is cached, so it can disagree with the per-function endpoint the rest of
 * the permission UI trusts.
 */
@Component({
  selector: 'erp-purchase-report',
  standalone: false,
  templateUrl: './purchase-report.component.html',
  styleUrls: ['./purchase-report.component.scss']
})
export class PurchaseReportComponent implements OnInit {
  activeReport: ReportDef | null = null;

  /** Reports this user may open. Null until the lookup resolves. */
  private allowed: Set<string> | null = null;
  loadingPermissions = true;

  readonly groups: ReportGroup[] = [
    { label: 'Purchase Requests', reports: this.pick('PUR_PR_') },
    { label: 'Purchase Orders', reports: this.pick('PUR_PO_') },
    { label: 'Receiving (GRN)', reports: this.pick('PUR_GRN_') },
    { label: 'Invoices & Debit Notes', reports: this.pick(['PUR_PIN_', 'PUR_DN_']) },
    { label: 'Supplier & Spend Analysis', reports: this.pick('PUR_ANA_') }
  ];

  constructor(
    public reportsSvc: PurchaseReportsService,
    private permissions: MenuPermissionService
  ) {}

  ngOnInit(): void {
    const userId = Number(localStorage.getItem('id') || 0);
    if (!userId) { this.allowFallback(); return; }

    forkJoin(
      PURCHASE_REPORTS.map(report =>
        this.permissions.getFunctionPermission(userId, report.functionId)
          .pipe(catchError(() => of(null)))
      )
    ).subscribe({
      next: results => {
        this.allowed = new Set(
          PURCHASE_REPORTS
            .filter((_, i) => this.permissions.hasView(results[i]))
            .map(report => report.functionId)
        );
        this.loadingPermissions = false;
      },
      // The route guard already cleared this user for the page; if the lookup
      // itself is unreachable, show the reports rather than an empty screen.
      error: () => this.allowFallback()
    });
  }

  private allowFallback(): void {
    this.allowed = new Set(PURCHASE_REPORTS.map(r => r.functionId));
    this.loadingPermissions = false;
  }

  visibleReports(group: ReportGroup): ReportDef[] {
    return group.reports.filter(report => this.canView(report));
  }

  get hasVisibleReports(): boolean {
    return this.groups.some(group => this.visibleReports(group).length > 0);
  }

  canView(report: ReportDef): boolean {
    return this.allowed ? this.allowed.has(report.functionId) : false;
  }

  private pick(prefix: string | string[]): ReportDef[] {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];
    return PURCHASE_REPORTS.filter(r => prefixes.some(p => r.key.startsWith(p)));
  }

  openReport(report: ReportDef): void {
    if (!this.canView(report)) return;
    this.activeReport = report;
    window.scrollTo(0, 0);
  }

  closeReport(): void {
    this.activeReport = null;
    window.scrollTo(0, 0);
  }
}
