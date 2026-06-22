import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

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
  debitNoteNo = '';
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
  get isPosted(): boolean { return this.status === 'Posted'; }

  // Lines
  lines: DNLine[] = [];

  // Dropdowns
  pinOptions: any[] = [];

  reasonOptions = [
    { label: 'Short Supply',      value: 'Short Supply' },
    { label: 'Quality Issue',     value: 'Quality Issue' },
    { label: 'Price Adjustment',  value: 'Price Adjustment' },
    { label: 'Damage',            value: 'Damage' },
    { label: 'Other',             value: 'Other' }
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
    this.loadPinOptions();
  }

  loadPinOptions(): void {
    this.svc.getSupplierInvoices().subscribe(r => {
      this.pinOptions = this.svc.unwrap(r).map((p: any) => ({
        label: `${p.invoiceNo ?? 'INV'} (${p.status ?? ''})`,
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
        this.debitNoteNo = d.debitNoteNo ?? d.DebitNoteNo ?? '';
        this.pinId = d.pinId ?? null;
        this.supplierId = d.supplierId ?? null;
        this.supplierName = d.name ?? d.supplierName ?? '';
        this.referenceNo = d.referenceNo ?? '';
        this.reason = d.reason ?? '';
        this.noteDate = d.noteDate ? d.noteDate.substring(0, 10) : this.noteDate;
        this.fxRate = d.fxRate ?? 1;
        this.status = d.status ?? 'Draft';

        // LinesJson is stored as a JSON string in the DB
        const rawLines = d.linesJson ?? d.LinesJson ?? d.lines ?? '[]';
        const parsedLines: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);
        this.lines = parsedLines.map((l: any) => this.mapLine(l));
        if (!this.lines.length) this.addLine();
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
      lineTotal: l.lineTotal ?? (lineAmount + (l.taxAmt ?? 0))
    };
  }

  onPinSelect(): void {
    if (!this.pinId) return;
    this.svc.getDebitNoteSourceByPin(this.pinId).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.supplierName = d.name ?? d.supplierName ?? '';
        this.supplierId = d.supplierId ?? null;
        this.fxRate = d.fxRate ?? 1;
        this.currencyName = d.currencyName ?? '';

        // Source lines come from the PIN's LinesJson
        const rawLines = d.linesJson ?? d.LinesJson ?? d.lines ?? '[]';
        const parsedLines: any[] = typeof rawLines === 'string'
          ? JSON.parse(rawLines || '[]')
          : (Array.isArray(rawLines) ? rawLines : []);
        this.lines = parsedLines.map((l: any) => this.mapLine({ ...l, varianceQty: 0 }));
        if (!this.lines.length) this.addLine();
      }
    });
  }

  addLine(): void {
    this.lines.push({
      itemId: null, itemName: '', totalQty: null, varianceQty: null,
      unitPrice: null, remarks: '', lineAmount: 0, taxAmt: 0, lineTotal: 0
    });
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

    const linesData = this.lines.map(l => ({
      itemId: l.itemId,
      itemName: l.itemName,
      totalQty: l.totalQty,
      varianceQty: l.varianceQty,
      unitPrice: l.unitPrice,
      remarks: l.remarks,
      lineAmount: l.lineAmount,
      taxAmt: l.taxAmt,
      lineTotal: l.lineTotal
    }));

    const payload = {
      DebitNoteNo: this.debitNoteNo || 'DN-PENDING',
      PinId: this.pinId,
      SupplierId: this.supplierId,
      GrnId: null,
      ReferenceNo: this.referenceNo,
      Reason: this.reason,
      NoteDate: this.noteDate,
      Amount: this.totalAmount,
      LinesJson: JSON.stringify(linesData),
      Status: this.status,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0
    };

    const obs$ = this.isEdit
      ? this.svc.updateDebitNote(this.id!, payload)
      : this.svc.createDebitNote(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  viewLineDetail(line: DNLine): void {
    this.showDetailSwal(line.itemName || 'Line Detail', [
      ['Item Name', line.itemName],
      ['Total Qty', line.totalQty],
      ['Variance Qty', line.varianceQty],
      ['Unit Price', line.unitPrice != null ? Number(line.unitPrice).toFixed(2) : null],
      ['Line Amount', line.lineAmount != null ? Number(line.lineAmount).toFixed(2) : null],
      ['Tax Amount', line.taxAmt != null ? Number(line.taxAmt).toFixed(2) : null],
      ['Line Total', line.lineTotal != null ? Number(line.lineTotal).toFixed(2) : null],
      ['Remarks', line.remarks],
    ]);
  }

  private showDetailSwal(title: string, rows: [string, any][]): void {
    const html = rows.filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;font-weight:600;white-space:nowrap;text-align:left;border-bottom:1px solid #f1f5f9">${k}</td><td style="padding:5px 12px;font-size:12px;text-align:left;border-bottom:1px solid #f1f5f9">${v}</td></tr>`).join('');
    Swal.fire({ title, html: `<table style="width:100%;border-collapse:collapse">${html}</table>`, confirmButtonColor: '#0e7490', width: 500, showCloseButton: true });
  }

  back(): void { this.router.navigate(['/app/purchase/debit-note']); }
  get title(): string {
    return this.isEdit
      ? `Edit Debit Note${this.debitNoteNo ? ' – ' + this.debitNoteNo : ''}`
      : 'New Debit Note';
  }
}
