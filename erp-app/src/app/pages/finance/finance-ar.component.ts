import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';
import { ActivatedRoute } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TaxNamePipe } from '../../shared/pipes/tax-name.pipe';

type ArTab = 'invoices' | 'receipts' | 'advances' | 'aging' | 'create-invoice';

interface AllocationRow {
  invoiceId: number;
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: number;
  fxRate: number;
  currencyId: number;
  currencyName: string;
  advance: number;
  paid: number;
  balance: number;
  selected: boolean;
  allocatedAmount: number;
}

@Component({
  selector: 'erp-finance-ar',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule, MoneyPipe, TaxNamePipe],
  templateUrl: './finance-ar.component.html',
  styleUrls: ['./finance-ar.component.scss']
})
export class FinanceArComponent implements OnInit {
  activeTab: ArTab = 'invoices';

  // Invoices
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  expandedCustomers: Set<string> = new Set();
  /** All 4 top KPI cards are always in the company base currency, regardless of each invoice's own currency. */
  invoiceSummary = { total: 0, paid: 0, creditNote: 0, outstanding: 0 };
  readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';

  // Receipts list
  receipts: any[] = [];
  filteredReceipts: any[] = [];
  showReceiptForm = false;
  savingReceipt = false;

  // Receipt create form
  receiptForm: any = { customerId: null, receiptDate: '', paymentMode: 'BANK', bankId: null, amountReceived: null };
  receiptInvoices: AllocationRow[] = [];
  bankAccounts: any[] = [];
  receiptCurrencies: any[] = [];
  receiptFxRate = 1;
  receiptCurrencyId: number | null = null;
  receiptCurrencyName = '';
  receiptBaseCurrencyId: number | null = null;
  receiptAmountBase = 0;
  receiptExchangeGainLoss = 0;
  loadingInvoices = false;

  // Advances
  advances: any[] = [];
  advanceSummary = { total: 0, utilised: 0, balance: 0 };
  showAdvanceForm = false;
  advanceForm: any = {
    customerId: null, customerName: '', salesOrderId: null,
    advanceDate: '', amount: null, bankAccountId: null,
    paymentMode: 'BANK', remarks: ''
  };
  savingAdvance = false;
  isOrderSpecific = false;
  orders: any[] = [];
  loadingOrders = false;
  openAdvancesForCustomer: any[] = [];
  advFxRate = 1;
  advCurrencyId: number | null = null;
  advCurrencyName = '';
  advBaseCurrencyId: number | null = null;
  advAmountBase = 0;
  advFxRateLoading = false;
  customers: any[] = [];
  readonly advancePaymentModeOptions = [
    { label: 'Bank Transfer', value: 'BANK' },
    { label: 'Cash', value: 'CASH' },
    { label: 'UPI', value: 'UPI' }
  ];
  readonly receiptPaymentModeOptions = [
    { label: 'Bank Transfer', value: 'BANK' },
    { label: 'Cash', value: 'CASH' },
    { label: 'Cheque', value: 'CHEQUE' },
    { label: 'UPI', value: 'UPI' }
  ];

  // Aging
  agingRows: any[] = [];
  agingSummary = { total: 0, days0_30: 0, days31_60: 0, days61plus: 0 };
  agingFromDate = '';
  agingToDate = '';

  // Create Invoice
  invoiceForm: { customerId: number | null; invoiceDate: string; remarks: string } = { customerId: null, invoiceDate: '', remarks: '' };
  invoiceLines: Array<{ itemName: string; uom: string; qty: number; unitPrice: number; discountPct: number; taxCodeId: number | null; gstPct: number; lineAmount: number; taxAmount: number; description: string }> = [];
  taxCodes: Array<{ id: number; taxCode: string; taxName: string; label: string; taxRate: number }> = [];
  savingInvoice = false;

  isPeriodLocked = false;
  periodName     = '';

  search = '';
  loading = false;
  error = '';
  message = '';
  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  private invoiceConfig = FINANCE_PAGES.find(p => p.key === 'ar-invoices')!;
  private receiptConfig  = FINANCE_PAGES.find(p => p.key === 'receipts')!;
  private advanceConfig  = FINANCE_PAGES.find(p => p.key === 'ar-advance')!;
  private agingConfig    = FINANCE_PAGES.find(p => p.key === 'ar-aging')!;

  constructor(private finance: FinanceService, private route: ActivatedRoute, private permissionService: PermissionService) {}

