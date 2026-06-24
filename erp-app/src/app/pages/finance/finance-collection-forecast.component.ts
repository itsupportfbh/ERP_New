import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';

@Component({
  selector: 'erp-finance-collection-forecast',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent],
  templateUrl: './finance-collection-forecast.component.html',
  styleUrls: ['./finance-collection-forecast.component.scss']
})
export class FinanceCollectionForecastComponent implements OnInit {
  loading = false;
  error = '';

  fromDate = '';
  toDate = '';
  search = '';

  rows: any[] = [];
  filtered: any[] = [];

  buckets = {
    overdue: { label: 'Overdue', amount: 0, count: 0 },
    current: { label: 'Current (0–30 days)', amount: 0, count: 0 },
    days30:  { label: '31–60 Days', amount: 0, count: 0 },
    days60:  { label: '61–90 Days', amount: 0, count: 0 },
    days90:  { label: '90+ Days', amount: 0, count: 0 },
  };
  total = 0;

  private readonly today = new Date().toISOString().slice(0, 10);
  private readonly monthAhead = (() => {
    const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10);
  })();

  constructor(private finance: FinanceService) {}

  ngOnInit(): void {
    this.fromDate = this.today;
    this.toDate = this.monthAhead;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const config = { list: '/ArCollectionForecast/summary' };
    this.finance.list(config, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        const rows = this.finance.unwrap(res);
        this.rows = rows.map((r: any) => this.normalize(r));
        this.buildBuckets();
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.error = err?.error?.message || 'Unable to load collection forecast.';
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          String(r.customerName ?? '').toLowerCase().includes(q) ||
          String(r.invoiceNo ?? '').toLowerCase().includes(q)
        )
      : [...this.rows];
  }

  probabilityClass(p: number): string {
    if (p >= 80) return 'prob-high';
    if (p >= 50) return 'prob-med';
    return 'prob-low';
  }

  daysUntilDue(dueDate: string): number {
    if (!dueDate) return 0;
    return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  }

  overdueClass(days: number): string {
    if (days < 0) return 'overdue';
    if (days <= 30) return 'due-soon';
    return '';
  }

  private buildBuckets(): void {
    const now = Date.now();
    Object.values(this.buckets).forEach(b => { b.amount = 0; b.count = 0; });
    this.total = 0;

    for (const r of this.rows) {
      const amt = Number(r.amount) || 0;
      this.total += amt;
      const days = this.daysUntilDue(r.dueDate);
      if (days < 0)       { this.buckets.overdue.amount += amt; this.buckets.overdue.count++; }
      else if (days <= 30) { this.buckets.current.amount += amt; this.buckets.current.count++; }
      else if (days <= 60) { this.buckets.days30.amount += amt;  this.buckets.days30.count++; }
      else if (days <= 90) { this.buckets.days60.amount += amt;  this.buckets.days60.count++; }
      else                  { this.buckets.days90.amount += amt;  this.buckets.days90.count++; }
    }
  }

  private normalize(r: any): any {
    const c = { ...r };
    c.customerName  = c.customerName  ?? c.CustomerName  ?? '-';
    c.invoiceNo     = c.invoiceNo     ?? c.InvoiceNo     ?? '-';
    c.dueDate       = c.dueDate       ?? c.DueDate;
    c.expectedDate  = c.expectedDate  ?? c.ExpectedDate;
    c.amount        = Number(c.amount ?? c.Amount ?? c.totalAmount ?? 0);
    c.probability   = Number(c.probability ?? c.Probability ?? 0);
    c.currency      = c.currency      ?? c.Currency      ?? 'SGD';
    return c;
  }

  get bucketsArray() {
    return Object.values(this.buckets);
  }
}
