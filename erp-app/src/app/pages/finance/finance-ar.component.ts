import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import Swal from 'sweetalert2';

type ArTab = 'invoices' | 'receipts' | 'advances' | 'aging';

@Component({
  selector: 'erp-finance-ar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-ar.component.html',
  styleUrls: ['./finance-ar.component.scss']
})
export class FinanceArComponent implements OnInit {
  activeTab: ArTab = 'invoices';

  // Invoices
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  expandedCustomers: Set<string> = new Set();
  invoiceSummary = { total: 0, paid: 0, creditNote: 0, outstanding: 0 };

  // Receipts
  receipts: any[] = [];
  filteredReceipts: any[] = [];
  showReceiptForm = false;
  receiptForm: any = { customerId: null, receiptDate: '', amount: null, paymentMode: 'BANK', remarks: '' };
  savingReceipt = false;

  // Advances
  advances: any[] = [];
  advanceSummary = { total: 0, utilised: 0, balance: 0 };
  showAdvanceForm = false;
  advanceForm: any = { customerId: null, advanceDate: '', amount: null, paymentMode: 'BANK', remarks: '' };
  savingAdvance = false;

  // Aging
  agingRows: any[] = [];
  agingSummary = { total: 0, days0_30: 0, days31_60: 0, days61plus: 0 };
  agingFromDate = '';
  agingToDate = '';

  search = '';
  loading = false;
  error = '';
  message = '';

  private invoiceConfig = FINANCE_PAGES.find(p => p.key === 'ar-invoices')!;
  private receiptConfig  = FINANCE_PAGES.find(p => p.key === 'receipts')!;
  private advanceConfig  = FINANCE_PAGES.find(p => p.key === 'ar-advance')!;
  private agingConfig    = FINANCE_PAGES.find(p => p.key === 'ar-aging')!;

  constructor(private finance: FinanceService) {}

  ngOnInit(): void {
    this.loadInvoices();
  }

  setTab(tab: ArTab): void {
    this.activeTab = tab;
    this.error = '';
    this.message = '';
    if (tab === 'invoices')  this.loadInvoices();
    else if (tab === 'receipts')  this.loadReceipts();
    else if (tab === 'advances')  this.loadAdvances();
    else if (tab === 'aging')     this.loadAging();
  }

  private loadInvoices(): void {
    this.loading = true;
    this.finance.list(this.invoiceConfig.endpoint).subscribe({
      next: res => {
        this.invoices = this.finance.unwrap(res);
        this.applyInvoiceFilter();
        this.calcInvoiceSummary();
        this.loading = false;
      },
      error: () => { this.invoices = []; this.filteredInvoices = []; this.loading = false; this.error = 'AR invoices unavailable.'; }
    });
  }

  private loadReceipts(): void {
    this.loading = true;
    this.finance.list(this.receiptConfig.endpoint).subscribe({
      next: res => { this.receipts = this.finance.unwrap(res); this.filteredReceipts = [...this.receipts]; this.loading = false; },
      error: () => { this.receipts = []; this.filteredReceipts = []; this.loading = false; this.error = 'Receipts unavailable.'; }
    });
  }

  private loadAdvances(): void {
    this.loading = true;
    this.finance.list(this.advanceConfig.endpoint).subscribe({
      next: res => { this.advances = this.finance.unwrap(res); this.calcAdvanceSummary(); this.loading = false; },
      error: () => { this.advances = []; this.loading = false; this.error = 'AR advances unavailable.'; }
    });
  }

  private loadAging(): void {
    this.loading = true;
    this.finance.list(this.agingConfig.endpoint, { fromDate: this.agingFromDate, toDate: this.agingToDate }).subscribe({
      next: res => { this.agingRows = this.finance.unwrap(res); this.calcAgingSummary(); this.loading = false; },
      error: () => { this.agingRows = []; this.loading = false; this.error = 'AR aging unavailable.'; }
    });
  }

