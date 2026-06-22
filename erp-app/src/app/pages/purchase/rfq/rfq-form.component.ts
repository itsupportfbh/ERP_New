import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

interface RfqLine {
  itemId: number | null;
  itemCode: string;
  itemName: string;
  uomId: number | null;
  quantity: number | null;
  unitPrice: number | null;
  discountPct: number | null;
  taxCodeId: number | null;
  taxMode: 'Exclusive' | 'Inclusive' | 'Zero';
  lineNet: number;
  lineTax: number;
  lineTotal: number;
  description: string;
}

@Component({
  selector: 'erp-rfq-form',
  standalone: false,
  templateUrl: './rfq-form.component.html',
  styleUrls: ['./rfq-form.component.scss']
})
export class RfqFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';
  successMsg = '';

  // Header
  rfqNumber = '';
  supplierId: number | null = null;
  currencyId: number | null = null;
  paymentTermId: number | null = null;
  fxRate: number = 1;
  deliveryDate = '';
  deliveryTo = '';
  remarks = '';
  status = 'Draft';
  needsHodApproval = false;

  // Lines
  items: RfqLine[] = [];

  // Dropdowns
  supplierOptions: any[] = [];
  currencyOptions: any[] = [];
  paymentTermOptions: any[] = [];
  itemOptions: any[] = [];
  uomOptions: any[] = [];
  taxCodeOptions: any[] = [];

  taxModeOptions = [
    { label: 'Exclusive', value: 'Exclusive' },
    { label: 'Inclusive', value: 'Inclusive' },
    { label: 'Zero',      value: 'Zero' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else { this.addItem(); }
    this.loadLookups();
  }

  loadLookups(): void {
    this.svc.getSuppliers().subscribe(r =>
      this.supplierOptions = this.svc.unwrap(r).map((s: any) => ({
        label: s.supplierName ?? s.name, value: s.id
      })));
    this.svc.getCurrencies().subscribe(r =>
      this.currencyOptions = this.svc.unwrap(r).map((c: any) => ({
        label: `${c.currencyCode} - ${c.currencyName ?? c.name}`, value: c.id
      })));
    this.svc.getPaymentTerms().subscribe(r =>
      this.paymentTermOptions = this.svc.unwrap(r).map((p: any) => ({
        label: p.termName ?? p.paymentTermsName ?? p.name, value: p.id
      })));
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: `${i.itemCode ?? ''} - ${i.itemName ?? i.name}`, value: i.id, raw: i
      })));
    this.svc.getUOMs().subscribe(r =>
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.uomName ?? u.name, value: u.id
      })));
    this.svc.getTaxCodes().subscribe(r =>
      this.taxCodeOptions = this.svc.unwrap(r).map((t: any) => ({
        label: `${t.taxCode} (${t.taxRate}%)`, value: t.id, raw: t
      })));
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getRfqById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.rfqNumber = d.number ?? d.rfqNumber ?? '';
        this.supplierId = d.customerId ?? d.supplierId ?? null;
        this.currencyId = d.currencyId ?? null;
        this.paymentTermId = d.paymentTermsId ?? d.paymentTermId ?? null;
        this.fxRate = d.fxRate ?? 1;
        this.deliveryDate = d.deliveryDate ? d.deliveryDate.substring(0, 10) : '';
        this.deliveryTo = d.deliveryTo ?? '';
        this.remarks = d.remarks ?? '';
        this.status = d.status ?? 'Draft';
        this.needsHodApproval = d.needsHodApproval ?? false;
        const lines: any[] = Array.isArray(d.lines) ? d.lines : [];
        this.items = lines.map((l: any) => this.mapLine(l));
        if (!this.items.length) this.addItem();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private mapLine(l: any): RfqLine {
    const qty = l.qty ?? l.quantity ?? 0;
    const price = l.unitPrice ?? 0;
    const disc = l.discountPct ?? 0;
    const lineNet = qty * price * (1 - disc / 100);
    const lineTax = l.taxMode === 'Exclusive' ? (l.lineTax ?? 0) : 0;
    return {
      itemId: l.itemId ?? null,
      itemCode: l.itemCode ?? '',
      itemName: l.itemName ?? l.description ?? '',
      uomId: l.uomId ?? null,
      quantity: qty,
      unitPrice: price,
      discountPct: disc,
      taxCodeId: l.taxCodeId ?? null,
      taxMode: l.taxMode ?? 'Exclusive',
      lineNet: l.lineNet ?? lineNet,
      lineTax: l.lineTax ?? lineTax,
      lineTotal: l.lineTotal ?? (lineNet + lineTax),
      description: l.description ?? ''
    };
  }

  addItem(): void {
    this.items.push({
      itemId: null, itemCode: '', itemName: '',
      uomId: null, quantity: null, unitPrice: null, discountPct: null,
      taxCodeId: null, taxMode: 'Exclusive',
      lineNet: 0, lineTax: 0, lineTotal: 0, description: ''
    });
  }

  removeItem(i: number): void { this.items.splice(i, 1); }

  onCurrencyChange(): void {
    const baseCurrencyId = Number(localStorage.getItem('companyCurrencyId') || 0);
    if (!this.currencyId || !baseCurrencyId || this.currencyId === baseCurrencyId) {
      this.fxRate = 1;
      return;
    }
    const today = new Date().toISOString().substring(0, 10);
    this.svc.getExchangeRate(this.currencyId, baseCurrencyId, today).subscribe({
      next: (res: any) => {
        const rate = res?.data?.rate ?? res?.data?.exchangeRate ?? res?.rate ?? res?.exchangeRate ?? (typeof res === 'number' ? res : null);
        if (rate && Number(rate) > 0) this.fxRate = Number(rate);
      },
      error: () => {}
    });
  }

  onItemSelect(item: RfqLine): void {
    const found = this.itemOptions.find(o => o.value === item.itemId);
    if (found?.raw) {
      item.itemCode = found.raw.itemCode ?? '';
      item.itemName = found.raw.itemName ?? found.label;
      if (found.raw.uomId) item.uomId = found.raw.uomId;
    }
  }

  recalcLine(item: RfqLine): void {
    const qty = item.quantity ?? 0;
    const price = item.unitPrice ?? 0;
    const disc = item.discountPct ?? 0;
    item.lineNet = qty * price * (1 - disc / 100);
    // Tax rate lookup
    const taxFound = this.taxCodeOptions.find(t => t.value === item.taxCodeId);
    const taxRate = taxFound?.raw?.taxRate ?? 0;
    if (item.taxMode === 'Exclusive') {
      item.lineTax = item.lineNet * (taxRate / 100);
      item.lineTotal = item.lineNet + item.lineTax;
    } else if (item.taxMode === 'Inclusive') {
      item.lineTax = item.lineNet - item.lineNet / (1 + taxRate / 100);
      item.lineTotal = item.lineNet;
    } else {
      item.lineTax = 0;
      item.lineTotal = item.lineNet;
    }
  }

  get subTotal(): number { return this.items.reduce((s, i) => s + i.lineNet, 0); }
  get totalTax(): number { return this.items.reduce((s, i) => s + i.lineTax, 0); }
  get grandTotal(): number { return this.items.reduce((s, i) => s + i.lineTotal, 0); }

  save(): void {
    if (!this.supplierId) { this.error = 'Please select a Supplier.'; return; }
    if (!this.deliveryDate) { this.error = 'Please set a Valid Until date.'; return; }
    const invalid = this.items.some(i => !i.itemId || !i.quantity);
    if (invalid) { this.error = 'Each line needs an Item and Quantity.'; return; }

    this.saving = true;
    this.error = '';

    const payload = {
      Number: this.rfqNumber || 'RFQ-00000',
      Status: this.status,
      CustomerId: this.supplierId,
      CurrencyId: this.currencyId ?? 0,
      FxRate: this.fxRate ?? 1,
      PaymentTermsId: this.paymentTermId ?? 0,
      DeliveryDate: this.deliveryDate,
      Remarks: this.remarks,
      DeliveryTo: this.deliveryTo,
      Subtotal: this.subTotal,
      TaxAmount: this.totalTax,
      Rounding: 0,
      GrandTotal: this.grandTotal,
      NeedsHodApproval: this.needsHodApproval,
      Lines: this.items.map(i => ({
        ItemId: i.itemId,
        UomId: i.uomId,
        Qty: i.quantity ?? 0,
        UnitPrice: i.unitPrice ?? 0,
        DiscountPct: i.discountPct ?? 0,
        TaxMode: i.taxMode,
        TaxCodeId: i.taxCodeId,
        LineNet: i.lineNet,
        LineTax: i.lineTax,
        LineTotal: i.lineTotal,
        Description: i.description
      }))
    };

    const obs$ = this.isEdit
      ? this.svc.updateRfq(this.id!, payload)
      : this.svc.createRfq(payload);

    obs$.subscribe({
      next: res => {
        this.saving = false;
        const d = this.svc.unwrapOne(res);
        if (!this.isEdit && d?.id) {
          this.id = d.id; this.isEdit = true;
          this.rfqNumber = d.number ?? this.rfqNumber;
        }
        this.successMsg = 'RFQ saved successfully.';
        setTimeout(() => this.successMsg = '', 3000);
      },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  submit(): void {
    this.status = 'Submitted';
    this.save();
  }

  viewLineDetail(item: RfqLine): void {
    this.showDetailSwal(item.itemName || 'Line Detail', [
      ['Item Code', item.itemCode],
      ['Item Name', item.itemName],
      ['Quantity', item.quantity],
      ['Unit Price', item.unitPrice != null ? Number(item.unitPrice).toFixed(2) : null],
      ['Discount %', item.discountPct],
      ['Tax Mode', item.taxMode],
      ['Line Net', item.lineNet != null ? Number(item.lineNet).toFixed(2) : null],
      ['Tax Amount', item.lineTax != null ? Number(item.lineTax).toFixed(2) : null],
      ['Line Total', item.lineTotal != null ? Number(item.lineTotal).toFixed(2) : null],
      ['Description', item.description],
    ]);
  }

  private showDetailSwal(title: string, rows: [string, any][]): void {
    const html = rows.filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;font-weight:600;white-space:nowrap;text-align:left;border-bottom:1px solid #f1f5f9">${k}</td><td style="padding:5px 12px;font-size:12px;text-align:left;border-bottom:1px solid #f1f5f9">${v}</td></tr>`).join('');
    Swal.fire({ title, html: `<table style="width:100%;border-collapse:collapse">${html}</table>`, confirmButtonColor: '#0e7490', width: 500, showCloseButton: true });
  }

  back(): void { this.router.navigate(['/app/purchase/rfq']); }
  get today(): string { return new Date().toISOString().substring(0, 10); }
  get title(): string { return this.isEdit ? `Edit RFQ${this.rfqNumber ? ' – ' + this.rfqNumber : ''}` : 'New Request for Quotation'; }
  getLabel(opts: any[], val: any): string { return opts.find(o => o.value === val)?.label ?? '—'; }
}
