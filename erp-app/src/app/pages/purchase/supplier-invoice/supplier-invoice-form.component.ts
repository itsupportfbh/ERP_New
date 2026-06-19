import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';

type TaxMode = 'Exclusive' | 'Inclusive' | 'Zero';

interface PinLine {
  itemId: number | null;
  itemName: string;
  locationId: number | null;
  grnQty: number | null;
  qty: number | null;
  unitPrice: number | null;
  discountPct: number | null;
  taxMode: TaxMode;
  lineTotal: number;
  taxAmt: number;
  lineGrandTotal: number;
  budgetLineId: number | null;
  dcNoteNo: string;
  remarks: string;
}

@Component({
  selector: 'erp-supplier-invoice-form',
  standalone: false,
  templateUrl: './supplier-invoice-form.component.html',
  styleUrls: ['./supplier-invoice-form.component.scss']
})
export class SupplierInvoiceFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  posting = false;
  error = '';
  threeWayMatch: any[] = [];
  showThreeWay = false;

  // Header
  invoiceNo = '';
  invoiceDate = new Date().toISOString().substring(0, 10);
  supplierId: number | null = null;
  supplierName = '';
  currencyId: number | null = null;
  fxRate: number = 1;
  taxPct: number | null = null;
  isOverseas = false;
  incotermsId: number | null = null;
  isPartial = false;
  isGlPosted = false;
  status = 'Draft';
  selectedGrnIds: number[] = [];
  combineMode = false;

  // Lines
  lines: PinLine[] = [];

  // Dropdowns
  grnOptions: any[] = [];
  currencyOptions: any[] = [];
  incotermOptions: any[] = [];
  locationOptions: any[] = [];
  ledgerOptions: any[] = [];

  taxModeOptions = [
    { label: 'Exclusive', value: 'Exclusive' },
    { label: 'Inclusive', value: 'Inclusive' },
    { label: 'Zero', value: 'Zero' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;
  companyId = Number(localStorage.getItem('companyId')) || null;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else { this.loadGrnOptions(); }
    this.loadLookups();
  }

  loadLookups(): void {
    this.svc.getCurrencies().subscribe(r =>
      this.currencyOptions = this.svc.unwrap(r).map((c: any) => ({ label: `${c.currencyCode} - ${c.currencyName ?? c.name}`, value: c.id })));
    this.svc.getIncoterms().subscribe(r =>
      this.incotermOptions = this.svc.unwrap(r).map((i: any) => ({ label: i.incotermsName ?? i.name, value: i.id })));
    this.svc.getLocations().subscribe(r =>
      this.locationOptions = this.svc.unwrap(r).map((l: any) => ({ label: l.locationName ?? l.name, value: l.id })));
    this.svc.getChartOfAccounts().subscribe(r =>
      this.ledgerOptions = this.svc.unwrap(r).map((c: any) => ({ label: `${c.accountCode ?? ''} ${c.accountName ?? c.name}`, value: c.id })));
  }

  loadGrnOptions(): void {
    this.svc.getAvailableGRNsForPin().subscribe(r => {
      this.grnOptions = this.svc.unwrap(r).map((g: any) => ({ label: `${g.grnNumber} - ${g.supplierName ?? ''}`, value: g.id, raw: g }));
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getSupplierInvoiceById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.invoiceNo = d.invoiceNo ?? '';
        this.invoiceDate = d.invoiceDate ? d.invoiceDate.substring(0, 10) : this.invoiceDate;
        this.supplierId = d.supplierId ?? null;
        this.supplierName = d.supplierName ?? '';
        this.currencyId = d.currencyId ?? null;
        this.fxRate = d.fxRate ?? 1;
        this.taxPct = d.taxPct ?? null;
        this.isOverseas = d.isOverseas ?? false;
        this.incotermsId = d.incotermsId ?? null;
        this.isPartial = d.isPartial ?? false;
        this.isGlPosted = d.isGlPosted ?? false;
        this.status = d.status ?? 'Draft';
        this.selectedGrnIds = d.grnIds ?? [];
        this.lines = (d.lines ?? d.items ?? []).map((l: any) => this.mapLine(l));
        this.loading = false;
        // Load available GRNs for edit
        this.svc.getAvailableGRNsForPinEdit(this.id!).subscribe(r => {
          this.grnOptions = this.svc.unwrap(r).map((g: any) => ({ label: `${g.grnNumber} - ${g.supplierName ?? ''}`, value: g.id, raw: g }));
        });
      },
      error: () => { this.loading = false; }
    });
  }

  private mapLine(l: any): PinLine {
    const qty = l.qty ?? l.quantity ?? 0;
    const price = l.unitPrice ?? 0;
    const disc = l.discountPct ?? 0;
    const baseAmt = qty * price * (1 - disc / 100);
    const taxAmt = l.taxMode === 'Exclusive' ? baseAmt * ((this.taxPct ?? 0) / 100)
                 : l.taxMode === 'Inclusive' ? baseAmt - baseAmt / (1 + (this.taxPct ?? 0) / 100) : 0;
    return {
      itemId: l.itemId ?? null,
      itemName: l.itemName ?? '',
      locationId: l.locationId ?? null,
      grnQty: l.grnQty ?? null,
      qty,
      unitPrice: price,
      discountPct: disc,
      taxMode: l.taxMode ?? 'Exclusive',
      lineTotal: baseAmt,
      taxAmt,
      lineGrandTotal: l.taxMode === 'Exclusive' ? baseAmt + taxAmt : baseAmt,
      budgetLineId: l.budgetLineId ?? null,
      dcNoteNo: l.dcNoteNo ?? '',
      remarks: l.remarks ?? ''
    };
  }

  onGrnSelect(): void {
    if (!this.selectedGrnIds.length) return;
    const selected = this.grnOptions.filter(o => this.selectedGrnIds.includes(o.value));
    if (!selected.length) return;
    const firstGrn = selected[0].raw;
    this.supplierName = firstGrn.supplierName ?? '';
    this.supplierId = firstGrn.supplierId ?? null;
    this.currencyId = firstGrn.currencyId ?? null;
    this.fxRate = firstGrn.fxRate ?? 1;
    this.isOverseas = firstGrn.isOverseas ?? false;
    // Build lines from GRN lines
    this.lines = [];
    selected.forEach(grn => {
      (grn.raw.lines ?? grn.raw.items ?? []).forEach((l: any) => {
        const existing = this.lines.find(pl => pl.itemId === l.itemId && pl.unitPrice === (l.unitPrice ?? 0));
        if (existing && this.combineMode) {
          existing.qty = (existing.qty ?? 0) + (l.qtyReceived ?? 0);
          existing.grnQty = (existing.grnQty ?? 0) + (l.qtyReceived ?? 0);
        } else {
          this.lines.push(this.mapLine({ ...l, qty: l.qtyReceived, grnQty: l.qtyReceived, taxMode: 'Exclusive' }));
        }
      });
    });
    this.recalcLines();
  }

  recalcLine(line: PinLine): void {
    const base = (line.qty ?? 0) * (line.unitPrice ?? 0) * (1 - (line.discountPct ?? 0) / 100);
    line.lineTotal = base;
    if (line.taxMode === 'Exclusive') {
      line.taxAmt = base * ((this.taxPct ?? 0) / 100);
      line.lineGrandTotal = base + line.taxAmt;
    } else if (line.taxMode === 'Inclusive') {
      line.taxAmt = base - base / (1 + (this.taxPct ?? 0) / 100);
      line.lineGrandTotal = base;
    } else {
      line.taxAmt = 0;
      line.lineGrandTotal = base;
    }
  }

  recalcLines(): void { this.lines.forEach(l => this.recalcLine(l)); }

  get subTotal(): number { return this.lines.reduce((s, l) => s + l.lineTotal, 0); }
  get totalTax(): number { return this.lines.reduce((s, l) => s + l.taxAmt, 0); }
  get grandTotal(): number { return this.lines.reduce((s, l) => s + l.lineGrandTotal, 0); }

  loadThreeWayMatch(): void {
    if (!this.id) return;
    this.svc.getThreeWayMatch(this.id).subscribe({
      next: res => { this.threeWayMatch = this.svc.unwrap(res); this.showThreeWay = true; },
      error: () => {}
    });
  }

  postToAP(): void {
    if (!this.id || !confirm('Post this invoice to A/P?')) return;
    this.posting = true;
    this.svc.postPinToAP(this.id).subscribe({
      next: () => { this.posting = false; this.isGlPosted = true; this.status = 'Posted'; },
      error: err => { this.posting = false; this.error = err?.error?.message ?? 'GL posting failed.'; }
    });
  }

  submit(draft = false): void {
    this.saving = true;
    this.error = '';
    const payload = {
      invoiceNo: this.invoiceNo,
      invoiceDate: this.invoiceDate,
      supplierId: this.supplierId,
      currencyId: this.currencyId,
      fxRate: this.fxRate,
      taxPct: this.taxPct,
      isOverseas: this.isOverseas,
      incotermsId: this.incotermsId,
      isPartial: this.isPartial,
      status: draft ? 'Draft' : 'Posted',
      grandTotal: this.grandTotal,
      grnIds: this.selectedGrnIds,
      companyId: this.companyId,
      createdBy: this.loginUserId,
      updatedBy: this.loginUserId,
      lines: this.lines
    };

    const obs$ = this.isEdit
      ? this.svc.updateSupplierInvoice(this.id!, payload)
      : this.svc.createSupplierInvoice(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/supplier-invoice']); }
  get title(): string { return this.isEdit ? 'Edit Supplier Invoice' : 'New Supplier Invoice'; }
  getLabel(opts: any[], val: any): string { return opts.find(o => o.value === val)?.label ?? '—'; }
}
