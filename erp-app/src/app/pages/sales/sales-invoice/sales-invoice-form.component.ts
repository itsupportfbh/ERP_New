import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

interface SiLine {
  sourceLineId: number | null;
  itemId: number | null;
  itemName: string;
  description: string;
  ledgerId: number | null;
  uom: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  gstPct: number;
  tax: string;
  taxCodeId: number | null;
  lineAmount: number;
  taxAmount: number;
}

@Component({
  selector: 'erp-sales-invoice-form',
  standalone: false,
  templateUrl: './sales-invoice-form.component.html',
  styleUrls: ['./sales-invoice-form.component.scss']
})
export class SalesInvoiceFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;

  // Header
  invoiceNo = '';
  sourceType = 1;
  sourceId: number | null = null;
  sourceRef = '';
  invoiceDate = new Date().toISOString().substring(0, 10);
  shippingCost = 0;
  discountValue = 0;
  discountType: 'percent' | 'amount' = 'percent';
  remarks = '';
  customerName = '';
  currencyName = 'SGD';
  status = 'Draft';

  // Lines
  lines: SiLine[] = [];

  // Dropdown data
  sourceTypeOptions = [
    { label: 'From SO', value: 1 },
    { label: 'From DO', value: 2 }
  ];
  sourceDocOptions: any[] = [];
  itemOptions: any[] = [];
  uomOptions: any[] = [];
  taxCodeOptions: any[] = [];
  ledgerOptions: any[] = [];

  private soList: any[] = [];
  private doList: any[] = [];

  readonly fnId = 'si-list';
  constructor(
    private svc: SalesService,
    private route: ActivatedRoute,
    private router: Router,
    public perm: PermissionService
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    this.loadLookups();
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    else { this.loadSourceDocs(); }
  }

  // ── Lookups ───────────────────────────────────────────
  loadLookups(): void {
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: i.itemName ?? i.name ?? '',
        value: i.id ?? i.itemId,
        raw: i
      })));
    this.svc.getUOMs().subscribe(r =>
      this.uomOptions = this.svc.unwrap(r).map((u: any) => ({
        label: u.uomName ?? u.name ?? u.code ?? '',
        value: u.id ?? u.uomId
      })));
    this.svc.getTaxCodes().subscribe(r =>
      this.taxCodeOptions = this.svc.unwrap(r).map((t: any) => ({
        label: t.taxCodeName ?? t.name ?? t.code ?? t.taxCode ?? '',
        value: t.id ?? t.taxCodeId
      })));
    this.svc.getChartOfAccounts().subscribe(r =>
      this.ledgerOptions = this.svc.unwrap(r).map((c: any) => ({
        label: (c.headName ?? c.accountName ?? c.name ?? '').trim(),
        value: c.id ?? c.headId
      })));
  }

  loadSourceDocs(): void {
    if (this.sourceType === 1) {
      this.svc.getAvailableSalesOrdersForInvoice().subscribe(r => {
        this.soList = this.svc.unwrap(r);
        this.sourceDocOptions = this.soList.map((s: any) => ({
          label: `${s.soNumber ?? s.salesOrderNo ?? s.orderNo ?? ('SO-' + (s.id ?? s.soId))} - ${s.customerName ?? ''}`,
          value: s.id ?? s.soId,
          raw: s
        }));
      });
    } else {
      this.svc.getAvailableDeliveryOrdersForInvoice().subscribe(r => {
        this.doList = this.svc.unwrap(r);
        this.sourceDocOptions = this.doList.map((d: any) => ({
          label: `${d.doNumber ?? d.deliveryOrderNo ?? ('DO-' + (d.id ?? d.doId))} - ${d.customerName ?? ''}`,
          value: d.id ?? d.doId,
          raw: d
        }));
      });
    }
  }

  // ── Header events ─────────────────────────────────────
  onSourceTypeChange(): void {
    if (this.isEdit) return;
    this.sourceId = null;
    this.sourceDocOptions = [];
    this.lines = [];
    this.customerName = '';
    this.loadSourceDocs();
  }

  onSourceDocChange(): void {
    if (this.isEdit) return;
    this.lines = [];
    this.customerName = '';
    if (!this.sourceId) return;

    const opt = this.sourceDocOptions.find(o => String(o.value) === String(this.sourceId));
    this.customerName = opt?.raw?.customerName ?? '';

    this.svc.getSalesInvoiceSourceLines(this.sourceType, this.sourceId).subscribe({
      next: res => {
        const rows = this.svc.unwrap(res);
        this.lines = (rows ?? []).map((r: any) => this.mapSourceLine(r));
        this.recalcLines();
      },
      error: () => {}
    });
  }

  private mapSourceLine(r: any): SiLine {
    const line: SiLine = {
      sourceLineId: r.sourceLineId ?? null,
      itemId: r.itemId ?? null,
      itemName: r.itemName ?? '',
      description: r.description || r.itemName || '',
      ledgerId: r.budgetLineId ?? r.ledgerId ?? null,
      uom: r.uomName ?? r.uom ?? '',
      qty: Number(r.qtyOpen ?? r.qty ?? 0),
      unitPrice: Number(r.unitPrice ?? 0),
      discountPct: Number(r.discountPct ?? 0),
      gstPct: Number(r.gstPct ?? 0),
      tax: r.tax ?? '',
      taxCodeId: r.taxCodeId ?? null,
      lineAmount: 0,
      taxAmount: 0
    };
    this.recalcLine(line);
    return line;
  }

  // ── Lines / totals ────────────────────────────────────
  addLine(): void {
    this.lines.push({
      sourceLineId: null, itemId: null, itemName: '', description: '', ledgerId: null,
      uom: '', qty: 1, unitPrice: 0, discountPct: 0, gstPct: 0, tax: '', taxCodeId: null,
      lineAmount: 0, taxAmount: 0
    });
  }

  recalcLine(line: SiLine): void {
    const qty = Number(line.qty ?? 0);
    const price = Number(line.unitPrice ?? 0);
    const disc = Number(line.discountPct ?? 0);
    const gst = Number(line.gstPct ?? 0);
    const base = qty * price * (1 - disc / 100);
    line.lineAmount = +base.toFixed(2);
    line.taxAmount = +(base * (gst / 100)).toFixed(2);
  }

  recalcLines(): void { this.lines.forEach(l => this.recalcLine(l)); }

  onItemSelect(line: SiLine): void {
    const opt = this.itemOptions.find(o => String(o.value) === String(line.itemId));
    if (opt) {
      line.itemName = opt.label;
      line.uom = opt.raw?.uomName ?? opt.raw?.uom ?? line.uom;
      if (!line.description) line.description = opt.label;
    }
    this.recalcLine(line);
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  // Sub Total = gross of line discounts (qty × price)
  get subTotal(): number { return +this.lines.reduce((s, l) => s + Number(l.qty ?? 0) * Number(l.unitPrice ?? 0), 0).toFixed(2); }
  // Discount = total of per-line discounts (read-only)
  get discountAmount(): number {
    return +this.lines.reduce((s, l) => s + Number(l.qty ?? 0) * Number(l.unitPrice ?? 0) * (Number(l.discountPct ?? 0) / 100), 0).toFixed(2);
  }
  get netAfterDiscount(): number { return +(this.subTotal - this.discountAmount).toFixed(2); }
  get taxAmount(): number { return +this.lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0).toFixed(2); }
  get grandTotal(): number { return +(this.netAfterDiscount + this.taxAmount + Number(this.shippingCost ?? 0)).toFixed(2); }

  // ── OCR upload (stub) ─────────────────────────────────
  onOcrUpload(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void Swal.fire('Info', `Selected "${file.name}". OCR extraction isn't wired to the backend yet.`, 'info');
  }

  // ── Edit ──────────────────────────────────────────────
  loadForEdit(): void {
    this.loading = true;
    this.svc.getSalesInvoiceById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const hdr = d.header ?? d;
        const rows = d.lines ?? hdr.lines ?? [];
        this.invoiceNo = hdr.invoiceNo ?? hdr.siNo ?? '';
        this.invoiceDate = hdr.invoiceDate ? String(hdr.invoiceDate).substring(0, 10) : this.invoiceDate;
        this.sourceType = Number(hdr.sourceType ?? 1);
        this.sourceId = this.sourceType === 1
          ? (hdr.soId ?? hdr.salesOrderId ?? null)
          : (hdr.doId ?? hdr.deliveryOrderId ?? null);
        this.shippingCost = Number(hdr.shippingCost ?? 0);
        this.remarks = hdr.remarks ?? '';
        this.customerName = hdr.customerName ?? hdr.CustomerName ?? '';
        this.sourceRef = hdr.sourceRef ?? hdr.SourceRef ?? '';
        this.currencyName = hdr.currencyName ?? this.currencyName;
        this.status = hdr.glPosted ? 'Posted' : (hdr.status ?? 'Draft');
        this.lines = (rows ?? []).map((r: any) => ({
          sourceLineId: r.sourceLineId ?? null,
          itemId: r.itemId ?? null,
          itemName: r.itemName ?? '',
          description: r.description || r.itemName || '',
          ledgerId: r.budgetLineId ?? r.ledgerId ?? null,
          uom: r.uom ?? r.uomName ?? '',
          qty: Number(r.qty ?? 0),
          unitPrice: Number(r.unitPrice ?? 0),
          discountPct: Number(r.discountPct ?? 0),
          gstPct: Number(r.gstPct ?? 0),
          tax: r.tax ?? '',
          taxCodeId: r.taxCodeId ?? null,
          lineAmount: Number(r.lineAmount ?? 0),
          taxAmount: Number(r.taxAmount ?? 0)
        }));
        this.recalcLines();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // ── Save ──────────────────────────────────────────────
  submit(): void {
    if (!this.invoiceDate) { void Swal.fire('Validation', 'Invoice Date is required.', 'warning'); return; }

    this.saving = true;

    if (this.isEdit) {
      this.svc.updateSalesInvoiceHeader(this.id!, { invoiceDate: this.invoiceDate }).subscribe({
        next: () => { this.saving = false; void Swal.fire('Success', 'Invoice updated.', 'success').then(() => this.back()); },
        error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Update failed.', 'error'); }
      });
      return;
    }

    if (!this.sourceId || !this.lines.length) {
      this.saving = false;
      void Swal.fire('Validation', 'Select a source document and load at least one line.', 'warning');
      return;
    }

    const payload: any = {
      sourceType: this.sourceType,
      soId: this.sourceType === 1 ? this.sourceId : null,
      doId: this.sourceType === 2 ? this.sourceId : null,
      invoiceDate: this.invoiceDate,
      subtotal: this.netAfterDiscount,
      discount: this.discountAmount,
      shippingCost: Number(this.shippingCost ?? 0),
      total: this.grandTotal,
      remarks: (this.remarks || '').trim() || '-',
      taxAmount: this.taxAmount,
      lines: this.lines.map(l => ({
        sourceLineId: l.sourceLineId ?? null,
        itemId: l.itemId,
        itemName: l.itemName ?? null,
        uom: l.uom ?? null,
        qty: Number(l.qty ?? 0),
        unitPrice: Number(l.unitPrice ?? 0),
        discountPct: Number(l.discountPct ?? 0),
        gstPct: Number(l.gstPct ?? 0),
        tax: l.tax ?? '',
        taxCodeId: l.taxCodeId ?? null,
        lineAmount: Number(l.lineAmount ?? 0),
        taxAmount: Number(l.taxAmount ?? 0),
        description: l.description || null,
        budgetLineId: l.ledgerId ?? null
      }))
    };

    this.svc.createSalesInvoice(payload).subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Save failed.', 'error'); }
    });
  }

  back(): void { this.router.navigate(['/app/sales/invoices']); }

  get title(): string { return this.isEdit ? 'Sales Invoice (SI)' : 'Sales Invoice (SI)'; }
  get today(): string { return new Date().toISOString().substring(0, 10); }

  getLabel(opts: any[], val: any): string {
    return opts.find(o => String(o.value) === String(val))?.label ?? '—';
  }
}
