


import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { concat } from 'rxjs';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';
import { ActivatedRoute } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

type ApTab = 'invoices' | 'payments' | 'aging' | 'advances' | 'match';
type ApView = 'list' | 'payment-form' | 'advance-form';

@Component({
  selector: 'erp-finance-ap',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule, MoneyPipe],
  templateUrl: './finance-ap.component.html',
  styleUrls: ['./finance-ap.component.scss']
})
export class FinanceApComponent implements OnInit {
  activeTab: ApTab = 'invoices';
  view: ApView = 'list';

  // Combobox open/search state
  pmtSupplierOpen = false;  pmtSupplierSearch = '';
  pmtInvoiceOpen  = false;  pmtInvoiceSearch  = '';
  pmtBankOpen     = false;  pmtBankSearch     = '';
  pmtCurrOpen     = false;  pmtCurrSearch     = '';
  advSupplierOpen = false;  advSupplierSearch = '';
  advBankOpen     = false;  advBankSearch     = '';

  // Supplier Invoices
  invoices: any[] = [];
  filteredInvoices: any[] = [];
  expandedSuppliers: Record<string, boolean> = {};
  /** All 4 top KPI cards are always in the company base currency, regardless of each invoice's own currency. */
  invoiceSummary = { totalInvoice: 0, paid: 0, debitNote: 0, advance: 0, outstanding: 0 };
  readonly baseCurrencyName = (localStorage.getItem('companyCurrencyName') || '').trim();

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
  pmtSupplierName = '';
  paymentSupplierInvoices: any[] = [];  // all posted supplier invoices
  paymentFilteredInvoices: any[] = [];  // filtered by selected supplier
  supplierInvoicesAll: any[] = [];      // open invoices for selected supplier (payment form)
  payInvSelectAll = false;
  amountEditedManually = false;
  supTotalInvoice = 0; supTotalPaid = 0; supTotalDebitNote = 0; supTotalAdvance = 0; supTotalPayable = 0;
  invoiceCurrencyName = '';
  bankAccounts: any[] = [];
  paymentCurrencies: any[] = [];
  paymentFxRate = 1;
  paymentCurrencyId: number | null = null;
  paymentCurrencyName = '';
  paymentBankName = '';
  paymentBaseCurrencyId: number | null = null;
  paymentAmountBase = 0;
  paymentExchangeGainLoss = 0;
  loadingPaymentInvoices = false;
  paymentInvoicesLoaded = false;

  // AP Aging
  agingRows: any[] = [];
  agingDetailRows: any[] = [];
  agingDetailLoading = false;
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
  readonly paymentMethodOptions = [
    { label: 'Cash', value: 1 },
    { label: 'Bank Transfer', value: 2 },
    { label: 'Cheque', value: 3 }
  ];
  apAdvMethodId = 2;
  apAdvBankId:     number | null = null;
  apAdvBankHeadId: number | null = null;
  apAdvBankName = '';
  apAdvGrnNo = '';
  apAdvGrnTotal = 0;
  apAdvFxRate = 1;
  apAdvAmountBase = 0;
  apAdvCurrencyId: number | null = null;
  apAdvCurrencyName = '';
  advCurrOpen = false;
  advCurrSearch  = '';
  suppliers: any[] = [];

  // GRN combobox
  grns: any[] = [];
  advGrnOpen = false;
  advGrnSearch = '';

  // 3-Way Match
  matchRows: any[] = [];

  isPeriodLocked = false;
  periodName     = '';

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
    this.loadGrns();
    this.checkPeriodLock(new Date().toISOString().slice(0, 10));
    const path = this.route.snapshot.routeConfig?.path || '';
    if (path.includes('ap-aging')) this.setTab('aging');
    else if (path.includes('ap-advance')) this.setTab('advances');
    else this.loadInvoices();
    this.permissionService.getFunctionPermission(this.userId, 'ap').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  // ── Period Close ───────────────────────────────────────────────────────────

  checkPeriodLock(date: string): void {
    if (!date) return;
    this.finance.list({ list: '/PeriodClose/status' }, { date }).subscribe({
      next: (res: any) => {
        const wasLocked = this.isPeriodLocked;
        this.isPeriodLocked = !!res?.isLocked;
        this.periodName     = res?.periodName || '';
        if (this.isPeriodLocked && !wasLocked) {
          Swal.fire({
            icon: 'warning',
            title: 'Period Locked',
            text: `Period "${this.periodName || date}" is locked. New entries cannot be posted.`,
            confirmButtonColor: '#2e5f73',
            timer: 4000,
            timerProgressBar: true
          });
        }
      },
      error: () => { this.isPeriodLocked = false; this.periodName = ''; }
    });
  }

  onPaymentDateChange(): void {
    this.checkPeriodLock(this.paymentForm.paymentDate);
    if (this.paymentCurrencyId && this.paymentBaseCurrencyId && this.paymentCurrencyId !== this.paymentBaseCurrencyId) {
      this.fetchPaymentFxRate();
    }
  }

  onApAdvanceDateChange(): void {
    this.checkPeriodLock(this.advanceForm.advanceDate);
  }

  // ── Bank Accounts + Currencies ──────────────────────────────────────────────

