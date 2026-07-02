import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  SystemWideException
} from '../dashboard.service';

@Component({
  standalone: false,
  selector: 'app-system-wide-exceptions',
  templateUrl: './system-wide-exceptions.component.html',
  styleUrls: ['./system-wide-exceptions.component.scss']
})
export class SystemWideExceptionsComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  exceptions: any[] = [];

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.loadSystemWideExceptions();
  }

  loadSystemWideExceptions(): void {
    this.dashboardService.getSystemWideExceptions(this.companyId).subscribe({
      next: (res: SystemWideException[]) => {
        this.exceptions = (res || []).map(x => ({
          severity: x.severity,
          type: x.type,
          module: x.module,
          document: x.document,
          party: x.party,
          impact: x.impact,
          level: this.getLevel(x.severity)
        }));

        console.log('System Wide Exceptions:', this.exceptions);
      },
      error: (err) => {
        console.error('System Wide Exceptions error:', err);
      }
    });
  }

  getLevel(severity: string): string {
    const value = (severity || '').toLowerCase();

    if (value === 'high') {
      return 'high';
    }

    if (value === 'warn' || value === 'warning') {
      return 'warn';
    }

    return 'warn';
  }
}