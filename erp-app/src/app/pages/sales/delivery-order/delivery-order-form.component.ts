import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SalesService } from '../sales.service';

interface DoLine {
  soLineId: number | null;
  itemId: number | null;
  itemName: string;
  uom: string;
  orderedQty: number;
  pendingQty: number;
  deliverQty: number;
  notes: string;
  warehouseId: number | null;
  binId: number | null;
  supplierId: number | null;
}

const STATUS_LABEL: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Approved', 3: 'Rejected', 4: 'Posted' };

@Component({
  selector: 'erp-delivery-order-form',
  standalone: false,
  templateUrl: './delivery-order-form.component.html',
  styleUrls: ['./delivery-order-form.component.scss']
})
export class DeliveryOrderFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';
  success = '';
  status = 0;
  isPosted = false;

  // Header
  soId: number | null = null;
  soNo = '';
  customerName = '';
  modeOfDeliveryId = 1;
  deliveryDate = '';
  deliveryTime = '';
  deliveryTo = '';
  driverId: number | null = null;
  driverMobileNo = '';
  vehicleId: number | null = null;

  // Receiver
  receivedPersonName = '';
  receivedPersonMobileNo = '';
  receivedSignature: string | null = null;

  // Lines
  lines: DoLine[] = [];

  // Lookups
  soOptions: any[] = [];
  driverOptions: any[] = [];
  vehicleOptions: any[] = [];
  deliveryModes = [
    { id: 1, name: 'Delivery' },
    { id: 2, name: 'Self Collected' }
  ];

  // Signature pad
  showSignature = false;
  @ViewChild('sigCanvas') sigCanvas!: ElementRef<HTMLCanvasElement>;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private hasInk = false;

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
    this.loadLookups();
    if (this.isEdit) this.loadForEdit();
  }

  loadLookups(): void {
    this.svc.getAvailableSalesOrdersForDelivery().subscribe(r => {
      this.soOptions = this.svc.unwrap(r).map((so: any) => ({
        id: Number(so.id ?? so.Id),
        label: `${so.salesOrderNo ?? so.soNo ?? so.number ?? so.id} — ${so.customerName ?? so.CustomerName ?? ''}`.trim(),
        raw: so
      }));
    });
    this.svc.getDrivers().subscribe(r => {
      this.driverOptions = this.svc.unwrap(r).map((d: any) => ({
        id: Number(d.id ?? d.Id),
        name: d.driverName ?? d.name ?? d.fullName ?? `Driver ${d.id}`,
        mobile: d.mobileNo ?? d.mobile ?? d.phone ?? d.contactNo ?? d.phoneNumber ?? ''
      }));
      if (this.isEdit && this.driverId) this.onDriverChange();
    });
    this.svc.getVehicles().subscribe(r => {
      this.vehicleOptions = this.svc.unwrap(r).map((v: any) => ({
        id: Number(v.id ?? v.Id),
        label: v.vehicleNo ?? v.vehicleNumber ?? v.VehicleNo ?? v.name ?? `Vehicle ${v.id}`
      }));
    });
  }

  get isSelfMode(): boolean { return Number(this.modeOfDeliveryId) === 2; }

  onModeChange(): void {
    if (this.isSelfMode) {
      this.driverId = null;
      this.vehicleId = null;
      this.driverMobileNo = '';
    }
  }

  onDriverChange(): void {
    const d = this.driverOptions.find(x => Number(x.id) === Number(this.driverId));
    this.driverMobileNo = d?.mobile ?? '';
  }

  // ── Sales order selection ─────────────────────────────
  onSoChange(): void {
    const sid = Number(this.soId);
    if (!sid || sid <= 0) { this.resetSo(); return; }
    this.loading = true;
    this.error = '';
    this.svc.getSalesOrderById(sid).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.soNo = d.salesOrderNo ?? d.soNo ?? '';
        this.customerName = d.customerName ?? d.CustomerName ?? '';
        if (!this.deliveryDate) this.deliveryDate = this.toDate(d.deliveryDate ?? d.DeliveryDate);
        if (!this.deliveryTo) this.deliveryTo = String(d.deliveryTo ?? d.DeliveryTo ?? '');

        const rawLines = d.lineItems ?? d.LineItems ?? d.lines ?? d.salesOrderLines ?? [];
        const arr: any[] = Array.isArray(rawLines) ? rawLines : [];
        this.lines = arr.map((l: any) => {
          const ordered = Number(l.quantity ?? l.Quantity ?? l.orderedQty ?? l.qty ?? 0) || 0;
          const delivered = Number(l.deliveredQty ?? l.shippedQty ?? 0) || 0;
          const pending = Math.max(ordered - delivered, 0);
          return {
            soLineId: Number(l.id ?? l.Id ?? l.soLineId ?? 0) || null,
            itemId: Number(l.itemId ?? l.ItemId ?? 0) || null,
            itemName: l.itemName ?? l.ItemName ?? '',
            uom: l.uom ?? l.Uom ?? l.uomName ?? '',
            orderedQty: ordered,
            pendingQty: pending || ordered,
            deliverQty: pending || ordered,
            notes: '',
            warehouseId: (l.warehouseId ?? l.WarehouseId) != null ? Number(l.warehouseId ?? l.WarehouseId) : null,
            binId: (l.binId ?? l.BinId) != null ? Number(l.binId ?? l.BinId) : null,
            supplierId: (l.supplierId ?? l.SupplierId) != null ? Number(l.supplierId ?? l.SupplierId) : null
          } as DoLine;
        });
        this.loading = false;
      },
      error: () => { this.loading = false; this.error = 'Unable to load sales order lines.'; }
    });
  }

  private resetSo(): void {
    this.soNo = this.customerName = '';
    this.lines = [];
  }

  clampQty(l: DoLine): void {
    let v = Number(l.deliverQty);
    if (isNaN(v) || v < 0) v = 0;
    if (v > l.pendingQty) v = l.pendingQty;
    l.deliverQty = v;
  }

  get totalDeliverQty(): number {
    return this.lines.reduce((s, l) => s + (Number(l.deliverQty) || 0), 0);
  }

  // ── Edit load ─────────────────────────────────────────
  loadForEdit(): void {
    this.loading = true;
    this.svc.getDeliveryOrderById(this.id!).subscribe({
      next: res => {
        const data = this.svc.unwrapOne(res);
        const h = data.header ?? data.Header ?? data;
        this.soId = (h.soId ?? h.SoId) != null ? Number(h.soId ?? h.SoId) : null;
        this.soNo = h.salesOrderNo ?? h.SalesOrderNo ?? '';
        this.customerName = h.customerName ?? h.CustomerName ?? '';
        this.status = Number(h.status ?? h.Status ?? 0) || 0;
        this.isPosted = !!(h.isPosted ?? h.IsPosted);
        this.modeOfDeliveryId = Number(h.modeOfDeliveryId ?? h.ModeOfDeliveryId ?? 1) || 1;
        this.deliveryDate = this.toDate(h.deliveryDate ?? h.DeliveryDate);
        this.deliveryTime = this.normalizeTime(h.deliveryTime ?? h.DeliveryTime);
        this.deliveryTo = String(h.routeName ?? h.RouteName ?? '');
        this.driverId = (h.driverId ?? h.DriverId) != null ? Number(h.driverId ?? h.DriverId) : null;
        this.vehicleId = (h.vehicleId ?? h.VehicleId) != null ? Number(h.vehicleId ?? h.VehicleId) : null;
        this.driverMobileNo = String(h.driverMobileNo ?? h.DriverMobileNo ?? '');
        this.receivedPersonName = String(h.receivedPersonName ?? h.ReceivedPersonName ?? '');
        this.receivedPersonMobileNo = String(h.receivedPersonMobileNo ?? h.ReceivedPersonMobileNo ?? '');
        this.receivedSignature = h.receivedSignature ?? h.ReceivedSignature ?? null;

        const rawLines = data.lines ?? data.Lines ?? h.lines ?? [];
        const arr: any[] = Array.isArray(rawLines) ? rawLines : [];
        this.lines = arr.map((l: any) => {
          const qty = Number(l.qty ?? l.Qty ?? l.quantity ?? 0) || 0;
          return {
            soLineId: (l.soLineId ?? l.SoLineId) != null ? Number(l.soLineId ?? l.SoLineId) : null,
            itemId: (l.itemId ?? l.ItemId) != null ? Number(l.itemId ?? l.ItemId) : null,
            itemName: l.itemName ?? l.ItemName ?? '',
            uom: l.uom ?? l.Uom ?? '',
            orderedQty: qty,
            pendingQty: qty,
            deliverQty: qty,
            notes: l.notes ?? l.Notes ?? '',
            warehouseId: null, binId: null, supplierId: null
          } as DoLine;
        });
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // ── Signature pad ─────────────────────────────────────
  openSignature(): void {
    this.showSignature = true;
    this.hasInk = false;
    setTimeout(() => this.initCanvas(), 50);
  }

  private initCanvas(): void {
    const canvas = this.sigCanvas?.nativeElement;
    if (!canvas) return;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.ctx.lineWidth = 2.2;
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = '#1f2937';
  }

  private pos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvas = this.sigCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const p = (e as TouchEvent).touches?.[0] ?? (e as MouseEvent);
    return {
      x: (p.clientX - rect.left) * (canvas.width / rect.width),
      y: (p.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  startDraw(e: MouseEvent | TouchEvent): void {
    if (!this.ctx) return;
    e.preventDefault();
    this.drawing = true;
    const { x, y } = this.pos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }
  moveDraw(e: MouseEvent | TouchEvent): void {
    if (!this.drawing || !this.ctx) return;
    e.preventDefault();
    const { x, y } = this.pos(e);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.hasInk = true;
  }
  endDraw(): void { this.drawing = false; }

  clearSignature(): void { this.initCanvas(); this.hasInk = false; }

  saveSignature(): void {
    if (this.hasInk && this.sigCanvas) {
      this.receivedSignature = this.sigCanvas.nativeElement.toDataURL('image/png');
    }
    this.showSignature = false;
  }

  removeSignature(): void { this.receivedSignature = null; }

  // ── Save ──────────────────────────────────────────────
  submit(): void {
    if (this.isPosted) { this.error = 'This delivery order is already posted.'; return; }
    if (!this.soId) { this.error = 'Please select a Sales Order.'; return; }
    const anyQty = this.lines.some(l => (Number(l.deliverQty) || 0) > 0);
    if (!anyQty) { this.error = 'Enter at least one deliver quantity.'; return; }
    this.saving = true;
    this.error = '';
    this.success = '';

    if (this.isEdit) {
      const header: any = {
        DriverId: this.isSelfMode ? null : this.driverId,
        VehicleId: this.isSelfMode ? null : this.vehicleId,
        RouteName: (this.deliveryTo || '').trim() || null,
        DeliveryDate: this.deliveryDate || null,
        ModeOfDeliveryId: this.modeOfDeliveryId,
        DriverMobileNo: this.isSelfMode ? null : (this.driverMobileNo || null),
        ReceivedPersonName: (this.receivedPersonName || '').trim() || null,
        ReceivedPersonMobileNo: this.receivedPersonMobileNo || null,
        ReceivedSignature: this.receivedSignature || null
      };
      this.svc.updateDeliveryOrderHeader(this.id!, header).subscribe({
        next: () => { this.saving = false; this.back(); },
        error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
      });
      return;
    }

    const payload: any = {
      SoId: this.soId,
      PackId: null,
      DriverId: this.isSelfMode ? null : this.driverId,
      VehicleId: this.isSelfMode ? null : this.vehicleId,
      RouteName: (this.deliveryTo || '').trim() || null,
      DeliveryDate: this.deliveryDate || null,
      DeliveryTime: this.deliveryTime || null,
      ModeOfDeliveryId: this.modeOfDeliveryId,
      DriverMobileNo: this.isSelfMode ? null : (this.driverMobileNo || null),
      ReceivedPersonName: (this.receivedPersonName || '').trim() || null,
      ReceivedPersonMobileNo: this.receivedPersonMobileNo || null,
      ReceivedSignature: this.receivedSignature || null,
      Lines: this.lines
        .filter(l => (Number(l.deliverQty) || 0) > 0)
        .map(l => ({
          SoLineId: l.soLineId ?? null,
          PackLineId: null,
          ItemId: l.itemId ?? null,
          ItemName: l.itemName || '',
          Uom: (l.uom || '').toString(),
          Qty: Number(l.deliverQty) || 0,
          Notes: l.notes || null,
          WarehouseId: l.warehouseId ?? null,
          BinId: l.binId ?? null,
          SupplierId: l.supplierId ?? null
        }))
    };

    this.svc.createDeliveryOrder(payload).subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Failed to create delivery order.'; }
    });
  }

  clear(): void {
    if (this.isEdit) return;
    this.soId = null; this.resetSo();
    this.modeOfDeliveryId = 1;
    this.deliveryDate = this.deliveryTime = this.deliveryTo = '';
    this.driverId = this.vehicleId = null;
    this.driverMobileNo = '';
    this.receivedPersonName = this.receivedPersonMobileNo = '';
    this.receivedSignature = null;
    this.error = this.success = '';
  }

  // ── Helpers ───────────────────────────────────────────
  private toDate(v: any): string {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10);
  }
  private normalizeTime(v: any): string {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : '';
  }

  back(): void { this.router.navigate(['/app/sales/delivery-orders']); }

  get title(): string { return this.isEdit ? 'Edit Delivery Order' : 'Create Delivery Order'; }
  get statusLabel(): string { return STATUS_LABEL[Number(this.status)] ?? 'Draft'; }
}
