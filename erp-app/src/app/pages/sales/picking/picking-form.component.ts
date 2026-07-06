import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalesService } from '../sales.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

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
  // Package grouping (display only): a header row carries the package name; children hold pick data.
  isSetHeader?: boolean;
  itemSetId?: number | null;
  setName?: string;
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
  collapsedSets = new Set<number>();

  // Sales order options
  soOptions: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || null;

  readonly fnId = 'sales-pp-list';
  constructor(
    private svc: SalesService,
    private route: ActivatedRoute,
    private router: Router,
    public perm: PermissionService
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

        // Group package lines under an "Executive Lunch Buffet" style header (collapsed by default).
        this.applyPackageGrouping(h.itemSets ?? h.ItemSets ?? []);

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
        void Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to load sales order lines / codes.', confirmButtonColor: '#16a34a' });
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
    // Count a package once (its header qty) plus standalone items; exclude package children.
    return this.rows
      .filter(r => r.isSetHeader || !r.itemSetId)
      .reduce((s, r) => s + (+(r.qty ?? 0) || 0), 0);
  }

  // ── Package grouping (display only) ───────────────────
  isPackageChild(r: PickRow): boolean { return !!r.itemSetId && !r.isSetHeader; }
  isSetCollapsed(id: number | null | undefined): boolean { return this.collapsedSets.has(Number(id)); }
  toggleSet(id: number | null | undefined): void {
    const key = Number(id);
    if (this.collapsedSets.has(key)) this.collapsedSets.delete(key);
    else this.collapsedSets.add(key);
  }

  // Package children are packed via their header's carton; standalone items use their own.
  private cartonForRow(r: PickRow): number | null {
    if (r.isSetHeader) return null;
    if (r.itemSetId) {
      const hdr = this.rows.find(x => x.isSetHeader && Number(x.itemSetId) === Number(r.itemSetId));
      return hdr?.cartonId ?? null;
    }
    return r.cartonId ?? null;
  }

  private applyPackageGrouping(apiItemSets: any[]): void {
    const sets = (apiItemSets || []).map((x: any) => ({
      id: Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0),
      setName: String(x.setName ?? x.SetName ?? x.itemSetName ?? x.ItemSetName ?? '').trim(),
      qty: Number(x.qty ?? x.Qty ?? 0) || 0
    })).filter((s: any) => s.id > 0);
    if (!sets.length) return;

    forkJoin(sets.map((s: any) => this.svc.getItemSetById(s.id))).subscribe({
      next: (responses: any[]) => {
        const itemIdToSet = new Map<number, { itemSetId: number; setName: string }>();
        responses.forEach((res: any, idx: number) => {
          const setId = sets[idx].id;
          const sdto = this.svc.unwrapOne(res);
          const setName = sets[idx].setName || String(sdto?.setName ?? `Set #${setId}`);
          const rows: any[] = sdto?.items ?? sdto?.itemSetItems ?? sdto?.lines ?? [];
          for (const r of rows) {
            const itemId = Number(r.itemId ?? r.ItemId ?? 0);
            if (itemId && !itemIdToSet.has(itemId)) itemIdToSet.set(itemId, { itemSetId: setId, setName });
          }
        });

        for (const r of this.rows) {
          if (r.isSetHeader) continue;
          const m = itemIdToSet.get(Number(r.itemId));
          if (m) { r.itemSetId = m.itemSetId; r.setName = m.setName; }
        }

        const items = this.rows.filter(r => !r.isSetHeader);
        const rebuilt: PickRow[] = [];
        this.collapsedSets.clear();
        for (const s of sets) {
          const group = items.filter(r => Number(r.itemSetId) === s.id);
          if (!group.length) continue;
          rebuilt.push({
            soLineId: null, itemId: null, itemName: s.setName || `Set #${s.id}`, uom: '',
            warehouseId: null, warehouseName: '', binId: null, binName: '', supplierId: null,
            // The package qty is its own ordered qty (e.g. 10 buffets), not the sum of its contents.
            qty: s.qty || (group[0]?.qty ?? 0), cartonId: null,
            isSetHeader: true, itemSetId: s.id, setName: s.setName
          });
          for (const g of group) rebuilt.push(g);
          this.collapsedSets.add(s.id); // start collapsed
        }
        for (const r of items.filter(r => !r.itemSetId)) rebuilt.push(r);
        this.rows = rebuilt;
      },
      error: () => { /* leave ungrouped */ }
    });
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

        // Regroup package lines under their header (item sets come from the source SO).
        if (this.soId) {
          this.svc.getSalesOrderById(this.soId).subscribe({
            next: soRes => {
              const so = this.svc.unwrapOne(soRes);
              this.applyPackageGrouping(so?.itemSets ?? so?.ItemSets ?? []);
            },
            error: () => { /* leave ungrouped */ }
          });
        }

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
    if (!this.soId) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select a Sales Order.', confirmButtonColor: '#16a34a' }); return; }
    if (!this.rows.length) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'No pick lines to save.', confirmButtonColor: '#16a34a' }); return; }
    this.saving = true;

    const payload: any = {
      SoId: this.soId,
      SoDate: this.soDate || null,
      DeliveryDate: this.deliveryDate || null,
      BarCode: this.barCode || null,
      QrCode: this.qrText || null,
      Status: this.status ?? 0,
      CreatedBy: this.loginUserId ?? 0,
      UpdatedBy: this.loginUserId ?? 0,
      LineItems: this.rows.filter(r => !r.isSetHeader).map(r => ({
        SoLineId: r.soLineId ?? 0,
        ItemId: r.itemId ?? 0,
        WarehouseId: r.warehouseId ?? 0,
        BinId: r.binId ?? null,
        SupplierId: r.supplierId ?? null,
        Quantity: +(r.qty ?? 0) || 0,
        CartonId: this.cartonForRow(r)
      }))
    };
    if (this.isEdit) payload.Id = this.id;

    const obs$ = this.isEdit ? this.svc.updatePacking(payload) : this.svc.createPacking(payload);
    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Save failed.', 'error'); }
    });
  }

  // ── Codes actions ─────────────────────────────────────
  copy(text: string): void {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => { void Swal.fire({ icon: 'success', title: 'Copied!', text: 'Copied to clipboard.', timer: 1500, showConfirmButton: false }); },
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
    if (!this.rows.length) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Select a Sales Order first.', confirmButtonColor: '#16a34a' }); return; }
    const rowsHtml = this.rows.filter(r => !r.isSetHeader).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${this.esc(r.itemName)}${r.uom ? ` <small>&middot; ${this.esc(r.uom)}</small>` : ''}</td>
        <td>${this.esc(r.warehouseName)}</td>
        <td style="text-align:right">${r.qty ?? 0}</td>
        <td>${this.esc(this.cartonName(this.cartonForRow(r)))}</td>
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
        <thead><tr><th>#</th><th>Item</th><th>Warehouse</th><th style="text-align:right">Qty</th><th>Pack to Carton</th></tr></thead>
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