  private loadBankAccounts(): void {
    this.finance.list({ list: '/finance/ap/bankaccount' }).subscribe({
      next: res => {
        this.bankAccounts = this.finance.unwrap(res).map((b: any) => ({
          ...b,
          id: b.bankId ?? b.BankId ?? b.id ?? b.Id,
          displayName: b.headName ?? b.HeadName ?? b.bankName ?? b.BankName ?? b.name ?? b.accountName ?? '—'
        }));
      },
      error: () => { this.bankAccounts = []; }
    });
  }

  private loadPaymentCurrencies(): void {
    this.finance.list({ list: '/Currency/GetCurrencies' }).subscribe({
      next: res => {
        this.paymentCurrencies = this.finance.unwrap(res).map((c: any) => ({
          ...c,
          id: c.id ?? c.currencyId,
          currencyCode: c.currencyCode ?? c.currencyName ?? ''
        }));
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
    if (this.isPeriodLocked) return;
    this.showPaymentForm = true;
    this.activeTab = 'payments';
    this.message = '';
    this.error = '';
    this.paymentForm = {
      supplierId: null, supplierInvoiceId: null,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethodId: 2, bankId: null, amount: null, referenceNo: '', notes: ''
    };
    this.paymentFilteredInvoices = [];
    this.supplierInvoicesAll = [];
    this.payInvSelectAll = false;
    this.amountEditedManually = false;
    this.supTotalInvoice = this.supTotalPaid = this.supTotalDebitNote = this.supTotalAdvance = this.supTotalPayable = 0;
    this.invoiceCurrencyName = '';
    this.pmtSupplierName = '';
    this.paymentBankName = '';
    this.paymentFxRate = 1;
    this.paymentAmountBase = 0;
    this.paymentExchangeGainLoss = 0;
    this.pmtSupplierSearch = ''; this.pmtBankSearch = ''; this.pmtCurrSearch = '';
    const base = this.paymentCurrencies.find((c: any) => c.isBase) ?? this.paymentCurrencies[0];
    if (base) {
      this.paymentCurrencyId = base.id ?? base.currencyId;
      this.paymentCurrencyName = base.currencyCode ?? base.currencyName ?? '';
      this.pmtCurrSearch = this.paymentCurrencyName;
    }
  }

  closePaymentForm(): void {
    this.showPaymentForm = false;
    this.paymentFilteredInvoices = [];
    this.closeAllComboboxes();
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
    this.supplierInvoicesAll = [];
    this.payInvSelectAll = false;
    this.amountEditedManually = false;
    this.supTotalInvoice = this.supTotalPaid = this.supTotalDebitNote = this.supTotalAdvance = this.supTotalPayable = 0;
    this.invoiceCurrencyName = '';
    if (!this.paymentForm.supplierId) { this.paymentFilteredInvoices = []; return; }
    this.paymentFilteredInvoices = this.paymentSupplierInvoices.filter(
      inv => inv.supplierId === Number(this.paymentForm.supplierId)
    );
    // Load open invoices for this supplier for the invoice table
    this.finance.list({ list: `/finance/ap/invoices/supplier/${this.paymentForm.supplierId}` }).subscribe({
      next: res => {
        const rows = this.finance.unwrap(res);
        this.supplierInvoicesAll = rows
          .map((x: any) => {
            const fxRate = Number(x.fxRate ?? x.FxRate ?? 1) || 1;
            const grandTotal = this.money(x, ['amount','Amount','grandTotal','GrandTotal','totalAmount','TotalAmount']);
            const paidAmount = this.money(x, ['paid','Paid','paidAmount','PaidAmount']);
            const debitNoteAmount = this.money(x, ['debitNote','DebitNote','debitNoteAmount','DebitNoteAmount']);
            const advanceAmount = this.money(x, ['advance','Advance','advanceAppliedAmount','AdvanceAppliedAmount']);
            const payableAfterAdvance = this.money(x, ['outstandingAmount','OutstandingAmount','outstanding','Outstanding','balance','Balance','netPayableAmount','NetPayableAmount']);
            // Base-currency (company) values = document (foreign) amount * frozen invoice Fx rate.
            return {
              ...x,
              id: x.id ?? x.Id,
              invoiceNo:   x.invoiceNo   ?? x.InvoiceNo   ?? '',
              invoiceDate: x.invoiceDate ?? x.InvoiceDate ?? '',
              dueDate:     x.dueDate     ?? x.DueDate     ?? '',
              grandTotal,
              paidAmount,
              debitNoteAmount,
              advanceAmount,
              payableAfterAdvance,
              grandTotalBase: +(grandTotal * fxRate).toFixed(2),
              paidBase: +(paidAmount * fxRate).toFixed(2),
              debitNoteBase: +(debitNoteAmount * fxRate).toFixed(2),
              advanceBase: +(advanceAmount * fxRate).toFixed(2),
              payableBase: +(payableAfterAdvance * fxRate).toFixed(2),
              currencyId: Number(x.currencyId ?? x.CurrencyId ?? 0) || 0,
              currencyName: x.currencyName ?? x.CurrencyName ?? 'SGD',
              fxRate,
              isSelected: false
            };
          })
          .filter((x: any) => x.payableAfterAdvance > 0);
        this.supplierInvoicesAll.forEach((x: any) => {
          this.supTotalInvoice  += x.grandTotalBase;
          this.supTotalPaid     += x.paidBase;
          this.supTotalDebitNote += x.debitNoteBase;
          this.supTotalAdvance  += x.advanceBase;
          this.supTotalPayable  += x.payableBase;
        });
        if (this.supplierInvoicesAll[0]) {
          this.invoiceCurrencyName = this.supplierInvoicesAll[0].currencyName || '';
        }
      }
    });
  }

  onInvoiceCheckboxChange(inv: any, checked: boolean): void {
    inv.isSelected = checked;
    if (checked) {
      this.paymentForm.supplierInvoiceId = inv.id;
      if (!this.amountEditedManually) {
        // Default the payable in the base currency (matches the RM figures + Select-All total).
        this.paymentForm.amount = inv.payableBase;
        this.recalcPaymentBase();
        this.recalcPaymentExchangeGainLoss();
      }
      // deselect others (single selection)
      this.supplierInvoicesAll.forEach(x => { if (x !== inv) x.isSelected = false; });
    } else {
      this.paymentForm.supplierInvoiceId = null;
      if (!this.amountEditedManually) { this.paymentForm.amount = null; this.paymentAmountBase = 0; }
    }
  }

  onSelectAllInvoicesChange(checked: boolean): void {
    this.payInvSelectAll = checked;
    this.supplierInvoicesAll.forEach(x => (x.isSelected = checked));
    if (checked && this.supplierInvoicesAll.length) {
      this.paymentForm.supplierInvoiceId = this.supplierInvoicesAll[0].id;
      this.paymentForm.amount = this.supTotalPayable;
      this.amountEditedManually = false;
      this.recalcPaymentBase();
    }
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

    const isForeign = !!(this.paymentCurrencyId && this.paymentBaseCurrencyId && this.paymentCurrencyId !== this.paymentBaseCurrencyId);
    if (isForeign) {
      // Rate arrives async; the amount default that needs it is applied in the callback.
      this.fetchPaymentFxRate();
    } else {
      this.paymentFxRate = 1;
      this.applyPaymentAmountDefault();
      this.recalcPaymentExchangeGainLoss();
    }
  }

  /**
   * Default the payment amount into the selected pay currency for the ticked invoices:
   *  - paying in the invoice's OWN currency → settle its foreign face value (payableAfterAdvance)
   *  - paying in any other currency (base or a third one) → convert the base-currency payable
   *    into the pay currency = payableBase / (payCurrency→base rate).
   * The base field (paymentAmountBase) then always resolves back to the company-currency value.
   */
  private applyPaymentAmountDefault(): void {
    if (this.amountEditedManually) { this.recalcPaymentBase(); return; }
    const invs = (this.supplierInvoicesAll || []).filter(x => x.isSelected);
    if (!invs.length) { this.recalcPaymentBase(); return; }
    const payCur = Number(this.paymentCurrencyId) || 0;
    const rate = Number(this.paymentFxRate) || 1;
    const total = invs.reduce((s, inv) => {
      if (payCur && Number(inv.currencyId) === payCur) return s + (Number(inv.payableAfterAdvance) || 0);
      const base = Number(inv.payableBase) || 0;
      return s + (rate > 0 ? base / rate : base);
    }, 0);
    this.paymentForm.amount = +total.toFixed(2);
    this.recalcPaymentBase();
  }

  private fetchPaymentFxRate(): void {
    if (!this.paymentCurrencyId || !this.paymentBaseCurrencyId || !this.paymentForm.paymentDate) return;
    this.finance.list(
      { list: '/ExchangeRate/GetRate' },
      { fromCurrencyId: this.paymentCurrencyId, toCurrencyId: this.paymentBaseCurrencyId, rateDate: this.paymentForm.paymentDate }
    ).subscribe({
      next: (res: any) => {
        this.paymentFxRate = Number(res?.data?.rate ?? res?.rate ?? 1) || 1;
        this.applyPaymentAmountDefault();
        this.recalcPaymentExchangeGainLoss();
      },
      error: () => { this.paymentFxRate = 1; this.applyPaymentAmountDefault(); }
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
    if (this.isPeriodLocked) { Swal.fire('Period Locked', this.periodName ? `Period "${this.periodName}" is locked.` : 'This period is locked.', 'warning'); return; }
    if (!this.paymentForm.supplierId) { Swal.fire('Required', 'Please select a supplier.', 'warning'); return; }
    if (!this.paymentForm.paymentDate) { Swal.fire('Required', 'Payment date is required.', 'warning'); return; }
    if (!(Number(this.paymentForm.amount) > 0)) { Swal.fire('Required', 'Amount must be greater than 0.', 'warning'); return; }
    // Bank Transfer (2) and Cheque (3) both leave a specific bank account, so the bank must be
    // named — the balance is tracked per bank GL account, and an unnamed bank would quietly pay
    // the money out of the company's generic Cash account instead.
    const apMethod = Number(this.paymentForm.paymentMethodId);
    if ((apMethod === 2 || apMethod === 3) && !this.paymentForm.bankId) {
      Swal.fire('Required',
        apMethod === 3 ? 'Please select the bank the cheque is drawn on.' : 'Please select the bank account for this payment.',
        'warning');
      return;
    }

    // The backend posts one payment per invoice, so split the entered total across the
    // selected invoices (in list order, capped at each invoice's outstanding balance).
    const selected = (this.supplierInvoicesAll || []).filter(x => x.isSelected);
    if (!selected.length) { Swal.fire('Required', 'Please select at least one supplier invoice.', 'warning'); return; }

    let remaining = Number(this.paymentForm.amount) || 0;
    const allocations: { inv: any; amount: number }[] = [];
    for (const inv of selected) {
      if (remaining <= 0.001) break;
      const bal = Number(inv.payableAfterAdvance ?? inv.balance ?? 0);
      const alloc = Math.min(remaining, bal);
      if (alloc > 0) {
        allocations.push({ inv, amount: parseFloat(alloc.toFixed(2)) });
        remaining = parseFloat((remaining - alloc).toFixed(2));
      }
    }

    if (!allocations.length) { Swal.fire('Required', 'Amount must be greater than 0.', 'warning'); return; }
    if (remaining > 0.01) {
      Swal.fire('Amount too high', `Amount exceeds the total outstanding of the selected invoice(s) by ${remaining.toFixed(2)}.`, 'warning');
      return;
    }

    this.savingPayment = true;
    this.error = '';

    const requests = allocations.map(a => {
      const payload = {
        supplierId: Number(this.paymentForm.supplierId),
        supplierInvoiceId: Number(a.inv.id),
        paymentDate: this.paymentForm.paymentDate,
        paymentMethodId: Number(this.paymentForm.paymentMethodId) || 2,
        bankId: this.paymentForm.paymentMethodId === 2 ? this.paymentForm.bankId : null,
        amount: a.amount,
        amountBase: parseFloat((a.amount * (this.paymentFxRate || 1)).toFixed(2)),
        fxRate: this.paymentFxRate,
        currencyId: this.paymentCurrencyId,
        companyCurrencyId: this.paymentBaseCurrencyId,
        exchangeGainLoss: allocations.length === 1 ? this.paymentExchangeGainLoss : 0,
        referenceNo: this.paymentForm.referenceNo || '',
        notes: this.paymentForm.notes || ''
      };
      return this.finance.create({ create: '/finance/ap/payments/create' }, payload);
    });

    // Post SEQUENTIALLY (not in parallel) — each payment's GL posting upserts the shared
    // AccountBalance row, so concurrent posts would race and violate its primary key.
    concat(...requests).subscribe({
      error: err => {
        this.savingPayment = false;
        Swal.fire({ icon: 'error', title: 'Save Failed', text: err?.error?.message || 'Unable to save payment. Please try again.', confirmButtonColor: '#2e5f73' });
      },
      complete: () => {
        this.savingPayment = false;
        this.showPaymentForm = false;
        this.paymentFilteredInvoices = [];
        this.paymentInvoicesLoaded = false;
        this.loadPayments();
        Swal.fire({ icon: 'success', title: 'Payment Posted', text: `Supplier payment saved successfully across ${allocations.length} invoice(s).`, confirmButtonColor: '#2e5f73', timer: 2500, timerProgressBar: true });
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
        Swal.fire({ icon: 'error', title: 'Load Failed', text: 'Accounts Payable data unavailable.', confirmButtonColor: '#2e5f73' });
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
        Swal.fire({ icon: 'error', title: 'Load Failed', text: 'Payments data unavailable.', confirmButtonColor: '#2e5f73' });
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
      error: () => { this.agingRows = []; this.loading = false; Swal.fire({ icon: 'error', title: 'Load Failed', text: 'AP Aging data unavailable.', confirmButtonColor: '#2e5f73' }); }
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
      error: () => { this.advances = []; this.loading = false; Swal.fire({ icon: 'error', title: 'Load Failed', text: 'AP Advances data unavailable.', confirmButtonColor: '#2e5f73' }); }
    });
  }

  private loadMatch(): void {
    this.loading = true;
    this.finance.list({ list: '/finance/ap/match' }).subscribe({
      next: res => {
        this.matchRows = this.finance.unwrap(res).map(row => this.normalizeMatch(row));
        this.loading = false;
      },
      error: () => { this.matchRows = []; this.loading = false; Swal.fire({ icon: 'error', title: 'Load Failed', text: '3-Way Match data unavailable.', confirmButtonColor: '#2e5f73' }); }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filteredInvoices = q
      ? this.invoices.filter(r => ['supplierName', 'invoiceNo', 'status'].some(k => String(r[k] ?? '').toLowerCase().includes(q)))
      : [...this.invoices];
    this.buildSupplierGroups();
  }

  supplierGroups: { supplier: string; invoices: any[]; total: number; paid: number; debitNote: number; advance: number; outstanding: number; baseAmount: number; currencyName: string; isMixedCurrency: boolean }[] = [];

  private buildSupplierGroups(): void {
    const map = new Map<string, any[]>();
    this.filteredInvoices.forEach(inv => {
      const key = inv.supplierName || 'Unknown Supplier';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });
    this.supplierGroups = Array.from(map.entries()).map(([supplier, invs]) => {
      // Amount/Paid/Debit Note/Advance/Outstanding are in each invoice's OWN currency (e.g.
      // SGD); only Base Amount is in the company base currency. The group total therefore only
      // means something when every invoice shares one currency — flag the mixed case rather
      // than adding SGD to RM and labelling the result RM.
      const currencies = new Set(invs.map(i => String(i.currencyName ?? '').trim()).filter(Boolean));
      const isMixedCurrency = currencies.size > 1;
      return {
        supplier,
        invoices: invs,
        total: invs.reduce((s, i) => s + (i.amount || 0), 0),
        paid: invs.reduce((s, i) => s + (i.paid || 0), 0),
        debitNote: invs.reduce((s, i) => s + (i.debitNote || 0), 0),
        advance: invs.reduce((s, i) => s + (i.advance || 0), 0),
        outstanding: invs.reduce((s, i) => s + (i.balance || 0), 0),
        baseAmount: invs.reduce((s, i) => s + (i.baseAmount || 0), 0),
        currencyName: isMixedCurrency ? '' : (currencies.values().next().value ?? this.baseCurrencyName),
        isMixedCurrency
      };
    });
  }

  trackBySupplier(_: number, grp: any): string { return grp.supplier; }

  toggleSupplier(supplier: string): void {
    this.expandedSuppliers = { ...this.expandedSuppliers, [supplier]: !this.expandedSuppliers[supplier] };
  }

  isExpanded(supplier: string): boolean { return !!this.expandedSuppliers[supplier]; }

  toggleAgingSupplier(supplier: string): void {
    if (this.expandedSupplierAging.has(supplier)) {
      this.expandedSupplierAging.delete(supplier);
      this.agingDetailRows = [];
      this.agingDetailLoading = false;
      return;
    }
    this.expandedSupplierAging.clear();
    this.expandedSupplierAging.add(supplier);
    this.agingDetailRows = [];
    this.agingDetailLoading = true;

    const row = this.agingRows.find(r => String(r.supplierName) === String(supplier));
    let supplierId: any = row?.supplierId ?? row?.SupplierId;
    if (!supplierId) {
      const found = this.suppliers.find((s: any) =>
        String(s.name).toLowerCase().trim() === String(supplier).toLowerCase().trim());
      supplierId = found?.id;
    }
    console.log('[AP Aging] expand supplier=', supplier, ' supplierId=', supplierId, ' dateRange=', this.agingDateRange());
    if (!supplierId) {
      console.warn('[AP Aging] supplierId not found for supplier:', supplier);
      this.agingDetailLoading = false;
      return;
    }
    this.finance.list({ list: `/ApAging/supplierInvoices/${supplierId}` }, this.agingDateRange()).subscribe({
      next: res => {
        console.log('[AP Aging] supplierInvoices response:', res);
        this.agingDetailRows = this.finance.unwrap(res).map(detail => this.normalizeAgingDetail(detail));
        console.log('[AP Aging] agingDetailRows count:', this.agingDetailRows.length);
        this.agingDetailLoading = false;
      },
      error: (err) => {
        console.error('[AP Aging] supplierInvoices error:', err);
        this.agingDetailRows = [];
        this.agingDetailLoading = false;
      }
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
    if (this.isPeriodLocked) return;
    this.showAdvanceForm = true;
    this.activeTab = 'advances';
    this.message = '';
    this.error = '';
    this.apAdvMethodId = 2;
    this.apAdvBankId     = null;
    this.apAdvBankHeadId = null;
    this.apAdvBankName   = '';
    this.apAdvGrnNo = '';
    this.apAdvGrnSearch = '';
    this.apAdvGrnTotal = 0;
    this.apAdvFxRate = 1;
    this.apAdvAmountBase = 0;
    this.apAdvCurrencyId = null;
    this.apAdvCurrencyName = '';
    this.advCurrSearch = '';
    this.advSupplierSearch = '';
    this.advBankSearch = '';
    // default to base currency
    const base = this.paymentCurrencies.find((c: any) => c.isBase) ?? this.paymentCurrencies[0];
    if (base) { this.apAdvCurrencyId = base.id ?? base.currencyId; this.apAdvCurrencyName = base.currencyCode ?? base.currencyName ?? 'SGD'; }
    this.advanceForm = {
      supplierId: null, supplierName: '',
      advanceDate: new Date().toISOString().slice(0, 10),
      amount: null, referenceNo: '', notes: ''
    };
  }

  closeApAdvanceForm(): void {
    this.showAdvanceForm = false;
    this.closeAllComboboxes();
  }

  onApAdvMethodChange(): void {
    if (this.apAdvMethodId === 1) this.apAdvBankHeadId = null;
  }

  onApAdvAmountChange(): void {
    this.apAdvAmountBase = parseFloat(((Number(this.advanceForm.amount) || 0) * (this.apAdvFxRate || 1)).toFixed(2));
  }

  saveAdvance(): void {
    if (this.isPeriodLocked) { Swal.fire('Period Locked', this.periodName ? `Period "${this.periodName}" is locked.` : 'This period is locked.', 'warning'); return; }
    if (!this.advanceForm.supplierId) { Swal.fire('Required', 'Please select a supplier.', 'warning'); return; }
    if (!this.advanceForm.advanceDate) { Swal.fire('Required', 'Advance date is required.', 'warning'); return; }
    if (!(Number(this.advanceForm.amount) > 0)) { Swal.fire('Required', 'Amount must be greater than 0.', 'warning'); return; }
    const needsBank = this.apAdvMethodId === 2 || this.apAdvMethodId === 3;
    if (needsBank && !this.apAdvBankId) {
      Swal.fire('Required', 'Please select a bank account.', 'warning'); return;
    }

    // Warn when the advance exceeds the selected GRN total, but allow proceeding.
    if (this.apAdvExceedsGrn) {
      const amt  = (Number(this.advanceForm.amount) || 0).toFixed(2);
      const grn  = this.apAdvGrnTotal.toFixed(2);
      const cur  = this.apAdvCurrencyName || this.baseCurrencyName;
      Swal.fire({
        icon: 'warning',
        title: 'Advance exceeds GRN total',
        html: `Advance <strong>${amt} ${cur}</strong> is more than GRN <strong>${this.apAdvGrnNo}</strong> total <strong>${grn} ${cur}</strong>.<br>Do you still want to save?`,
        showCancelButton: true,
        confirmButtonText: 'Save anyway',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#d97706',
        cancelButtonColor: '#6b7280'
      }).then(res => { if (res.isConfirmed) this.doSaveAdvance(); });
      return;
    }

    this.doSaveAdvance();
  }

  private doSaveAdvance(): void {
    const needsBank = this.apAdvMethodId === 2 || this.apAdvMethodId === 3;
    this.savingAdvance = true;
    this.error = '';

    const payload = {
      supplierId:  Number(this.advanceForm.supplierId),
      advanceDate: this.advanceForm.advanceDate,
      amount:      Number(this.advanceForm.amount) || 0,
      referenceNo: this.advanceForm.referenceNo || null,
      notes:       this.advanceForm.notes || null,
      methodId:    this.apAdvMethodId,
      bankId:      needsBank ? this.apAdvBankId     : null,
      bankHeadId:  needsBank ? this.apAdvBankHeadId : null,
      grnNo:       this.apAdvGrnNo || null,
      currencyId:  this.apAdvCurrencyId ?? null,
      fxRate:      this.apAdvFxRate || 1,
      amountBase:  this.apAdvAmountBase || Number(this.advanceForm.amount) || 0
    };

    this.finance.create(this.advanceConfig.endpoint, payload).subscribe({
      next: () => {
        this.savingAdvance = false;
        this.showAdvanceForm = false;
        this.loadAdvances();
        Swal.fire({ icon: 'success', title: 'Advance Saved', text: 'Supplier advance saved successfully.', confirmButtonColor: '#2e5f73', timer: 2500, timerProgressBar: true });
      },
      error: err => {
        this.savingAdvance = false;
        Swal.fire({ icon: 'error', title: 'Save Failed', text: err?.error?.message || 'Unable to save advance. Please try again.', confirmButtonColor: '#2e5f73' });
      }
    });
  }

  // ── Combobox helpers ──────────────────────────────────────────────────────

  @HostListener('document:mousedown', ['$event'])
  onDocClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.ap-combo') && !t.closest('.ap-dd')) this.closeAllComboboxes();
  }

  closeAllComboboxes(): void {
    this.pmtSupplierOpen = this.pmtInvoiceOpen = this.pmtBankOpen = this.pmtCurrOpen = false;
    this.advSupplierOpen = this.advBankOpen = this.advGrnOpen = this.advCurrOpen = false;
  }

  toggleCombo(name: string): void {
    const all = ['pmtSupplierOpen','pmtInvoiceOpen','pmtBankOpen','pmtCurrOpen','advSupplierOpen','advBankOpen','advGrnOpen','advCurrOpen'];
    const cur = (this as any)[name];
    all.forEach(f => { (this as any)[f] = false; });
    (this as any)[name] = !cur;
  }

  // Payment form combobox getters
  get pmtFilteredSuppliers(): any[] {
    const q = this.pmtSupplierSearch.toLowerCase();
    return q ? this.suppliers.filter(s => s.name.toLowerCase().includes(q)) : this.suppliers;
  }
  get pmtFilteredInvoices(): any[] {
    const q = this.pmtInvoiceSearch.toLowerCase();
    return q ? this.paymentFilteredInvoices.filter(i =>
      (i.invoiceNo ?? '').toLowerCase().includes(q)) : this.paymentFilteredInvoices;
  }
  get pmtFilteredBanks(): any[] {
    const q = this.pmtBankSearch.toLowerCase();
    return q ? this.bankAccounts.filter(b => (b.displayName ?? '').toLowerCase().includes(q)) : this.bankAccounts;
  }
  get pmtFilteredCurrencies(): any[] {
    const q = this.pmtCurrSearch.toLowerCase();
    return q ? this.paymentCurrencies.filter(c =>
      (c.currencyCode ?? c.currencyName ?? '').toLowerCase().includes(q)) : this.paymentCurrencies;
  }

  // Payment form select methods
  selectPmtSupplier(s: any): void {
    this.paymentForm.supplierId = s.id;
    this.pmtSupplierName = s.name;
    this.pmtSupplierSearch = '';
    this.pmtSupplierOpen = false;
    this.paymentForm.supplierInvoiceId = null;
    this.onPaymentSupplierChange();
  }
  selectPmtInvoice(inv: any): void {
    this.paymentForm.supplierInvoiceId = inv.id;
    this.pmtInvoiceSearch = inv.invoiceNo ?? '';
    this.pmtInvoiceOpen = false;
    this.onPaymentInvoiceSelect();
  }
  selectPmtBank(b: any): void {
    this.paymentForm.bankId = b.id;
    this.pmtBankSearch = '';
    this.pmtBankOpen = false;
    this.paymentBankName = b.displayName;
  }
  selectPmtCurrency(c: any): void {
    this.paymentCurrencyId = c.id ?? c.currencyId;
    this.pmtCurrSearch = '';
    this.pmtCurrOpen = false;
    this.paymentCurrencyName = c.currencyCode ?? c.currencyName ?? '';
    this.onPaymentCurrencyChange();
  }

  // Advance form combobox getters
  get advFilteredSuppliers(): any[] {
    const q = this.advSupplierSearch.toLowerCase();
    return q ? this.suppliers.filter(s => s.name.toLowerCase().includes(q)) : this.suppliers;
  }
  get advFilteredBanks(): any[] {
    const q = this.advBankSearch.toLowerCase();
    return q ? this.bankAccounts.filter(b => (b.displayName ?? '').toLowerCase().includes(q)) : this.bankAccounts;
  }

  // Advance form select methods
  selectAdvSupplier(s: any): void {
    this.advanceForm.supplierId = s.id;
    this.advSupplierSearch = s.name;
    this.advSupplierOpen = false;
    this.onSupplierSelect();
  }
  selectAdvBank(b: any): void {
    this.apAdvBankId     = b.id;
    this.apAdvBankHeadId = b.id;
    this.apAdvBankName   = b.displayName;
    this.advBankSearch   = b.displayName;
    this.advBankOpen     = false;
  }

  /** erp-dropdown handler for the Advance form's Bank Account field. */
  onApAdvBankChange(): void {
    this.apAdvBankHeadId = this.apAdvBankId;
    const b = this.bankAccounts.find(x => x.id === Number(this.apAdvBankId));
    this.apAdvBankName = b?.displayName ?? '';
  }

  get advFilteredCurrencies(): any[] {
    const q = this.advCurrSearch.toLowerCase();
    return q ? this.paymentCurrencies.filter(c =>
      (c.currencyCode ?? c.currencyName ?? '').toLowerCase().includes(q)) : this.paymentCurrencies;
  }
  selectAdvCurrency(c: any): void {
    this.apAdvCurrencyId   = c.id ?? c.currencyId;
    this.apAdvCurrencyName = c.currencyCode ?? c.currencyName ?? '';
    this.advCurrSearch     = this.apAdvCurrencyName;
    this.advCurrOpen       = false;
    this.onApAdvAmountChange();
  }

  /** erp-dropdown handler for the Advance form's Currency field. */
  onApAdvCurrencyChange(): void {
    const cur = this.paymentCurrencies.find(c => c.id === Number(this.apAdvCurrencyId));
    this.apAdvCurrencyName = cur?.currencyCode ?? '';
    this.onApAdvAmountChange();
  }

  get apAdvGrnSearch(): string { return this.advGrnSearch; }
  set apAdvGrnSearch(v: string) { this.advGrnSearch = v; }

  get advFilteredGrns(): any[] {
    const q = this.advGrnSearch.toLowerCase();
    return q ? this.grns.filter(g => (g.grnNo ?? '').toLowerCase().includes(q)) : this.grns;
  }

  selectAdvGrn(g: any): void {
    this.apAdvGrnNo    = g.grnNo ?? g.GrnNo ?? '';
    this.advGrnSearch  = this.apAdvGrnNo;
    this.advGrnOpen    = false;
    this.apAdvGrnTotal = this.computeGrnTotal(g);
  }

  /** erp-dropdown handler — apAdvGrnNo is bound directly to the GRN's grnNo (its bindValue). */
  onAdvGrnChange(): void {
    const g = this.grns.find(x => x.grnNo === this.apAdvGrnNo);
    this.apAdvGrnTotal = g ? this.computeGrnTotal(g) : 0;
  }

  /** Sum of (qtyReceived × unitPrice), inclusive of tax, across the GRN's line items (stored in GRNJson). */
  private computeGrnTotal(g: any): number {
    const raw = g?.grnJson ?? g?.GRNJson ?? g?.gRNJson ?? '[]';
    let lines: any[] = [];
    try { lines = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch { lines = []; }
    const total = lines.reduce((s, l) => {
      const base = (Number(l.qtyReceived) || 0) * (Number(l.unitPrice) || 0);
      const taxRate = Number(l.taxRate) || 0;
      return s + base * (1 + taxRate / 100);
    }, 0);
    return +total.toFixed(2);
  }

  /** True when the entered advance amount exceeds the selected GRN's total. */
  get apAdvExceedsGrn(): boolean {
    return this.apAdvGrnTotal > 0 && (Number(this.advanceForm.amount) || 0) > this.apAdvGrnTotal;
  }

  private loadGrns(): void {
    // Advance dropdown: exclude fully-paid GRNs (they don't need an advance).
    this.finance.list({ list: '/PurchaseGoodReceipt/GetAvailableGRNsForAdvance' }).subscribe({
      next: res => {
        this.grns = this.finance.unwrap(res).map((g: any) => ({
          ...g,
          grnNo: g.grnNo ?? g.GrnNo ?? g.grnNumber ?? ''
        })).filter((g: any) => g.grnNo);
      },
      error: () => { this.grns = []; }
    });
  }

  getSelectedBank(bankId: any): any {
    return this.bankAccounts.find(b => String(b.id) === String(bankId)) ?? null;
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
    if (s === 'paid' || s === 'matched') return 'badge-success';
    if (s === 'partial' || s === 'mismatch') return 'badge-warning';
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
    this.invoiceSummary.totalInvoice = this.invoices.reduce((s, r) => s + (r.baseAmount || 0), 0);
    this.invoiceSummary.paid = this.invoices.reduce((s, r) => s + (r.paidBase || 0), 0);
    this.invoiceSummary.debitNote = this.invoices.reduce((s, r) => s + (r.debitNoteBase || 0), 0);
    this.invoiceSummary.advance = this.invoices.reduce((s, r) => s + (r.advanceBase || 0), 0);
    this.invoiceSummary.outstanding = this.invoices.reduce((s, r) => s + (r.balanceBase || 0), 0);
  }

  private normalizeInvoice(row: any): any {
    const amount = this.money(row, ['amount', 'Amount', 'invoiceAmount', 'InvoiceAmount', 'totalAmount', 'TotalAmount', 'grandTotal', 'GrandTotal', 'netAmount', 'NetAmount']);
    const taxAmount = this.money(row, ['taxAmount', 'TaxAmount', 'tax', 'Tax']);
    const paid = this.money(row, ['paid', 'Paid', 'paidAmount', 'PaidAmount', 'totalPaid', 'TotalPaid']);
    const debitNote = this.money(row, ['debitNote', 'DebitNote', 'debitNoteAmount', 'DebitNoteAmount']);
    const advance = this.money(row, ['advance', 'Advance', 'advanceAmount', 'AdvanceAmount', 'advanceAppliedAmount', 'AdvanceAppliedAmount', 'advanceApplied', 'AdvanceApplied']);
    const net = this.money(row, ['netPayableAmount', 'NetPayableAmount', 'outstandingAmount', 'OutstandingAmount', 'balance', 'Balance', 'outstanding', 'Outstanding'], amount - paid - debitNote - advance);
    const fxRate = Number(row.fxRate ?? row.FxRate ?? 1) || 1;
    const storedBase = this.money(row, ['baseAmount', 'BaseAmount', 'amountBase', 'AmountBase']);
    const baseAmount = storedBase > 0 ? storedBase : +(amount * fxRate).toFixed(2);
    const balance = Math.max(net, 0);
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
      taxAmount,
      paid,
      debitNote,
      advance,
      balance,
      currencyName: row.currencyName ?? row.CurrencyName ?? row.currencyCode ?? 'SGD',
      fxRate,
      baseAmount,
      // Base-currency equivalents for the top KPI cards — a paid/debit-note/advance amount is always
      // recorded in the same currency as its invoice, so the same fxRate converts it to base currency.
      paidBase: +(paid * fxRate).toFixed(2),
      debitNoteBase: +(debitNote * fxRate).toFixed(2),
      advanceBase: +(advance * fxRate).toFixed(2),
      balanceBase: +(balance * fxRate).toFixed(2),
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
    // Use *Base (SGD-converted) fields first — API DTO returns both raw FC and Base values
    return {
      ...row,
      supplierName: row.supplierName ?? row.SupplierName,
      supplierId: row.supplierId ?? row.SupplierId,
      invoiceCount: row.invoiceCount ?? row.InvoiceCount ?? 0,
      total:     this.money(row, ['totalOutstandingBase', 'TotalOutstandingBase', 'totalOutstanding', 'TotalOutstanding', 'total']),
      current:   this.money(row, ['bucket0_30Base',  'Bucket0_30Base',  'bucket0_30',  'Bucket0_30',  'current', 'days30']),
      days60:    this.money(row, ['bucket31_60Base', 'Bucket31_60Base', 'bucket31_60', 'Bucket31_60', 'days60']),
      days90:    this.money(row, ['bucket61_90Base', 'Bucket61_90Base', 'bucket61_90', 'Bucket61_90', 'days90']),
      days90plus: this.money(row, ['bucket90PlusBase', 'Bucket90PlusBase', 'bucket90Plus', 'Bucket90Plus', 'days90plus'])
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
      debitNoteAmount: this.money(row, ['debitNoteAmount', 'DebitNoteAmount', 'debitNote', 'DebitNote']),
      advanceAmount: this.money(row, ['advanceAmount', 'AdvanceAmount', 'advance', 'Advance']),
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
    const amount = this.money(row, ['originalAmount', 'OriginalAmount', 'amount', 'Amount']);
    const utilised = this.money(row, ['utilisedAmount', 'UtilisedAmount', 'utilised', 'Utilised'], amount - this.money(row, ['balanceAmount', 'BalanceAmount', 'balance', 'Balance']));
    const balance = this.money(row, ['balanceAmount', 'BalanceAmount', 'balance', 'Balance'], amount - utilised);
    return {
      ...row,
      advanceNo: row.advanceNo ?? row.AdvanceNo,
      supplierName: row.supplierName ?? row.SupplierName,
      advanceDate: row.advanceDate ?? row.AdvanceDate,
      methodId: row.methodId ?? row.MethodId,
      amountBase: this.money(row, ['amountBase', 'AmountBase']),
      currencyName: row.currencyName ?? row.CurrencyName ?? '',
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