  ngOnInit(): void {
    this.advBaseCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    this.loadCustomers();
    this.loadTaxCodes();
    this.loadBankAccounts();
    this.loadReceiptCurrencies();
    this.invoiceForm.invoiceDate = new Date().toISOString().slice(0, 10);
    this.checkPeriodLock(new Date().toISOString().slice(0, 10));
    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('receipts') || path.includes('AR-receipt')) this.setTab('receipts');
    else if (path.includes('ar-advance')) this.setTab('advances');
    else if (path.includes('ar-aging') || path.includes('aging')) this.setTab('aging');
    else if (path.includes('AR-invoice-create')) this.setTab('create-invoice');
    else this.loadInvoices();
    this.permissionService.getFunctionPermission(this.userId, 'ar').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  // ── Period Close ───────────────────────────────────────────────────────────

  checkPeriodLock(date: string): void {
    if (!date) return;
    this.finance.list({ list: '/PeriodClose/status' }, { date }).subscribe({
      next: (res: any) => {
        this.isPeriodLocked = !!res?.isLocked;
        this.periodName     = res?.periodName || '';
      },
      error: () => { this.isPeriodLocked = false; this.periodName = ''; }
    });
  }

  onReceiptDateChange(): void {
    this.checkPeriodLock(this.receiptForm.receiptDate);
    if (this.receiptCurrencyId && this.receiptBaseCurrencyId && this.receiptCurrencyId !== this.receiptBaseCurrencyId) {
      this.fetchReceiptFxRate();
    }
  }

  onAdvanceDateChange(): void {
    this.checkPeriodLock(this.advanceForm.advanceDate);
  }

  onInvoiceDateChange(): void {
    this.checkPeriodLock(this.invoiceForm.invoiceDate);
  }

  // ── Bank Accounts ──────────────────────────────────────────────────────────

  private loadBankAccounts(): void {
    this.finance.list({ list: '/BankAccounts' }).subscribe({
      next: res => {
        this.bankAccounts = this.finance.unwrap(res).map((b: any) => {
          const name = b.headName ?? b.HeadName ?? b.bankName ?? b.BankName ?? b.name ?? b.accountName ?? '—';
          return {
            ...b,
            id: b.id ?? b.bankId ?? b.BankId ?? b.Id,
            displayName: name + (b.accountNo ? ` (${b.accountNo})` : '')
          };
        });
      },
      error: () => { this.bankAccounts = []; }
    });
  }

  // ── Currencies ─────────────────────────────────────────────────────────────

  private loadReceiptCurrencies(): void {
    this.finance.list({ list: '/Currency/GetCurrencies' }).subscribe({
      next: res => {
        this.receiptCurrencies = this.finance.unwrap(res).map((c: any) => ({
          ...c,
          id: c.id ?? c.currencyId,
          currencyCode: c.currencyCode ?? c.currencyName ?? ''
        }));
        if (this.receiptCurrencies.length && !this.receiptCurrencyId) {
          const base = this.receiptCurrencies.find(c => c.isBase) ?? this.receiptCurrencies[0];
          this.receiptCurrencyId = base.id ?? base.currencyId;
          this.receiptCurrencyName = base.currencyCode ?? base.currencyName ?? '';
          this.receiptBaseCurrencyId = this.receiptCurrencyId;
        }
      },
      error: () => { this.receiptCurrencies = []; }
    });
  }

  // ── Receipt Form ───────────────────────────────────────────────────────────

  openReceiptForm(): void {
    this.showReceiptForm = true;
    this.message = '';
    this.error = '';
    this.receiptForm = {
      customerId: null,
      receiptDate: new Date().toISOString().slice(0, 10),
      paymentMode: 'BANK',
      bankId: null,
      amountReceived: null
    };
    this.receiptInvoices = [];
    this.receiptFxRate = 1;
    this.receiptAmountBase = 0;
    this.receiptExchangeGainLoss = 0;
    const base = this.receiptCurrencies.find(c => c.isBase) ?? this.receiptCurrencies[0];
    if (base) {
      this.receiptCurrencyId = base.id ?? base.currencyId;
      this.receiptCurrencyName = base.currencyCode ?? base.currencyName ?? '';
    }
  }

  closeReceiptForm(): void {
    this.showReceiptForm = false;
    this.receiptInvoices = [];
  }

  onReceiptCustomerChange(): void {
    this.receiptInvoices = [];
    if (this.receiptForm.customerId) {
      this.loadOpenInvoicesForReceipt(Number(this.receiptForm.customerId));
    }
  }

