import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ReportDef } from '../../../shared/reports/report-def';
import { INVENTORY_REPORTS } from './inventory-report-defs';
import { InventoryReportsService } from './inventory-reports.service';
import { PermissionService as MenuPermissionService } from '../../../shared/permission.service';

interface ReportGroup {
  label: string;
  reports: ReportDef[];
}

/**
 * Inventory reports hub. Mirrors the sales and purchase hubs — a card grid that
 * opens the shared <erp-dynamic-report> inline — with the eight reports split
 * into the four areas of the stock cycle.
 *
 * Card visibility is resolved through the same service the sidebar uses, one
 * call per report, so what the menu promises and what this page shows always
 * agree. The core PermissionService is deliberately not used here: it is fed by
 * `User/organization-role/{userId}`, which returns a single OrganizationRole row
 * and is cached, so it can disagree with the per-function endpoint the rest of
 * the permission UI trusts.
 */
@Component({
  selector: 'erp-inventory-report',
  standalone: false,
  templateUrl: './inventory-report.component.html',
  styleUrls: ['./inventory-report.component.scss']
})
export class InventoryReportComponent implements OnInit {
  activeReport: ReportDef | null = null;

  /** Reports this user may open. Null until the lookup resolves. */
  private allowed: Set<string> | null = null;
  loadingPermissions = true;

  readonly groups: ReportGroup[] = [
    { label: 'Stock Position', reports: this.pick('Reports > Stock Position') },
    { label: 'Movements', reports: this.pick('Reports > Movements') },
    { label: 'Counts & Planning', reports: this.pick('Reports > Counts & Planning') },
    { label: 'Costing', reports: this.pick('Reports > Costing') }
  ];

  constructor(
    public reportsSvc: InventoryReportsService,
    private permissions: MenuPermissionService
  ) {}

  ngOnInit(): void {
    const userId = Number(localStorage.getItem('id') || 0);
    if (!userId) { this.allowFallback(); return; }

    forkJoin(
      INVENTORY_REPORTS.map(report =>
        this.permissions.getFunctionPermission(userId, report.functionId)
          .pipe(catchError(() => of(null)))
      )
    ).subscribe({
      next: results => {
        this.allowed = new Set(
          INVENTORY_REPORTS
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
    this.allowed = new Set(INVENTORY_REPORTS.map(r => r.functionId));
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

  private pick(crumb: string): ReportDef[] {
    return INVENTORY_REPORTS.filter(r => r.crumb === crumb);
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
