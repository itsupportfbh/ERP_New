import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';

interface InvoiceOption {
  id: number;
  invoiceNo: string;
  supplierName: string;
  supplierId: number;
  fxRate: number;
  currencyName: string;
  currencyId: number;
  isOverseas: boolean;
  incotermsName: string;
  listStatusCode: number;
}

interface LineRow {
  itemId: number;
  warehouseId: number;
  binId: number;
  item: string;
  totalQty: number;
  varianceQty: number;
  qty: number;
  price: number;
  taxPct: number;
  lineAmount: number;
  taxAmount: number;
  lineTotal: number;
  remarks: string;
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
  pinId = 0;
  supplierId: number | null = null;
  supplierName = '';
  referenceNo = '';
  reason = 'Short Supply';
  noteDate = new Date().toISOString().substring(0, 10);
  fxRate = 1;
  currencyName = '';
  currencyId = 0;
  isOverseas = false;
  incotermsName = '';
  status = 'Draft';
  isGlPosted = false;

  get isPosted(): boolean { return this.status === 'Posted' || +this.status === 2 || +this.status === 4; }

  // Invoice combobox
  invoiceList: InvoiceOption[] = [];
  invoiceFiltered: InvoiceOption[] = [];
  invoiceSearch = '';
  invoiceOpen = false;
  selectedInvoiceNo = '';

  // Lines
  retRows: LineRow[] = [];

