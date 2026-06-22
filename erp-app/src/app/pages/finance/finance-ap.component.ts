import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import Swal from 'sweetalert2';
import { ActivatedRoute } from '@angular/router';

type ApTab = 'invoices' | 'payments' | 'aging' | 'advances' | 'match';

@Component({
  selector: 'erp-finance-ap',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-ap.component.html',
  styleUrls: ['./finance-ap.component.scss']
})
export class FinanceApComponent implements OnInit {
  activeTab: ApTab = 'invoices';

  // Supplier Invoices
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  expandedSuppliers: Set<string> = new Set();
  invoiceSummary = { totalInvoice: 0, paid: 0, debitNote: 0, advance: 0, outstanding: 0 };

  // Payments
  payments: any[] = [];
  filteredPayments: any[] = [];
  showPaymentForm = false;
  paymentForm: any = { supplierId: null, invoiceId: null, paymentDate: '', amount: null, paymentMode: 'Bank Transfer', referenceNo: '', notes: '' };
  savingPayment = false;

  // AP Aging
  agingRows: any[] = [];
  agingDetailRows: any[] = [];
  agingSummary = { total: 0, days0_30: 0, days31_60: 0, days61plus: 0 };
  agingFromDate = '';
  agingToDate = '';
  expandedSupplierAging: Set<string> = new Set();

  // Advances
  advances: any[] = [];
  advanceSummary = { total: 0, utilised: 0, balance: 0 };
  showAdvanceForm = false;
  advanceForm: any = { supplierId: null, supplierName: '', advanceDate: '', amount: null, referenceNo: '', notes: '' };
  savingAdvance = false;
  suppliers: any[] = [];

  // 3-Way Match
  matchRows: any[] = [];

  search = '';
  loading = false;
  error = '';
  message = '';

  private apConfig = FINANCE_PAGES.find(p => p.key === 'accounts-payable')!;
  private agingConfig = FINANCE_PAGES.find(p => p.key === 'ap-aging')!;
  private advanceConfig = FINANCE_PAGES.find(p => p.key === 'ap-advance')!;

