import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalesService } from '../sales.service';

interface PickRow {
  soLineId: number | null;
  itemId: number | null;
  itemName: string;
  uom: string;
  warehouseId: number | null;
  warehouseName: string;
  binId: number | null;
  binName: string;
  supplierId: number | null;
  qty: number | null;
  cartonId: number | null;
}

interface Carton { id: number; name: string; }

const STATUS_LABEL: Record<number, string> = { 0: 'Draft', 1: 'Picked', 2: 'Packed', 3: 'Closed' };

@Component({
  selector: 'erp-picking-form',
  standalone: false,
  templateUrl: './picking-form.component.html',
  styleUrls: ['./picking-form.component.scss']
})
export class PickingFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';
  success = '';

  // Header
  soId: number | null = null;
  soNo = '';
  customerName = '';
  soDate = '';
  deliveryDate = '';
  status = 0;

  // Codes
  barCode = '';
  qrText = '';
  barCodeSrc = '';
  qrCodeSrc = '';
  codesLoading = false;

  // Lines
  rows: PickRow[] = [];
  cartonOptions: Carton[] = [];

  // Sales order options
  soOptions: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || null;

  constructor(
    private svc: SalesService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) this.id = Number(paramId);
    this.loadSalesOrders();
    if (this.isEdit) this.loadForEdit();
  }

  loadSalesOrders(): void {
    this.svc.getAvailableSalesOrdersForPicking(this.isEdit ? this.id : null).subscribe({
      next: r => {
        this.soOptions = this.svc.unwrap(r).map((so: any) => ({
          id: Number(so.id ?? so.Id),
          label: `${so.salesOrderNo ?? so.soNo ?? so.number ?? so.id} — ${so.customerName ?? so.CustomerName ?? ''}`.trim(),
          raw: so
        }));
      }
    });
  }

  // ── Sales order selection ─────────────────────────────
  onSoChange(): void {
    const sid = Number(this.soId);
    if (!sid || sid <= 0) { this.resetSo(); return; }

    this.loading = true;
    this.codesLoading = true;
    this.error = '';

    forkJoin({
      head: this.svc.getSalesOrderById(sid),
      codes: this.svc.generatePackingCodes(sid)
    }).subscribe({
      next: ({ head, codes }: any) => {
        const h = this.svc.unwrapOne(head);
        const c = this.svc.unwrapOne(codes);

        this.soNo = h.salesOrderNo ?? h.soNo ?? '';
        this.customerName = h.customerName ?? h.CustomerName ?? '';
        this.soDate = this.toDate(h.requestedDate ?? h.orderDate ?? h.RequestedDate);
        this.deliveryDate = this.toDate(h.deliveryDate ?? h.DeliveryDate);

        const rawLines = h.lineItems ?? h.LineItems ?? h.lines ?? h.salesOrderLines ?? [];
        const lines: any[] = Array.isArray(rawLines) ? rawLines : [];
        this.rows = lines.map((l: any) => ({
          soLineId: Number(l.id ?? l.Id ?? l.soLineId ?? 0) || null,
          itemId: Number(l.itemId ?? l.ItemId ?? 0) || null,
          itemName: l.itemName ?? l.ItemName ?? '',
          uom: l.uom ?? l.Uom ?? l.uomName ?? '',
          warehouseId: (l.warehouseId ?? l.WarehouseId) != null ? Number(l.warehouseId ?? l.WarehouseId) : null,
          warehouseName: l.warehouseName ?? l.WarehouseName ?? '',
          binId: (l.binId ?? l.BinId) != null ? Number(l.binId ?? l.BinId) : null,
          binName: l.bin ?? l.Bin ?? l.binName ?? '',
          supplierId: (l.supplierId ?? l.SupplierId) != null ? Number(l.supplierId ?? l.SupplierId) : null,
          qty: Number(l.quantity ?? l.Quantity ?? l.qty ?? 0) || 0,
          cartonId: null
        }));

        this.cartonOptions = this.buildCartons(this.rows.length);

        this.barCode = c.barCode ?? c.BarCode ?? '';
        this.qrText = c.qrText ?? c.QrText ?? '';
        this.barCodeSrc = c.barCodeSrcBase64 ?? c.BarCodeSrcBase64 ?? '';
        this.qrCodeSrc = c.qrCodeSrcBase64 ?? c.QrCodeSrcBase64 ?? '';

        this.loading = false;
        this.codesLoading = false;
      },
      error: () => {
        this.loading = false;
        this.codesLoading = false;
        this.error = 'Unable to load sales order lines / codes.';
      }
    });
  }

  private resetSo(): void {
    this.soNo = this.customerName = this.soDate = this.deliveryDate = '';
    this.barCode = this.qrText = this.barCodeSrc = this.qrCodeSrc = '';
    this.rows = [];
    this.cartonOptions = [];
  }

  private buildCartons(n: number): Carton[] {
    const count = Math.max(n, 1);
    return Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Carton ${i + 1}` }));
  }

  get totalQty(): number {
    return this.rows.reduce((s, r) => s + (+(r.qty ?? 0) || 0), 0);
  }

  // ── Edit load ─────────────────────────────────────────
  loadForEdit(): void {
    this.loading = true;
    this.svc.getPackingById(this.id!).subscribe({
      next: res => {
        const p = this.svc.unwrapOne(res);
        this.soId = Number(p.soId ?? p.SoId ?? 0) || null;
        this.soNo = p.salesOrderNo ?? p.soNo ?? '';
        this.customerName = p.customerName ?? '';
        this.soDate = this.toDate(p.soDate ?? p.requestedDate ?? p.SoDate);
        this.deliveryDate = this.toDate(p.deliveryDate ?? p.DeliveryDate);
        this.status = Number(p.status ?? p.Status ?? 0) || 0;
        this.barCode = p.barCode ?? p.BarCode ?? '';
        this.qrText = p.qrCode ?? p.QrCode ?? '';
        this.barCodeSrc = this.ensureDataUrl(p.barCodeSrc ?? p.barCodeSrcBase64);
        this.qrCodeSrc = this.ensureDataUrl(p.qrCodeSrc ?? p.qrCodeSrcBase64);

        const rawLines = p.lineItems ?? p.LineItems ?? p.lines ?? [];
        const lines: any[] = Array.isArray(rawLines) ? rawLines : [];
        this.rows = lines.map((l: any) => ({
          soLineId: Number(l.soLineId ?? l.SoLineId ?? 0) || null,
          itemId: Number(l.itemId ?? l.ItemId ?? 0) || null,
          itemName: l.itemName ?? l.ItemName ?? '',
          uom: l.uom ?? l.Uom ?? l.uomName ?? '',
          warehouseId: (l.warehouseId ?? l.WarehouseId) != null ? Number(l.warehouseId ?? l.WarehouseId) : null,
          warehouseName: l.warehouseName ?? l.WarehouseName ?? '',
          binId: (l.binId ?? l.BinId) != null ? Number(l.binId ?? l.BinId) : null,
          binName: l.bin ?? l.Bin ?? l.binName ?? '',
          supplierId: (l.supplierId ?? l.SupplierId) != null ? Number(l.supplierId ?? l.SupplierId) : null,
          qty: Number(l.quantity ?? l.Quantity ?? l.qty ?? 0) || 0,
          cartonId: (l.cartonId ?? l.CartonId) != null ? Number(l.cartonId ?? l.CartonId) : null
        }));
        this.cartonOptions = this.buildCartons(this.rows.length);

        // Refresh codes/images if not stored
        if ((!this.barCodeSrc || !this.qrCodeSrc) && this.soId) {
          this.svc.generatePackingCodes(this.soId).subscribe((cr: any) => {
            const c = this.svc.unwrapOne(cr);
            this.barCode = this.barCode || c.barCode || '';
            this.qrText = this.qrText || c.qrText || '';
            this.barCodeSrc = c.barCodeSrcBase64 ?? this.barCodeSrc;
            this.qrCodeSrc = c.qrCodeSrcBase64 ?? this.qrCodeSrc;
          });
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // ── Save ──────────────────────────────────────────────
  submit(): void {
    if (!this.soId) { this.error = 'Please select a Sales Order.'; return; }
    if (!this.rows.length) { this.error = 'No pick lines to save.'; return; }
    this.saving = true;
    this.error = '';
    this.success = '';

    const payload: any = {
      SoId: this.soId,
      SoDate: this.soDate || null,
      DeliveryDate: this.deliveryDate || null,
      BarCode: this.barCode || null,
      QrCode: this.qrText || null,
      Status: this.status ?? 0,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0,
      LineItems: this.rows.map(r => ({
        SoLineId: r.soLineId ?? 0,
        ItemId: r.itemId ?? 0,
        WarehouseId: r.warehouseId ?? 0,
        BinId: r.binId ?? null,
        SupplierId: r.supplierId ?? null,
        Quantity: +(r.qty ?? 0) || 0,
        CartonId: r.cartonId ?? null
      }))
    };
    if (this.isEdit) payload.Id = this.id;

    const obs$ = this.isEdit ? this.svc.updatePacking(payload) : this.svc.createPacking(payload);
    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  // ── Codes actions ─────────────────────────────────────
  copy(text: string): void {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => { this.success = 'Copied to clipboard.'; setTimeout(() => this.success = '', 1500); },
      () => {}
    );
  }

  downloadImage(dataUrl: string, name: string): void {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${name}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  downloadPickList(): void {
    if (!this.rows.length) { this.error = 'Select a Sales Order first.'; return; }
    const rowsHtml = this.rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${this.esc(r.itemName)}${r.uom ? ` <small>&middot; ${this.esc(r.uom)}</small>` : ''}</td>
        <td>${this.esc(r.warehouseName)}</td>
        <td>${this.esc(r.binName)}</td>
        <td style="text-align:right">${r.qty ?? 0}</td>
        <td>${this.esc(this.cartonName(r.cartonId))}</td>
      </tr>`).join('');

    const html = `
      <html><head><title>Pick List ${this.esc(this.barCode || this.soNo)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#1f2937;padding:24px;}
        h2{margin:0 0 4px;} .meta{color:#6b7280;font-size:13px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th{background:#2E5F73;color:#fff;text-align:left;padding:8px;}
        td{padding:7px 8px;border-bottom:1px solid #e5e7eb;}
        .tot{font-weight:700;text-align:right;padding-top:10px;}
        img{height:70px;}
      </style></head><body>
      <h2>Pick List</h2>
      <div class="meta">
        ${this.barCode ? 'Code: <b>' + this.esc(this.barCode) + '</b> &middot; ' : ''}
        SO: <b>${this.esc(this.soNo)}</b> &middot; Customer: <b>${this.esc(this.customerName)}</b><br/>
        SO Date: ${this.esc(this.soDate)} &middot; Delivery Date: ${this.esc(this.deliveryDate)}
      </div>
      ${this.barCodeSrc ? '<img src="' + this.barCodeSrc + '" />' : ''}
      <table>
        <thead><tr><th>#</th><th>Item</th><th>Warehouse</th><th>Bin</th><th style="text-align:right">Qty</th><th>Pack to Carton</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="tot">Total Qty: ${this.totalQty}</div>
      </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  cartonName(id: number | null): string {
    return this.cartonOptions.find(c => c.id === id)?.name ?? '';
  }

  // ── Helpers ───────────────────────────────────────────
  private toDate(v: any): string {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10);
  }

  private ensureDataUrl(v: any): string {
    if (!v) return '';
    const s = String(v);
    return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
  }

  private esc(s: any): string {
    return String(s ?? '').replace(/[&<>"]/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch]);
  }

  back(): void { this.router.navigate(['/app/sales/picking']); }

  get title(): string { return this.isEdit ? 'View / Edit Picking & Packing' : 'New Picking & Packing'; }
  get statusLabel(): string { return STATUS_LABEL[Number(this.status)] ?? 'Draft'; }
}
