import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';
import { AuditPrintService } from '../../core/services/audit-print.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { MasterService } from '../../core/services/master.service';

@Component({
  selector: 'erp-finance-collection-forecast',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent, MoneyPipe],
  templateUrl: './finance-collection-forecast.component.html',
  styleUrls: ['./finance-collection-forecast.component.scss']
})
export class FinanceCollectionForecastComponent implements OnInit {
  loading = false;
  error = '';

  fromDate = '';
  toDate = '';
  search = '';
  groupBy = 'none'; columnsOpen = false;
  loginBranch = 'All branches';
  selectedBranch = 'All branches';
  readonly reportColumns = ['Customer', '0–7 Days', '8–14 Days', '15–30 Days', '30+ Days', 'Total Outstanding'];
  columnSelection: Record<string, boolean> = {};

  /** Customer-level day-bucket totals — this is the actual shape /ArCollectionForecast/summary returns. */
  rows: any[] = [];
  filtered: any[] = [];

  expandedCustomers = new Set<number>();
  detailRows: Record<number, any[]> = {};
  detailLoading: Record<number, boolean> = {};

  buckets = {
    days0_7:    { label: 'Due in 0–7 Days', amount: 0 },
    days8_14:   { label: 'Due in 8–14 Days', amount: 0 },
    days15_30:  { label: 'Due in 15–30 Days', amount: 0 },
    days30plus: { label: 'Due in 30+ Days', amount: 0 },
  };
  total = 0;