  private loadOpenInvoicesForReceipt(customerId: number): void {
    this.loadingInvoices = true;
    this.finance.list({ list: `/ArReceipt/open-invoices/${customerId}` }).subscribe({
      next: res => {
        this.receiptInvoices = this.finance.unwrap(res).map((inv: any) => ({
          invoiceId: inv.id ?? inv.Id ?? inv.invoiceId ?? inv.InvoiceId,
          invoiceNo: inv.invoiceNo ?? inv.InvoiceNo ?? '',
          invoiceDate: inv.invoiceDate ?? inv.InvoiceDate ?? '',
          invoiceAmount: Number(inv.amount ?? inv.Amount ?? 0),
          fxRate: Number(inv.fxRate ?? inv.FxRate ?? 1) || 1,
          currencyId: Number(inv.currencyId ?? inv.CurrencyId ?? 0),
          currencyName: inv.currencyName ?? inv.CurrencyName ?? '',
          advance: Number(inv.advanceAmount ?? inv.AdvanceAmount ?? 0),
          paid: Number(inv.paidAmount ?? inv.PaidAmount ?? 0),
          balance: Number(inv.balance ?? inv.Balance ?? 0),
          selected: true,
          allocatedAmount: 0
        }));
        // Pre-select all open invoices, allocate their balance and set amount received
        this.autoAllocateFromSelection();
        this.loadingInvoices = false;
      },
      error: () => { this.receiptInvoices = []; this.loadingInvoices = false; }
    });
  }

  /** Allocate each selected invoice's balance and set Amount Received to the total. */
  private autoAllocateFromSelection(): void {
    let total = 0;
    for (const row of this.receiptInvoices) {
      if (row.selected) {
        const bal = this.receiptRowBalance(row);
        row.allocatedAmount = bal;
        total += bal;
      } else {
        row.allocatedAmount = 0;
      }
    }
    this.receiptForm.amountReceived = parseFloat(total.toFixed(2));
    this.recalcReceiptBase();
    this.recalcExchangeGainLoss();
  }

  onReceiptCurrencyChange(): void {
    const cur = this.receiptCurrencies.find(c => (c.id ?? c.currencyId) === Number(this.receiptCurrencyId));
    this.receiptCurrencyName = cur?.currencyCode ?? cur?.currencyName ?? '';
    if (this.receiptCurrencyId && this.receiptBaseCurrencyId && this.receiptCurrencyId !== this.receiptBaseCurrencyId) {
      this.fetchReceiptFxRate();
    } else {
      this.receiptFxRate = 1;
      this.recalcReceiptBase();
      this.recalcReceiptAllocations();
    }
  }

  private fetchReceiptFxRate(): void {
    if (!this.receiptCurrencyId || !this.receiptBaseCurrencyId || !this.receiptForm.receiptDate) return;
    this.finance.list(
      { list: '/ExchangeRate/GetRate' },
      { fromCurrencyId: this.receiptCurrencyId, toCurrencyId: this.receiptBaseCurrencyId, rateDate: this.receiptForm.receiptDate }
    ).subscribe({
      next: (res: any) => {
        this.receiptFxRate = Number(res?.data?.rate ?? res?.rate ?? 1) || 1;
        this.recalcReceiptBase();
        this.recalcReceiptAllocations();
      },
      error: () => { this.receiptFxRate = 1; }
    });
  }

  onReceiptFxRateChange(): void {
    this.recalcReceiptBase();
    this.recalcReceiptAllocations();
  }

  onReceiptAmountChange(): void {
    this.recalcReceiptBase();
    this.recalcReceiptAllocations();
  }

  private recalcReceiptBase(): void {
    const amt = Number(this.receiptForm.amountReceived) || 0;
    this.receiptAmountBase = parseFloat((amt * this.receiptFxRate).toFixed(2));
  }

  private recalcReceiptAllocations(): void {
    let remaining = Number(this.receiptForm.amountReceived) || 0;
    for (const row of this.receiptInvoices) {
      if (!row.selected) { row.allocatedAmount = 0; continue; }
      // balance is in invoice currency; convert to receipt currency via respective FX rates to base
      const balanceInReceiptCcy = this.receiptFxRate > 0
        ? (row.balance * (row.fxRate || 1)) / this.receiptFxRate
        : row.balance;
      const alloc = parseFloat(Math.min(balanceInReceiptCcy, remaining).toFixed(2));
      row.allocatedAmount = alloc;
      remaining = parseFloat((remaining - alloc).toFixed(2));
      if (remaining <= 0) remaining = 0;
    }
    this.recalcExchangeGainLoss();
  }