  applyInvoiceFilter(): void {
    const q = this.search.toLowerCase();
    this.filteredInvoices = q
      ? this.invoices.filter(r => ['customerName', 'invoiceNo', 'status'].some(k => String(r[k] ?? '').toLowerCase().includes(q)))
      : [...this.invoices];
  }

  get customerGroups(): { customer: string; invoices: any[]; total: number; paid: number; outstanding: number }[] {
    const map = new Map<string, any[]>();
    this.filteredInvoices.forEach(inv => {
      const key = inv.customerName || 'Unknown Customer';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });
    return Array.from(map.entries()).map(([customer, invs]) => ({
      customer,
      invoices: invs,
      total: invs.reduce((s, i) => s + (i.amount || 0), 0),
      paid: invs.reduce((s, i) => s + (i.paid || 0), 0),
      outstanding: invs.reduce((s, i) => s + (i.balance || 0), 0)
    }));
  }

  toggleCustomer(c: string): void {
    this.expandedCustomers.has(c) ? this.expandedCustomers.delete(c) : this.expandedCustomers.add(c);
  }
  isExpanded(c: string): boolean { return this.expandedCustomers.has(c); }

  saveReceipt(): void {
    if (!this.receiptForm.receiptDate || !this.receiptForm.amount) {
      Swal.fire('Required', 'Date and amount are required.', 'warning');
      return;
    }
    this.savingReceipt = true;
    this.finance.create(this.receiptConfig.endpoint, this.receiptForm).subscribe({
      next: () => { this.savingReceipt = false; this.showReceiptForm = false; this.message = 'Receipt saved.'; this.loadReceipts(); },
      error: err => { this.savingReceipt = false; this.error = err?.error?.message || 'Unable to save receipt.'; }
    });
  }

  saveAdvance(): void {
    if (!this.advanceForm.advanceDate || !this.advanceForm.amount) {
      Swal.fire('Required', 'Date and amount are required.', 'warning');
      return;
    }
    this.savingAdvance = true;
    this.finance.create(this.advanceConfig.endpoint, this.advanceForm).subscribe({
      next: () => { this.savingAdvance = false; this.showAdvanceForm = false; this.message = 'Advance saved.'; this.loadAdvances(); },
      error: err => { this.savingAdvance = false; this.error = err?.error?.message || 'Unable to save advance.'; }
    });
  }

  runAging(): void { this.loadAging(); }

  statusClass(status: string): string {
    const s = String(status || '').toLowerCase();
    if (['paid', 'posted', 'approved'].includes(s)) return 'badge-success';
    if (['overdue', 'rejected'].includes(s)) return 'badge-danger';
    if (['pending', 'submitted', 'draft'].includes(s)) return 'badge-warning';
    return 'badge-default';
  }

  private calcInvoiceSummary(): void {
    this.invoiceSummary.total = this.invoices.reduce((s, r) => s + (r.amount || 0), 0);
    this.invoiceSummary.paid  = this.invoices.reduce((s, r) => s + (r.paid || 0), 0);
    this.invoiceSummary.outstanding = this.invoices.reduce((s, r) => s + (r.balance || 0), 0);
  }

  private calcAdvanceSummary(): void {
    this.advanceSummary.total    = this.advances.reduce((s, r) => s + (r.amount || 0), 0);
    this.advanceSummary.utilised = this.advances.reduce((s, r) => s + (r.utilised || 0), 0);
    this.advanceSummary.balance  = this.advances.reduce((s, r) => s + (r.balance || 0), 0);
  }

  private calcAgingSummary(): void {
    this.agingSummary.total      = this.agingRows.reduce((s, r) => s + (r.total || 0), 0);
    this.agingSummary.days0_30   = this.agingRows.reduce((s, r) => s + (r.current || r.days30 || 0), 0);
    this.agingSummary.days31_60  = this.agingRows.reduce((s, r) => s + (r.days60 || 0), 0);
    this.agingSummary.days61plus = this.agingRows.reduce((s, r) => s + (r.days90 || 0) + (r.days90plus || 0), 0);
  }
}
