import { Component, OnInit } from '@angular/core';
import {
  DashboardService,
  FinanceException
} from '../dashboard.service';
import { CurrencyDisplayService } from '../../../core/services/currency-display.service';

@Component({
  standalone: false,
  selector: 'app-all-finance-exceptions',
  templateUrl: './all-finance-exceptions.component.html',
  styleUrls: ['./all-finance-exceptions.component.scss']
})
export class AllFinanceExceptionsComponent implements OnInit {

  companyId = Number(localStorage.getItem('companyId')) || 0;

  exceptions: any[] = [];

  constructor(
    private dashboardService: DashboardService,
    private cur: CurrencyDisplayService
  ) {}

  ngOnInit(): void {
    this.loadFinanceExceptions();
  }

  loadFinanceExceptions(): void {
    this.dashboardService.getFinanceExceptions(this.companyId).subscribe({
      next: (res: FinanceException[]) => {
       this.exceptions = (res || []).map(x => ({
  severity: x.severity,
  type: x.type,
  document: x.document,
  party: x.party || '-',
  impact: this.cur.compactMoney(x.impactAmount || 0),
  level: (x.severity || '').toLowerCase()
}));

        console.log('Finance Exceptions:', this.exceptions);
      },
      error: (err) => {
        console.error('Finance Exceptions error:', err);
      }
    });
  }

  formatAmount(value: number): string {
    return this.cur.compactMoney(value);
  }
}