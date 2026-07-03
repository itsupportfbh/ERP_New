import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';
import { AuditPrintService } from '../../core/services/audit-print.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TaxNamePipe } from '../../shared/pipes/tax-name.pipe';

@Component({
  selector: 'erp-finance-gst-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent, MoneyPipe, TaxNamePipe],
  templateUrl: './finance-gst-detail.component.html',
  styleUrls: ['./finance-gst-detail.component.scss']
})
export class FinanceGstDetailComponent implements OnInit {
  loading = false;
  error = '';

  fromDate = '';
  toDate = '';
  docType: 'ALL' | 'SI' | 'PIN' = 'ALL';
  search = '';

  rows: any[] = [];
  filtered: any[] = [];

  pageSize = 10;
  page = 1;

  private readonly today = new Date().toISOString().slice(0, 10);
  private readonly threeMonthsAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); })();
  private readonly api = environment.apiUrl;
  readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';

  constructor(private http: HttpClient, private auditPrint: AuditPrintService) {}

  ngOnInit(): void {
    this.fromDate = this.threeMonthsAgo;
    this.toDate = this.today;
    this.load();
  }

  load(): void {
    this.loading = true; this.error = ''; this.page = 1;
    let p = new HttpParams().set('startDate', this.fromDate).set('endDate', this.toDate);
    if (this.docType !== 'ALL') p = p.set('docType', this.docType);
    this.http.get<any>(`${this.api}/GstReturns/details`, { params: p }).subscribe({
      next: res => {
        const data = Array.isArray(res) ? res : (res?.data ?? res?.result ?? []);
        this.rows = data.map((r: any) => this.norm(r));
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.error = 'GST data unavailable.'; this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          String(r.docNo ?? '').toLowerCase().includes(q) ||
          String(r.partyName ?? '').toLowerCase().includes(q))
      : [...this.rows];
    this.page = 1;
  }

  reset(): void { this.search = ''; this.docType = 'ALL'; this.fromDate = this.threeMonthsAgo; this.toDate = this.today; this.load(); }

  get pagedRows(): any[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  get totalPages(): number { return Math.ceil(this.filtered.length / this.pageSize); }
  get pages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  minVal(a: number, b: number): number { return Math.min(a, b); }

  get totalTaxable(): number { return this.rows.reduce((s, r) => s + r.taxable, 0); }
  get totalTax():     number { return this.rows.reduce((s, r) => s + r.taxAmt, 0); }
  get totalNet():     number { return this.rows.reduce((s, r) => s + r.net, 0); }

  typeLabel(r: any): string {
    const src = String(r.source ?? r.type ?? '').toUpperCase();
    if (src === 'INPUT' || src.includes('INPUT')) return 'Supplier';
    if (src === 'OUTPUT' || src.includes('OUTPUT')) return 'Customer';
    const dt = String(r.docType ?? r.sourceDocType ?? '').toUpperCase();
    if (dt === 'PIN' || dt.includes('PURCHASE') || dt.includes('SUPPLIER')) return 'Supplier';
    if (dt === 'SI' || dt.includes('SALE')) return 'Customer';
    return dt || 'Other';
  }

  typeBadgeClass(r: any): string {
    const l = this.typeLabel(r).toLowerCase();
    if (l === 'supplier') return 'badge-supplier';
    if (l === 'customer') return 'badge-customer';
    return 'badge-other';
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
      reportTitle: 'GST Detail Report',
      periodLine: `For The Period From ${fromTxt} To ${toTxt}`,
      metaLines: [`Date : From ${fromTxt} to ${toTxt}`, 'Sort By : Date;Doc No', `Doc Type : ${this.docType === 'ALL' ? 'All' : this.docType}`],
      labelColumnKey: 'partyName',
      columns: [
        { header: 'Type', key: 'typeLabel' },
        { header: 'Doc No', key: 'docNo' },
        { header: 'Date', key: 'txnDate', type: 'date' },
        { header: 'Customer / Supplier', key: 'partyName' },
        { header: 'Taxable', key: 'taxable', align: 'right', type: 'number' },
        { header: 'Tax', key: 'taxAmt', align: 'right', type: 'number' },
        { header: 'Net', key: 'net', align: 'right', type: 'number' }
      ],
      rows: this.filtered.map(r => ({ ...r, typeLabel: this.typeLabel(r) })),
      totalRows: [
        { label: 'Grand Total', values: { taxable: this.totalTaxable, taxAmt: this.totalTax, net: this.totalNet }, grand: true }
      ]
    });
  }

  exportExcel(): void {
    const header = ['Type', 'Source', 'Date', 'Doc No', 'Customer / Supplier', 'Taxable', 'Tax', 'Net'];
    const data = [header, ...this.filtered.map(r => [
      this.typeLabel(r), r.source, r.txnDate, r.docNo, r.partyName,
      r.taxable.toFixed(2), r.taxAmt.toFixed(2), r.net.toFixed(2)
    ])];
    const csv = data.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'GSTDetail.csv'; a.click();
  }

  private norm(r: any): any {
    const src = String(r.source ?? r.Source ?? r.type ?? '').toUpperCase();
    const taxAmt = Number(r.gstAmount ?? r.taxAmount ?? r.TaxAmount ?? 0);
    const taxable = Number(r.taxableAmount ?? r.TaxableAmount ?? r.baseAmount ?? r.amount ?? 0);
    return {
      docType:   r.docType   ?? r.sourceDocType ?? r.type ?? '',
      source:    src || (r.docType === 'PIN' ? 'INPUT' : 'OUTPUT'),
      txnDate:   r.date ?? r.docDate ?? r.DocDate ?? r.txnDate ?? r.invoiceDate ?? '',
      docNo:     r.documentNo ?? r.docNo ?? r.DocNo ?? r.invoiceNo ?? r.pinNo ?? '-',
      partyName: r.partyName ?? r.description ?? r.PartyName ?? r.customerName ?? r.supplierName ?? '-',
      taxable,
      taxAmt,
      net:       taxable + taxAmt
    };
  }
}