  private recalcExchangeGainLoss(): void {
    let gainLoss = 0;
    for (const row of this.receiptInvoices) {
      if (!row.selected || row.allocatedAmount <= 0) continue;
      if (row.currencyId === this.receiptCurrencyId) {
        gainLoss += row.allocatedAmount * this.receiptFxRate - row.allocatedAmount * (row.fxRate || 1);
      }
    }
    this.receiptExchangeGainLoss = parseFloat(gainLoss.toFixed(2));
  }

  onReceiptRowCheckbox(row: AllocationRow): void {
    this.autoAllocateFromSelection();
  }

  onReceiptHeaderCheckbox(checked: boolean): void {
    this.receiptInvoices.forEach(r => r.selected = checked);
    this.autoAllocateFromSelection();
  }

  onReceiptAllocateChange(row: AllocationRow): void {
    this.recalcExchangeGainLoss();
  }

  receiptRowBalance(row: AllocationRow): number {
    return this.receiptFxRate > 0
      ? parseFloat(((row.balance * (row.fxRate || 1)) / this.receiptFxRate).toFixed(2))
      : row.balance;
  }

  get receiptTotalAllocated(): number {
    return parseFloat(this.receiptInvoices.filter(r => r.selected).reduce((s, r) => s + (r.allocatedAmount || 0), 0).toFixed(2));
  }

  get receiptUnallocated(): number {
    return parseFloat(Math.max(0, (Number(this.receiptForm.amountReceived) || 0) - this.receiptTotalAllocated).toFixed(2));
  }

  get receiptAllChecked(): boolean {
    return this.receiptInvoices.length > 0 && this.receiptInvoices.every(r => r.selected);
  }

  saveReceipt(): void {
    if (this.isPeriodLocked) { Swal.fire('Period Locked', this.periodName ? `Period "${this.periodName}" is locked.` : 'This period is locked.', 'warning'); return; }
    if (!this.receiptForm.customerId) { Swal.fire('Required', 'Please select a customer.', 'warning'); return; }
    if (!this.receiptForm.receiptDate) { Swal.fire('Required', 'Receipt date is required.', 'warning'); return; }
    if (!(Number(this.receiptForm.amountReceived) > 0)) { Swal.fire('Required', 'Amount received must be greater than 0.', 'warning'); return; }

    this.savingReceipt = true;
    this.error = '';

    const payload = {
      customerId: this.receiptForm.customerId,
      receiptDate: this.receiptForm.receiptDate,
      paymentMode: this.receiptForm.paymentMode,
      bankId: this.receiptForm.paymentMode === 'BANK' ? this.receiptForm.bankId : null,
      amountReceived: Number(this.receiptForm.amountReceived) || 0,
      totalAllocated: this.receiptTotalAllocated,
      fxRate: this.receiptFxRate,
      amountBase: this.receiptAmountBase,
      currencyId: this.receiptCurrencyId,
      currencyName: this.receiptCurrencyName,
      exchangeGainLoss: this.receiptExchangeGainLoss,
      allocations: this.receiptInvoices
        .filter(r => r.selected && r.allocatedAmount > 0)
        .map(r => ({ invoiceId: r.invoiceId, invoiceNo: r.invoiceNo, allocatedAmount: r.allocatedAmount }))
    };

    this.finance.create(this.receiptConfig.endpoint, payload).subscribe({
      next: () => {
        this.savingReceipt = false;
        this.showReceiptForm = false;
        this.receiptInvoices = [];
        this.message = 'Receipt saved successfully.';
        this.loadReceipts();
      },
      error: err => {
        this.savingReceipt = false;
        this.error = err?.error?.message || 'Unable to save receipt.';
      }
    });
  }

  // ── Tax Codes ──────────────────────────────────────────────────────────────

  private loadTaxCodes(): void {
    this.finance.list({ list: '/TaxCode/getAll' }).subscribe({
      next: res => {
        this.taxCodes = this.finance.unwrap(res).map((t: any) => {
          const taxCode = t.taxCode ?? t.TaxCode;
          const taxName = t.taxName ?? t.TaxName;
          return {
            id: t.id ?? t.iD ?? t.taxCodeId,
            taxCode, taxName,
            label: `${taxCode ?? ''} – ${taxName ?? ''}`,
            taxRate: Number(t.taxRate ?? t.TaxRate ?? 0)
          };
        });
      },
      error: () => { this.taxCodes = []; }
    });
  }

  resetInvoiceForm(): void {
    this.invoiceForm = { customerId: null, invoiceDate: new Date().toISOString().slice(0, 10), remarks: '' };
    this.invoiceLines = [];
    this.addInvoiceLine();
  }

