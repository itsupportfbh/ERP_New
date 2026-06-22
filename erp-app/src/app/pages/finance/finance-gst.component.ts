import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import Swal from 'sweetalert2';

type GstTab = 'taxcodes' | 'returns' | 'details';

@Component({
  selector: 'erp-finance-gst',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-gst.component.html',
  styleUrls: ['./finance-gst.component.scss']
})
export class FinanceGstComponent implements OnInit {
  activeTab: GstTab = 'taxcodes';

  // Tax Codes
  taxCodes: any[] = [];
  filteredTaxCodes: any[] = [];
  showTaxForm = false;
  taxForm: any = { code: '', description: '', rate: null, type: 'GST', isActive: true };
  savingTax = false;
  editingTax: any = null;

  // GST F5 Returns
  gstReturns: any[] = [];
  returnYears: string[] = [];
  selectedYear = '';
  returnSummary = { totalOutput: 0, totalInput: 0, netPayable: 0 };

  // GST Details / Report
  gstReport: any[] = [];
  reportFromDate = '';
  reportToDate = '';
  reportSummary = { outputTax: 0, inputTax: 0, netGST: 0, totalSales: 0, totalPurchases: 0 };

  search = '';
  loading = false;
  error = '';
  message = '';

  private taxConfig    = FINANCE_PAGES.find(p => p.key === 'tax-gst')!;
  private returnConfig = FINANCE_PAGES.find(p => p.key === 'gst-return')!;
  private reportConfig = FINANCE_PAGES.find(p => p.key === 'gst-report')!;

  constructor(private finance: FinanceService) {}

  ngOnInit(): void {
    this.loadTaxCodes();
  }

  setTab(tab: GstTab): void {
    this.activeTab = tab;
    this.error = '';
    this.message = '';
    if (tab === 'taxcodes') this.loadTaxCodes();
    else if (tab === 'returns') this.loadReturns();
    else if (tab === 'details') this.loadReport();
  }

  private loadTaxCodes(): void {
    this.loading = true;
    this.finance.list(this.taxConfig.endpoint).subscribe({
      next: res => {
        this.taxCodes = this.finance.unwrap(res);
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.taxCodes = []; this.filteredTaxCodes = []; this.loading = false; this.error = 'Tax codes unavailable.'; }
    });
  }

  private loadReturns(): void {
    this.loading = true;
    this.finance.list(this.returnConfig.endpoint).subscribe({
      next: res => {
        const data = this.finance.unwrap(res);
        this.returnYears = Array.isArray(data) && typeof data[0] === 'string' ? data : [];
        if (this.returnYears.length && !this.selectedYear) {
          this.selectedYear = this.returnYears[0];
        }
        this.loadReturnForYear();
      },
      error: () => { this.returnYears = []; this.gstReturns = []; this.loading = false; this.error = 'GST returns unavailable.'; }
    });
  }

  loadReturnForYear(): void {
    if (!this.selectedYear) { this.loading = false; return; }
    this.loading = true;
    this.finance.list(this.returnConfig.endpoint, { year: this.selectedYear }).subscribe({
      next: res => {
        this.gstReturns = this.finance.unwrap(res);
        this.calcReturnSummary();
        this.loading = false;
      },
      error: () => { this.gstReturns = []; this.loading = false; this.error = 'GST return data unavailable.'; }
    });
  }

  private loadReport(): void {
    this.loading = true;
    this.finance.list(this.reportConfig.endpoint, { fromDate: this.reportFromDate, toDate: this.reportToDate }).subscribe({
      next: res => {
        this.gstReport = this.finance.unwrap(res);
        this.calcReportSummary();
        this.loading = false;
      },
      error: () => { this.gstReport = []; this.loading = false; this.error = 'GST report unavailable.'; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filteredTaxCodes = q
      ? this.taxCodes.filter(r => ['code', 'description', 'type'].some(k => String(r[k] ?? '').toLowerCase().includes(q)))
      : [...this.taxCodes];
  }

  saveTax(): void {
    if (!this.taxForm.code || this.taxForm.rate === null) {
      Swal.fire('Required', 'Code and rate are required.', 'warning');
      return;
    }
    this.savingTax = true;
    const payload = { ...this.taxForm };
    const obs = this.editingTax
      ? this.finance.update(this.taxConfig.endpoint, this.editingTax.id, payload)
      : this.finance.create(this.taxConfig.endpoint, payload);

    obs.subscribe({
      next: () => {
        this.savingTax = false;
        this.showTaxForm = false;
        this.editingTax = null;
        this.message = 'Tax code saved.';
        this.loadTaxCodes();
      },
      error: err => { this.savingTax = false; this.error = err?.error?.message || 'Unable to save tax code.'; }
    });
  }

  editTax(row: any): void {
    this.editingTax = row;
    this.taxForm = { code: row.code, description: row.description, rate: row.rate, type: row.type || 'GST', isActive: row.isActive !== false };
    this.showTaxForm = true;
    this.message = '';
    this.error = '';
  }

  cancelTaxForm(): void {
    this.showTaxForm = false;
    this.editingTax = null;
    this.taxForm = { code: '', description: '', rate: null, type: 'GST', isActive: true };
  }

  runReport(): void { this.loadReport(); }

  private calcReturnSummary(): void {
    this.returnSummary.totalOutput = this.gstReturns.reduce((s, r) => s + (r.outputTax || r.gstCollected || 0), 0);
    this.returnSummary.totalInput  = this.gstReturns.reduce((s, r) => s + (r.inputTax || r.gstPaid || 0), 0);
    this.returnSummary.netPayable  = this.returnSummary.totalOutput - this.returnSummary.totalInput;
  }

  private calcReportSummary(): void {
    this.reportSummary.totalSales     = this.gstReport.reduce((s, r) => s + (r.totalSales || r.amount || 0), 0);
    this.reportSummary.totalPurchases = this.gstReport.reduce((s, r) => s + (r.totalPurchases || 0), 0);
    this.reportSummary.outputTax      = this.gstReport.reduce((s, r) => s + (r.outputTax || r.gstCollected || 0), 0);
    this.reportSummary.inputTax       = this.gstReport.reduce((s, r) => s + (r.inputTax || r.gstPaid || 0), 0);
    this.reportSummary.netGST         = this.reportSummary.outputTax - this.reportSummary.inputTax;
  }
}
