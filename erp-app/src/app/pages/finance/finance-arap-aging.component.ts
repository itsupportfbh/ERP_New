import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';
import { AuditPrintService } from '../../core/services/audit-print.service';

type AgingTab = 'ar' | 'ap';

@Component({
  selector: 'erp-finance-arap-aging',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent],
  templateUrl: './finance-arap-aging.component.html',
  styleUrls: ['./finance-arap-aging.component.scss']
})
export class FinanceArapAgingComponent implements OnInit {
  activeTab: AgingTab = 'ar';

  // Filters
  fromDate = '';
  toDate = '';
  selectedCustomerId: number | null = null;
  selectedSupplierId: number | null = null;
  customers: any[] = [];
  suppliers: any[] = [];

  // AR summary
  arRows: any[] = [];
  arLoading = false;
  arError = '';
  arTotal = 0; ar030 = 0; ar3160 = 0; ar6190plus = 0;

  // AP summary
  apRows: any[] = [];
  apLoading = false;
  apError = '';
  apTotal = 0; ap030 = 0; ap3160 = 0; ap6190plus = 0;

  private readonly api = environment.apiUrl;
  readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';
  private readonly today = new Date().toISOString().slice(0, 10);
  private readonly monthAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();

  constructor(private http: HttpClient, private auditPrint: AuditPrintService) {}

  ngOnInit(): void {
    this.fromDate = this.monthAgo;
    this.toDate = this.today;
    this.loadCustomers();
    this.loadSuppliers();
    this.loadAr();
  }

  setTab(tab: AgingTab): void {
    this.activeTab = tab;
    if (tab === 'ar' && !this.arRows.length) this.loadAr();
    if (tab === 'ap' && !this.apRows.length) this.loadAp();
  }

  loadAr(): void {
    this.arLoading = true; this.arError = '';
    let p = new HttpParams().set('fromDate', this.fromDate).set('toDate', this.toDate);
    if (this.selectedCustomerId) p = p.set('customerId', this.selectedCustomerId);
    this.http.get<any>(`${this.api}/ArAging/summary`, { params: p }).subscribe({
      next: res => {
        this.arRows = (Array.isArray(res) ? res : res?.data ?? res?.result ?? []).map((r: any) => this.normAr(r));
        this.buildArTotals();
        this.arLoading = false;
      },
      error: () => { this.arError = 'AR aging data unavailable.'; this.arLoading = false; }
    });
  }

  loadAp(): void {
    this.apLoading = true; this.apError = '';
    let p = new HttpParams().set('fromDate', this.fromDate).set('toDate', this.toDate);
    if (this.selectedSupplierId) p = p.set('supplierId', this.selectedSupplierId);
    this.http.get<any>(`${this.api}/ApAging/summary`, { params: p }).subscribe({
      next: res => {
        this.apRows = (Array.isArray(res) ? res : res?.data ?? res?.result ?? []).map((r: any) => this.normAp(r));
        this.buildApTotals();
        this.apLoading = false;
      },
      error: () => { this.apError = 'AP aging data unavailable.'; this.apLoading = false; }
    });
  }

  filter(): void {
    if (this.activeTab === 'ar') this.loadAr();
    else this.loadAp();
  }

  private loadCustomers(): void {
    this.http.get<any>(`${this.api}/CustomerMaster/GetAllCustomerMaster`).subscribe({
      next: res => { this.customers = Array.isArray(res) ? res : res?.data ?? []; },
      error: () => {}
    });
  }

  private loadSuppliers(): void {
    this.http.get<any>(`${this.api}/Suppliers/getAllSupplier`).subscribe({
      next: res => { this.suppliers = Array.isArray(res) ? res : res?.data ?? []; },
      error: () => {}
    });
  }

  // Prefer the *Base (company-base-currency) fields the API already computes over the raw,
  // per-invoice-currency fields — otherwise foreign-currency suppliers/customers get mixed
  // into the same totals as base-currency ones.
  private normAr(r: any): any {
    return {
      customerName: r.customerName ?? r.CustomerName ?? '-',
      days030:  Number(r.bucket0_30Base   ?? r.Bucket0_30Base   ?? r.days030 ?? r.current ?? r.bucket0_30 ?? 0),
      days3160: Number(r.bucket31_60Base  ?? r.Bucket31_60Base  ?? r.days3160 ?? r.days30 ?? r.bucket31_60 ?? 0),
      days6190: Number(r.bucket61_90Base  ?? r.Bucket61_90Base  ?? r.days6190 ?? r.days60 ?? r.bucket61_90 ?? 0),
      days90p:  Number(r.bucket90PlusBase ?? r.Bucket90PlusBase ?? r.days90p  ?? r.days90 ?? r.bucket90Plus ?? 0),
      total:    Number(r.totalOutstandingBase ?? r.TotalOutstandingBase ?? r.total ?? r.totalOutstanding ?? 0)
    };
  }

