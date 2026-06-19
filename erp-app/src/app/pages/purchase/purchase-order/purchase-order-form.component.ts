import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';

interface POLine {
  prId: number | null;
  prNumber: string;
  itemId: number | null;
  itemCode: string;
  itemName: string;
  quantity: number | null;
  uomId: number | null;
  unitPrice: number | null;
  discountPct: number | null;
  taxCodeId: number | null;
  budgetLineId: number | null;
  locationId: number | null;
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
  step = 1;
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
  tax: number | null = null;
  shipping: number | null = null;
  discount: number | null = null;
  isOverseas = false;
  incotermsId: number | null = null;
  approvalStatus = 1;

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
  ledgerOptions: any[] = [];
  availablePROptions: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || null;
  companyId = Number(localStorage.getItem('companyId')) || null;

  private _locationNameFromEdit = '';

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    this.loadLookups();
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
        label: `${c.currencyCode} - ${c.currencyName ?? c.name}`, value: c.id
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
      // Reverse-lookup location name → id when loading for edit
      if (this._locationNameFromEdit) {
        const found = this.locationOptions.find(o => o.label === this._locationNameFromEdit);
        if (found) this.locationId = found.value;
      }
    });
    this.svc.getTaxCodes().subscribe(r =>
      this.taxCodeOptions = this.svc.unwrap(r).map((t: any) => ({
        label: `${t.taxCode} (${t.taxRate}%)`, value: t.id
      })));
    this.svc.getChartOfAccounts().subscribe(r =>
      this.ledgerOptions = this.svc.unwrap(r).map((c: any) => ({
        label: `${c.headCode ?? ''} ${c.headName ?? ''}`.trim(), value: c.id
      })));
    this.svc.getAvailablePurchaseRequests().subscribe(r =>
      this.availablePROptions = this.svc.unwrap(r).map((pr: any) => ({
        label: `${pr.purchaseRequestNo} - ${pr.requester ?? ''}`, value: pr.id, raw: pr
      })));
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
        this.tax = d.tax ?? null;
        this.shipping = d.shipping ?? null;
        this.discount = d.discount ?? null;
        this.isOverseas = !!(this.tax || this.shipping || this.discount);
        this.incotermsId = d.incotermsId ?? null;
        this.approvalStatus = d.approvalStatus ?? 1;

        // Location is stored as a string — store name, resolve to id after options load
        this._locationNameFromEdit = d.location ?? d.Location ?? '';
        const locFound = this.locationOptions.find(o => o.label === this._locationNameFromEdit);
        if (locFound) this.locationId = locFound.value;

        // PoLines is stored as a JSON string in the DB
        const rawLines = d.poLines ?? d.PoLines ?? '[]';
        const parsed: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);

        this.lines = parsed.map((l: any) => ({
          prId: l.prId ?? null,
          prNumber: l.prNo ?? l.prNumber ?? '',
          itemId: l.itemId ?? null,
          itemCode: l.itemCode ?? '',
          itemName: l.itemSearch ?? l.itemName ?? '',
          quantity: l.qty ?? l.quantity ?? null,
          uomId: l.uomId ?? null,
          unitPrice: l.unitPrice ?? null,
          discountPct: l.discountPct ?? null,
          taxCodeId: l.taxCodeId ?? null,
          budgetLineId: l.budgetLineId ?? null,
          locationId: l.locationId ?? null,
          remarks: l.remarks ?? ''
        }));

        if (!this.lines.length) this.addLine();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onSupplierChange(): void {
    const found = this.supplierOptions.find(o => o.value === this.supplierId);
    if (found?.raw) {
      const s = found.raw;
      if (s.paymentTermId) this.paymentTermId = s.paymentTermId;
      if (s.currencyId) this.currencyId = s.currencyId;
      if (s.incotermsId) this.incotermsId = s.incotermsId;
    }
  }

  addLine(): void {
    this.lines.push({
      prId: null, prNumber: '',
      itemId: null, itemCode: '', itemName: '',
      quantity: null, uomId: null, unitPrice: null,
      discountPct: null, taxCodeId: null, budgetLineId: null,
      locationId: null, remarks: ''
    });
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  onPrSelect(line: POLine): void {
    const found = this.availablePROptions.find(o => o.value === line.prId);
    if (found?.raw) line.prNumber = found.raw.purchaseRequestNo ?? '';
  }

  onItemSelect(line: POLine): void {
    const found = this.itemOptions.find(o => o.value === line.itemId);
    if (found?.raw) {
      line.itemCode = found.raw.itemCode ?? '';
      line.itemName = found.raw.itemName ?? found.label;
      if (found.raw.uomId) line.uomId = found.raw.uomId;
      if (this.supplierId) {
        this.svc.getItemSupplierPrices(line.itemId!).subscribe(res => {
          const prices = this.svc.unwrap(res);
          const match = prices.find((p: any) => p.supplierId === this.supplierId);
          if (match) line.unitPrice = match.unitPrice ?? match.price;
        });
      }
    }
  }

  get subTotal(): number {
    return this.lines.reduce((sum, l) => {
      const base = (l.quantity ?? 0) * (l.unitPrice ?? 0);
      const disc = base * ((l.discountPct ?? 0) / 100);
      return sum + base - disc;
    }, 0);
  }

  get netTotal(): number {
    return this.subTotal + (this.tax ?? 0) + (this.shipping ?? 0) - (this.discount ?? 0);
  }

  get approvalStatusLabel(): string { return STATUS_MAP[this.approvalStatus] ?? 'Pending'; }

  next(): void {
    if (this.step === 1) {
      if (!this.supplierId) { this.error = 'Please select a Supplier.'; return; }
      if (!this.deliveryDate) { this.error = 'Please set a Delivery Date.'; return; }
      this.error = '';
      if (!this.lines.length) this.addLine();
      this.step = 2;
    } else if (this.step === 2) {
      const invalid = this.lines.some(l => !l.itemId || !l.quantity || (l.quantity ?? 0) <= 0);
      if (invalid) { this.error = 'Each line needs an Item and Quantity > 0.'; return; }
      this.error = '';
      this.step = 3;
    }
  }

  prev(): void { this.step = Math.max(1, this.step - 1); this.error = ''; }

  private buildPayload(statusOverride?: number): any {
    const locationName = this.getLabel(this.locationOptions, this.locationId);
    const poLinesData = this.lines.map(l => ({
      prNo: l.prNumber,
      __fromPR: !!l.prId,
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemSearch: l.itemName,
      qty: l.quantity,
      uomId: l.uomId,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct ?? 0,
      taxCodeId: l.taxCodeId,
      budgetLineId: l.budgetLineId,
      locationId: l.locationId,
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
      Tax: this.tax ?? 0,
      Shipping: this.shipping ?? 0,
      Discount: this.discount ?? 0,
      SubTotal: this.subTotal,
      NetTotal: this.netTotal,
      PoLines: JSON.stringify(poLinesData),
      PurchaseOrderNo: this.purchaseOrderNo || 'PO-00000',
      IsActive: true,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0
    };
  }

  submit(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    const payload = this.buildPayload();

    const obs$ = this.isEdit
      ? this.svc.updatePurchaseOrder({ Id: this.id, ...payload })
      : this.svc.createPurchaseOrder(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed. Please try again.'; }
    });
  }

  approve(status: number): void {
    if (!this.id) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    const payload = { Id: this.id, ...this.buildPayload(status) };
    this.svc.updatePurchaseOrder(payload).subscribe({
      next: () => {
        this.saving = false;
        this.approvalStatus = status;
        this.success = status === 2 ? 'Purchase Order approved.' : 'Purchase Order rejected.';
      },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Update failed.'; }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/orders']); }

  getLabel(opts: any[], val: any): string {
    return opts.find(o => o.value === val)?.label ?? '';
  }

  get title(): string {
    return this.isEdit
      ? `Edit PO${this.purchaseOrderNo ? ' – ' + this.purchaseOrderNo : ''}`
      : 'New Purchase Order';
  }
  get today(): string { return new Date().toISOString().substring(0, 10); }
}
