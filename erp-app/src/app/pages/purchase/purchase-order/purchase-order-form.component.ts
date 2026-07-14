import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { DocumentNumberService } from '../../../core/services/document-number.service';
import { MasterService } from '../../../core/services/master.service';
import { CalculatedTaxMode, TaxDecisionService } from '../../../core/services/tax-decision.service';
import { PurchaseService } from '../purchase.service';

interface POLine {
  prId: number | null;
  prNumber: string;
  itemId: number | null;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number | null;
  uomId: number | null;
  unitPrice: number | null;
  discountPct: number | null;
  taxCodeId: number | null;
  taxRate: number;
  taxMode: string;
  taxAmt: number;
  lineTotal: number;
  budgetId: number | null;
  budget: string;
  remarks: string;
}

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected' };

@Component({
  selector: 'erp-purchase-order-form',
  standalone: false,
  templateUrl: './purchase-order-form.component.html',
  styleUrls: ['./purchase-order-form.component.scss']
})
export class PurchaseOrderFormComponent implements OnInit {
  poStep = 0;
  poSteps = ['Header', 'Lines', 'Review'];

  isEdit = false;
  id: number | null = null;
  // draftId: number | null = null; // DRAFT DISABLED
  fromPrId: number | null = null;
  fromReorderPrId: number | null = null;
  fromAlertPrId: number | null = null;
  sourceType = '';
  sourceRefId: number | null = null;
  loading = false;
  saving = false;
  error = '';
  private cleanHash = '';

  purchaseOrderNo = '';
  supplierId: number | null = null;
  paymentTermId: number | null = null;
  currencyId: number | null = null;
  fxRate: number | null = 1;
  poDate = new Date().toISOString().substring(0, 10);
  deliveryDate = '';
  locationId: number | null = null;
  contactNumber = '';
  remarks = '';
  shipping: number | null = null;
  discount: number | null = null;
  isOverseas = false;
  incotermsId: number | null = null;
  approvalStatus = 1;
  gstPct = 0;

  lines: POLine[] = [];

  showModal = false;
  editingIndex: number | null = null;
  modalLine: POLine = this.emptyLine();
  private autoOpenFirstLine = false;

  supplierOptions: any[] = [];
  paymentTermOptions: any[] = [];
  currencyOptions: any[] = [];
  incotermOptions: any[] = [];
  itemOptions: any[] = [];
  locationOptions: any[] = [];
  taxModeOptions = [
    { label: 'Exclusive', value: 'Exclusive' },
    { label: 'Inclusive', value: 'Inclusive' },
    { label: 'Exempt', value: 'ZeroRated' }
  ];
  budgetOptions: any[] = [];
  availablePROptions: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || null;
  companyId = Number(localStorage.getItem('companyId') || 0);
  companyCountryId = Number(localStorage.getItem('companyCountryId') || 0) || null;
  supplierCountryId: number | null = null;
  defaultLineTaxMode: CalculatedTaxMode = 'Exclusive';
  // Company-wide tax mode (Company → Finance & Tax): Exclusive / Inclusive / ZeroRated.
  companyTaxMode: CalculatedTaxMode | null = null;
  private suggestedPoNo = '';
  private _locationNameFromEdit = '';
  private _locationNameFromPR = '';

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router,
    private masterSvc: MasterService,
    private docNoSvc: DocumentNumberService,
    private taxDecisionSvc: TaxDecisionService
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    // const draftParam = this.route.snapshot.queryParamMap.get('draftId'); // DRAFT DISABLED
    const fromPR = this.route.snapshot.queryParamMap.get('fromPR');
    const fromReorder = this.route.snapshot.queryParamMap.get('fromReorderPrId');
    const fromAlert = this.route.snapshot.queryParamMap.get('prId');
    const fromSO = this.route.snapshot.queryParamMap.get('fromSO');
    const fromRecipe = this.route.snapshot.queryParamMap.get('fromRecipe');

    this.isEdit = !!paramId && paramId !== 'new';
    this.loadCompanyContext();
    this.loadLookups();

    if (fromSO) {
      this.sourceType = 'SO';
      this.sourceRefId = Number(fromSO);
    } else if (fromRecipe) {
      this.sourceType = 'RECIPE_SHORTAGE';
      this.sourceRefId = Number(fromRecipe);
    }