  addInvoiceLine(): void {
    this.invoiceLines.push({ itemName: '', uom: 'PCS', qty: 1, unitPrice: 0, discountPct: 0, taxCodeId: null, gstPct: 0, lineAmount: 0, taxAmount: 0, description: '' });
  }

  removeInvoiceLine(i: number): void {
    if (this.invoiceLines.length > 1) this.invoiceLines.splice(i, 1);
  }

  onTaxCodeChange(line: any): void {
    const tc = this.taxCodes.find(t => t.id === Number(line.taxCodeId));
    line.gstPct = tc ? tc.taxRate : 0;
    this.calcLine(line);
  }

  calcLine(line: any): void {
    const qty = Number(line.qty) || 0;
    const price = Number(line.unitPrice) || 0;
    const disc = Number(line.discountPct) || 0;
    const gst = Number(line.gstPct) || 0;
    line.lineAmount = parseFloat((qty * price * (1 - disc / 100)).toFixed(2));
    line.taxAmount  = parseFloat((line.lineAmount * gst / 100).toFixed(2));
  }

  get invoiceSubtotal(): number { return this.invoiceLines.reduce((s, l) => s + (l.lineAmount || 0), 0); }
  get invoiceTaxTotal(): number { return this.invoiceLines.reduce((s, l) => s + (l.taxAmount  || 0), 0); }
  get invoiceGrandTotal(): number { return this.invoiceSubtotal + this.invoiceTaxTotal; }

  saveInvoice(): void {
    if (this.isPeriodLocked) { Swal.fire('Period Locked', this.periodName ? `Period "${this.periodName}" is locked.` : 'This period is locked.', 'warning'); return; }
    if (!this.invoiceForm.customerId) { Swal.fire('Required', 'Please select a customer.', 'warning'); return; }
    if (!this.invoiceForm.invoiceDate) { Swal.fire('Required', 'Invoice date is required.', 'warning'); return; }
    if (this.invoiceLines.every(l => !l.itemName.trim())) { Swal.fire('Required', 'Add at least one line item.', 'warning'); return; }

    this.savingInvoice = true;
    this.error = '';
    const payload = {
      customerId: this.invoiceForm.customerId,
      sourceType: 0,
      invoiceDate: this.invoiceForm.invoiceDate,
      remarks: this.invoiceForm.remarks,
      subtotal: this.invoiceSubtotal,
      taxAmount: this.invoiceTaxTotal,
      total: this.invoiceGrandTotal,
      shippingCost: 0,
      lines: this.invoiceLines
        .filter(l => l.itemName.trim())
        .map(l => ({
          itemName: l.itemName,
          uom: l.uom,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
          gstPct: l.gstPct,
          taxAmount: l.taxAmount,
          lineAmount: l.lineAmount,
          taxCodeId: l.taxCodeId,
          description: l.description
        }))
    };

    this.finance.create({ create: '/SalesInvoice/Create' }, payload).subscribe({
      next: () => {
        this.savingInvoice = false;
        this.message = 'Invoice created successfully.';
        this.resetInvoiceForm();
        this.setTab('invoices');
      },
      error: err => {
        this.savingInvoice = false;
        this.error = err?.error?.message || 'Unable to create invoice.';
      }
    });
  }

  // ── Customers ──────────────────────────────────────────────────────────────

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
    // unused after advance form refactor — keep for compatibility
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
setTab(tab: ArTab): void {
    if (tab === 'create-invoice' && this.isPeriodLocked) return;
    this.activeTab = tab;
    this.error = '';
    this.message = '';
    if (tab === 'invoices')        this.loadInvoices();
    else if (tab === 'receipts')   this.loadReceipts();
    else if (tab === 'advances')   this.loadAdvances();
    else if (tab === 'aging')      this.loadAging();
    else if (tab === 'create-invoice') this.resetInvoiceForm();
  }

  private loadInvoices(): void {
    this.loading = true;
    this.finance.list(this.invoiceConfig.endpoint).subscribe({
      next: res => {
        this.invoices = this.finance.unwrap(res).map((r: any) => this.normalizeInvoice(r)).filter((r: any) => r !== null);
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
      ? this.invoices.filter(r => ['customerName', 'invoiceNo'].some(k => String(r[k] ?? '').toLowerCase().includes(q)))
      : [...this.invoices];
  }

  get customerGroups(): { customer: string; invoices: any[]; total: number; paid: number; creditNote: number; advance: number; outstanding: number; baseAmount: number }[] {
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
      advance: invs.reduce((s, i) => s + (i.advance || 0), 0),
      outstanding: invs.reduce((s, i) => s + (i.balance || 0), 0),
      baseAmount: invs.reduce((s, i) => s + (i.baseAmount || 0), 0)
    }));
  }

