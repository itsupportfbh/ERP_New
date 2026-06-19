import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';

interface DNLine {
  itemId: number | null;
  itemName: string;
  totalQty: number | null;
  varianceQty: number | null;
  unitPrice: number | null;
  remarks: string;
  lineAmount: number;
  taxAmt: number;
  lineTotal: number;
}

@Component({
  selector: 'erp-debit-note-form',
  standalone: false,
  templateUrl: './debit-note-form.component.html',
  styleUrls: ['./debit-note-form.component.scss']
})
export class DebitNoteFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';

  // Header
  pinId: number | null = null;
  supplierId: number | null = null;
  supplierName = '';
  referenceNo = '';
  reason = '';
  noteDate = new Date().toISOString().substring(0, 10);
  fxRate: number = 1;
  currencyName = '';
  isOverseas = false;
  incoterms = '';
  status = 'Draft';
  isPosted = false;

  // Lines
  lines: DNLine[] = [];

  // Dropdowns
  pinOptions: any[] = [];

  reasonOptions = [
    { label: 'Short Supply', value: 'Short Supply' },
    { label: 'Quality Issue', value: 'Quality Issue' },
    { label: 'Price Adjustment', value: 'Price Adjustment' },
    { label: 'Damage', value: 'Damage' },
    { label: 'Other', value: 'Other' }
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
    this.loadPinOptions();
  }

  loadPinOptions(): void {
    this.svc.getSupplierInvoices().subscribe(r => {
      this.pinOptions = this.svc.unwrap(r).map((p: any) => ({
        label: `${p.invoiceNo} - ${p.supplierName ?? ''}`,
        value: p.id,
        raw: p
      }));
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getDebitNoteById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.pinId = d.pinId ?? null;
        this.supplierId = d.supplierId ?? null;
        this.supplierName = d.supplierName ?? '';
        this.referenceNo = d.referenceNo ?? '';
        this.reason = d.reason ?? '';
        this.noteDate = d.noteDate ? d.noteDate.substring(0, 10) : this.noteDate;
        this.fxRate = d.fxRate ?? 1;
        this.currencyName = d.currencyName ?? '';
        this.isOverseas = d.isOverseas ?? false;
        this.incoterms = d.incoterms ?? '';
        this.status = d.status ?? 'Draft';
        this.isPosted = d.isPosted ?? false;
        this.lines = (d.lines ?? d.items ?? []).map((l: any) => this.mapLine(l));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private mapLine(l: any): DNLine {
    const qty = l.varianceQty ?? 0;
    const price = l.unitPrice ?? 0;
    const lineAmount = qty * price;
    return {
      itemId: l.itemId ?? null,
      itemName: l.itemName ?? '',
      totalQty: l.totalQty ?? null,
      varianceQty: qty,
      unitPrice: price,
      remarks: l.remarks ?? '',
      lineAmount,
      taxAmt: l.taxAmt ?? 0,
      lineTotal: lineAmount + (l.taxAmt ?? 0)
    };
  }

  onPinSelect(): void {
    if (!this.pinId) return;
    this.svc.getDebitNoteSourceByPin(this.pinId).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.supplierName = d.supplierName ?? '';
        this.supplierId = d.supplierId ?? null;
        this.fxRate = d.fxRate ?? 1;
        this.currencyName = d.currencyName ?? '';
        this.isOverseas = d.isOverseas ?? false;
        this.incoterms = d.incoterms ?? '';
        this.lines = (d.lines ?? []).map((l: any) => this.mapLine({ ...l, varianceQty: 0 }));
      }
    });
  }

  addLine(): void {
    this.lines.push({ itemId: null, itemName: '', totalQty: null, varianceQty: null, unitPrice: null, remarks: '', lineAmount: 0, taxAmt: 0, lineTotal: 0 });
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  recalcLine(line: DNLine): void {
    const qty = line.varianceQty ?? 0;
    const price = line.unitPrice ?? 0;
    line.lineAmount = qty * price;
    line.lineTotal = line.lineAmount + line.taxAmt;
  }

  get totalAmount(): number { return this.lines.reduce((s, l) => s + l.lineTotal, 0); }

  submit(): void {
    this.saving = true;
    this.error = '';
    const payload = {
      pinId: this.pinId,
      supplierId: this.supplierId,
      referenceNo: this.referenceNo,
      reason: this.reason,
      noteDate: this.noteDate,
      fxRate: this.fxRate,
      amount: this.totalAmount,
      companyId: this.companyId,
      createdBy: this.loginUserId,
      updatedBy: this.loginUserId,
      lines: this.lines
    };

    const obs$ = this.isEdit
      ? this.svc.updateDebitNote(this.id!, payload)
      : this.svc.createDebitNote(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/debit-note']); }
  get title(): string { return this.isEdit ? 'Edit Debit Note' : 'New Debit Note'; }
}
