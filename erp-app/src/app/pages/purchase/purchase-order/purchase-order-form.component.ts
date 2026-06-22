import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

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
  isEdit = false;
  id: number | null = null;
  draftId: number | null = null;
  fromPrId: number | null = null;
  loading = false;
  saving = false;
  error = '';
  success = '';

  // Header
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

  // Lines
  lines: POLine[] = [];

  // Dropdowns
  supplierOptions: any[] = [];
  paymentTermOptions: any[] = [];
  currencyOptions: any[] = [];
  incotermOptions: any[] = [];
  itemOptions: any[] = [];
  uomOptions: any[] = [];
  locationOptions: any[] = [];
  taxCodeOptions: any[] = [];
  availablePROptions: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || null;
  private _locationNameFromEdit = '';

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    const draftParam = this.route.snapshot.queryParamMap.get('draftId');
    const fromPR = this.route.snapshot.queryParamMap.get('fromPR');
    this.isEdit = !!paramId && paramId !== 'new';
    this.loadLookups();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else if (draftParam) { this.draftId = Number(draftParam); this.loadFromDraft(); }
    else if (fromPR) { this.fromPrId = Number(fromPR); this.loadFromPR(this.fromPrId); }
    else { this.addLine(); }
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
    this.svc.getUOMs().subscribe(r =>
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.uomName ?? u.name, value: u.id
      })));
    this.svc.getLocations().subscribe(r => {
      this.locationOptions = this.svc.unwrap(r).map((l: any) => ({
        label: l.locationName ?? l.name, value: l.id
      }));
      if (this._locationNameFromEdit) {
        const found = this.locationOptions.find(o => o.label === this._locationNameFromEdit);
        if (found) this.locationId = found.value;
      }
    });
    this.svc.getTaxCodes().subscribe(r =>
      this.taxCodeOptions = this.svc.unwrap(r).map((t: any) => {
        const code = t.taxCode ?? t.code ?? t.taxName ?? t.name ?? '';
        const rate = Number(t.taxRate ?? t.rate ?? t.percentage ?? 0);
        const mode = t.taxMode ?? t.mode ?? t.taxType ?? 'Exclusive';
        const modeLabel = mode === 'Inclusive' ? 'Incl' : mode === 'ZeroRated' || mode === 'Zero Rated' ? 'Zero' : 'Excl';
        return { label: `${code} (${rate}% ${modeLabel})`, value: t.id ?? t.iD, raw: t };
      }));
    this.svc.getAvailablePurchaseRequests().subscribe(r =>
      this.availablePROptions = this.svc.unwrap(r).map((pr: any) => ({
        label: `${pr.purchaseRequestNo} - ${pr.requester ?? ''}`, value: pr.id, raw: pr
      })));
  }

  private parsePoLines(raw: any): POLine[] {
    const parsed: any[] = typeof raw === 'string'
      ? JSON.parse(raw || '[]')
      : (Array.isArray(raw) ? raw : []);
    return parsed.map((l: any) => {
      const line: POLine = {
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
        taxMode: l.taxMode ?? 'Exclusive',
        taxAmt: Number(l.taxAmt ?? 0),
        lineTotal: Number(l.lineTotal ?? 0),
        remarks: l.remarks ?? ''
      };
      return line;
    });
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
        if (!this.lines.length) this.addLine();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

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
        if (!this.lines.length) this.addLine();
        this.loading = false;
      },
      error: () => { this.loading = false; this.addLine(); }
    });
  }

  loadFromPR(prId: number): void {
    this.loading = true;
    this.svc.getPurchaseRequestById(prId).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.deliveryDate = d.deliveryDate ? d.deliveryDate.substring(0, 10) : '';
        const rawLines = d.pRLines ?? d.prLines ?? d.PRLines ?? '[]';
        const parsed: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);
        this.lines = parsed.map((l: any) => ({
          prId: prId, prNumber: d.purchaseRequestNo ?? '',
          itemId: l.itemId ?? null, itemCode: l.itemCode ?? '',
          itemName: l.itemSearch ?? l.itemName ?? '',
          description: l.remarks ?? '',
          quantity: l.qty ?? l.quantity ?? null,
          uomId: l.uomId ?? null, unitPrice: null, discountPct: null,
          taxCodeId: null, taxRate: 0, taxMode: 'Exclusive', taxAmt: 0, lineTotal: 0,
          remarks: l.remarks ?? ''
        }));
        if (!this.lines.length) this.addLine();
        this.loading = false;
      },
      error: () => { this.loading = false; this.addLine(); }
    });
  }

  onSupplierChange(): void {
    const found = this.supplierOptions.find(o => o.value === this.supplierId);
    if (found?.raw) {
      const s = found.raw;
      if (s.paymentTermId) this.paymentTermId = s.paymentTermId;
      if (s.currencyId) { this.currencyId = s.currencyId; this.onCurrencyChange(); }
      if (s.incotermsId) this.incotermsId = s.incotermsId;
      this.gstPct = Number(s.taxRate ?? s.gstPercentage ?? s.tax ?? s.gstRate ?? 0);
    }
  }

  onCurrencyChange(): void {
    const baseCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    if (!this.currencyId || !baseCurrencyId || this.currencyId === baseCurrencyId) {
      this.fxRate = 1;
      this.isOverseas = false;
      return;
    }
    this.isOverseas = true;
    const today = new Date().toISOString().substring(0, 10);
    this.svc.getExchangeRate(this.currencyId, baseCurrencyId, today).subscribe({
      next: (res: any) => {
        const rate = res?.data?.rate ?? res?.data?.exchangeRate ?? res?.rate ?? res?.exchangeRate ?? (typeof res === 'number' ? res : null);
        if (rate && Number(rate) > 0) this.fxRate = Number(rate);
      },
      error: () => {}
    });
  }

  addLine(): void {
    this.lines.push({
      prId: null, prNumber: '',
      itemId: null, itemCode: '', itemName: '', description: '',
      quantity: null, uomId: null, unitPrice: null,
      discountPct: null, taxCodeId: null,
      taxRate: 0, taxMode: 'Exclusive', taxAmt: 0, lineTotal: 0,
      remarks: ''
    });
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  onPrSelect(line: POLine): void {
    const found = this.availablePROptions.find(o => o.value === line.prId);
    if (found?.raw) line.prNumber = found.raw.purchaseRequestNo ?? '';
  }

  onTaxCodeSelect(line: POLine): void {
    const found = this.taxCodeOptions.find(o => o.value === line.taxCodeId);
    if (found?.raw) {
      line.taxRate = Number(found.raw.taxRate ?? found.raw.rate ?? found.raw.percentage ?? 0);
      const raw = found.raw.taxMode ?? found.raw.mode ?? found.raw.taxType ?? 'Exclusive';
      line.taxMode = (raw === 'Zero Rated' || raw === 'ZeroRated') ? 'ZeroRated'
                   : raw === 'Inclusive' ? 'Inclusive' : 'Exclusive';
    }
    this.recalcLine(line);
  }

  recalcLine(line: POLine): void {
    const base = (line.quantity ?? 0) * (line.unitPrice ?? 0) * (1 - (line.discountPct ?? 0) / 100);
    if (line.taxMode === 'Inclusive') {
      line.taxAmt  = +(base - base / (1 + line.taxRate / 100)).toFixed(4);
      line.lineTotal = +base.toFixed(4);
    } else if (line.taxMode === 'ZeroRated' || !line.taxRate) {
      line.taxAmt  = 0;
      line.lineTotal = +base.toFixed(4);
    } else {
      line.taxAmt  = +(base * (line.taxRate / 100)).toFixed(4);
      line.lineTotal = +(base + line.taxAmt).toFixed(4);
    }
  }

  onItemSelect(line: POLine): void {
    const found = this.itemOptions.find(o => o.value === line.itemId);
    if (found?.raw) {
      line.itemCode = found.raw.itemCode ?? '';
      line.itemName = found.raw.itemName ?? found.label;
      if (!line.description) line.description = found.raw.description ?? '';
      if (found.raw.uomId) line.uomId = found.raw.uomId;
      if (this.supplierId) {
        this.svc.getItemSupplierPrices(line.itemId!).subscribe(res => {
          const prices = this.svc.unwrap(res);
          const match = prices.find((p: any) => p.supplierId === this.supplierId);
          if (match) { line.unitPrice = match.unitPrice ?? match.price; this.recalcLine(line); }
        });
      }
    }
  }

  // ── Totals ────────────────────────────────────────────────────
  get subTotal(): number {
    return this.lines.reduce((s, l) => s + (l.quantity ?? 0) * (l.unitPrice ?? 0), 0);
  }

  get lineDiscountTotal(): number {
    return this.lines.reduce((s, l) => s + (l.quantity ?? 0) * (l.unitPrice ?? 0) * ((l.discountPct ?? 0) / 100), 0);
  }

  get totalLineTax(): number {
    return this.lines.reduce((s, l) => s + (l.taxAmt ?? 0), 0);
  }

  get lineGrandTotal(): number {
    return this.lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  }

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

  get netTotalBase(): number {
    return +(this.netTotal * (this.fxRate ?? 1)).toFixed(2);
  }

  get approvalStatusLabel(): string { return STATUS_MAP[this.approvalStatus] ?? 'Pending'; }

  getCurrencyCode(): string {
    if (!this.currencyId) return 'SGD';
    const opt = this.currencyOptions.find(o => o.value === this.currencyId);
    return (opt?.label ?? 'SGD').split(' - ')[0].trim() || 'SGD';
  }

  validate(): boolean {
    if (!this.supplierId) { this.error = 'Please select a Supplier.'; return false; }
    if (!this.deliveryDate) { this.error = 'Please set a Delivery Date.'; return false; }
    if (!this.lines.length) { this.error = 'Please add at least one line item.'; return false; }
    const hasInvalid = this.lines.some(l => !l.itemId || !l.quantity || (l.quantity ?? 0) <= 0);
    if (hasInvalid) { this.error = 'Each line needs an Item and Quantity > 0.'; return false; }
    return true;
  }

  private buildPayload(statusOverride?: number): any {
    const locationName = this.getLabel(this.locationOptions, this.locationId);
    const poLinesData = this.lines.map(l => ({
      prNo: l.prNumber,
      __fromPR: !!l.prId,
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
      PurchaseOrderNo: this.purchaseOrderNo || 'PO-00000',
      IsActive: true,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0
    };
  }

  saveDraft(): void {
    this.saving = true;
    this.error = '';
    const payload = { ...this.buildPayload(0), ApprovalStatus: 0 };
    const obs$ = this.draftId
      ? this.svc.updatePurchaseOrderDraft({ Id: this.draftId, ...payload })
      : this.svc.createPurchaseOrderDraft(payload);
    obs$.subscribe({
      next: () => { this.saving = false; Swal.fire('Saved', 'Purchase order saved as draft.', 'success').then(() => this.back()); },
      error: (err: any) => { this.saving = false; this.error = err?.error?.message ?? 'Draft save failed.'; }
    });
  }

  submit(): void {
    this.error = '';
    if (!this.validate()) return;
    this.saving = true;
    this.success = '';
    this.svc.checkPeriodLock(this.poDate).subscribe({
      next: (res: any) => {
        const d = res?.data ?? res ?? {};
        if (d.isClosed || d.IsClosed || d.status === 'Closed' || d.Status === 'Closed') {
          this.saving = false;
          this.error = `The accounting period for ${this.poDate} is closed. Please contact Finance.`;
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
      next: () => {
        this.saving = false;
        if (this.draftId) this.svc.deletePurchaseOrderDraft(this.draftId).subscribe({ error: () => {} });
        Swal.fire('Submitted!', this.isEdit ? 'Purchase order updated.' : 'Purchase order submitted for approval.', 'success').then(() => this.back());
      },
      error: (err: any) => { this.saving = false; this.error = err?.error?.message ?? 'Save failed. Please try again.'; }
    });
  }

  approve(status: 2 | 3): void {
    if (!this.id) return;
    const action = status === 2 ? 'Approve' : 'Reject';
    const color  = status === 2 ? '#22c55e' : '#ef4444';
    Swal.fire({ title: `${action} PO?`, text: `${action} purchase order ${this.purchaseOrderNo}?`, icon: 'question', showCancelButton: true, confirmButtonText: action, confirmButtonColor: color })
      .then(r => { if (!r.isConfirmed) return;
        this.saving = true; this.error = ''; this.success = '';
        const req$ = status === 2
          ? this.svc.approvePurchaseOrder(this.id!, this.netTotal)
          : this.svc.rejectPurchaseOrder(this.id!, this.netTotal);
        req$.subscribe({
          next: () => {
            this.saving = false; this.approvalStatus = status;
            Swal.fire(status === 2 ? 'Approved!' : 'Rejected', `PO ${status === 2 ? 'approved' : 'rejected'} successfully.`, status === 2 ? 'success' : 'info');
          },
          error: (err: any) => { this.saving = false; this.error = err?.error?.message ?? `${action} failed.`; }
        });
      });
  }

  back(): void { this.router.navigate(['/app/purchase/orders']); }
  getLabel(opts: any[], val: any): string { return opts.find(o => o.value === val)?.label ?? ''; }
  get title(): string {
    if (this.isEdit) return `Edit PO${this.purchaseOrderNo ? ' – ' + this.purchaseOrderNo : ''}`;
    if (this.draftId) return 'Edit PO Draft';
    if (this.fromPrId) return 'New PO from PR';
    return 'New Purchase Order';
  }
}
