import { Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ReportDef, SALES_REPORTS } from './sales-report-defs';
import { PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'erp-sales-report',
  standalone: false,
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.scss']
})
export class ReportComponent implements OnDestroy {
  readonly reports: ReportDef[] = SALES_REPORTS;
  activeReport: ReportDef | null = null;
  private readonly permissionSub: Subscription;

  constructor(private permissionService: PermissionService) {
    this.permissionSub = this.permissionService.changes$.subscribe(() => {
      if (this.activeReport && !this.canView(this.activeReport)) this.activeReport = null;
    });
  }

  get visibleReports(): ReportDef[] {
    return this.reports.filter(report => this.canView(report));
  }

  canView(report: ReportDef): boolean {
    return this.permissionService.canView(report.functionId);
  }

  openReport(report: ReportDef): void {
    if (!this.canView(report)) return;
    this.activeReport = this.activeReport?.key === report.key ? null : report;
  }

  isActive(report: ReportDef): boolean {
    return this.activeReport?.key === report.key;
  }

  ngOnDestroy(): void {
    this.permissionSub.unsubscribe();
  }
}
