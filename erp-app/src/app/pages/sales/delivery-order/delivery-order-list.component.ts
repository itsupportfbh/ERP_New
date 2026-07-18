import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, DocumentPrintConfig, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import { PermissionService } from '../../../core/services/permission.service';
import { UploadService } from '../../../shared/upload.service';
import Swal from 'sweetalert2';

const STATUS_MAP: Record<number, string> = {
  0: 'Draft',
  1: 'Submitted',
  2: 'Approved',
  3: 'Rejected',
  4: 'Posted'
};

// DeliveryOrder.DeliveryStatus — the customer-signed / billed state, separate from
// the approval STATUS_MAP above. 2 is set by the API when a Sales Invoice is raised
// from the DO.
const DELIVERY_STATUS_MAP: Record<number, string> = {
  0: 'Pending',
  1: 'Completed',
  2: 'Invoice Created'
};
const DELIVERY_STATUS_CLASS: Record<number, string> = {
  0: 'st-1',
  1: 'st-2',
  2: 'st-4'
};

@Component({
  selector: 'erp-delivery-order-list',
  standalone: false,
  templateUrl: './delivery-order-list.component.html',
  styleUrls: ['./delivery-order-list.component.scss']
})
export class DeliveryOrderListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  searchText = '';
  pageSize = 10;
  sortField = '';
  sortAsc = true;

  showDeleteModal = false;
  itemToDelete: any = null;

  // ── Confirm Delivery (proof of delivery, captured after the goods arrive) ──
  showConfirm = false;
  confirmRow: any = null;
  cfMode: 'upload' | 'draw' = 'upload';
  cfName = '';
  cfMobile = '';
  cfSignature: string | null = null;   // base64 from the pad
  cfPodUrl: string | null = null;      // relative URL of the uploaded signed form
  cfPodIsPdf = false;
  cfUploading = false;
  cfSaving = false;
  cfError = '';

  @ViewChild('sigCanvas') sigCanvas!: ElementRef<HTMLCanvasElement>;
  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private hasInk = false;

  // lookups for resolving line names
  private uomMap = new Map<number, string>();
  private itemCodeMap = new Map<number, string>();
  private warehouseMap = new Map<number, string>();
  private driverMap = new Map<number, string>();
  /** customerId → billing address from the Customer master, for the print "Bill To" box */
  private custAddrMap = new Map<number, string>();

  // view-details modal
  showView = false;
  viewLoading = false;
  activeRow: any = null;
  viewTitle = '';
  viewSubtitle = '';
  viewInfo: PrintField[] = [];
  viewLines: any[] = [];
  viewTotals: PrintField[] = [];
  printBillTo: { name?: string; lines?: string[] } = {};
  printDeliverTo: { name?: string; lines?: string[] } = {};
  /** Customer's billing address from the Customer master — shown in the print "Bill To" box. */
  viewBillAddress = '';

  readonly lineColumns: PrintColumn[] = [
    { header: 'Item Code', key: 'itemCode', align: 'center' },
    { header: 'Item', key: 'itemName' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
    { header: 'Notes', key: 'notes' },
  ];

  readonly fnId = 'do-list2';
  constructor(
    private svc: SalesService,
    private router: Router,
    private printSvc: DocumentPrintService,
    public perm: PermissionService,
    private uploadSvc: UploadService
  ) {}

  ngOnInit(): void {
    this.load();
    this.svc.getUOMs().subscribe(r => this.svc.unwrap(r).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? '')));
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => { if (i.itemCode) this.itemCodeMap.set(Number(i.id), i.itemCode); }));
    this.svc.getWarehouses().subscribe(r => this.svc.unwrap(r).forEach((w: any) => this.warehouseMap.set(Number(w.id), w.warehouseName ?? w.name ?? '')));
    this.svc.getDrivers().subscribe(r => this.svc.unwrap(r).forEach((d: any) => this.driverMap.set(Number(d.id ?? d.Id), String(d.name ?? d.Name ?? d.driverName ?? '').trim())));
    this.svc.getCustomers().subscribe(r => this.svc.unwrap(r).forEach((c: any) =>
      this.custAddrMap.set(Number(c.id ?? c.Id), String(c.address ?? c.Address ?? '').trim())));
  }

  getDriverName(id: any): string {
    const n = Number(id);
    return n ? (this.driverMap.get(n) ?? '') : '';
  }

  load(): void {
    this.loading = true;
    this.svc.getDeliveryOrders().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          const status = Number(r.status ?? r.Status ?? 0);
          const posted = !!(r.isPosted ?? r.IsPosted ?? (status === 4));
          const deliveryStatus = Number(r.deliveryStatus ?? r.DeliveryStatus ?? 0);
          return {
            ...r,
            id: r.id ?? r.Id,
            doNumber: r.doNumber ?? r.DoNumber ?? '',
            salesOrderNo: r.salesOrderNo ?? r.SalesOrderNo ?? r.soNo ?? '',
            driverId: r.driverId ?? r.DriverId ?? null,
            routeName: r.routeName ?? r.RouteName ?? '',
            deliveryDate: r.deliveryDate ?? r.DeliveryDate ?? null,
            status,
            statusLabel: STATUS_MAP[status] ?? 'Draft',
            deliveryStatus,
            deliveryStatusLabel: DELIVERY_STATUS_MAP[deliveryStatus] ?? 'Pending',
            deliveryStatusClass: DELIVERY_STATUS_CLASS[deliveryStatus] ?? 'st-1',
            // Editable only while Pending. Once the customer has signed (1) the delivery is a
            // record of what happened, and once invoiced (2) it has been billed.
            editable: deliveryStatus === 0,
            posted,
            postedLabel: posted ? 'Yes' : 'No'
          };
        });
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.searchText.trim().toLowerCase();
    let list = q
      ? this.rows.filter(r =>
          (r.doNumber ?? '').toLowerCase().includes(q) ||
          (r.salesOrderNo ?? '').toLowerCase().includes(q) ||
          this.getDriverName(r.driverId).toLowerCase().includes(q) ||
          (r.routeName ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];

    if (this.sortField) {
      const f = this.sortField;
      list = [...list].sort((a, b) => {
        const va = (a[f] ?? '').toString().toLowerCase();
        const vb = (b[f] ?? '').toString().toLowerCase();
        return this.sortAsc ? va.localeCompare(vb, undefined, { numeric: true }) : vb.localeCompare(va, undefined, { numeric: true });
      });
    }
    this.filtered = list;
  }

  get pagedItems(): any[] { return this.filtered.slice(0, this.pageSize); }

  sortBy(field: string): void {
    if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; }
    this.applyFilter();
  }

  create(): void { this.router.navigate(['/app/sales/delivery-orders/new']); }

  edit(row: any): void { this.router.navigate(['/app/sales/delivery-orders', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private mapLine(l: any): any {
    const itemId = l.itemId ?? l.ItemId;
    const uomRaw = l.uomId ?? l.UomId ?? l.uom ?? l.Uom;
    const warehouseId = l.warehouseId ?? l.WarehouseId;
    // UOM may be stored as a numeric id (map it) or already as the name string (use as-is).
    const uomName = l.uomName ?? l.UomName
      ?? (uomRaw != null && !isNaN(Number(uomRaw)) ? this.uomMap.get(Number(uomRaw)) : null)
      ?? (uomRaw != null && String(uomRaw).trim() ? String(uomRaw) : '');
    return {
      itemId: Number(itemId) || 0,
      itemCode: l.itemCode ?? l.ItemCode ?? this.itemCodeMap.get(Number(itemId)) ?? '',
      itemName: l.itemName ?? l.ItemName ?? '',
      uomName,
      qty: l.qty ?? l.Qty ?? 0,
      warehouseName: l.warehouseName ?? l.WarehouseName ?? this.warehouseMap.get(Number(warehouseId)) ?? '',
      binName: l.binName ?? l.BinName ?? l.binCode ?? l.BinCode ?? '',
      notes: l.notes ?? l.Notes ?? '',
    };
  }

  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getDeliveryOrderById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const hdr = d.header ?? d;
        const embedded = d.lines ?? d.Lines ?? hdr.lines ?? hdr.Lines ?? null;

        const finish = (rawLines: any[]) => {
          const baseLines = (Array.isArray(rawLines) ? rawLines : []).map(l => this.mapLine(l));
          // Package name comes from the source SO's item sets → show the header followed by
          // its contents as indented sub-items (e.g. Chicken Briyani, White Bread).
          this.svc.getSourceSoItemSets({ soId: hdr.soId ?? hdr.SoId, doId: row.id }).subscribe(itemSets => {
            this.svc.groupViewLinesByPackage(baseLines, itemSets, (s: any) => ({
              itemId: 0,
              itemCode: '',
              itemName: s.setName ?? s.SetName ?? 'Package',
              uomName: '',
              qty: +(s.qty ?? s.Qty ?? 0) || 0,
              warehouseName: '',
              binName: '',
              notes: '',
            }), true).subscribe(grouped => {
              this.viewLines = grouped.map((l: any) => l.isPackageChild
                ? { ...l, itemName: `— ${l.itemName}` }
                : l);
              this.viewInfo = [
                { label: 'DO No', value: row.doNumber },
                { label: 'SO No', value: row.salesOrderNo || '—' },
                { label: 'Route', value: row.routeName || '—' },
                { label: 'Customer', value: hdr.customerName ?? hdr.CustomerName ?? '—' },
                { label: 'Delivery Date', value: this.fmtDate(row.deliveryDate) },
                { label: 'Status', value: row.statusLabel },
                { label: 'Posted', value: row.postedLabel },
              ];
              this.viewTotals = [];
              const custName = hdr.customerName ?? hdr.CustomerName ?? '—';
              const custAddr = hdr.customerAddress ?? hdr.CustomerAddress ?? '';
              this.viewBillAddress = this.custAddrMap.get(Number(hdr.customerId ?? hdr.CustomerId ?? row.customerId)) || '';
              const billAddr = this.viewBillAddress || custAddr;
              this.printBillTo = { name: custName, lines: [billAddr].filter(Boolean) };
              this.printDeliverTo = { name: custName, lines: [custAddr, row.routeName ? `Route: ${row.routeName}` : ''].filter(Boolean) };
              this.viewTitle = `Delivery Order Lines — ${row.doNumber}`;
              this.viewSubtitle = `SO: ${row.salesOrderNo || '—'} · Route: ${row.routeName || '—'}`;
              this.viewLoading = false;
              cb();
            });
          });
        };

        if (Array.isArray(embedded) && embedded.length) {
          finish(embedded);
        } else {
          this.svc.getDeliveryOrderLines(row.id).subscribe({
            next: lres => finish(this.svc.unwrap(lres)),
            error: () => finish([])
          });
        }
      },
      error: () => { this.viewLoading = false; cb(); }
    });
  }

  view(row: any): void { this.showView = true; this.buildDetail(row, () => {}); }

  /** Single source of truth for the DO document layout, shared by Print and Email
   *  so the emailed PDF always matches exactly what Print produces. */
  private buildDocConfig(): DocumentPrintConfig {
    return {
      docTitle: 'DELIVERY ORDER',
      docNo: this.activeRow?.doNumber ?? '',
      fields: this.viewInfo.filter(f => f.label !== 'Customer'),
      columns: this.lineColumns,
      lines: this.viewLines,
      totals: this.viewTotals,
      billTo: this.printBillTo,
      deliverTo: this.printDeliverTo,
      // The printed DO is what the customer signs; the signed page is scanned back in
      // and attached via Confirm Delivery.
      signature: {
        note: 'Received the above goods in good order and condition.',
        contactName: this.activeRow?.quotationContactPerson ?? '',
        contactNo: this.activeRow?.quotationContactNo ?? ''
      }
    };
  }

  print(row: any): void {
    this.buildDetail(row, () => {
      this.printSvc.print(this.buildDocConfig());
    });
  }

  printActive(): void { if (this.activeRow) this.print(this.activeRow); }

  // ── Email to customer ─────────────────────────────────
  async emailCustomer(row: any): Promise<void> {
    if (!this.perm.canPrint(this.fnId)) return;
    const result = await Swal.fire({
      title: 'Email Customer?',
      text: `Send delivery order ${row.doNumber} to the customer via email?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, send it!'
    });
    if (!result.isConfirmed) return;

    Swal.fire({
      title: 'Sending Email…',
      html: 'Generating PDF and sending to customer.<br/>Please wait.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading()
    });

    // Build the same layout print() produces, render it to a PDF, then upload.
    this.buildDetail(row, async () => {
      try {
        const pdf = await this.printSvc.generatePdfBlob(this.buildDocConfig());
        this.svc.emailDeliveryOrderCustomer(row.id, pdf).subscribe({
          next: () => Swal.fire({ icon: 'success', title: 'Sent!', text: `Delivery order ${row.doNumber} emailed to customer.`, confirmButtonColor: '#16a34a' }),
          error: err => Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to send email.', confirmButtonColor: '#16a34a' })
        });
      } catch {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to generate the PDF.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  private fmtDate(d: any): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
  }

  // ── Delete ────────────────────────────────────────────
  // ── Confirm Delivery ──────────────────────────────────
  openConfirm(row: any): void {
    this.confirmRow = row;
    // The contact was captured on the quotation — start from it rather than making them retype,
    // but leave it editable: whoever actually took the goods is who should be recorded.
    this.cfName = String(row?.receivedPersonName || row?.quotationContactPerson || '');
    this.cfMobile = String(row?.receivedPersonMobileNo || row?.quotationContactNo || '');
    this.cfMode = 'upload';
    this.cfSignature = null;
    this.cfPodUrl = null;
    this.cfPodIsPdf = false;
    this.cfError = '';
    this.cfUploading = this.cfSaving = false;
    this.hasInk = false;
    this.showConfirm = true;
  }

  closeConfirm(): void { this.showConfirm = false; this.confirmRow = null; }

  setDrawMode(): void {
    this.cfMode = 'draw';
    this.hasInk = false;
    setTimeout(() => this.initCanvas(), 50);
  }

  podSrc(url: string | null): string { return this.uploadSvc.toSrc(url); }

  onPodSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const problem = this.uploadSvc.validate(file, 'do-pod');
    if (problem) { this.cfError = problem; input.value = ''; return; }

    this.cfError = '';
    this.cfUploading = true;
    this.uploadSvc.upload(file, 'do-pod').subscribe({
      next: url => {
        this.cfPodUrl = url;
        this.cfPodIsPdf = /\.pdf$/i.test(url);
        this.cfUploading = false;
        input.value = '';
      },
      error: () => {
        this.cfUploading = false;
        input.value = '';
        this.cfError = 'The file could not be uploaded. Please try again.';
      }
    });
  }

  removePod(): void { this.cfPodUrl = null; this.cfPodIsPdf = false; }

  // signature pad
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

  confirmDelivery(): void {
    if (!this.confirmRow) return;

    if (!this.cfName.trim()) { this.cfError = 'Received By is required.'; return; }

    if (this.cfMode === 'draw' && this.hasInk && this.sigCanvas) {
      this.cfSignature = this.sigCanvas.nativeElement.toDataURL('image/png');
    }

    const hasProof = (this.cfMode === 'draw' && !!this.cfSignature) || (this.cfMode === 'upload' && !!this.cfPodUrl);
    if (!hasProof) {
      this.cfError = this.cfMode === 'upload'
        ? 'Upload the signed delivery form first.'
        : 'Please capture the signature first.';
      return;
    }

    this.cfError = '';
    this.cfSaving = true;
    this.svc.confirmDelivery(this.confirmRow.id, {
      ReceivedPersonName: this.cfName.trim(),
      ReceivedPersonMobileNo: this.cfMobile.trim() || null,
      ReceivedSignature: this.cfMode === 'draw' ? this.cfSignature : null,
      PodFileUrl: this.cfMode === 'upload' ? this.cfPodUrl : null
    }).subscribe({
      next: () => {
        this.cfSaving = false;
        this.closeConfirm();
        void Swal.fire({ icon: 'success', title: 'Delivered', text: 'Delivery confirmed and the DO is now Completed.', confirmButtonColor: '#16a34a' });
        this.load();
      },
      error: err => {
        this.cfSaving = false;
        this.cfError = err?.error?.message ?? 'Could not confirm delivery.';
      }
    });
  }

  openDelete(row: any): void { this.itemToDelete = row; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.svc.deleteDeliveryOrder(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
}