  toggleCustomer(c: string): void {
    this.expandedCustomers.has(c) ? this.expandedCustomers.delete(c) : this.expandedCustomers.add(c);
  }
  isExpanded(c: string): boolean { return this.expandedCustomers.has(c); }

  // ── Advance Form ───────────────────────────────────────────────────────────

 openAdvanceForm(): void {
    if (this.isPeriodLocked) return;
    this.showAdvanceForm = true;
    this.message = '';
    this.error = '';
    this.isOrderSpecific = false;
    this.orders = [];
    this.openAdvancesForCustomer = [];
    this.advFxRate = 1;
    this.advCurrencyId = null;
    this.advCurrencyName = '';
    this.advAmountBase = 0;
    this.advanceForm = {
      customerId: null, customerName: '', salesOrderId: null,
      advanceDate: new Date().toISOString().slice(0, 10),
      amount: null, bankAccountId: null, paymentMode: 'BANK', remarks: ''
    };
  }

  closeAdvanceForm(): void { this.showAdvanceForm = false; }

  onAdvanceCustomerChange(): void {
    this.advanceForm.salesOrderId = null;
    this.orders = [];
    this.openAdvancesForCustomer = [];
    this.advFxRate = 1;
    this.advCurrencyId = null;
    this.advCurrencyName = '';
    this.advAmountBase = 0;
    const cust = this.customers.find(c => Number(c.id) === Number(this.advanceForm.customerId));
    this.advanceForm.customerName = cust?.name ?? '';
    if (!this.advanceForm.customerId) return;
    if (this.isOrderSpecific) this.loadOrdersForCustomer();
    this.loadOpenAdvancesForCustomer();
  }

  onToggleOrderSpecific(): void {
    this.advanceForm.salesOrderId = null;
    this.orders = [];
    this.advFxRate = 1;
    this.advCurrencyId = null;
    this.advCurrencyName = '';
    this.advAmountBase = 0;
    if (this.isOrderSpecific && this.advanceForm.customerId) {
      this.loadOrdersForCustomer();
    }
  }

  loadOrdersForCustomer(): void {
    if (!this.advanceForm.customerId) return;
    this.loadingOrders = true;
    this.finance.list({ list: `/SalesOrder/customer-open/${this.advanceForm.customerId}` }).subscribe({
      next: res => {
        this.orders = this.finance.unwrap(res).map((o: any) => ({ ...o, soLabel: this.soLabel(o) }));
        this.loadingOrders = false;
      },
      error: () => { this.orders = []; this.loadingOrders = false; }
    });
  }

  soLabel(o: any): string {
    return o?.salesOrderNo ?? o?.soNo ?? o?.orderNo ?? (o ? ('SO-' + o.id) : '');
  }

  onAdvanceSalesOrderChange(): void {
    this.loadOpenAdvancesForCustomer();
    if (!this.advanceForm.salesOrderId) {
      this.advFxRate = 1; this.advCurrencyId = null; this.advCurrencyName = ''; this.advAmountBase = 0; return;
    }
    const so = this.orders.find(o => o.id === Number(this.advanceForm.salesOrderId));
    if (so) {
      this.advCurrencyId   = Number(so.currencyId   ?? so.CurrencyId   ?? 0) || null;
      this.advCurrencyName = so.currencyName         ?? so.CurrencyName  ?? '';
      this.advFxRate       = Number(so.fxRate        ?? so.FxRate        ?? 1) || 1;
      if (this.advCurrencyId && this.advCurrencyId !== this.advBaseCurrencyId) {
        if (this.advFxRate === 1) this.fetchAdvanceFxRate(this.advCurrencyId);
        else this.calcAdvanceAmountBase();
      }
    }
  }

  fetchAdvanceFxRate(fromCurrencyId: number): void {
    if (!fromCurrencyId || !this.advBaseCurrencyId) return;
    this.advFxRateLoading = true;
    const today = new Date().toISOString().slice(0, 10);
    this.finance.list(
      { list: '/ExchangeRate/GetRate' },
      { fromCurrencyId, toCurrencyId: this.advBaseCurrencyId, rateDate: today }
    ).subscribe({
      next: (res: any) => {
        this.advFxRate = Number(res?.data?.rate ?? res?.rate ?? 1) || 1;
        this.advFxRateLoading = false;
        this.calcAdvanceAmountBase();
      },
      error: () => { this.advFxRate = 1; this.advFxRateLoading = false; }
    });
  }

