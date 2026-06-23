import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
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

  // Payments list
  payments: any[] = [];
  filteredPayments: any[] = [];
  showPaymentForm = false;
  savingPayment = false;

  // Payment create form
  paymentForm: any = {
    supplierId: null, supplierInvoiceId: null, paymentDate: '',
    paymentMethodId: 2, bankId: null, amount: null, referenceNo: '', notes: ''
  };
  paymentSupplierInvoices: any[] = [];  // all posted supplier invoices
  paymentFilteredInvoices: any[] = [];  // filtered by selected supplier
  bankAccounts: any[] = [];
  paymentCurrencies: any[] = [];
  paymentFxRate = 1;
  paymentCurrencyId: number | null = null;
  paymentCurrencyName = '';
  paymentBaseCurrencyId: number | null = null;
  paymentAmountBase = 0;
  paymentExchangeGainLoss = 0;
  loadingPaymentInvoices = false;
  paymentInvoicesLoaded = false;

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
  apAdvMethodId = 2;
  apAdvBankHeadId: number | null = null;
  apAdvGrnNo = '';
  apAdvFxRate = 1;
  apAdvAmountBase = 0;
  apAdvCurrencyId: number | null = null;
  apAdvCurrencyName = '';
  suppliers: any[] = [];

  // 3-Way Match
  matchRows: any[] = [];

  search = '';
  loading = false;
  error = '';
  message = '';
  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  private apConfig = FINANCE_PAGES.find(p => p.key === 'accounts-payable')!;
  private agingConfig = FINANCE_PAGES.find(p => p.key === 'ap-aging')!;
  private advanceConfig = FINANCE_PAGES.find(p => p.key === 'ap-advance')!;

  constructor(private finance: FinanceService, private route: ActivatedRoute, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.loadSuppliers();
    this.loadBankAccounts();
    this.loadPaymentCurrencies();
    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('ap-aging')) this.setTab('aging');
    else if (path.includes('ap-advance')) this.setTab('advances');
    else this.loadInvoices();
    this.permissionService.getFunctionPermission(this.userId, 'ap').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  // ── Bank Accounts + Currencies ──────────────────────────────────────────────

  private loadBankAccounts(): void {
    this.finance.list({ list: '/BankAccounts' }).subscribe({
      next: res => { this.bankAccounts = this.finance.unwrap(res); },
      error: () => { this.bankAccounts = []; }
    });
  }

  private loadPaymentCurrencies(): void {
    this.finance.list({ list: '/Currency/GetCurrencies' }).subscribe({
      next: res => {
        this.paymentCurrencies = this.finance.unwrap(res);
        if (this.paymentCurrencies.length && !this.paymentCurrencyId) {
          const base = this.paymentCurrencies.find(c => c.isBase) ?? this.paymentCurrencies[0];
          this.paymentCurrencyId = base.id ?? base.currencyId;
          this.paymentCurrencyName = base.currencyCode ?? base.currencyName ?? '';
          this.paymentBaseCurrencyId = this.paymentCurrencyId;
        }
      },
      error: () => { this.paymentCurrencies = []; }
    });
  }

  // ── Payment Form ───────────────────────────────────────────────────────────

  openPaymentForm(): void {
    this.showPaymentForm = true;
    this.message = '';
    this.error = '';
    this.paymentForm = {
      supplierId: null, supplierInvoiceId: null,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethodId: 2, bankId: null, amount: null, referenceNo: '', notes: ''
    };
    this.paymentFilteredInvoices = [];
    this.paymentFxRate = 1;
    this.paymentAmountBase = 0;
    this.paymentExchangeGainLoss = 0;
    const base = this.paymentCurrencies.find(c => c.isBase) ?? this.paymentCurrencies[0];
    if (base) {
      this.paymentCurrencyId = base.id ?? base.currencyId;
      this.paymentCurrencyName = base.currencyCode ?? base.currencyName ?? '';
    }
    if (!this.paymentInvoicesLoaded) this.loadAllSupplierInvoices();
  }

  closePaymentForm(): void {
    this.showPaymentForm = false;
    this.paymentFilteredInvoices = [];
  }

  private loadAllSupplierInvoices(): void {
    this.loadingPaymentInvoices = true;
    this.finance.list({ list: '/SupplierInvoicePin/GetAll' }).subscribe({
      next: res => {
        this.paymentSupplierInvoices = this.finance.unwrap(res)
          .filter((inv: any) => {
            const status = Number(inv.status ?? inv.Status ?? 0);
            const net = Number(inv.netPayableAmount ?? inv.NetPayableAmount ?? inv.balance ?? inv.Balance ?? 0);
            return status >= 3 && net > 0;
          })
          .map((inv: any) => this.normalizeSupplierInvoiceForPayment(inv));
        this.paymentInvoicesLoaded = true;
        this.loadingPaymentInvoices = false;
        if (this.paymentForm.supplierId) this.onPaymentSupplierChange();
      },
      error: () => { this.paymentSupplierInvoices = []; this.loadingPaymentInvoices = false; }
    });
  }

  private normalizeSupplierInvoiceForPayment(inv: any): any {
    const amount = Number(inv.amount ?? inv.Amount ?? 0);
    const advance = Number(inv.advanceAppliedAmount ?? inv.AdvanceAppliedAmount ?? 0);
    const net = Number(inv.netPayableAmount ?? inv.NetPayableAmount ?? (amount - advance));
    return {
      id: inv.id ?? inv.Id,
      invoiceNo: inv.invoiceNo ?? inv.InvoiceNo ?? '',
      invoiceDate: inv.invoiceDate ?? inv.InvoiceDate ?? '',
      supplierId: Number(inv.supplierId ?? inv.SupplierId ?? 0),
      supplierName: inv.supplierName ?? inv.SupplierName ?? '',
      amount,
      advance,
      balance: net > 0 ? net : 0,
      fxRate: Number(inv.fxRate ?? inv.FxRate ?? 1) || 1,
      currencyId: Number(inv.currencyId ?? inv.CurrencyId ?? 0),
      status: inv.status ?? inv.Status
    };
  }

  onPaymentSupplierChange(): void {
    this.paymentForm.supplierInvoiceId = null;
    this.paymentForm.amount = null;
    this.paymentAmountBase = 0;
    this.paymentExchangeGainLoss = 0;
    if (!this.paymentForm.supplierId) { this.paymentFilteredInvoices = []; return; }
    this.paymentFilteredInvoices = this.paymentSupplierInvoices.filter(
      inv => inv.supplierId === Number(this.paymentForm.supplierId)
    );
  }

  onPaymentInvoiceSelect(): void {
    const inv = this.getSelectedPaymentInvoice();
    if (!inv) { this.paymentForm.amount = null; this.paymentAmountBase = 0; return; }
    this.paymentForm.amount = inv.balance;
    this.recalcPaymentBase();
    this.recalcPaymentExchangeGainLoss();
  }

  onPaymentCurrencyChange(): void {
    const cur = this.paymentCurrencies.find(c => (c.id ?? c.currencyId) === Number(this.paymentCurrencyId));
    this.paymentCurrencyName = cur?.currencyCode ?? cur?.currencyName ?? '';
    if (this.paymentCurrencyId && this.paymentBaseCurrencyId && this.paymentCurrencyId !== this.paymentBaseCurrencyId) {
      this.fetchPaymentFxRate();
    } else {
      this.paymentFxRate = 1;
      this.recalcPaymentBase();
      this.recalcPaymentExchangeGainLoss();
    }
  }

  private fetchPaymentFxRate(): void {
    if (!this.paymentCurrencyId || !this.paymentBaseCurrencyId || !this.paymentForm.paymentDate) return;
    this.finance.list(
      { list: '/ExchangeRate/GetRate' },
      { fromCurrencyId: this.paymentCurrencyId, toCurrencyId: this.paymentBaseCurrencyId, rateDate: this.paymentForm.paymentDate }
    ).subscribe({
      next: (res: any) => {
        this.paymentFxRate = Number(res?.data?.rate ?? res?.rate ?? 1) || 1;
        this.recalcPaymentBase();
        this.recalcPaymentExchangeGainLoss();
      },
      error: () => { this.paymentFxRate = 1; }
    });
  }

  onPaymentFxRateChange(): void {
    this.recalcPaymentBase();
    this.recalcPaymentExchangeGainLoss();
  }

  onPaymentAmountChange(): void {
    this.recalcPaymentBase();
    this.recalcPaymentExchangeGainLoss();
  }

  private recalcPaymentBase(): void {
    const amt = Number(this.paymentForm.amount) || 0;
    this.paymentAmountBase = parseFloat((amt * this.paymentFxRate).toFixed(2));
  }

  private recalcPaymentExchangeGainLoss(): void {
    const inv = this.getSelectedPaymentInvoice();
    if (!inv || !this.paymentCurrencyId || inv.currencyId !== this.paymentCurrencyId) {
      this.paymentExchangeGainLoss = 0; return;
    }
    const amt = Number(this.paymentForm.amount) || 0;
    this.paymentExchangeGainLoss = parseFloat((amt * (inv.fxRate || 1) - amt * this.paymentFxRate).toFixed(2));
  }

  getSelectedPaymentInvoice(): any {
    if (!this.paymentForm.supplierInvoiceId) return null;
    return this.paymentFilteredInvoices.find(inv => inv.id === Number(this.paymentForm.supplierInvoiceId)) ?? null;
  }

  savePayment(): void {
    if (!this.paymentForm.supplierId) { Swal.fire('Required', 'Please select a supplier.', 'warning'); return; }
    if (!this.paymentForm.supplierInvoiceId) { Swal.fire('Required', 'Please select a supplier invoice.', 'warning'); return; }
    if (!this.paymentForm.paymentDate) { Swal.fire('Required', 'Payment date is required.', 'warning'); return; }
    if (!(Number(this.paymentForm.amount) > 0)) { Swal.fire('Required', 'Amount must be greater than 0.', 'warning'); return; }

    this.savingPayment = true;
    this.error = '';

    const payload = {
      supplierId: Number(this.paymentForm.supplierId),
      supplierInvoiceId: Number(this.paymentForm.supplierInvoiceId),
      paymentDate: this.paymentForm.paymentDate,
      paymentMethodId: Number(this.paymentForm.paymentMethodId) || 2,
      bankId: this.paymentForm.paymentMethodId === 2 ? this.paymentForm.bankId : null,
      amount: Number(this.paymentForm.amount) || 0,
      amountBase: this.paymentAmountBase,
      fxRate: this.paymentFxRate,
      currencyId: this.paymentCurrencyId,
      exchangeGainLoss: this.paymentExchangeGainLoss,
      referenceNo: this.paymentForm.referenceNo || '',
      notes: this.paymentForm.notes || ''
    };

    this.finance.create({ create: '/SupplierPayment/Create' }, payload).subscribe({
      next: () => {
        this.savingPayment = false;
        this.showPaymentForm = false;
        this.paymentFilteredInvoices = [];
        this.message = 'Payment saved successfully.';
        this.paymentInvoicesLoaded = false;
        this.loadPayments();
      },
      error: err => {
        this.savingPayment = false;
        this.error = err?.error?.message || 'Unable to save payment.';
      }
    });
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

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

  // ── Tabs ───────────────────────────────────────────────────────────────────

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
    this.finance.list({ list: '/SupplierPayment/GetAll' }).subscribe({
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

  isExpanded(supplier: string): boolean { return this.expandedSuppliers.has(supplier); }

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
    if (!supplierId) { this.agingDetailRows = []; return; }
    this.finance.list({ list: `/ApAging/supplierInvoices/${supplierId}` }, this.agingDateRange()).subscribe({
      next: res => { this.agingDetailRows = this.finance.unwrap(res).map(detail => this.normalizeAgingDetail(detail)); },
      error: () => { this.agingDetailRows = []; }
    });
  }

  isAgingExpanded(supplier: string): boolean { return this.expandedSupplierAging.has(supplier); }

  runAging(): void { this.loadAging(); }

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

  openApAdvanceForm(): void {
    this.showAdvanceForm = true;
    this.message = '';
    this.error = '';
    this.apAdvMethodId = 2;
    this.apAdvBankHeadId = null;
    this.apAdvGrnNo = '';
    this.apAdvFxRate = 1;
    this.apAdvAmountBase = 0;
    this.apAdvCurrencyId = null;
    this.apAdvCurrencyName = '';
    this.advanceForm = {
      supplierId: null, supplierName: '',
      advanceDate: new Date().toISOString().slice(0, 10),
      amount: null, referenceNo: '', notes: ''
    };
  }

  closeApAdvanceForm(): void { this.showAdvanceForm = false; }

  onApAdvMethodChange(): void {
    if (this.apAdvMethodId === 1) this.apAdvBankHeadId = null;
  }

  onApAdvAmountChange(): void {
    this.apAdvAmountBase = parseFloat(((Number(this.advanceForm.amount) || 0) * (this.apAdvFxRate || 1)).toFixed(2));
  }

  saveAdvance(): void {
    if (!this.advanceForm.supplierId) { Swal.fire('Required', 'Please select a supplier.', 'warning'); return; }
    if (!this.advanceForm.advanceDate) { Swal.fire('Required', 'Advance date is required.', 'warning'); return; }
    if (!(Number(this.advanceForm.amount) > 0)) { Swal.fire('Required', 'Amount must be greater than 0.', 'warning'); return; }
    if ((this.apAdvMethodId === 2 || this.apAdvMethodId === 3) && !this.apAdvBankHeadId) {
      Swal.fire('Required', 'Please select a bank account.', 'warning'); return;
    }

    this.savingAdvance = true;
    this.error = '';

    const payload = {
      supplierId:  Number(this.advanceForm.supplierId),
      advanceDate: this.advanceForm.advanceDate,
      amount:      Number(this.advanceForm.amount) || 0,
      referenceNo: this.advanceForm.referenceNo || null,
      notes:       this.advanceForm.notes || null,
      methodId:    this.apAdvMethodId,
      bankHeadId:  (this.apAdvMethodId === 2 || this.apAdvMethodId === 3) ? this.apAdvBankHeadId : null,
      grnNo:       this.apAdvGrnNo || null,
      currencyId:  this.apAdvCurrencyId ?? null,
      fxRate:      this.apAdvFxRate || 1,
      amountBase:  this.apAdvAmountBase || Number(this.advanceForm.amount) || 0
    };

    this.finance.create(this.advanceConfig.endpoint, payload).subscribe({
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
    this.openPaymentForm();
    this.paymentForm.supplierId = row.supplierId ?? row.SupplierId;
    if (!this.paymentInvoicesLoaded) {
      this.loadAllSupplierInvoices();
    } else {
      this.onPaymentSupplierChange();
      if (row.id) {
        setTimeout(() => {
          this.paymentForm.supplierInvoiceId = row.id;
          this.onPaymentInvoiceSelect();
        }, 50);
      }
    }
    this.setTab('payments');
  }

  statusClass(status: string): string {
    const s = String(status || '').toLowerCase();
    if (s === 'paid')    return 'badge-success';
    if (s === 'partial') return 'badge-warning';
    return 'badge-danger';
  }

  paymentMethodLabel(id: number | string | null): string {
    const n = Number(id);
    if (n === 1) return 'Cash';
    if (n === 2) return 'Bank Transfer';
    if (n === 3) return 'Cheque';
    return String(id || '—');
  }

  private calculateInvoiceSummary(): void {
    this.invoiceSummary.totalInvoice = this.invoices.reduce((s, r) => s + (r.amount || 0), 0);
    this.invoiceSummary.paid = this.invoices.reduce((s, r) => s + (r.paid || 0), 0);
    this.invoiceSummary.debitNote = this.invoices.reduce((s, r) => s + (r.debitNote || 0), 0);
    this.invoiceSummary.advance = this.invoices.reduce((s, r) => s + (r.advance || 0), 0);
    this.invoiceSummary.outstanding = this.invoices.reduce((s, r) => s + (r.balance || 0), 0);
  }

  private normalizeInvoice(row: any): any {
    const amount = this.money(row, ['amount', 'Amount', 'invoiceAmount', 'InvoiceAmount', 'totalAmount', 'TotalAmount', 'grandTotal', 'GrandTotal', 'netAmount', 'NetAmount', 'amountBase', 'AmountBase', 'baseAmount', 'BaseAmount']);
    const paid = this.money(row, ['paid', 'Paid', 'paidAmount', 'PaidAmount', 'totalPaid', 'TotalPaid']);
    const debitNote = this.money(row, ['debitNote', 'DebitNote', 'debitNoteAmount', 'DebitNoteAmount']);
    const advance = this.money(row, ['advance', 'Advance', 'advanceAppliedAmount', 'AdvanceAppliedAmount', 'advanceApplied', 'AdvanceApplied']);
    const net = this.money(row, ['netPayableAmount', 'NetPayableAmount', 'balance', 'Balance', 'outstanding', 'Outstanding'], amount - paid - debitNote - advance);
    return {
      ...row,
      id: row.id ?? row.Id ?? row.invoiceId ?? row.pinId ?? row.supplierInvoiceId,
      supplierId: row.supplierId ?? row.SupplierId,
      supplierName: row.supplierName ?? row.SupplierName ?? 'Unknown Supplier',
      invoiceNo: row.invoiceNo ?? row.InvoiceNo ?? row.pinNo ?? row.referenceNo,
      invoiceDate: row.invoiceDate ?? row.InvoiceDate,
      dueDate: row.dueDate ?? row.DueDate,
      invoiceType: row.isOverseas || row.IsOverseas ? 'Overseas' : 'Local',
      amount,
      paid,
      debitNote,
      advance,
      balance: Math.max(net, 0),
      currencyName: row.currencyName ?? row.CurrencyName ?? row.currencyCode ?? 'SGD',
      status: net <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
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
      current: this.money(row, ['current', 'days30', 'bucket0_30', 'Bucket0_30']),
      days60: this.money(row, ['days60', 'bucket31_60', 'Bucket31_60']),
      days90: this.money(row, ['days90', 'bucket61_90', 'Bucket61_90']),
      days90plus: this.money(row, ['days90plus', 'bucket90Plus', 'Bucket90Plus'])
    };
  }

  private normalizeAgingDetail(row: any): any {
    return {
      ...row,
      invoiceNo: row.invoiceNo ?? row.InvoiceNo ?? row.pinNo,
      invoiceDate: row.invoiceDate ?? row.InvoiceDate,
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
      paymentNo: row.paymentNo ?? row.PaymentNo ?? row.referenceNo,
      supplierName: row.supplierName ?? row.SupplierName,
      invoiceNo: row.invoiceNo ?? row.InvoiceNo,
      paymentDate: row.paymentDate ?? row.PaymentDate,
      paymentMode: row.paymentMethodName ?? row.PaymentMethodName ?? this.paymentMethodLabel(row.paymentMethodId ?? row.PaymentMethodId),
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
      amount, utilised, balance,
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
      poAmount, invoiceAmount,
      matchStatus: row.matchStatus ?? row.MatchStatus ?? row.status ?? (Math.abs(poAmount - invoiceAmount) <= 0.01 && poAmount > 0 ? 'Matched' : 'Mismatch')
    };
  }

  private downloadCsv(fileName: string, rows: any[]): void {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const body = rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.click();
    URL.revokeObjectURL(url);
  }

  private dateOnly(date: Date): string { return date.toISOString().slice(0, 10); }
}