  constructor(private finance: FinanceService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.loadSuppliers();
    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('ap-aging')) this.setTab('aging');
    else if (path.includes('ap-advance')) this.setTab('advances');
    else this.loadInvoices();
  }

  private loadSuppliers(): void {
    this.finance.getSuppliers().subscribe({
      next: res => {
        this.suppliers = this.finance.unwrap(res).map((s: any) => ({
          id: s.id ?? s.iD,
          name: s.supplierName ?? s.name ?? s.SupplierName ?? ''
        }));
      },
      error: () => { this.suppliers = []; }
    });
  }

  onSupplierSelect(): void {
    const sup = this.suppliers.find(s => Number(s.id) === Number(this.advanceForm.supplierId));
    this.advanceForm.supplierName = sup?.name ?? '';
  }

  setTab(tab: ApTab): void {
    this.activeTab = tab;
    this.error = '';
    this.message = '';
    if (tab === 'invoices') this.loadInvoices();
    else if (tab === 'payments') this.loadPayments();
    else if (tab === 'aging') this.loadAging();
    else if (tab === 'advances') this.loadAdvances();
    else if (tab === 'match') this.loadMatch();
  }

  private loadInvoices(): void {
    this.loading = true;
    this.finance.list(this.apConfig.endpoint).subscribe({
      next: res => {
        this.invoices = this.finance.unwrap(res).map(row => this.normalizeInvoice(row));
        this.applyFilter();
        this.calculateInvoiceSummary();
        this.loading = false;
      },
      error: () => {
        this.invoices = [];
        this.filteredInvoices = [];
        this.loading = false;
        this.error = 'Accounts Payable data unavailable.';
      }
    });
  }

  private loadPayments(): void {
    this.loading = true;
    this.finance.list({ list: '/finance/ap/payments' }).subscribe({
      next: res => {
        this.payments = this.finance.unwrap(res).map(row => this.normalizePayment(row));
        this.filteredPayments = [...this.payments];
        this.loading = false;
      },
      error: () => {
        this.payments = [];
        this.filteredPayments = [];
        this.loading = false;
        this.error = 'Payments data unavailable.';
      }
    });
  }

  savePayment(): void {
    if (!this.paymentForm.paymentDate || !this.paymentForm.amount) {
      Swal.fire('Required', 'Payment date and amount are required.', 'warning');
      return;
    }
    this.savingPayment = true;
    this.finance.create({ create: '/finance/ap/payments/create' }, this.paymentForm).subscribe({
      next: () => {
        this.savingPayment = false;
        this.showPaymentForm = false;
        this.paymentForm = { supplierId: null, invoiceId: null, paymentDate: '', amount: null, paymentMode: 'Bank Transfer', referenceNo: '', notes: '' };
        this.message = 'Payment recorded successfully.';
        this.loadPayments();
      },
      error: err => {
        this.savingPayment = false;
        this.error = err?.error?.message || 'Unable to save payment.';
      }
    });
  }

  private loadAging(): void {
    this.loading = true;
    const range = this.agingDateRange();
    this.agingFromDate = range.fromDate;
    this.agingToDate = range.toDate;
    this.finance.list(this.agingConfig.endpoint, range).subscribe({
      next: res => {
        this.agingRows = this.finance.unwrap(res).map(row => this.normalizeAging(row));
        this.calculateAgingSummary();
        this.loading = false;
      },
      error: () => { this.agingRows = []; this.loading = false; this.error = 'AP Aging data unavailable.'; }
    });
  }

  private loadAdvances(): void {
    this.loading = true;
    this.finance.list(this.advanceConfig.endpoint).subscribe({
      next: res => {
        this.advances = this.finance.unwrap(res).map(row => this.normalizeAdvance(row));
        this.calculateAdvanceSummary();
        this.loading = false;
      },
      error: () => { this.advances = []; this.loading = false; this.error = 'AP Advances data unavailable.'; }
    });
  }

  private loadMatch(): void {
    this.loading = true;
    this.finance.list({ list: '/finance/ap/match' }).subscribe({
      next: res => {
        this.matchRows = this.finance.unwrap(res).map(row => this.normalizeMatch(row));
        this.loading = false;
      },
      error: () => { this.matchRows = []; this.loading = false; this.error = '3-Way Match data unavailable.'; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filteredInvoices = q
      ? this.invoices.filter(r => ['supplierName', 'invoiceNo', 'status'].some(k => String(r[k] ?? '').toLowerCase().includes(q)))
      : [...this.invoices];
  }

  get supplierGroups(): { supplier: string; invoices: any[]; total: number; paid: number; debitNote: number; advance: number; outstanding: number }[] {
    const map = new Map<string, any[]>();
    this.filteredInvoices.forEach(inv => {
      const key = inv.supplierName || 'Unknown Supplier';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });
    return Array.from(map.entries()).map(([supplier, invs]) => ({
      supplier,
      invoices: invs,
      total: invs.reduce((s, i) => s + (i.amount || 0), 0),
      paid: invs.reduce((s, i) => s + (i.paid || 0), 0),
      debitNote: invs.reduce((s, i) => s + (i.debitNote || 0), 0),
      advance: invs.reduce((s, i) => s + (i.advance || 0), 0),
      outstanding: invs.reduce((s, i) => s + (i.balance || 0), 0)
    }));
  }

  toggleSupplier(supplier: string): void {
    this.expandedSuppliers.has(supplier) ? this.expandedSuppliers.delete(supplier) : this.expandedSuppliers.add(supplier);
  }

  isExpanded(supplier: string): boolean {
    return this.expandedSuppliers.has(supplier);
  }

  toggleAgingSupplier(supplier: string): void {
    if (this.expandedSupplierAging.has(supplier)) {
      this.expandedSupplierAging.delete(supplier);
      this.agingDetailRows = [];
      return;
    }
    this.expandedSupplierAging.clear();
    this.expandedSupplierAging.add(supplier);
    const row = this.agingRows.find(r => String(r.supplierName) === String(supplier));
    const supplierId = row?.supplierId ?? row?.SupplierId;
    if (!supplierId) {
      this.agingDetailRows = [];
      return;
    }
    this.finance.list({ list: `/ApAging/supplierInvoices/${supplierId}` }, this.agingDateRange()).subscribe({
      next: res => { this.agingDetailRows = this.finance.unwrap(res).map(detail => this.normalizeAgingDetail(detail)); },
      error: () => { this.agingDetailRows = []; }
    });
  }

  isAgingExpanded(supplier: string): boolean {
    return this.expandedSupplierAging.has(supplier);
  }

  runAging(): void {
    this.loadAging();
  }

  exportAging(): void {
    const rows = this.agingRows.map((r, i) => ({
      'Sl No': i + 1,
      Supplier: r.supplierName || '',
      'Invoice Count': r.invoiceCount || 0,
      '0-30': Number(r.current || 0).toFixed(2),
      '31-60': Number(r.days60 || 0).toFixed(2),
      '61-90': Number(r.days90 || 0).toFixed(2),
      '90+': Number(r.days90plus || 0).toFixed(2),
      Total: Number(r.total || 0).toFixed(2)
    }));
    this.downloadCsv(`AP-Aging-${this.agingFromDate}-to-${this.agingToDate}.csv`, rows);
  }

  saveAdvance(): void {
    if (!this.advanceForm.advanceDate || !this.advanceForm.amount) {
      Swal.fire('Required', 'Date and amount are required.', 'warning');
      return;
    }
    this.savingAdvance = true;
    this.finance.create(this.advanceConfig.endpoint, this.advanceForm).subscribe({
      next: () => {
        this.savingAdvance = false;
        this.showAdvanceForm = false;
        this.message = 'Advance saved successfully.';
        this.loadAdvances();
      },
      error: err => {
        this.savingAdvance = false;
        this.error = err?.error?.message || 'Unable to save advance.';
      }
    });
  }

  payInvoice(row: any): void {
    Swal.fire({
      title: `Pay Invoice ${row.invoiceNo || ''}`,
      text: 'Record payment for this invoice?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Pay',
      confirmButtonColor: '#2E5F73'
    }).then(result => {
      if (result.isConfirmed) {
        this.finance.run(this.apConfig.endpoint, 'pay', { id: row.id, invoiceId: row.id, amount: row.balance || 0, paymentDate: new Date().toISOString().slice(0, 10) }).subscribe({
          next: () => { this.message = 'Payment recorded.'; this.loadInvoices(); },
          error: err => { this.error = err?.error?.message || 'Payment failed.'; }
        });
      }
    });
  }

  statusClass(status: string): string {
    const s = String(status || '').toLowerCase();
    if (s === 'paid')    return 'badge-success';
    if (s === 'partial') return 'badge-warning';
    return 'badge-danger';
  }

  private calculateInvoiceSummary(): void {
    this.invoiceSummary.totalInvoice = this.invoices.reduce((s, r) => s + (r.amount || 0), 0);
    this.invoiceSummary.paid = this.invoices.reduce((s, r) => s + (r.paid || 0), 0);
    this.invoiceSummary.debitNote = this.invoices.reduce((s, r) => s + (r.debitNote || 0), 0);
    this.invoiceSummary.advance = this.invoices.reduce((s, r) => s + (r.advance || 0), 0);
    this.invoiceSummary.outstanding = this.invoices.reduce((s, r) => s + (r.balance || 0), 0);
  }

  private normalizeInvoice(row: any): any {
    const amount = this.money(row, ['amount', 'Amount', 'invoiceAmount', 'InvoiceAmount', 'totalAmount', 'TotalAmount', 'grandTotal', 'GrandTotal', 'netAmount', 'NetAmount', 'amountBase', 'AmountBase']);
    const paid = this.money(row, ['paid', 'Paid', 'paidAmount', 'PaidAmount', 'totalPaid', 'TotalPaid', 'paymentAmount', 'PaymentAmount', 'paidBase', 'PaidBase']);
    const debitNote = this.money(row, ['debitNote', 'DebitNote', 'debitNoteAmount', 'DebitNoteAmount', 'debitAmount', 'DebitAmount', 'totalDebitNote', 'TotalDebitNote']);
    const advance = this.money(row, ['advance', 'Advance', 'advanceApplied', 'AdvanceApplied', 'advanceAmount', 'AdvanceAmount', 'advanceAppliedAmount', 'AdvanceAppliedAmount', 'supplierAdvance', 'SupplierAdvance', 'advanceAdjusted', 'AdvanceAdjusted']);
    const balance = this.money(row, ['balance', 'Balance', 'outstanding', 'Outstanding', 'outstandingAmount', 'OutstandingAmount', 'netPayable', 'NetPayable', 'dueAmount', 'DueAmount', 'balanceAmount', 'BalanceAmount'], amount - paid - debitNote - advance);
    return {
      ...row,
      id: row.id ?? row.invoiceId ?? row.pinId ?? row.supplierInvoiceId,
      supplierId: row.supplierId ?? row.SupplierId,
      supplierName: row.supplierName ?? row.SupplierName ?? row.supplier ?? row.vendorName ?? row.partyName ?? 'Unknown Supplier',
      invoiceNo: row.invoiceNo ?? row.InvoiceNo ?? row.pinNo ?? row.supplierInvoiceNo ?? row.referenceNo ?? row.docNo,
      invoiceDate: row.invoiceDate ?? row.InvoiceDate ?? row.pinDate ?? row.docDate ?? row.createdDate,
      dueDate: row.dueDate ?? row.DueDate ?? row.paymentDueDate,
      invoiceType: row.invoiceType ?? row.InvoiceType ?? row.type ?? (row.isLocal ? 'Local' : 'Local'),
      amount,
      paid,
      debitNote,
      advance,
      balance: Math.max(balance, 0),
      currencyName: row.currencyName ?? row.CurrencyName ?? row.currencyCode ?? 'INR',
      status: balance <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
    };
  }

  private money(row: any, keys: string[], fallback = 0): number {
    const value = keys.map(key => row?.[key]).find(v => v !== undefined && v !== null && v !== '');
    return Number(value ?? fallback) || 0;
  }

  private calculateAgingSummary(): void {
    this.agingSummary.total = this.agingRows.reduce((s, r) => s + (r.total || 0), 0);
    this.agingSummary.days0_30 = this.agingRows.reduce((s, r) => s + (r.current || r.days30 || 0), 0);
    this.agingSummary.days31_60 = this.agingRows.reduce((s, r) => s + (r.days60 || 0), 0);
    this.agingSummary.days61plus = this.agingRows.reduce((s, r) => s + (r.days90 || 0) + (r.days90plus || 0), 0);
  }

  private calculateAdvanceSummary(): void {
    this.advanceSummary.total = this.advances.reduce((s, r) => s + (r.amount || 0), 0);
    this.advanceSummary.utilised = this.advances.reduce((s, r) => s + (r.utilised || 0), 0);
    this.advanceSummary.balance = this.advances.reduce((s, r) => s + (r.balance || 0), 0);
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

  private normalizeAging(row: any): any {
    return {
      ...row,
      supplierName: row.supplierName ?? row.SupplierName,
      supplierId: row.supplierId ?? row.SupplierId,
      invoiceCount: row.invoiceCount ?? row.InvoiceCount ?? 0,
      total: this.money(row, ['total', 'totalOutstanding', 'TotalOutstanding', 'totalOutstandingBase', 'TotalOutstandingBase']),
      current: this.money(row, ['current', 'days30', 'bucket0_30', 'Bucket0_30', 'bucket0_30Base', 'Bucket0_30Base']),
      days60: this.money(row, ['days60', 'bucket31_60', 'Bucket31_60', 'bucket31_60Base', 'Bucket31_60Base']),
      days90: this.money(row, ['days90', 'bucket61_90', 'Bucket61_90', 'bucket61_90Base', 'Bucket61_90Base']),
      days90plus: this.money(row, ['days90plus', 'bucket90Plus', 'Bucket90Plus', 'bucket90PlusBase', 'Bucket90PlusBase'])
    };
  }

  private normalizeAgingDetail(row: any): any {
    return {
      ...row,
      invoiceNo: row.invoiceNo ?? row.InvoiceNo ?? row.pinNo ?? row.PinNo,
      invoiceDate: row.invoiceDate ?? row.InvoiceDate ?? row.pinDate ?? row.PinDate,
      dueDate: row.dueDate ?? row.DueDate,
      originalAmount: this.money(row, ['originalAmount', 'OriginalAmount', 'amount', 'Amount', 'grandTotal', 'GrandTotal']),
      paidAmount: this.money(row, ['paidAmount', 'PaidAmount', 'paid', 'Paid']),
      balance: this.money(row, ['balance', 'Balance', 'balanceAmount', 'BalanceAmount', 'outstandingAmount', 'OutstandingAmount']),
      currencyName: row.currencyName ?? row.CurrencyName ?? 'SGD'
    };
  }

  private normalizePayment(row: any): any {
    return {
      ...row,
      paymentNo: row.paymentNo ?? row.PaymentNo ?? row.referenceNo ?? row.ReferenceNo,
      supplierName: row.supplierName ?? row.SupplierName,
      invoiceNo: row.invoiceNo ?? row.InvoiceNo,
      paymentDate: row.paymentDate ?? row.PaymentDate,
      paymentMode: row.paymentMode ?? row.PaymentMode ?? row.methodName ?? row.MethodName,
      referenceNo: row.referenceNo ?? row.ReferenceNo,
      amount: this.money(row, ['amount', 'Amount', 'amountBase', 'AmountBase']),
      status: row.status ?? row.Status ?? 'Posted'
    };
  }

  private normalizeAdvance(row: any): any {
    const amount = this.money(row, ['amount', 'Amount', 'originalAmount', 'OriginalAmount']);
    const utilised = this.money(row, ['utilised', 'Utilised', 'utilisedAmount', 'UtilisedAmount']);
    const balance = this.money(row, ['balance', 'Balance', 'balanceAmount', 'BalanceAmount'], amount - utilised);
    return {
      ...row,
      advanceNo: row.advanceNo ?? row.AdvanceNo,
      supplierName: row.supplierName ?? row.SupplierName,
      advanceDate: row.advanceDate ?? row.AdvanceDate,
      amount,
      utilised,
      balance,
      status: row.status ?? row.Status ?? (balance <= 0 ? 'Closed' : 'Open')
    };
  }

  private normalizeMatch(row: any): any {
    const poAmount = this.money(row, ['poAmount', 'PoAmount']);
    const invoiceAmount = this.money(row, ['invoiceAmount', 'InvoiceAmount']);
    return {
      ...row,
      poNo: row.poNo ?? row.PoNo,
      grnNo: row.grnNo ?? row.GrnNo,
      invoiceNo: row.invoiceNo ?? row.InvoiceNo,
      supplierName: row.supplierName ?? row.SupplierName,
      poAmount,
      invoiceAmount,
      matchStatus: row.matchStatus ?? row.MatchStatus ?? row.status ?? row.Status ?? (Math.abs(poAmount - invoiceAmount) <= 0.01 && poAmount > 0 ? 'Matched' : 'Mismatch')
    };
  }

  private downloadCsv(fileName: string, rows: any[]): void {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const body = rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