  private normAp(r: any): any {
    return {
      supplierName: r.supplierName ?? r.SupplierName ?? '-',
      days030:  Number(r.bucket0_30Base   ?? r.Bucket0_30Base   ?? r.days030 ?? r.current ?? r.bucket0_30 ?? 0),
      days3160: Number(r.bucket31_60Base  ?? r.Bucket31_60Base  ?? r.days3160 ?? r.days30 ?? r.bucket31_60 ?? 0),
      days6190: Number(r.bucket61_90Base  ?? r.Bucket61_90Base  ?? r.days6190 ?? r.days60 ?? r.bucket61_90 ?? 0),
      days90p:  Number(r.bucket90PlusBase ?? r.Bucket90PlusBase ?? r.days90p  ?? r.days90 ?? r.bucket90Plus ?? 0),
      total:    Number(r.totalOutstandingBase ?? r.TotalOutstandingBase ?? r.total ?? r.totalOutstanding ?? 0)
    };
  }

  private buildArTotals(): void {
    this.arTotal  = this.arRows.reduce((s, r) => s + r.total,    0);
    this.ar030    = this.arRows.reduce((s, r) => s + r.days030,  0);
    this.ar3160   = this.arRows.reduce((s, r) => s + r.days3160, 0);
    this.ar6190plus = this.arRows.reduce((s, r) => s + r.days6190 + r.days90p, 0);
  }

  private buildApTotals(): void {
    this.apTotal    = this.apRows.reduce((s, r) => s + r.total,    0);
    this.ap030      = this.apRows.reduce((s, r) => s + r.days030,  0);
    this.ap3160     = this.apRows.reduce((s, r) => s + r.days3160, 0);
    this.ap6190plus = this.apRows.reduce((s, r) => s + r.days6190 + r.days90p, 0);
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
    const isAr    = this.activeTab === 'ar';
    const rows    = isAr ? this.arRows : this.apRows;
    const nameKey = isAr ? 'customerName' : 'supplierName';
    const fromTxt = this.fmtDate(this.fromDate);
    const toTxt   = this.fmtDate(this.toDate);
    const days6190Total = rows.reduce((s, r) => s + (r.days6190 || 0), 0);
    const days90pTotal  = rows.reduce((s, r) => s + (r.days90p || 0), 0);
    const days030Total  = isAr ? this.ar030 : this.ap030;
    const days3160Total = isAr ? this.ar3160 : this.ap3160;
    const grandTotal    = isAr ? this.arTotal : this.apTotal;

    this.auditPrint.print({
      reportTitle: isAr ? 'AR Aging' : 'AP Aging',
      periodLine: `As At ${toTxt}`,
      metaLines: [`Date : From ${fromTxt} to ${toTxt}`, 'Sort By : Name', 'Project : All'],
      labelColumnKey: 'name',
      columns: [
        { header: isAr ? 'Customer' : 'Supplier', key: 'name' },
        { header: '0-30', key: 'days030', align: 'right', type: 'number' },
        { header: '31-60', key: 'days3160', align: 'right', type: 'number' },
        { header: '61-90', key: 'days6190', align: 'right', type: 'number' },
        { header: '90+', key: 'days90p', align: 'right', type: 'number' },
        { header: 'Total', key: 'total', align: 'right', type: 'number' }
      ],
      rows: rows.map(r => ({ name: r[nameKey], days030: r.days030, days3160: r.days3160, days6190: r.days6190, days90p: r.days90p, total: r.total })),
      totalRows: [
        { label: `Grand Total Amount (${this.baseCurrencyName})`, values: { days030: days030Total, days3160: days3160Total, days6190: days6190Total, days90p: days90pTotal, total: grandTotal }, grand: true }
      ]
    });
  }

  exportExcel(): void {
    const rows = this.activeTab === 'ar' ? this.arRows : this.apRows;
    const nameKey = this.activeTab === 'ar' ? 'customerName' : 'supplierName';
    const header = [this.activeTab === 'ar' ? 'Customer' : 'Supplier', '0-30', '31-60', '61-90', '90+', 'Total'];
    const data = [header, ...rows.map(r => [r[nameKey], r.days030, r.days3160, r.days6190, r.days90p, r.total])];
    const csv = data.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${this.activeTab.toUpperCase()}_Aging.csv`; a.click();
  }
}