    if (this.isEdit) {
      this.id = Number(paramId);
      this.loadForEdit();
    // DRAFT DISABLED
    // } else if (draftParam) {
    //   this.draftId = Number(draftParam);
    //   this.loadFromDraft();
    } else if (fromPR) {
      this.fromPrId = Number(fromPR);
      if (!this.sourceType) { this.sourceType = 'PR'; this.sourceRefId = this.fromPrId; }
      this.loadFromPR(this.fromPrId);
    } else if (fromReorder) {
      this.fromReorderPrId = Number(fromReorder);
      if (!this.sourceType) { this.sourceType = 'PR'; this.sourceRefId = this.fromReorderPrId; }
      this.loadFromPR(this.fromReorderPrId);
    } else if (fromAlert) {
      this.fromAlertPrId = Number(fromAlert);
      if (!this.sourceType) { this.sourceType = 'PR'; this.sourceRefId = this.fromAlertPrId; }
      this.loadFromPR(this.fromAlertPrId);
    } else {
      this.tryApplyRfqDraft();
      this.markClean();
    }
  }

  private loadCompanyContext(): void {
    const applySuggestion = () => {
      this.suggestedPoNo = this.docNoSvc.peekNextNumber('PO', this.companyId || undefined);
      if (!this.isEdit && !this.purchaseOrderNo) this.purchaseOrderNo = this.suggestedPoNo;
    };
    if (!this.companyId) {
      applySuggestion();
      return;
    }
    this.masterSvc.getCompanyById(this.companyId).subscribe({
      next: (res: any) => {
        if (res?.numberSeries?.length) this.docNoSvc.cacheCompanySeries(this.companyId, res.numberSeries);
        const countryId = Number(res?.financeTax?.countryId ?? res?.general?.countryId ?? 0) || null;
        this.companyCountryId = countryId;
        if (countryId) localStorage.setItem('companyCountryId', String(countryId));
        const tm = res?.financeTax?.taxMode;
        this.companyTaxMode = (tm === 'Inclusive' || tm === 'ZeroRated' || tm === 'Exclusive') ? tm : null;
        if (this.companyTaxMode) localStorage.setItem('companyTaxMode', this.companyTaxMode);
        this.applyTaxDecision(this.gstPct);
        applySuggestion();
      },
      error: () => applySuggestion()
    });
  }

  private emptyLine(): POLine {
    return {
      prId: null,
      prNumber: '',
      itemId: null,
      itemCode: '',
      itemName: '',
      description: '',
      quantity: null,
      uomId: null,
      unitPrice: null,
      discountPct: null,
      taxCodeId: null,
      taxRate: 0,
      taxMode: this.defaultLineTaxMode,
      taxAmt: 0,
      lineTotal: 0,
      budgetId: null,
      budget: '',
      remarks: ''
    };
  }

  loadLookups(): void {
    this.svc.getSuppliers().subscribe(r =>
      this.supplierOptions = this.svc.unwrap(r).map((s: any) => ({
        label: s.supplierName ?? s.name, value: s.id, raw: s
      })));
    this.svc.getPaymentTerms().subscribe(r =>
      this.paymentTermOptions = this.svc.unwrap(r).map((p: any) => ({
        label: p.termName ?? p.paymentTermsName ?? p.name, value: p.id
      })));
    this.svc.getCurrencies().subscribe(r =>
      this.currencyOptions = this.svc.unwrap(r).map((c: any) => ({
        label: `${c.currencyCode ?? c.code ?? c.currency ?? ''} - ${c.currencyName ?? c.name ?? ''}`.replace(/^-\s*|-\s*$/, '').trim(),
        value: c.id ?? c.iD, raw: c
      })));
    this.svc.getIncoterms().subscribe(r =>
      this.incotermOptions = this.svc.unwrap(r).map((i: any) => ({
        label: i.incotermsName ?? i.name, value: i.id
      })));
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: `${i.itemCode ?? ''} - ${i.itemName ?? i.name}`, value: i.id, raw: i
      })));
    this.svc.getLocations().subscribe(r => {
      this.locationOptions = this.svc.unwrap(r).map((l: any) => ({
        label: l.locationName ?? l.name, value: l.id, raw: l
      }));
      if (this._locationNameFromEdit) {
        const found = this.locationOptions.find(o => o.label === this._locationNameFromEdit);
        if (found) this.locationId = found.value;
      }
      if (this._locationNameFromPR) {
        this.autoSetLocationByName(this._locationNameFromPR);
        this._locationNameFromPR = '';
      }
    });
    this.svc.getChartOfAccounts().subscribe(r =>
      this.budgetOptions = this.svc.unwrap(r).map((a: any) => ({
        label: a.headName ?? a.accountName ?? a.name ?? '', value: a.id
      })));
    this.svc.getAvailablePurchaseRequests().subscribe(r =>
      this.availablePROptions = this.svc.unwrap(r).map((pr: any) => ({
        label: `${pr.purchaseRequestNo} - ${pr.requester ?? ''}`, value: pr.id, raw: pr
      })));
  }

  private parsePoLines(raw: any): POLine[] {
    const parsed: any[] = typeof raw === 'string'
      ? JSON.parse(raw || '[]')
      : (Array.isArray(raw) ? raw : []);
    return parsed.map((l: any) => ({
      prId: l.prId ?? null,
      prNumber: l.prNo ?? l.prNumber ?? '',
      itemId: l.itemId ?? null,
      itemCode: l.itemCode ?? '',
      itemName: l.itemSearch ?? l.itemName ?? '',
      description: l.description ?? '',
      quantity: l.qty ?? l.quantity ?? null,
      uomId: l.uomId ?? null,
      unitPrice: l.unitPrice ?? null,
      discountPct: l.discountPct ?? null,
      taxCodeId: l.taxCodeId ?? null,
      taxRate: Number(l.taxRate ?? 0),
      taxMode: l.taxMode ?? this.defaultLineTaxMode,
      taxAmt: Number(l.taxAmt ?? 0),
      lineTotal: Number(l.lineTotal ?? 0),
      budgetId: l.budgetId ?? null,
      budget: l.budget ?? '',
      remarks: l.remarks ?? ''
    }));
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getPurchaseOrderById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.purchaseOrderNo = d.purchaseOrderNo ?? '';
        this.supplierId = d.supplierId ?? null;
        this.paymentTermId = d.paymentTermId ?? null;
        this.currencyId = d.currencyId ?? null;
        this.fxRate = d.fxRate ?? 1;
        this.poDate = d.poDate ? d.poDate.substring(0, 10) : this.poDate;
        this.deliveryDate = d.deliveryDate ? d.deliveryDate.substring(0, 10) : '';
        this.contactNumber = d.contactNumber ?? '';
        this.remarks = d.remarks ?? '';
        this.gstPct = Number(d.tax ?? d.gstPct ?? 0);
        this.shipping = d.shipping ?? null;
        this.discount = d.discount ?? null;
        this.isOverseas = !!(d.shipping || d.discount || d.incotermsId);
        this.incotermsId = d.incotermsId ?? null;
        this.approvalStatus = d.approvalStatus ?? 1;
        this._locationNameFromEdit = d.location ?? d.Location ?? '';
        const locFound = this.locationOptions.find(o => o.label === this._locationNameFromEdit);
        if (locFound) this.locationId = locFound.value;
        this.lines = this.parsePoLines(d.poLines ?? d.PoLines ?? '[]');
        this.loading = false;
        this.markClean();
      },
      error: () => { this.loading = false; }
    });
  }

  /* DRAFT DISABLED
  loadFromDraft(): void {
    this.loading = true;
    this.svc.getPurchaseOrderDraftById(this.draftId!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.supplierId = d.supplierId ?? null;
        this.paymentTermId = d.paymentTermId ?? null;
        this.currencyId = d.currencyId ?? null;
        this.fxRate = d.fxRate ?? 1;
        this.poDate = d.poDate ? d.poDate.substring(0, 10) : this.poDate;
        this.deliveryDate = d.deliveryDate ? d.deliveryDate.substring(0, 10) : '';
        this.contactNumber = d.contactNumber ?? '';
        this.remarks = d.remarks ?? '';
        this.gstPct = Number(d.tax ?? d.gstPct ?? 0);
        this.shipping = d.shipping ?? null;
        this.discount = d.discount ?? null;
        this.isOverseas = !!(d.shipping || d.discount || d.incotermsId);
        this.incotermsId = d.incotermsId ?? null;
        this._locationNameFromEdit = d.location ?? d.Location ?? '';
        const locFound = this.locationOptions.find(o => o.label === this._locationNameFromEdit);
        if (locFound) this.locationId = locFound.value;
        this.lines = this.parsePoLines(d.poLines ?? d.PoLines ?? '[]');
        this.loading = false;
        this.markClean();
      },
      error: () => { this.loading = false; }
    });
  }
  */

  loadFromPR(prId: number): void {
    this.loading = true;
    this.svc.getPurchaseRequestById(prId).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.deliveryDate = d.deliveryDate ? d.deliveryDate.substring(0, 10) : '';
        if (!this.sourceType) {
          const prSourceType = d.sourceType ?? d.SourceType ?? '';
          const prSourceRefId = Number(d.sourceRefId ?? d.SourceRefId ?? 0);
          if (prSourceType) this.sourceType = String(prSourceType).toUpperCase();
          if (prSourceRefId) this.sourceRefId = prSourceRefId;
        }
        const rawLines = d.pRLines ?? d.prLines ?? d.PRLines ?? '[]';
        const parsed: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);

        this.lines = parsed.map((l: any) => ({
          ...this.emptyLine(),
          prId,
          prNumber: d.purchaseRequestNo ?? '',
          itemId: l.itemId ?? null,
          itemCode: l.itemCode ?? '',
          itemName: l.itemSearch ?? l.itemName ?? '',
          description: l.remarks ?? '',
          quantity: l.qty ?? l.quantity ?? null,
          uomId: l.uomId ?? null,
          budget: l.budget ?? '',
          remarks: l.remarks ?? ''
        }));

        const firstLine = parsed[0];
        const locName = firstLine?.locationSearch ?? firstLine?.location ?? '';
        if (locName) {
          if (this.locationOptions.length) this.autoSetLocationByName(locName);
          else this._locationNameFromPR = locName;
        }

        this.loading = false;
        this.markClean();

        // Arm the Lines step so the first line's popup auto-opens when the user
        // reaches it (lets them fill in unit price / tax right away).
        if (this.lines.length) this.autoOpenFirstLine = true;
      },
      error: () => { this.loading = false; }
    });
  }

  private tryApplyRfqDraft(): void {
    try {
      const raw = sessionStorage.getItem('rfqPoDraft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.source !== 'RFQ' || !Array.isArray(draft.lines) || !draft.lines.length) return;

      const supplierName = (draft.supplierName || '').trim().toLowerCase();
      const supplier = this.supplierOptions.find(o => (o.label || '').trim().toLowerCase() === supplierName);
      if (supplier) { this.supplierId = supplier.value; this.onSupplierChange(); }

      if (draft.validUntil) this.deliveryDate = draft.validUntil;
      this.remarks = `Created from RFQ: ${draft.supplierName || 'selected supplier'}`;

      this.lines = draft.lines.map((l: any) => {
        const itemCode = (l.itemCode || l.item || '').split(' - ')[0].trim().toLowerCase();
        const found = this.itemOptions.find(o => (o.raw?.itemCode ?? '').toLowerCase() === itemCode);
        const line = this.emptyLine();
        line.prNumber = 'RFQ';
        line.itemId = found?.value ?? null;
        line.itemCode = found?.raw?.itemCode ?? l.itemCode ?? '';
        line.itemName = found?.raw?.itemName ?? l.itemName ?? l.item ?? '';
        line.description = l.description ?? line.itemName;
        line.quantity = Number(l.qty || 0) || null;
        line.unitPrice = Number(l.price || 0) || null;
        this.recalcLine(line);
        return line;
      });

      sessionStorage.removeItem('rfqPoDraft');
      Swal.fire({ icon: 'success', title: 'RFQ Loaded', text: 'Supplier and quote lines loaded from RFQ winner.', timer: 2500, showConfirmButton: false });
    } catch {}
  }

  private computeHash(): string {
    return JSON.stringify({
      supplierId: this.supplierId,
      paymentTermId: this.paymentTermId,
      currencyId: this.currencyId,
      fxRate: this.fxRate,
      poDate: this.poDate,
      deliveryDate: this.deliveryDate,
      locationId: this.locationId,
      remarks: this.remarks,
      isOverseas: this.isOverseas,
      incotermsId: this.incotermsId,
      shipping: this.shipping,
      discount: this.discount,
      lines: this.lines
    });
  }
  private markClean(): void { this.cleanHash = this.computeHash(); }
  get isDirty(): boolean { return this.computeHash() !== this.cleanHash; }

  onSupplierChange(): void {
    const found = this.supplierOptions.find(o => o.value === this.supplierId);
    if (!found?.raw) return;
    const s = found.raw;
    // Supplier record exposes the payment terms as `termsId` (Suppliers.TermsId);
    // keep the older aliases as fallbacks in case the API shape changes.
    const supplierTermId = s.termsId ?? s.TermsId ?? s.paymentTermId ?? s.paymentTermsId;
    if (supplierTermId) this.paymentTermId = supplierTermId;
    if (s.currencyId) { this.currencyId = s.currencyId; this.onCurrencyChange(); }
    if (s.incotermsId) this.incotermsId = s.incotermsId;
    const countryId = Number(s.countryId ?? s.CountryId ?? 0);
    this.supplierCountryId = countryId || null;
    if (countryId) {
      this.svc.getCountryById(countryId).subscribe({
        next: (res: any) => {
          const country = this.svc.unwrapOne(res);
          const gst = Number(country?.gSTPercentage ?? country?.gstPercentage ?? country?.GSTPercentage ?? 0);
          this.applyTaxDecision(gst);
        },
        error: () => this.applyTaxDecision(this.gstPct)
      });
      return;
    }
    this.applyTaxDecision(this.gstPct);
  }

  onCurrencyChange(): void {
    const baseCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    const decision = this.taxDecisionSvc.decide({
      companyCountryId: this.companyCountryId,
      partnerCountryId: this.supplierCountryId,
      companyCurrencyId: baseCurrencyId,
      documentCurrencyId: this.currencyId,
      defaultTaxRate: this.gstPct,
      preferredTaxMode: this.companyTaxMode
    });
    this.isOverseas = decision.isOverseas;
    if (!this.currencyId || !baseCurrencyId || this.currencyId === baseCurrencyId) {
      this.fxRate = 1;
      this.applyTaxDecision(this.gstPct);
      return;
    }
    // Use the document (PO) date so re-opened orders keep their historical rate.
    const rateDate = this.poDate || new Date().toISOString().substring(0, 10);
    this.svc.getExchangeRate(this.currencyId, baseCurrencyId, rateDate).subscribe({
      next: (res: any) => {
        const rate = res?.data?.rate ?? res?.data?.exchangeRate ?? res?.rate ?? res?.exchangeRate ?? (typeof res === 'number' ? res : null);
        if (rate && Number(rate) > 0) this.fxRate = Number(rate);
      },
      error: () => {}
    });
    this.applyTaxDecision(this.gstPct);
  }

  onOverseasToggle(): void {
    this.isOverseas = !this.isOverseas;
    if (!this.isOverseas) {
      this.incotermsId = null;
      this.shipping = null;
      this.discount = null;
    }
  }

  onGstPctChange(): void {
    this.lines.forEach(l => {
      l.taxRate = this.gstPct ?? 0;
      if (this.defaultLineTaxMode === 'ZeroRated' && l.taxMode !== 'Inclusive') l.taxMode = 'ZeroRated';
      if (this.defaultLineTaxMode === 'Exclusive' && l.taxMode === 'ZeroRated') l.taxMode = 'Exclusive';
      if (this.defaultLineTaxMode === 'Inclusive' && l.taxMode !== 'ZeroRated') l.taxMode = 'Inclusive';
      this.recalcLine(l);
    });
    if (this.showModal) {
      this.modalLine.taxRate = this.gstPct ?? 0;
      if (this.defaultLineTaxMode === 'ZeroRated' && this.modalLine.taxMode !== 'Inclusive') this.modalLine.taxMode = 'ZeroRated';
      if (this.defaultLineTaxMode === 'Exclusive' && this.modalLine.taxMode === 'ZeroRated') this.modalLine.taxMode = 'Exclusive';
      if (this.defaultLineTaxMode === 'Inclusive' && this.modalLine.taxMode !== 'ZeroRated') this.modalLine.taxMode = 'Inclusive';
      this.recalcLine(this.modalLine);
    }
  }

  private applyTaxDecision(defaultTaxRate: number): void {
    const baseCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    const decision = this.taxDecisionSvc.decide({
      companyCountryId: this.companyCountryId,
      partnerCountryId: this.supplierCountryId,
      companyCurrencyId: baseCurrencyId,
      documentCurrencyId: this.currencyId,
      defaultTaxRate,
      preferredTaxMode: this.companyTaxMode
    });
    this.isOverseas = decision.isOverseas;
    // GST % always reflects the supplier country's tax rate, even for overseas
    // orders — the decision's zero-rating is not applied to the displayed rate.
    const rate = Math.max(0, Number(defaultTaxRate || 0));
    this.gstPct = rate;
    // Honour the company tax mode (Exclusive/Inclusive/ZeroRated) instead of forcing Exclusive.
    this.defaultLineTaxMode = decision.taxMode;
    this.onGstPctChange();
  }

  onLocationChange(): void {
    const found = this.locationOptions.find(o => o.value === this.locationId);
    if (found?.raw?.contactNumber) this.contactNumber = found.raw.contactNumber;
  }

  private autoSetLocationByName(name: string): void {
    if (!name) return;
    const found = this.locationOptions.find(o => (o.label || '').toLowerCase() === name.toLowerCase());
    if (!found) return;
    this.locationId = found.value;
    if (!this.contactNumber && found.raw?.contactNumber) this.contactNumber = found.raw.contactNumber;
  }

  get lockHeaderByPR(): boolean {
    return !!(this.fromPrId || this.fromReorderPrId || this.fromAlertPrId) && this.lines.length > 0;
  }

  openAddLine(): void {
    this.editingIndex = null;
    this.modalLine = this.emptyLine();
    this.modalLine.taxMode = this.defaultLineTaxMode;
    this.modalLine.taxRate = this.gstPct > 0 ? this.gstPct : 0;
    this.error = '';
    this.showModal = true;
  }

  editLine(i: number): void {
    this.editingIndex = i;
    this.modalLine = { ...this.lines[i] };
    this.error = '';
    this.showModal = true;
  }

  closeModal(): void { this.showModal = false; this.editingIndex = null; this.error = ''; }

  onModalItemChange(): void {
    const found = this.itemOptions.find(o => o.value === this.modalLine.itemId);
    if (!found?.raw) return;
    this.modalLine.itemCode = found.raw.itemCode ?? '';
    this.modalLine.itemName = found.raw.itemName ?? found.label;
    if (!this.modalLine.description) this.modalLine.description = found.raw.description ?? '';
    if (found.raw.uomId) this.modalLine.uomId = found.raw.uomId;
    if (!this.modalLine.taxMode) this.modalLine.taxMode = this.defaultLineTaxMode;
    if (this.supplierId) {
      this.svc.getItemSupplierPrices(this.modalLine.itemId!).subscribe(res => {
        const prices = this.svc.unwrap(res);
        const match = prices.find((p: any) => p.supplierId === this.supplierId);
        if (match) {
          this.modalLine.unitPrice = match.unitPrice ?? match.price;
          this.recalcLine(this.modalLine);
        }
      });
    }
  }

  onTaxModeChange(): void {
    this.modalLine.taxRate = this.modalLine.taxMode === 'ZeroRated' ? 0 : (this.gstPct ?? 0);
    this.recalcLine(this.modalLine);
  }

  onModalPrChange(): void {
    const found = this.availablePROptions.find(o => o.value === this.modalLine.prId);
    if (!found) { this.modalLine.prNumber = ''; return; }
    this.modalLine.prNumber = found.raw?.purchaseRequestNo ?? '';

    if (this.editingIndex !== null) return;

    this.svc.getPurchaseRequestById(this.modalLine.prId!).subscribe({
      next: (res: any) => {
        const pr = this.svc.unwrapOne(res);
        const rawLines = pr?.pRLines ?? pr?.PRLines ?? pr?.prLines ?? '[]';
        const lines: any[] = typeof rawLines === 'string' ? JSON.parse(rawLines || '[]') : (Array.isArray(rawLines) ? rawLines : []);
        if (!lines.length) return;
        const first = lines[0];
        const itemId = first.itemId ?? null;
        const itemOpt = this.itemOptions.find(o => o.value === itemId);
        this.modalLine.itemId = itemId;
        this.modalLine.itemCode = first.itemCode ?? itemOpt?.raw?.itemCode ?? '';
        this.modalLine.itemName = first.itemSearch ?? first.itemName ?? itemOpt?.raw?.itemName ?? '';
        this.modalLine.description = first.remarks ?? first.description ?? '';
        this.modalLine.quantity = first.qty ?? first.quantity ?? null;
        this.modalLine.uomId = first.uomId ?? null;
        this.recalcModal();
      }
    });
  }

  onModalBudgetChange(): void {
    const found = this.budgetOptions.find(o => o.value === this.modalLine.budgetId);
    if (found) this.modalLine.budget = found.label;
  }

  recalcModal(): void {
    this.modalLine.taxRate = this.gstPct ?? 0;
    if (this.defaultLineTaxMode === 'ZeroRated' && this.modalLine.taxMode !== 'Inclusive') this.modalLine.taxMode = 'ZeroRated';
    this.recalcLine(this.modalLine);
  }

  saveModal(): void {
    this.error = '';
    const isPRLineEdit = this.editingIndex !== null && this.modalLine.prId !== null;
    if (!isPRLineEdit && !this.modalLine.itemId) { this.error = 'Please select an Item.'; return; }
    if (isPRLineEdit && !this.modalLine.itemName) { this.error = 'Item name is missing.'; return; }
    if (!this.modalLine.quantity || (this.modalLine.quantity ?? 0) <= 0) { this.error = 'Please enter a valid Quantity.'; return; }
    if (!this.modalLine.unitPrice || (this.modalLine.unitPrice ?? 0) <= 0) { this.error = 'Please enter a Unit Price.'; return; }
    this.recalcLine(this.modalLine);
    if (this.editingIndex !== null) this.lines[this.editingIndex] = { ...this.modalLine };
    else this.lines.push({ ...this.modalLine });
    this.closeModal();
  }

  addAndContinue(): void {
    this.error = '';
    if (!this.modalLine.itemId) { this.error = 'Please select an Item.'; return; }
    if (!this.modalLine.quantity || (this.modalLine.quantity ?? 0) <= 0) { this.error = 'Please enter a valid Quantity.'; return; }
    if (!this.modalLine.unitPrice || (this.modalLine.unitPrice ?? 0) <= 0) { this.error = 'Please enter a Unit Price.'; return; }
    this.recalcLine(this.modalLine);
    this.lines.push({ ...this.modalLine });
    this.modalLine = this.emptyLine();
    this.modalLine.taxMode = this.defaultLineTaxMode;
    if (this.gstPct > 0) this.modalLine.taxRate = this.gstPct;
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  viewLineDetail(line: POLine): void {
    const rows: [string, any][] = [
      ['PR No', line.prNumber],
      ['Item Code', line.itemCode],
      ['Item', line.itemName],
      ['Description', line.description],
      ['Qty', line.quantity],
      ['Unit Price', line.unitPrice],
      ['Discount %', line.discountPct],
      ['Tax Mode', line.taxMode],
      ['Tax Rate %', line.taxRate ? `${line.taxRate}%` : null],
      ['Tax Amt', line.taxAmt?.toFixed(2)],
      ['Line Total', line.lineTotal?.toFixed(2)],
      ['Budget', line.budget],
      ['Remarks', line.remarks]
    ];
    const html = rows.filter(([, v]) => v != null && v !== '' && v !== '—')
      .map(([k, v]) => `<tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;font-weight:600;white-space:nowrap;text-align:left;border-bottom:1px solid #f1f5f9">${k}</td><td style="padding:5px 12px;font-size:12px;text-align:left;border-bottom:1px solid #f1f5f9">${v}</td></tr>`).join('');
    Swal.fire({ title: line.itemName || 'Line Detail', html: `<table style="width:100%;border-collapse:collapse">${html}</table>`, confirmButtonColor: '#16a34a', width: 500, showCloseButton: true });
  }

  recalcLine(line: POLine): void {
    const base = (line.quantity ?? 0) * (line.unitPrice ?? 0) * (1 - (line.discountPct ?? 0) / 100);
    if (line.taxMode === 'Inclusive') {
      line.taxAmt = +(base - base / (1 + line.taxRate / 100)).toFixed(4);
      line.lineTotal = +base.toFixed(4);
    } else if (line.taxMode === 'ZeroRated' || !line.taxRate) {
      line.taxAmt = 0;
      line.lineTotal = +base.toFixed(4);
    } else {
      line.taxAmt = +(base * (line.taxRate / 100)).toFixed(4);
      line.lineTotal = +(base + line.taxAmt).toFixed(4);
    }
  }

  poGo(step: number): void {
    this.error = '';
    const next = this.poStep + step;
    if (step > 0) {
      if (this.poStep === 0) {
        if (!this.supplierId) { this.error = 'Please select a Supplier.'; return; }
        if (!this.deliveryDate) { this.error = 'Please set a Delivery Date.'; return; }
      } else if (this.poStep === 1) {
        if (!this.lines.length) { this.error = 'Please add at least one line item.'; return; }
        const invalid = this.lines.some(l => (!l.itemId && !l.itemName) || !l.quantity || (l.quantity ?? 0) <= 0);
        if (invalid) { this.error = 'Each line requires an Item and Quantity > 0.'; return; }
        const missingPrice = this.lines.some(l => !l.unitPrice || (l.unitPrice ?? 0) <= 0);
        if (missingPrice) { this.error = 'Each line requires a Unit Price > 0.'; return; }
      }
    }
    this.poStep = Math.max(0, Math.min(next, this.poSteps.length - 1));

    // On first arrival at the Lines step (from a PR), open the first line's popup.
    if (this.poStep === 1 && this.autoOpenFirstLine && this.lines.length) {
      this.autoOpenFirstLine = false;
      setTimeout(() => this.editLine(0));
    }
  }

  get subTotal(): number { return this.lines.reduce((s, l) => s + (l.quantity ?? 0) * (l.unitPrice ?? 0), 0); }
  get lineDiscountTotal(): number { return this.lines.reduce((s, l) => s + (l.quantity ?? 0) * (l.unitPrice ?? 0) * ((l.discountPct ?? 0) / 100), 0); }
  get totalLineTax(): number { return this.lines.reduce((s, l) => s + (l.taxAmt ?? 0), 0); }
  get lineGrandTotal(): number { return this.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0); }
  get shippingWithTax(): number {
    const ship = this.shipping ?? 0;
    return +(ship + ship * (this.gstPct / 100)).toFixed(2);
  }
  get netTotal(): number {
    const shipCost = this.isOverseas ? this.shippingWithTax : 0;
    return +(this.lineGrandTotal - (this.discount ?? 0) + shipCost).toFixed(2);
  }
  get showNetTotalBase(): boolean {
    const baseCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    return !!this.currencyId && !!baseCurrencyId && this.currencyId !== baseCurrencyId;
  }
  get netTotalBase(): number { return +(this.netTotal * (this.fxRate ?? 1)).toFixed(2); }
  get approvalStatusLabel(): string { return STATUS_MAP[this.approvalStatus] ?? 'Pending'; }

  getCurrencyCode(): string {
    if (!this.currencyId) return '';
    const opt = this.currencyOptions.find(o => o.value === this.currencyId);
    return (opt?.label ?? '').split(' - ')[0].trim() || '';
  }

  getLabel(opts: any[], val: any): string { return opts.find(o => o.value === val)?.label ?? '—'; }

  taxModeLabel(mode: string): string { return this.taxModeOptions.find(o => o.value === mode)?.label ?? mode ?? '—'; }

  private resolvePurchaseOrderNo(): string {
    const current = (this.purchaseOrderNo || '').trim();
    if (this.isEdit && current) return current;
    if (!current || current === this.suggestedPoNo) {
      this.purchaseOrderNo = this.docNoSvc.reserveNextNumber('PO', this.companyId || undefined);
      return this.purchaseOrderNo;
    }
    return current;
  }

  private buildPayload(statusOverride?: number): any {
    const finalPoNo = this.resolvePurchaseOrderNo();
    const locationName = this.getLabel(this.locationOptions, this.locationId);
    const poLinesData = this.lines.map(l => ({
      __fromPR: !!l.prNumber,
      prNo: l.prNumber,
      prId: l.prId ?? null,
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemSearch: l.itemName,
      description: l.description,
      qty: l.quantity,
      uomId: l.uomId,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct ?? 0,
      taxCodeId: l.taxCodeId,
      taxRate: l.taxRate,
      taxMode: l.taxMode,
      taxAmt: l.taxAmt,
      lineTotal: l.lineTotal,
      budgetId: l.budgetId,
      budget: l.budget,
      remarks: l.remarks
    }));
    return {
      SupplierId: this.supplierId,
      PaymentTermId: this.paymentTermId ?? 0,
      CurrencyId: this.currencyId ?? 0,
      IncotermsId: this.incotermsId ?? 0,
      ApprovalStatus: statusOverride ?? this.approvalStatus,
      FxRate: this.fxRate ?? 1,
      PoDate: this.poDate,
      DeliveryDate: this.deliveryDate,
      Location: locationName,
      ContactNumber: this.contactNumber,
      Remarks: this.remarks,
      Tax: this.gstPct ?? 0,
      Shipping: this.shipping ?? 0,
      Discount: this.discount ?? 0,
      SubTotal: +this.lineGrandTotal.toFixed(2),
      NetTotal: this.netTotal,
      PoLines: JSON.stringify(poLinesData),
      PurchaseOrderNo: finalPoNo,
      IsActive: true,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0,
      SourceType: this.sourceType || null,
      SourceRefId: this.sourceRefId || null
    };
  }

  /* DRAFT DISABLED
  saveDraft(): void {
    this.saving = true;
    this.error = '';
    const payload = { ...this.buildPayload(0), ApprovalStatus: 0 };
    const obs$ = this.draftId
      ? this.svc.updatePurchaseOrderDraft({ Id: this.draftId, ...payload })
      : this.svc.createPurchaseOrderDraft(payload);
    obs$.subscribe({
      next: () => {
        this.saving = false;
        this.markClean();
        Swal.fire({ icon: 'success', title: 'Saved!', text: 'Purchase order saved as draft.', confirmButtonColor: '#16a34a' }).then(() => this.goToList());
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message ?? 'Draft save failed.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'Draft save failed.', confirmButtonColor: '#16a34a' });
      }
    });
  }
  */

  submit(): void {
    this.error = '';
    this.saving = true;
    this.svc.checkPeriodLock(this.poDate).subscribe({
      next: (res: any) => {
        const d = res?.data ?? res ?? {};
        if (d.isClosed || d.IsClosed || d.status === 'Closed' || d.Status === 'Closed') {
          this.saving = false;
          this.error = `Accounting period for ${this.poDate} is closed. Please contact Finance.`;
          return;
        }
        this.doSubmit();
      },
      error: () => this.doSubmit()
    });
  }

  private doSubmit(): void {
    const payload = this.buildPayload();
    const obs$ = this.isEdit
      ? this.svc.updatePurchaseOrder({ Id: this.id, ...payload })
      : this.svc.createPurchaseOrder(payload);
    obs$.subscribe({
      next: (res: any) => {
        this.saving = false;
        this.markClean();
        // DRAFT DISABLED: if (this.draftId) this.svc.deletePurchaseOrderDraft(this.draftId).subscribe({ error: () => {} });
        const savedId = this.id ?? this.svc.unwrapOne(res)?.id ?? this.svc.unwrapOne(res)?.iD ?? null;
        if (savedId) this.svc.updateSoProcurementByPO(Number(savedId), 2).subscribe({ error: () => {} });
        Swal.fire({ icon: 'success', title: 'Submitted!', text: this.isEdit ? 'Purchase order updated.' : 'Purchase order submitted for approval.', confirmButtonColor: '#16a34a' })
          .then(() => this.goToList());
      },
      error: (err: any) => {
        this.saving = false;
        this.error = err?.error?.message ?? 'Save failed. Please try again.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'Save failed. Please try again.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  approve(status: 2 | 3): void {
    if (!this.id) return;
    const action = status === 2 ? 'Approve' : 'Reject';
    Swal.fire({
      title: `${action} PO?`,
      text: `${action} purchase order ${this.purchaseOrderNo}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: action,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626'
    }).then(r => {
      if (!r.isConfirmed) return;
      this.saving = true;
      this.error = '';
      const req$ = status === 2
        ? this.svc.approvePurchaseOrder(this.id!, this.netTotal)
        : this.svc.rejectPurchaseOrder(this.id!, this.netTotal);
      req$.subscribe({
        next: () => {
          this.saving = false;
          this.approvalStatus = status;
          Swal.fire({ icon: status === 2 ? 'success' : 'info', title: status === 2 ? 'Approved!' : 'Rejected', text: `PO ${status === 2 ? 'approved' : 'rejected'} successfully.`, confirmButtonColor: '#16a34a' });
        },
        error: (err: any) => {
          this.saving = false;
          this.error = err?.error?.message ?? `${action} failed.`;
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? `${action} failed.`, confirmButtonColor: '#16a34a' });
        }
      });
    });
  }

  async back(): Promise<void> {
    /* DRAFT DISABLED
    if (!this.isEdit && this.isDirty) {
      const result = await Swal.fire({
        icon: 'question',
        title: 'Leave this page?',
        text: 'You have unsaved changes. Save as draft before leaving?',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Save as Draft',
        denyButtonText: 'Discard',
        cancelButtonText: 'Stay',
        confirmButtonColor: '#16a34a'
      });
      if (result.isConfirmed) { this.saveDraft(); return; }
      if (result.isDenied) { this.goToList(); }
      return;
    }
    */
    this.goToList();
  }

  private goToList(): void { this.router.navigate(['/app/purchase/orders']); }

  get title(): string {
    if (this.isEdit) return `Edit PO${this.purchaseOrderNo ? ' - ' + this.purchaseOrderNo : ''}`;
    // if (this.draftId) return 'Edit PO Draft'; // DRAFT DISABLED
    if (this.fromPrId || this.fromReorderPrId || this.fromAlertPrId) return 'New PO from PR';
    return 'New Purchase Order';
  }
}
