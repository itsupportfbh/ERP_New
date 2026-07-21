import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalesService } from '../sales.service';
import { PermissionService } from '../../../core/services/permission.service';
import { environment } from '../../../../environments/environment';
import { QuickAddType, QuickAddResult } from '../../../shared/components/quick-add-modal/quick-add-modal.component';
import Swal from 'sweetalert2';

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
  // package grouping (derived from the SO's SalesOrderItemSetMap + ItemSetItem)
  isSetHeader?: boolean;
  itemSetId?: number | null;
  setName?: string;
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
  status = 0;
  isPosted = false;

  // Collapsed package sets (by itemSetId) — child lines hide when collapsed.
  collapsedSets = new Set<number>();
  toggleSet(itemSetId: number | null | undefined): void {
    const id = Number(itemSetId ?? 0);
    if (!id) return;
    if (this.collapsedSets.has(id)) this.collapsedSets.delete(id);
    else this.collapsedSets.add(id);
  }
  isSetCollapsed(itemSetId: number | null | undefined): boolean {
    return this.collapsedSets.has(Number(itemSetId ?? 0));
  }

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

  // Contact inherited from the source Quotation (display only — nothing to type here).
  // Proof of delivery is captured on the list page after the goods arrive, not at create.
  quotationContactPerson = '';
  quotationContactNo = '';

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

  // Inline quick-add ("+ Add new") state
  qaType: QuickAddType | null = null;
  qaVisible = false;
  qaName = '';
  private qaTarget = '';

  openQa(type: QuickAddType, target: string, text: string): void {
    this.qaType = type; this.qaTarget = target;
    this.qaName = (text || '').trim(); this.qaVisible = true;
  }

  qaCreated(e: QuickAddResult): void {
    if (!e?.id) { this.qaVisible = false; return; }
    switch (this.qaTarget) {
      case 'driver':
        this.driverOptions = [...this.driverOptions, { id: e.id, name: e.label, mobile: '' }];
        this.driverId = e.id;
        this.onDriverChange();
        break;
      case 'vehicle':
        this.vehicleOptions = [...this.vehicleOptions, { id: e.id, label: e.label }];
        this.vehicleId = e.id;
        break;
    }
    this.qaVisible = false;
  }

  loginUserId = Number(localStorage.getItem('id')) || null;

  readonly fnId = 'do-list2';
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
        // Coerce to string — the API returns mobileNumber as a JSON number, but the
        // backend DriverMobileNo column/DTO is a string (sending a number 400s).
        mobile: String(d.mobileNumber ?? d.MobileNumber ?? d.mobileNo ?? d.mobile ?? d.phone ?? d.contactNo ?? d.phoneNumber ?? '')
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
    this.svc.getSalesOrderById(sid).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.soNo = d.salesOrderNo ?? d.soNo ?? '';
        this.customerName = d.customerName ?? d.CustomerName ?? '';
        if (!this.deliveryDate) this.deliveryDate = this.toDate(d.deliveryDate ?? d.DeliveryDate);
        if (!this.deliveryTo) this.deliveryTo = String(d.deliveryTo ?? d.DeliveryTo ?? '');
        // The contact rides down from the SO's quotation — shown here, never retyped.
        this.quotationContactPerson = String(d.quotationContactPerson ?? d.QuotationContactPerson ?? '');
        this.quotationContactNo = String(d.quotationContactNo ?? d.QuotationContactNo ?? '');

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

        // group delivery lines under their package header (from the SO's item sets)
        this.applyPackageGrouping(d);

        this.loading = false;
      },
      error: () => { this.loading = false; void Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to load sales order lines.', confirmButtonColor: '#16a34a' }); }
    });
  }

  // Group the delivery lines under their package header, derived from the SO's
  // item sets (SalesOrderItemSetMap → itemSets) + each ItemSet's items.
  // Only items actually present in this delivery appear under the package.
  private applyPackageGrouping(dto: any): void {
    const apiItemSets = dto?.itemSets ?? dto?.ItemSets ?? [];
    const sets = (apiItemSets || [])
      .map((x: any) => ({
        id: Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0),
        setName: String(x.setName ?? x.SetName ?? x.itemSetName ?? x.ItemSetName ?? '').trim(),
        qty: Number(x.qty ?? x.Qty ?? 0) || 0
      }))
      .filter((s: any) => s.id > 0);
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

        for (const l of this.lines) {
          if (l.isSetHeader) continue;
          const m = itemIdToSet.get(Number(l.itemId));
          if (m) { l.itemSetId = m.itemSetId; l.setName = m.setName; }
        }

        // rebuild: each package header (holds Ordered/Pending/Deliver) + its child lines, then loose lines
        const items = this.lines.filter(l => !l.isSetHeader);
        const rebuilt: DoLine[] = [];
        this.collapsedSets.clear();
        for (const s of sets) {
          const group = items.filter(l => Number(l.itemSetId) === s.id);
          if (!group.length) continue;
          // package qty = SalesOrderItemSetMap.Qty, fallback to the max child pending
          const pkgOrdered = s.qty > 0 ? s.qty : Math.max(...group.map(g => g.orderedQty || 0), 0);
          const pkgPending = s.qty > 0 ? s.qty : Math.max(...group.map(g => g.pendingQty || 0), 0);
          const header: DoLine = {
            soLineId: null, itemId: null, itemName: s.setName || `Set #${s.id}`, uom: '',
            orderedQty: pkgOrdered, pendingQty: pkgPending, deliverQty: pkgPending, notes: '',
            warehouseId: null, binId: null, supplierId: null,
            isSetHeader: true, itemSetId: s.id, setName: s.setName
          };
          rebuilt.push(header);
          for (const g of group) rebuilt.push(g);
          // flow the package deliver qty down to its child lines (children are display-only)
          this.flowSetDeliverQty(header, group);
          // start collapsed — user expands with the + icon
          this.collapsedSets.add(s.id);
        }
        for (const l of items.filter(l => !l.itemSetId)) rebuilt.push(l);
        this.lines = rebuilt;
      },
      error: () => { /* leave lines ungrouped */ }
    });
  }

  // Distribute the package header's deliver qty across its child lines
  // (child qty = pkgDeliver × childOrdered / pkgOrdered, capped at child pending).
  private flowSetDeliverQty(header: DoLine, kids: DoLine[]): void {
    const pkgDeliver = Math.max(0, Number(header.deliverQty) || 0);
    const pkgOrdered = Number(header.orderedQty) || 0;
    for (const k of kids) {
      const ratio = pkgOrdered > 0 ? (Number(k.orderedQty) || 0) / pkgOrdered : 1;
      const q = Math.round(pkgDeliver * ratio);
      k.deliverQty = Math.min(q, Number(k.pendingQty) || q);
    }
  }

  // Package header deliver qty changed → clamp and flow to its child lines.
  onSetDeliverChange(header: DoLine): void {
    let v = Number(header.deliverQty);
    if (isNaN(v) || v < 0) v = 0;
    if (v > header.pendingQty) v = header.pendingQty;
    header.deliverQty = v;
    const kids = this.lines.filter(l => !l.isSetHeader && Number(l.itemSetId) === Number(header.itemSetId));
    this.flowSetDeliverQty(header, kids);
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
    // Count a package once (its header qty) plus standalone items; exclude package
    // children so a package delivers as one unit rather than summing its contents.
    return this.lines
      .filter(l => l.isSetHeader || !l.itemSetId)
      .reduce((s, l) => s + (Number(l.deliverQty) || 0), 0);
  }

  // Logical delivery lines: each package counts once (its header) plus standalone items.
  get deliveryLineCount(): number {
    return this.lines.filter(l => l.isSetHeader || !l.itemSetId).length;
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
        // Contact rides down from the Quotation; the receiver/signature belong to the
        // Confirm Delivery step on the list, not to this form.
        this.quotationContactPerson = String(h.quotationContactPerson ?? h.QuotationContactPerson ?? '');
        this.quotationContactNo = String(h.quotationContactNo ?? h.QuotationContactNo ?? '');

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

        // ensure this DO's own Sales Order is selectable (it's excluded from the
        // "available for delivery" list) and rebuild the package grouping from it.
        if (this.soId) {
          if (!this.soOptions.some(o => o.id === this.soId)) {
            this.soOptions = [{ id: this.soId, label: `${this.soNo} — ${this.customerName}`.trim(), raw: {} }, ...this.soOptions];
          }
          this.svc.getSalesOrderById(this.soId).subscribe({
            next: soRes => this.applyPackageGrouping(this.svc.unwrapOne(soRes)),
            error: () => { /* leave lines ungrouped */ }
          });
        }

        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // ── Save ──────────────────────────────────────────────
  submit(): void {
    if (this.isPosted) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'This delivery order is already posted.', confirmButtonColor: '#16a34a' }); return; }
    if (!this.soId) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select a Sales Order.', confirmButtonColor: '#16a34a' }); return; }
    const anyQty = this.lines.some(l => (Number(l.deliverQty) || 0) > 0);
    if (!anyQty) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Enter at least one deliver quantity.', confirmButtonColor: '#16a34a' }); return; }
    // Delivery mode (1) requires a Driver and a Vehicle — warn up front instead of
    // letting the backend reject the request with a generic error.
    if (Number(this.modeOfDeliveryId) === 1) {
      if (!this.driverId) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select a Driver for Delivery mode.', confirmButtonColor: '#16a34a' }); return; }
      if (!this.vehicleId) { void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please select a Vehicle for Delivery mode.', confirmButtonColor: '#16a34a' }); return; }
    }
    this.saving = true;

    if (this.isEdit) {
      const header: any = {
        DriverId: this.isSelfMode ? null : this.driverId,
        VehicleId: this.isSelfMode ? null : this.vehicleId,
        RouteName: (this.deliveryTo || '').trim() || null,
        DeliveryDate: this.deliveryDate || null,
        DeliveryTime: this.formatTime(this.deliveryTime),
        ModeOfDeliveryId: this.modeOfDeliveryId,
        DriverMobileNo: this.isSelfMode ? null : (this.driverMobileNo || null)
        // Receiver + signature are deliberately absent: they belong to Confirm Delivery on the
        // list page, after the goods have actually been received.
      };
      this.svc.updateDeliveryOrderHeader(this.id!, header).subscribe({
        next: () => {
          this.saving = false;
          void Swal.fire({ icon: 'success', title: 'Updated!', text: 'Delivery Order updated successfully.', confirmButtonColor: '#16a34a' })
            .then(() => this.back());
        },
        error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Save failed.', 'error'); }
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
      DeliveryTime: this.formatTime(this.deliveryTime),
      ModeOfDeliveryId: this.modeOfDeliveryId,
      DriverMobileNo: this.isSelfMode ? null : (this.driverMobileNo || null),
      // No receiver/signature here — a DO is raised before the goods leave.
      Lines: this.lines
        .filter(l => !l.isSetHeader && (Number(l.deliverQty) || 0) > 0)
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
      next: () => {
        this.saving = false;
        void Swal.fire({ icon: 'success', title: 'Saved!', text: 'Delivery Order created successfully.', confirmButtonColor: '#16a34a' })
          .then(() => this.back());
      },
      error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Failed to create delivery order.', 'error'); }
    });
  }

  clear(): void {
    if (this.isEdit) return;
    this.soId = null; this.resetSo();
    this.modeOfDeliveryId = 1;
    this.deliveryDate = this.deliveryTime = this.deliveryTo = '';
    this.driverId = this.vehicleId = null;
    this.driverMobileNo = '';
    this.quotationContactPerson = this.quotationContactNo = '';
  }

  // ── Helpers ───────────────────────────────────────────
  private toDate(v: any): string {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10);
  }
  // TimeSpan-friendly "HH:mm:ss" (or null) for the backend DeliveryTime column —
  // the time input yields "HH:mm". Mirrors the Sales Order form's OrderTime.
  private formatTime(t: string | null): string | null {
    if (!t) return null;
    return t.length === 5 ? `${t}:00` : t;
  }

  private normalizeTime(v: any): string {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : '';
  }

  submitDo(): void {
    if (!this.id) return;
    void Swal.fire({
      title: 'Submit Delivery Order?',
      text: 'This will submit the DO for approval.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Submit'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.saving = true;
      this.svc.submitDeliveryOrder(this.id!).subscribe({
        next: () => {
          this.saving = false;
          this.status = 1;
          void Swal.fire({ icon: 'success', title: 'Submitted!', text: 'Delivery Order submitted for approval.', confirmButtonColor: '#16a34a' });
        },
        error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Submit failed.', 'error'); }
      });
    });
  }

  approve(): void {
    if (!this.id) return;
    void Swal.fire({
      title: 'Approve Delivery Order?',
      text: 'This will set the DO status to Approved.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Approve'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.saving = true;
      this.svc.approveDeliveryOrder(this.id!).subscribe({
        next: () => {
          this.saving = false;
          this.status = 2;
          void Swal.fire({ icon: 'success', title: 'Approved!', text: 'Delivery Order approved.', confirmButtonColor: '#16a34a' });
        },
        error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Approve failed.', 'error'); }
      });
    });
  }

  post(): void {
    if (!this.id) return;
    void Swal.fire({
      title: 'Post Delivery Order?',
      text: 'Stock will be reduced. This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, Post'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.saving = true;
      this.svc.postDeliveryOrder(this.id!).subscribe({
        next: () => {
          this.saving = false;
          this.status = 4;
          this.isPosted = true;
          void Swal.fire({ icon: 'success', title: 'Posted!', text: 'Delivery Order posted and stock reduced.', confirmButtonColor: '#16a34a' });
        },
        error: err => { this.saving = false; void Swal.fire('Error', err?.error?.message ?? 'Post failed.', 'error'); }
      });
    });
  }

  back(): void { this.router.navigate(['/app/sales/delivery-orders']); }

  get title(): string { return this.isEdit ? 'Edit Delivery Order' : 'Create Delivery Order'; }
  get statusLabel(): string { return STATUS_LABEL[Number(this.status)] ?? 'Draft'; }
}