  calcAdvanceAmountBase(): void {
    this.advAmountBase = parseFloat(((Number(this.advanceForm.amount) || 0) * this.advFxRate).toFixed(2));
  }

  advIsForeignCurrency(): boolean {
    return !!(this.advCurrencyId && this.advBaseCurrencyId && this.advCurrencyId !== this.advBaseCurrencyId && this.advCurrencyName);
  }

  loadOpenAdvancesForCustomer(): void {
    if (!this.advanceForm.customerId) { this.openAdvancesForCustomer = []; return; }
    const params: any = { customerId: this.advanceForm.customerId };
    if (this.isOrderSpecific && this.advanceForm.salesOrderId) params.salesOrderId = this.advanceForm.salesOrderId;
    this.finance.list({ list: '/ArInvoice/advance/open' }, params).subscribe({
      next: res => { this.openAdvancesForCustomer = this.finance.unwrap(res); },
      error: () => { this.openAdvancesForCustomer = []; }
    });
  }

  onAdvancePaymentModeChange(): void {
    if (this.advanceForm.paymentMode !== 'BANK') this.advanceForm.bankAccountId = null;
  }

  saveAdvance(): void {
    if (this.isPeriodLocked) { Swal.fire('Period Locked', this.periodName ? `Period "${this.periodName}" is locked.` : 'This period is locked.', 'warning'); return; }
    if (!this.advanceForm.customerId) { Swal.fire('Required', 'Please select a customer.', 'warning'); return; }
    if (!(Number(this.advanceForm.amount) > 0)) { Swal.fire('Required', 'Amount must be greater than 0.', 'warning'); return; }
    if (!this.advanceForm.advanceDate) { Swal.fire('Required', 'Advance date is required.', 'warning'); return; }
    if (!this.isOrderSpecific) { Swal.fire('Required', 'Please tick "Link to Sales Order" and select an order.', 'warning'); return; }
    if (this.isOrderSpecific && !this.advanceForm.salesOrderId) { Swal.fire('Required', 'Please select a Sales Order.', 'warning'); return; }
    if (this.advanceForm.paymentMode === 'BANK' && !this.advanceForm.bankAccountId) { Swal.fire('Required', 'Please select a bank account.', 'warning'); return; }

    this.savingAdvance = true;
    this.error = '';
    const payload = {
      customerId:    Number(this.advanceForm.customerId),
      salesOrderId:  this.isOrderSpecific ? Number(this.advanceForm.salesOrderId) : null,
      advanceDate:   this.advanceForm.advanceDate,
      amount:        Number(this.advanceForm.amount) || 0,
      bankAccountId: this.advanceForm.bankAccountId ?? null,
      paymentMode:   this.advanceForm.paymentMode || 'BANK',
      remarks:       this.advanceForm.remarks || '',
      fxRate:        this.advFxRate || 1,
      amountBase:    this.advAmountBase || Number(this.advanceForm.amount) || 0,
      currencyId:    this.advCurrencyId ?? null,
      currencyName:  this.advCurrencyName || ''
    };

    this.finance.create(this.advanceConfig.endpoint, payload).subscribe({
      next: () => {
        this.savingAdvance = false;
        this.showAdvanceForm = false;
        this.message = 'Advance saved successfully.';
        this.loadAdvances();
      },
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
    this.invoiceSummary.total = this.invoices.reduce((s, r) => s + (r.baseAmount || 0), 0);
    this.invoiceSummary.paid  = this.invoices.reduce((s, r) => s + (r.paidBase || 0), 0);
    this.invoiceSummary.creditNote = this.invoices.reduce((s, r) => s + (r.creditNoteBase || 0), 0);
    this.invoiceSummary.outstanding = this.invoices.reduce((s, r) => s + (r.balanceBase || 0), 0);
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
    // Skip credit note rows — API may return rowType:'CN' mixed with invoices
    if (row.rowType && row.rowType !== 'INV') return null;
    const amount = this.money(row, ['amount', 'Amount', 'invoiceAmount', 'InvoiceAmount', 'totalAmount', 'TotalAmount', 'grandTotal', 'GrandTotal']);
    const paid = this.money(row, ['paid', 'Paid', 'paidAmount', 'PaidAmount', 'totalPaid', 'TotalPaid']);
    const creditNote = this.money(row, ['creditNote', 'CreditNote', 'customerCreditNoteAmount', 'creditNoteAmount', 'CreditNoteAmount']);
    const advance = this.money(row, ['advance', 'Advance', 'advanceAmount', 'AdvanceAmount']);
    // outstanding is the canonical field name from the API; balance is fallback
    const balance = this.money(row, ['outstanding', 'Outstanding', 'balance', 'Balance', 'balanceAmount', 'BalanceAmount'], amount - paid - creditNote - advance);
    const fxRate = Number(row.fxRate ?? row.FxRate ?? 1) || 1;
    const storedBase = this.money(row, ['baseAmount', 'BaseAmount', 'amountBase', 'AmountBase']);
    const baseAmount = storedBase > 0 ? storedBase : +(amount * fxRate).toFixed(2);
    const balanceOut = Math.max(balance, 0);
    return {
      ...row,
      customerName: row.customerName ?? row.CustomerName ?? row.customer ?? 'Unknown Customer',
      invoiceNo: row.invoiceNo ?? row.InvoiceNo ?? row.salesInvoiceNo ?? row.SalesInvoiceNo,
      invoiceDate: row.invoiceDate ?? row.InvoiceDate,
      dueDate: row.dueDate ?? row.DueDate,
      currencyName: row.currencyName ?? row.CurrencyName ?? row.currencyCode ?? 'SGD',
      amount,
      paid,
      creditNote,
      advance,
      balance: balanceOut,
      fxRate,
      baseAmount,
      // Base-currency equivalents for the top KPI cards — paid/credit-note amounts are recorded in the
      // same currency as the invoice, so the invoice's own fxRate converts them to base currency.
      paidBase: +(paid * fxRate).toFixed(2),
      creditNoteBase: +(creditNote * fxRate).toFixed(2),
      balanceBase: +(balanceOut * fxRate).toFixed(2)
    };
  }

  private normalizeReceipt(row: any): any {
    // amountReceived is the canonical field; fall back to amount then amountBase
    const amountReceived = this.money(row, ['amountReceived', 'AmountReceived', 'amount', 'Amount']);
    const amountBase     = this.money(row, ['amountBase', 'AmountBase'], amountReceived);
    return {
      ...row,
      receiptNo:    row.receiptNo    ?? row.ReceiptNo,
      invoiceNos:   row.invoiceNos   ?? row.InvoiceNos   ?? row.invoiceNo ?? row.InvoiceNo ?? '',
      customerName: row.customerName ?? row.CustomerName,
      receiptDate:  row.receiptDate  ?? row.ReceiptDate,
      paymentMode:  row.paymentMode  ?? row.PaymentMode,
      currencyName: row.currencyName ?? row.CurrencyName ?? '',
      amountReceived,
      amountBase,
      status: row.status ?? row.Status ?? 'Posted'
    };
  }

  private normalizeAdvance(row: any): any {
    const amount = this.money(row, ['amount', 'Amount', 'originalAmount', 'OriginalAmount']);
    const balance = this.money(row, ['balance', 'Balance', 'balanceAmount', 'BalanceAmount']);
    return {
      ...row,
      advanceNo:    row.advanceNo    ?? row.AdvanceNo,
      customerName: row.customerName ?? row.CustomerName,
      advanceDate:  row.advanceDate  ?? row.AdvanceDate,
      paymentMode:  row.paymentMode  ?? row.PaymentMode,
      orderNo:      row.orderNo      ?? row.OrderNo ?? row.salesOrderNo ?? row.SalesOrderNo,
      amountBase:   this.money(row, ['amountBase', 'AmountBase'], amount),
      currencyName: row.currencyName ?? row.CurrencyName,
      amount,
      utilised: this.money(row, ['utilised', 'Utilised', 'utilisedAmount', 'UtilisedAmount'], amount - balance),
      balance
    };
  }

  private normalizeAging(row: any): any {
    // Use *Base (SGD-converted) fields first, fall back to raw FC values
    return {
      ...row,
      customerName: row.customerName ?? row.CustomerName,
      total:     this.money(row, ['totalOutstandingBase', 'TotalOutstandingBase', 'totalOutstanding', 'TotalOutstanding', 'total']),
      current:   this.money(row, ['bucket0_30Base',  'Bucket0_30Base',  'bucket0_30',  'current', 'days30']),
      days60:    this.money(row, ['bucket31_60Base', 'Bucket31_60Base', 'bucket31_60', 'days60']),
      days90:    this.money(row, ['bucket61_90Base', 'Bucket61_90Base', 'bucket61_90', 'days90']),
      days90plus: this.money(row, ['bucket90PlusBase', 'Bucket90PlusBase', 'bucket90Plus', 'days90plus'])
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