  reasonOptions = ['Short Supply', 'Quality Issue', 'Price Adjustment', 'Damage', 'Other'];
  loginUserId = Number(localStorage.getItem('id')) || 0;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) {
      this.id = Number(paramId);
      this.loadForEdit(); // loadForEdit calls loadInvoices after pinId is known
    } else {
      this.retRows = [this.emptyLine()];
      this.loadInvoices();
    }
  }

  // ── Invoice combobox ──────────────────────────────────────────

  private loadInvoices(): void {
    forkJoin({
      invoices: this.svc.getSupplierInvoices(),
      notes:    this.svc.getDebitNotes()
    }).subscribe({
      next: ({ invoices, notes }) => {
        // Collect pinIds already used by existing debit notes
        const usedPinIds = new Set<number>(
          this.svc.unwrap(notes)
            .map((dn: any) => Number(dn.pinId ?? dn.PinId ?? 0))
            .filter((id: number) => id > 0)
        );
        // When editing, keep the current invoice available (don't exclude its pinId)
        if (this.isEdit && this.pinId > 0) usedPinIds.delete(this.pinId);

        const all = this.svc.unwrap(invoices);
        this.invoiceList = all
          .filter((x: any) => !usedPinIds.has(Number(x.id ?? x.iD ?? 0)))
          .map((x: any): InvoiceOption => ({
            id:            Number(x.id ?? x.iD ?? 0),
            invoiceNo:     x.invoiceNo ?? x.InvoiceNo ?? x.pinNo ?? '',
            supplierName:  x.supplierName ?? x.SupplierName ?? x.name ?? '',
            supplierId:    Number(x.supplierId ?? x.SupplierId ?? 0),
            fxRate:        Number(x.fxRate ?? x.FxRate ?? 1),
            currencyName:  x.currencyName ?? x.CurrencyName ?? '',
            currencyId:    Number(x.currencyId ?? x.CurrencyId ?? 0),
            isOverseas:    this.toBool(x.isOverseas ?? x.IsOverseas),
            incotermsName: x.incotermsName ?? x.IncotermsName ?? '',
            listStatusCode: Number(x.listStatusCode ?? x.ListStatusCode ?? 0)
          }));
        this.invoiceFiltered = [...this.invoiceList];

        // If editing, sync selected invoice label
        if (this.isEdit && this.pinId > 0) {
          const inv = this.invoiceList.find(x => x.id === this.pinId);
          if (inv) { this.invoiceSearch = inv.invoiceNo; this.selectedInvoiceNo = inv.invoiceNo; }
        }
      },
      error: () => { this.invoiceList = []; this.invoiceFiltered = []; }
    });
  }

  onInvoiceFocus(): void {
    this.invoiceFiltered = [...this.invoiceList];
    this.invoiceOpen = true;
  }

  onInvoiceSearch(e: Event): void {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    this.invoiceSearch = (e.target as HTMLInputElement).value;
    this.invoiceFiltered = this.invoiceList.filter(inv =>
      inv.invoiceNo.toLowerCase().includes(q) ||
      inv.supplierName.toLowerCase().includes(q)
    );
    this.invoiceOpen = true;
  }

  isInvoiceSelected(id: number): boolean { return this.pinId === id; }

  toggleInvoice(inv: InvoiceOption): void {
    if (this.isInvoiceSelected(inv.id)) { this.clearInvoice(); return; }
    this.applyInvoice(inv);
  }

  private applyInvoice(inv: InvoiceOption): void {
    this.pinId         = inv.id;
    this.supplierId    = inv.supplierId;
    this.supplierName  = inv.supplierName;
    this.referenceNo   = inv.invoiceNo;
    this.fxRate        = inv.fxRate;
    this.currencyName  = inv.currencyName;
    this.currencyId    = inv.currencyId;
    this.isOverseas    = inv.isOverseas;
    this.incotermsName = inv.incotermsName;
    this.invoiceSearch     = inv.invoiceNo;
    this.selectedInvoiceNo = inv.invoiceNo;
    this.invoiceOpen = false;
    this.loadLinesFromPin(inv.id);
  }

  private clearInvoice(): void {
    this.pinId = 0; this.supplierId = null; this.supplierName = '';
    this.referenceNo = ''; this.fxRate = 1; this.currencyName = '';
    this.currencyId = 0; this.isOverseas = false; this.incotermsName = '';
    this.invoiceSearch = ''; this.selectedInvoiceNo = '';
    this.retRows = [this.emptyLine()];
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!(ev.target as HTMLElement).closest('.invoice-combobox')) this.invoiceOpen = false;
  }

  // ── Load lines from supplier invoice PIN ─────────────────────

  private loadLinesFromPin(pinId: number): void {
    this.svc.getSupplierInvoiceById(pinId).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const rawLines = d.linesJson ?? d.LinesJson ?? d.lines ?? '[]';
        const lines: any[] = typeof rawLines === 'string' ? JSON.parse(rawLines || '[]') : (Array.isArray(rawLines) ? rawLines : []);
        this.retRows = lines.map((l: any) => {
          const totalQty = this.toNum(l.qty ?? l.Qty ?? l.grnQty ?? l.totalQty ?? l.invoiceQty ?? 0);
          return {
            itemId:      Number(l.itemId ?? l.ItemId ?? l.itemMasterId ?? 0),
            warehouseId: Number(l.warehouseId ?? l.WarehouseId ?? 0),
            binId:       Number(l.binId ?? l.BinId ?? 0),
            item:        l.itemName ?? l.itemSearch ?? l.item ?? l.Item ?? l.name ?? l.description ?? '',
            totalQty,
            varianceQty: 0,
            qty:         0,
            price:       this.toNum(l.unitPrice ?? l.price ?? l.Price ?? l.rate ?? 0),
            taxPct:      this.toNum(l.taxPct ?? l.taxRate ?? l.gstPct ?? 0),
            lineAmount:  0,
            taxAmount:   0,
            lineTotal:   0,
            remarks:     ''
          };
        });
        if (!this.retRows.length) this.retRows = [this.emptyLine()];
      },
      error: () => { this.retRows = [this.emptyLine()]; }
    });
  }

  // ── Load for edit ─────────────────────────────────────────────

  loadForEdit(): void {
    this.loading = true;
    this.svc.getDebitNoteById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.debitNoteNo  = d.debitNoteNo ?? d.DebitNoteNo ?? '';
        this.pinId        = Number(d.pinId ?? d.PinId ?? 0);
        this.supplierId   = d.supplierId ?? null;
        this.supplierName = d.name ?? d.supplierName ?? '';
        this.referenceNo  = d.referenceNo ?? '';
        this.reason       = d.reason ?? this.reason;
        this.noteDate     = d.noteDate ? d.noteDate.substring(0, 10) : this.noteDate;
        this.fxRate       = Number(d.fxRate ?? 1);
        this.currencyName = d.currencyName ?? '';
        this.currencyId   = Number(d.currencyId ?? 0);
        this.isOverseas   = this.toBool(d.isOverseas);
        this.incotermsName = d.incotermsName ?? '';
        this.isGlPosted   = this.toBool(d.glPosted ?? d.GlPosted);
        const s = d.status;
        this.status = (typeof s === 'string' && isNaN(Number(s)))
          ? s
          : ({ 0: 'Draft', 1: 'Pending', 2: 'Posted', 3: 'Approved', 4: 'Posted' } as any)[Number(s)] ?? 'Draft';

        const rawLines = d.linesJson ?? d.LinesJson ?? '[]';
        const parsed: any[] = typeof rawLines === 'string' ? JSON.parse(rawLines || '[]') : (Array.isArray(rawLines) ? rawLines : []);
        this.retRows = parsed.map((l: any) => {
          const qty       = this.toNum(l.varianceQty ?? l.qty ?? 0);
          const price     = this.toNum(l.price ?? l.unitPrice ?? 0);
          const taxPct    = this.toNum(l.taxPct ?? 0);
          const lineAmount = qty * price;
          const taxAmount  = lineAmount * taxPct / 100;
          return {
            itemId:      Number(l.itemId ?? 0),
            warehouseId: Number(l.warehouseId ?? 0),
            binId:       Number(l.binId ?? 0),
            item:        l.item ?? l.itemName ?? l.itemSearch ?? '',
            totalQty:    this.toNum(l.totalQty ?? 0),
            varianceQty: qty, qty,
            price, taxPct, lineAmount, taxAmount,
            lineTotal: lineAmount + taxAmount,
            remarks:   l.remarks ?? ''
          };
        });
        if (!this.retRows.length) this.retRows = [this.emptyLine()];
        this.loading = false;
        this.loadInvoices(); // load after pinId is known so edit's invoice isn't excluded
      },
      error: () => { this.loading = false; }
    });
  }

  // ── Line helpers ──────────────────────────────────────────────

  private emptyLine(): LineRow {
    return { itemId: 0, warehouseId: 0, binId: 0, item: '', totalQty: 0, varianceQty: 0, qty: 0, price: 0, taxPct: 0, lineAmount: 0, taxAmount: 0, lineTotal: 0, remarks: '' };
  }

  retAddRow(): void { this.retRows = [...this.retRows, this.emptyLine()]; }
  retRemoveRow(i: number): void { this.retRows = this.retRows.filter((_, idx) => idx !== i); }
  trackByIndex(i: number): number { return i; }

  onRowValueChange(row: LineRow): void {
    const qty    = this.toNum(row.varianceQty);
    const price  = this.toNum(row.price);
    const taxPct = this.toNum(row.taxPct);
    row.qty         = qty;
    row.varianceQty = qty;
    row.lineAmount  = qty * price;
    row.taxAmount   = row.lineAmount * taxPct / 100;
    row.lineTotal   = row.lineAmount + row.taxAmount;
  }

  get totalAmount(): number    { return this.retRows.reduce((s, r) => s + r.lineAmount, 0); }
  get totalTaxAmount(): number { return this.retRows.reduce((s, r) => s + r.taxAmount, 0); }
  get totalNetAmount(): number { return this.totalAmount + this.totalTaxAmount; }
  get totalAmountBase(): number { return +(this.totalAmount * this.fxRate).toFixed(2); }
  get totalNetAmountBase(): number { return +(this.totalNetAmount * this.fxRate).toFixed(2); }

  // ── Save / Post ───────────────────────────────────────────────

  save(post = false): void {
    if (!this.supplierId) { Swal.fire('Required', 'Please select a Supplier Invoice.', 'warning'); return; }

    const hasValidLine = this.retRows.some(r => r.item && this.toNum(r.varianceQty) > 0);
    if (!hasValidLine) { Swal.fire('Required', 'At least one line with item name and variance qty is required.', 'warning'); return; }

    this.saving = true;
    this.error = '';

    const linesJson = JSON.stringify(this.retRows.map(r => ({
      itemId:      r.itemId,
      warehouseId: r.warehouseId,
      binId:       r.binId,
      item:        r.item,
      itemName:    r.item,
      totalQty:    this.toNum(r.totalQty),
      varianceQty: this.toNum(r.varianceQty),
      qty:         this.toNum(r.varianceQty),
      price:       this.toNum(r.price),
      unitPrice:   this.toNum(r.price),
      taxPct:      this.toNum(r.taxPct),
      lineAmount:  r.lineAmount,
      taxAmt:      r.taxAmount,
      lineTotal:   r.lineTotal,
      remarks:     r.remarks
    })));

    const payload = {
      DebitNoteNo:  this.debitNoteNo || 'DN-PENDING',
      PinId:        this.pinId || null,
      SupplierId:   this.supplierId,
      GrnId:        null,
      ReferenceNo:  this.referenceNo,
      Reason:       this.reason,
      NoteDate:     this.noteDate,
      Amount:       this.totalNetAmount,
      LinesJson:    linesJson,
      Status:       0,
      FxRate:       this.fxRate,
      AmountBase:   this.totalNetAmountBase,
      CurrencyId:   this.currencyId || null,
      CurrencyName: this.currencyName,
      CreatedBy:    this.loginUserId,
      UpdatedBy:    this.loginUserId
    };

    const req$ = this.isEdit
      ? this.svc.updateDebitNote(this.id!, payload)
      : this.svc.createDebitNote(payload);

    req$.subscribe({
      next: (res: any) => {
        if (post) {
          // Get the saved debit note ID then call MarkDebitNote to post it and mark the PIN
          const savedId = this.isEdit ? this.id! : (res?.data ?? res);
          this.svc.postDebitNote(savedId).subscribe({
            next: () => {
              this.saving = false;
              Swal.fire({ icon: 'success', title: 'Posted!', text: 'Debit Note posted successfully.', confirmButtonColor: '#1a9db8' }).then(() => this.back());
            },
            error: (err: any) => {
              this.saving = false;
              this.error = err?.error?.message ?? 'Saved as draft. Post failed — try the Post button from the list.';
              Swal.fire({ icon: 'error', title: 'Post Failed', text: err?.error?.message ?? 'Saved as draft. Post failed — try the Post button from the list.', confirmButtonColor: '#1a9db8' });
            }
          });
        } else {
          this.saving = false;
          Swal.fire({ icon: 'success', title: 'Saved!', text: 'Debit Note saved as draft.', confirmButtonColor: '#1a9db8' }).then(() => this.back());
        }
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message ?? 'Save failed.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'Save failed.', confirmButtonColor: '#1a9db8' });
      }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/debit-note']); }

  get title(): string {
    return this.isEdit
      ? `Edit Debit Note${this.debitNoteNo ? ' – ' + this.debitNoteNo : ''}`
      : 'New Debit Note';
  }

  get supplierDisplay(): string { return this.supplierName || 'Select supplier invoice first'; }

  private toNum(v: any): number {
    const n = Number(String(v ?? '').replace(/,/g, '').trim());
    return isNaN(n) ? 0 : n;
  }

  private toBool(v: any): boolean {
    return v === true || v === 1 || String(v ?? '').toLowerCase() === 'true';
  }
}