  private readonly today = new Date().toISOString().slice(0, 10);
  private readonly monthAhead = (() => {
    const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10);
  })();
  readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';

  constructor(private finance: FinanceService, private auditPrint: AuditPrintService, private masterService: MasterService) {}

  ngOnInit(): void {
    this.reportColumns.forEach(c => this.columnSelection[c] = true);
    this.fromDate = this.today;
    this.toDate = this.monthAhead;
    this.loadLoginBranch();
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.expandedCustomers.clear();
    this.detailRows = {};
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
      ? this.rows.filter(r => String(r.customerName ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }
  columnVisible(c: string): boolean { return this.columnSelection[c] !== false; }
  toggleColumn(c: string): void {
    if (this.columnSelection[c] && this.reportColumns.filter(x => this.columnSelection[x]).length === 1) return;
    this.columnSelection[c] = !this.columnSelection[c];
  }
  get visibleColumnCount(): number { return this.reportColumns.filter(c => this.columnVisible(c)).length + 1; }
  clearFilters(): void { this.search = ''; this.groupBy = 'none'; this.selectedBranch = this.loginBranch; this.applyFilter(); }

  get displayRows(): any[] {
    if (this.groupBy === 'none') return this.filtered;
    const groups = new Map<string, any[]>();
    this.filtered.forEach(row => {
      const key = this.groupBy === 'customer' ? row.customerName : this.loginBranch;
      groups.set(key || '-', [...(groups.get(key || '-') || []), row]);
    });
    const result: any[] = [];
    groups.forEach((items, label) => {
      result.push({ _displayKind: 'group', label, count: items.length });
      result.push(...items);
    });
    return result;
  }

  private normalize(r: any): any {
    return {
      customerId: r.customerId ?? r.CustomerId,
      customerName: r.customerName ?? r.CustomerName ?? '-',
      bucket0_7: Number(r.bucket0_7 ?? r.Bucket0_7 ?? 0),
      bucket8_14: Number(r.bucket8_14 ?? r.Bucket8_14 ?? 0),
      bucket15_30: Number(r.bucket15_30 ?? r.Bucket15_30 ?? 0),
      bucket30Plus: Number(r.bucket30Plus ?? r.Bucket30Plus ?? 0),
      totalOutstanding: Number(r.totalOutstanding ?? r.TotalOutstanding ?? 0)
    };
  }

  private buildBuckets(): void {
    Object.values(this.buckets).forEach(b => { b.amount = 0; });
    this.total = 0;
    for (const r of this.rows) {
      this.buckets.days0_7.amount += r.bucket0_7;
      this.buckets.days8_14.amount += r.bucket8_14;
      this.buckets.days15_30.amount += r.bucket15_30;
      this.buckets.days30plus.amount += r.bucket30Plus;
      this.total += r.totalOutstanding;
    }
  }

  get bucketsArray() {
    return Object.values(this.buckets);
  }

  toggleCustomer(row: any): void {
    const id = row.customerId;
    if (this.expandedCustomers.has(id)) { this.expandedCustomers.delete(id); return; }
    this.expandedCustomers.add(id);
    if (this.detailRows[id]) return;
    this.detailLoading[id] = true;
    this.finance.list({ list: `/ArCollectionForecast/detail/${id}` }, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        this.detailRows[id] = this.finance.unwrap(res).map((d: any) => this.normalizeDetail(d));
        this.detailLoading[id] = false;
      },
      error: () => { this.detailRows[id] = []; this.detailLoading[id] = false; }
    });
  }

  isExpanded(row: any): boolean { return this.expandedCustomers.has(row.customerId); }

  private normalizeDetail(d: any): any {
    return {
      invoiceId: d.invoiceId ?? d.InvoiceId,
      invoiceNo: d.invoiceNo ?? d.InvoiceNo ?? '-',
      invoiceDate: d.invoiceDate ?? d.InvoiceDate,
      dueDate: d.dueDate ?? d.DueDate,
      balance: Number(d.balance ?? d.Balance ?? 0),
      bucketName: d.bucketName ?? d.BucketName ?? ''
    };
  }

  daysUntilDue(dueDate: string): number {
    if (!dueDate) return 0;
    return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  }

  private fmtDate(d: string): string {
    if (!d) return 'All';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }

  exportPdf(): void {
    const fromTxt = this.fmtDate(this.fromDate);
    const toTxt   = this.fmtDate(this.toDate);

    this.auditPrint.print({
      reportTitle: 'Collections Forecast',
      periodLine: `For The Period From ${fromTxt} To ${toTxt}`,
      metaLines: [`Date : From ${fromTxt} to ${toTxt}`, 'Sort By : Customer'],
      labelColumnKey: 'customerName',
      columns: [
        { header: 'Customer', key: 'customerName' },
        { header: '0-7 Days', key: 'bucket0_7', align: 'right', type: 'number' },
        { header: '8-14 Days', key: 'bucket8_14', align: 'right', type: 'number' },
        { header: '15-30 Days', key: 'bucket15_30', align: 'right', type: 'number' },
        { header: '30+ Days', key: 'bucket30Plus', align: 'right', type: 'number' },
        { header: 'Total Outstanding', key: 'totalOutstanding', align: 'right', type: 'number' }
      ],
      rows: this.filtered,
      totalRows: [
        {
          label: `Grand Total Amount (${this.baseCurrencyName})`,
          values: {
            bucket0_7: this.buckets.days0_7.amount,
            bucket8_14: this.buckets.days8_14.amount,
            bucket15_30: this.buckets.days15_30.amount,
            bucket30Plus: this.buckets.days30plus.amount,
            totalOutstanding: this.total
          },
          grand: true
        }
      ]
    });
  }

  exportExcel(): void {
    const header = ['Customer', '0-7 Days', '8-14 Days', '15-30 Days', '30+ Days', 'Total Outstanding'];
    const data = [header, ...this.filtered.map(row => [
      row.customerName, row.bucket0_7.toFixed(2), row.bucket8_14.toFixed(2),
      row.bucket15_30.toFixed(2), row.bucket30Plus.toFixed(2), row.totalOutstanding.toFixed(2)
    ])];
    const csv = data.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'CollectionsForecast.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  private loadLoginBranch(): void {
    const locationId = Number(localStorage.getItem('locationId') || 0);
    if (!locationId) return;
    this.masterService.getLocations().subscribe({ next: (res: any) => {
      const locations = res?.data ?? res ?? [];
      const x = Array.isArray(locations) ? locations.find((v: any) => Number(v.id ?? v.locationId ?? v.outletId) === locationId) : null;
      this.loginBranch = x?.name ?? x?.locationName ?? x?.outletName ?? x?.code ?? `Outlet ${locationId}`;
      this.selectedBranch = this.loginBranch;
    }, error: () => { this.loginBranch = `Outlet ${locationId}`; this.selectedBranch = this.loginBranch; } });
  }
}
