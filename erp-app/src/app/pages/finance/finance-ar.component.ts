import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import Swal from 'sweetalert2';
import { ActivatedRoute } from '@angular/router';

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
  advanceForm: any = { customerId: null, customerName: '', advanceDate: '', amount: null, paymentMode: 'BANK', remarks: '' };
  savingAdvance = false;
  customers: any[] = [];

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

  constructor(private finance: FinanceService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.loadCustomers();
    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('receipts') || path.includes('AR-receipt')) this.setTab('receipts');
    else if (path.includes('ar-advance')) this.setTab('advances');
    else if (path.includes('ar-aging') || path.includes('aging')) this.setTab('aging');
    else this.loadInvoices();
  }

  private loadCustomers(): void {
    this.finance.getCustomers().subscribe({
      next: res => {
        this.customers = this.finance.unwrap(res).map((c: any) => ({
          id: c.id ?? c.iD ?? c.customerId,
          name: c.customerName ?? c.name ?? c.CustomerName ?? ''
        }));
      },
      error: () => { this.customers = []; }
    });
  }

  onCustomerSelect(): void {
    const cust = this.customers.find(c => Number(c.id) === Number(this.advanceForm.customerId));
    this.advanceForm.customerName = cust?.name ?? '';
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
        this.invoices = this.finance.unwrap(res).map((r: any) => this.normalizeInvoice(r));
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
      next: res => { this.receipts = this.finance.unwrap(res).map(row => this.normalizeReceipt(row)); this.filteredReceipts = [...this.receipts]; this.loading = false; },
      error: () => { this.receipts = []; this.filteredReceipts = []; this.loading = false; this.error = 'Receipts unavailable.'; }
    });
  }

  private loadAdvances(): void {
    this.loading = true;
    this.finance.list(this.advanceConfig.endpoint).subscribe({
      next: res => { this.advances = this.finance.unwrap(res).map(row => this.normalizeAdvance(row)); this.calcAdvanceSummary(); this.loading = false; },
      error: () => { this.advances = []; this.loading = false; this.error = 'AR advances unavailable.'; }
    });
  }

  private loadAging(): void {
    this.loading = true;
    const range = this.agingDateRange();
    this.agingFromDate = range.fromDate;
    this.agingToDate = range.toDate;
    this.finance.list(this.agingConfig.endpoint, range).subscribe({
      next: res => { this.agingRows = this.finance.unwrap(res).map(row => this.normalizeAging(row)); this.calcAgingSummary(); this.loading = false; },
      error: () => { this.agingRows = []; this.loading = false; this.error = 'AR aging unavailable.'; }
    });
  }

  applyInvoiceFilter(): void {
    const q = this.search.toLowerCase();
    this.filteredInvoices = q
      ? this.invoices.filter(r => ['customerName', 'invoiceNo', 'status'].some(k => String(r[k] ?? '').toLowerCase().includes(q)))
      : [...this.invoices];
  }

  get customerGroups(): { customer: string; invoices: any[]; total: number; paid: number; creditNote: number; outstanding: number }[] {
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
      creditNote: invs.reduce((s, i) => s + (i.creditNote || 0), 0),
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
    if (s === 'paid')    return 'badge-success';
    if (s === 'partial') return 'badge-warning';
    return 'badge-danger';
  }

  private calcInvoiceSummary(): void {
    this.invoiceSummary.total = this.invoices.reduce((s, r) => s + (r.amount || 0), 0);
    this.invoiceSummary.paid  = this.invoices.reduce((s, r) => s + (r.paid || 0), 0);
    this.invoiceSummary.creditNote = this.invoices.reduce((s, r) => s + (r.creditNote || 0), 0);
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

  private normalizeInvoice(row: any): any {
    const amount = this.money(row, ['amount', 'Amount', 'invoiceAmount', 'InvoiceAmount', 'totalAmount', 'TotalAmount', 'grandTotal', 'GrandTotal']);
    const paid = this.money(row, ['paid', 'Paid', 'paidAmount', 'PaidAmount', 'totalPaid', 'TotalPaid']);
    const creditNote = this.money(row, ['creditNote', 'CreditNote', 'creditNoteAmount', 'CreditNoteAmount']);
    const balance = this.money(row, ['balance', 'Balance', 'outstanding', 'Outstanding', 'balanceAmount', 'BalanceAmount'], amount - paid - creditNote);
    return {
      ...row,
      customerName: row.customerName ?? row.CustomerName ?? row.customer ?? 'Unknown Customer',
      invoiceNo: row.invoiceNo ?? row.InvoiceNo ?? row.salesInvoiceNo ?? row.SalesInvoiceNo,
      invoiceDate: row.invoiceDate ?? row.InvoiceDate,
      dueDate: row.dueDate ?? row.DueDate,
      amount,
      paid,
      creditNote,
      balance: Math.max(balance, 0),
      status: row.status ?? row.Status ?? (balance <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid')
    };
  }

  private normalizeReceipt(row: any): any {
    return {
      ...row,
      receiptNo: row.receiptNo ?? row.ReceiptNo,
      customerName: row.customerName ?? row.CustomerName,
      receiptDate: row.receiptDate ?? row.ReceiptDate,
      paymentMode: row.paymentMode ?? row.PaymentMode,
      amount: this.money(row, ['amount', 'Amount', 'amountBase', 'AmountBase']),
      status: row.status ?? row.Status ?? 'Posted'
    };
  }

  private normalizeAdvance(row: any): any {
    const amount = this.money(row, ['amount', 'Amount', 'originalAmount', 'OriginalAmount']);
    const balance = this.money(row, ['balance', 'Balance', 'balanceAmount', 'BalanceAmount']);
    return {
      ...row,
      advanceNo: row.advanceNo ?? row.AdvanceNo,
      customerName: row.customerName ?? row.CustomerName,
      advanceDate: row.advanceDate ?? row.AdvanceDate,
      paymentMode: row.paymentMode ?? row.PaymentMode,
      amount,
      utilised: this.money(row, ['utilised', 'Utilised', 'utilisedAmount', 'UtilisedAmount'], amount - balance),
      balance
    };
  }

  private normalizeAging(row: any): any {
    return {
      ...row,
      customerName: row.customerName ?? row.CustomerName,
      total: this.money(row, ['total', 'totalOutstanding', 'TotalOutstanding', 'totalOutstandingBase', 'TotalOutstandingBase']),
      current: this.money(row, ['current', 'days30', 'bucket0_30', 'Bucket0_30', 'bucket0_30Base', 'Bucket0_30Base']),
      days60: this.money(row, ['days60', 'bucket31_60', 'Bucket31_60', 'bucket31_60Base', 'Bucket31_60Base']),
      days90: this.money(row, ['days90', 'bucket61_90', 'Bucket61_90', 'bucket61_90Base', 'Bucket61_90Base']),
      days90plus: this.money(row, ['days90plus', 'bucket90Plus', 'Bucket90Plus', 'bucket90PlusBase', 'Bucket90PlusBase'])
    };
  }

  private agingDateRange(): { fromDate: string; toDate: string } {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 120);
    return {
      fromDate: this.agingFromDate || this.dateOnly(from),
      toDate: this.agingToDate || this.dateOnly(today)
    };
  }

  private money(row: any, keys: string[], fallback = 0): number {
    const value = keys.map(key => row?.[key]).find(v => v !== undefined && v !== null && v !== '');
    return Number(value ?? fallback) || 0;
  }

  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
