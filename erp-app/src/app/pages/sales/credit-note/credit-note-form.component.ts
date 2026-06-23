import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

interface CnFormLine {
  doLineId: number | null;
  siId: number | null;
  itemId: number | null;
  itemName: string;
  uom: string | null;
  deliveredQty: number;
  returnedQty: number;
  unitPrice: number;
  discountPct: number;
  gstPct: number;
  tax: string | null;
  taxCodeId: number | null;
  lineNet: number;
  taxAmount: number;
  reasonId: number | null;
  dispositionId: number;
  warehouseId: number | null;
  supplierId: number | null;
  binId: number | null;
}

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Approved', 3: 'Rejected' };

@Component({
  selector: 'erp-credit-note-form',
  standalone: false,
  templateUrl: './credit-note-form.component.html',
  styleUrls: ['./credit-note-form.component.scss']
})
export class CreditNoteFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;

  // Header
  doId: number | null = null;
  doNumber: string | null = null;
  siId: number | null = null;
  siNumber = '';
  customerId: number | null = null;
  customerName = '';
  creditNoteNo = '';
  creditNoteDate = this.today();
  requestedDate = this.today();
  remarks = '';
  status = 0;

  // Lines
  lines: CnFormLine[] = [];

  // Dropdown options
  doOptions: any[] = [];
  itemOptions: any[] = [];
  availableItems: any[] = [];   // delivered items of the selected DO (dropdown pool)
  reasonOptions: any[] = [];
  dispositions = [
    { id: 1, name: 'RESTOCK' },
    { id: 2, name: 'SCRAP' }
  ];
  private selectedDoRaw: any = null;

  readonly fnId = 'cn-list';
  constructor(
    private svc: SalesService,
    private route: ActivatedRoute,
    private router: Router,
    public perm: PermissionService
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); }
    this.loadLookups();
    this.loadDoOptions();
    if (this.isEdit) { this.loadForEdit(); }
  }

  // ── Date helpers ──────────────────────────────────────
  private today(): string { return new Date().toISOString().substring(0, 10); }
  private toDateInput(v: any): string {
    if (!v) return '';
    return typeof v === 'string' ? v.substring(0, 10) : this.today();
  }

  // ── Lookups ───────────────────────────────────────────
  loadLookups(): void {
    this.svc.getItems().subscribe(r =>
      this.itemOptions = this.svc.unwrap(r).map((i: any) => ({
        label: i.itemName ?? i.name ?? '', value: i.id ?? i.itemId, raw: i
      })));
    this.svc.getReturnReasons().subscribe(r =>
      this.reasonOptions = this.svc.unwrap(r).map((x: any) => ({
        label: x.name ?? x.reason ?? x.stockIssueName ?? x.issueName ?? `Reason ${x.id}`,
        value: x.id ?? x.Id
      })));
  }

  loadDoOptions(): void {
    this.svc.getAvailableDeliveryOrdersForCreditNote().subscribe({
      next: res => {
        this.doOptions = this.svc.unwrap(res).map((d: any) => ({
          label: `${d.doNumber ?? d.doNo ?? ''} - ${d.customerName ?? ''}`,
          value: d.id ?? d.Id,
          raw: d
        }));
      }
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getCreditNoteById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.creditNoteNo = d.creditNoteNo ?? d.CreditNoteNo ?? '';
        this.doId = d.doId ?? d.DoId ?? null;
        this.doNumber = d.doNumber ?? d.DoNumber ?? '';
        this.siId = d.siId ?? d.SiId ?? null;
        this.siNumber = d.siNumber ?? d.SiNumber ?? d.invoiceNo ?? '';
        this.customerId = d.customerId ?? d.CustomerId ?? null;
        this.customerName = d.customerName ?? d.CustomerName ?? '';
        this.creditNoteDate = this.toDateInput(d.creditNoteDate ?? d.CreditNoteDate) || this.today();
        this.requestedDate = this.toDateInput(d.requestedDate ?? d.RequestedDate) || this.today();
        this.remarks = d.remarks ?? d.Remarks ?? '';
        this.status = Number(d.status ?? d.Status ?? 0);
        this.lines = (d.lines ?? d.Lines ?? []).map((l: any) => this.mapLine(l));
        this.recalcAll();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private mapLine(l: any): CnFormLine {
    return {
      doLineId: l.doLineId ?? l.DoLineId ?? null,
      siId: l.siId ?? l.SiId ?? this.siId,
      itemId: l.itemId ?? l.ItemId ?? null,
      itemName: l.itemName ?? l.ItemName ?? '',
      uom: l.uom ?? l.Uom ?? null,
      deliveredQty: Number(l.deliveredQty ?? l.DeliveredQty ?? 0),
      returnedQty: Number(l.returnedQty ?? l.ReturnedQty ?? 0),
      unitPrice: Number(l.unitPrice ?? l.UnitPrice ?? 0),
      discountPct: Number(l.discountPct ?? l.DiscountPct ?? 0),
      gstPct: Number(l.gstPct ?? l.GstPct ?? 0),
      tax: l.tax ?? l.Tax ?? null,
      taxCodeId: l.taxCodeId ?? l.TaxCodeId ?? null,
      lineNet: Number(l.lineNet ?? l.LineNet ?? 0),
      taxAmount: Number(l.taxAmount ?? l.TaxAmount ?? 0),
      reasonId: l.reasonId ?? l.ReasonId ?? null,
      dispositionId: Number(l.restockDispositionId ?? l.RestockDispositionId ?? 1) || 1,
      warehouseId: l.warehouseId ?? l.WarehouseId ?? null,
      supplierId: l.supplierId ?? l.SupplierId ?? null,
      binId: l.binId ?? l.BinId ?? null
    };
  }

  // ── DO selection ──────────────────────────────────────
  onDoSelect(): void {
    if (!this.doId) { this.clearDo(); return; }
    const opt = this.doOptions.find(o => String(o.value) === String(this.doId));
    const raw = opt?.raw ?? null;
    this.selectedDoRaw = raw;
    this.doNumber = raw?.doNumber ?? raw?.doNo ?? '';
    this.siId = raw?.siId ?? raw?.SiId ?? null;
    this.siNumber = raw?.invoiceNo ?? raw?.InvoiceNo ?? raw?.siNumber ?? '';
    this.customerId = raw?.customerId ?? raw?.CustomerId ?? null;
    this.customerName = raw?.customerName ?? raw?.CustomerName ?? '';

    // Load the DO's delivered items into the dropdown pool (NOT the table).
    this.lines = [];
    this.availableItems = [];
    this.svc.getCreditNoteDoLines(this.doId).subscribe({
      next: res => {
        this.availableItems = this.svc.unwrap(res).map((r: any) => ({
          doLineId: r.doLineId ?? r.DoLineId ?? r.id ?? null,
          itemId: r.itemId ?? r.ItemId ?? null,
          itemName: r.itemName ?? r.ItemName ?? '',
          uom: r.uom ?? r.Uom ?? '',
          deliveredQty: Number(r.qtyRemaining ?? r.QtyRemaining ?? r.deliveredQty ?? r.DeliveredQty ?? r.qty ?? r.Qty ?? 0),
          unitPrice: Number(r.unitPrice ?? r.UnitPrice ?? 0),
          discountPct: Number(r.discountPct ?? r.DiscountPct ?? 0),
          gstPct: Number(r.gstPct ?? r.GstPct ?? 0),
          tax: r.tax ?? r.Tax ?? null,
          taxCodeId: r.taxCodeId ?? r.TaxCodeId ?? null,
          warehouseId: r.warehouseId ?? r.WarehouseId ?? null,
          supplierId: r.supplierId ?? r.SupplierId ?? null,
          binId: r.binId ?? r.BinId ?? null
        }));
      },
      error: () => { this.availableItems = []; }
    });
  }

  private clearDo(): void {
    this.selectedDoRaw = null;
    this.doNumber = null;
    this.siId = null;
    this.siNumber = '';
    this.customerId = null;
    this.customerName = '';
    this.lines = [];
  }

  // ── Lines ─────────────────────────────────────────────
  addLine(): void {
    this.lines.push({
      doLineId: null, siId: this.siId, itemId: null, itemName: '', uom: null,
      deliveredQty: 0, returnedQty: 0, unitPrice: 0, discountPct: 0, gstPct: 0,
      tax: null, taxCodeId: null, lineNet: 0, taxAmount: 0, reasonId: null, dispositionId: 1,
      warehouseId: null, supplierId: null, binId: null
    });
  }

  onItemSelect(line: CnFormLine): void {
    const src = this.availableItems.find(o => String(o.itemId) === String(line.itemId));
    if (src) {
      line.doLineId = src.doLineId;
      line.itemName = src.itemName;
      line.uom = src.uom;
      line.deliveredQty = src.deliveredQty;
      line.unitPrice = src.unitPrice;
      line.discountPct = src.discountPct;
      line.gstPct = src.gstPct;
      line.tax = src.tax;
      line.taxCodeId = src.taxCodeId;
      line.warehouseId = src.warehouseId;
      line.supplierId = src.supplierId;
      line.binId = src.binId;
      line.siId = this.siId;
    }
    this.recalcLine(line);
  }

  recalcLine(line: CnFormLine): void {
    let qty = Number(line.returnedQty) || 0;
    if (qty < 0) qty = 0;
    if (line.deliveredQty > 0 && qty > line.deliveredQty) qty = line.deliveredQty;
    line.returnedQty = qty;
    const unit = Number(line.unitPrice) || 0;
    const disc = Number(line.discountPct) || 0;
    const gst = Number(line.gstPct) || 0;
    line.lineNet = +(qty * unit * (1 - disc / 100)).toFixed(2);
    line.taxAmount = +(line.lineNet * gst / 100).toFixed(2);
  }

  lineAmount(l: CnFormLine): number { return +((l.lineNet || 0) + (l.taxAmount || 0)).toFixed(2); }
  get taxTotal(): number { return +this.lines.reduce((s, l) => s + (Number(l.taxAmount) || 0), 0).toFixed(2); }
  get total(): number { return +(this.subtotal + this.taxTotal).toFixed(2); }

  recalcAll(): void { this.lines.forEach(l => this.recalcLine(l)); }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  get subtotal(): number {
    return +this.lines.reduce((s, l) => s + (Number(l.lineNet) || 0), 0).toFixed(2);
  }

  getLabel(options: any[], value: any): string {
    return options.find(o => String(o.value) === String(value))?.label ?? '';
  }

  get title(): string { return this.isEdit ? 'Edit Credit Note' : 'New Credit Note'; }
  get statusLabel(): string { return STATUS_MAP[this.status] ?? 'Draft'; }

  // ── Save ──────────────────────────────────────────────
  saveAsDraft(): void { this.submit(0); }
  saveAndApprove(): void { this.submit(2); }

  private submit(statusValue: number): void {
    if (!this.doId) { void Swal.fire('Validation', 'Select a Delivery Order.', 'warning'); return; }
    if (!this.lines.length) { void Swal.fire('Validation', 'No lines to return.', 'warning'); return; }

    this.saving = true;
    const firstSiId = this.siId ?? (this.lines[0]?.siId ?? null);

    const payload: any = {
      doId: this.doId,
      doNumber: this.doNumber,
      siId: firstSiId,
      customerId: this.customerId,
      customerName: this.customerName,
      requestedDate: this.requestedDate || null,
      creditNoteDate: this.creditNoteDate,
      status: statusValue,
      subtotal: this.subtotal,
      remarks: this.remarks || '-',
      lines: this.lines.map(l => ({
        doLineId: l.doLineId,
        siId: l.siId ?? firstSiId,
        itemId: l.itemId,
        itemName: l.itemName,
        uom: l.uom,
        deliveredQty: Number(l.deliveredQty) || 0,
        returnedQty: Number(l.returnedQty) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        discountPct: Number(l.discountPct) || 0,
        gstPct: Number(l.gstPct) || 0,
        tax: l.tax,
        taxCodeId: l.taxCodeId,
        lineNet: Number(l.lineNet) || 0,
        taxAmount: Number(l.taxAmount) || 0,
        reasonId: l.reasonId ?? null,
        restockDispositionId: l.dispositionId ?? 1,
        warehouseId: l.warehouseId ?? null,
        supplierId: l.supplierId ?? 0,
        binId: l.binId ?? null
      }))
    };

    const obs$ = this.isEdit
      ? this.svc.updateCreditNote({ Id: this.id, ...payload })
      : this.svc.createCreditNote(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Save failed.', 'error'); }
    });
  }

  back(): void { this.router.navigate(['/app/sales/credit-notes']); }
}
