import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import { ReceivingIntegrationService } from '../../../core/services/receiving-integration.service';
import { PermissionService } from '../../../core/services/permission.service';
import { PurchaseService } from '../purchase.service';

type ScanRow = {
  ts: Date;
  barcode: string;
  qty: number;
  itemCode: string;
  itemName: string;
  status: 'queued' | 'synced' | 'failed';
};

@Component({
  selector: 'erp-mobile-receiving',
  standalone: false,
  templateUrl: './mobile-receiving.component.html',
  styleUrls: ['./mobile-receiving.component.scss']
})
export class MobileReceivingComponent implements OnInit, OnDestroy {
  @ViewChild('barcodeInput') barcodeInput?: ElementRef<HTMLInputElement>;
  @ViewChild('scanVideo') scanVideo?: ElementRef<HTMLVideoElement>;
  readonly fnId = 'mobilereceiving';

  // Camera scanner state
  showCameraScanner = false;
  cameraError = '';
  private videoStream?: MediaStream;
  private scanAnimFrame?: number;
  readonly cameraSupported = typeof (window as any).BarcodeDetector !== 'undefined';


  mrPo = '';
  mrBarcode = '';
  mrQty = 1;
  mrOffline = false;
  mrScanMessage = '';
  isSyncing = false;
  error = '';

  mrRows: ScanRow[] = [];
  poLines: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || 0;
  lineInputQty: { [item: string]: number } = {};

  // Public (QR) mode: opened from a scanned PO QR on a phone that is NOT logged in.
  // In this mode there is no user session, so permission checks are skipped and the
  // page is driven entirely by the poNo/token in the URL.
  isPublic = false;
  mrToken = '';

  // Template gates: in public (QR) mode there is no session, so allow the actions;
  // otherwise fall back to the normal permission checks.
  get uiCanView(): boolean { return this.isPublic || this.perm.canView(this.fnId); }
  get uiCanCreate(): boolean { return this.isPublic || this.perm.canCreate(this.fnId); }

  constructor(
    private svc: PurchaseService,
    public perm: PermissionService,
    private receivingSvc: ReceivingIntegrationService,
    private zone: NgZone,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const qpPo = (qp.get('poNo') || '').trim();
    this.mrToken = (qp.get('t') || '').trim();

    // A poNo in the URL means we were reached via the scanned QR → public mode.
    if (qpPo) {
      this.isPublic = true;
      this.mrPo = qpPo;
      this.loadOffline();
      this.loadPo();
      return;
    }

    if (!this.perm.canView(this.fnId)) {
      this.error = 'You do not have permission to view Mobile Receiving.';
      return;
    }
    const savedPo = sessionStorage.getItem('mrPo');
    if (savedPo) { this.mrPo = savedPo; this.loadOffline(); this.loadPo(); }
  }

  loadPo(): void {
    if (!this.isPublic && !this.perm.canView(this.fnId)) return;
    const poNo = this.mrPo.trim();
    if (!poNo) { this.error = 'Enter a PO number.'; return; }
    this.error = '';
    sessionStorage.setItem('mrPo', poNo);
    this.svc.getMobileReceivingPo(poNo).subscribe({
      next: (res: any) => {
        this.poLines = res?.lines ?? res?.Lines ?? [];
        this.hydrateQueuedLineNames();
        this.focusBarcode();
      },
      error: () => { this.poLines = []; this.error = 'Failed to load PO lines - check PO number and backend.'; }
    });
  }

  addScan(): void {
    if (!this.isPublic && !this.perm.canCreate(this.fnId)) {
      this.error = 'You do not have permission to add mobile receiving scans.';
      return;
    }
    this.error = '';
    const poNo    = this.mrPo.trim();
    const barcode = this.mrBarcode.trim();
    const qty     = Number(this.mrQty || 0);

    // Clear the field immediately after capturing value
    this.mrBarcode = '';
    this.focusBarcode();

    if (!poNo || !barcode) { this.error = 'Enter PO number and barcode.'; return; }
    if (!qty || qty <= 0)  { this.error = 'Enter a valid quantity.'; return; }

    const localErr = this.validateLocal(barcode, qty);
    if (localErr) { this.error = localErr; return; }

    if (this.mrOffline) {
      this.pushRow(barcode, qty);
      this.saveOffline();
      return;
    }

    this.svc.validateMobileScan(poNo, barcode, qty, this.loginUserId).subscribe({
      next: () => { this.pushRow(barcode, qty); this.saveOffline(); },
      error: (err: any) => { this.error = err?.error?.message ?? 'Scan validation failed.'; }
    });
  }

  private pushRow(barcode: string, qty: number): void {
    const code = this.codeFrom(barcode);
    const line = this.findLine(code);
    const existing = this.mrRows.find(r => this.codeFrom(r.barcode) === code);
    if (existing) {
      existing.qty += qty;
    } else {
      this.mrRows.unshift({
        ts: new Date(),
        barcode,
        qty,
        itemCode: code,
        itemName: line?.item ?? line?.itemName ?? barcode,
        status: 'queued'
      });
    }
    this.mrBarcode = '';
    this.mrQty = 1;
    this.mrScanMessage = `${code} added. Queue total: ${this.queueTotalQty}`;
    this.focusBarcode();
  }

  syncMobile(): void {
    if (!this.isPublic && !this.perm.canCreate(this.fnId)) {
      this.error = 'You do not have permission to sync mobile receiving.';
      return;
    }
    if (!this.mrRows.length) { this.error = 'No scans to sync.'; return; }
    this.isSyncing = true;
    this.error = '';
    const payload = {
      purchaseOrderNo: this.mrPo.trim(),
      lines: this.mrRows.map(r => ({
        purchaseOrderNo: this.mrPo.trim(),
        itemKey: r.barcode,
        qty: r.qty,
        createdBy: this.loginUserId
      }))
    };
    this.svc.syncMobileReceiving(payload).subscribe({
      next: () => {
        this.isSyncing = false;
        this.mrScanMessage = 'Sync successful! Desktop GRN updated.';
        this.receivingSvc.saveSynced(this.mrPo.trim(), this.mrRows);
        this.mrRows = [];
        this.receivingSvc.clearQueue(this.mrPo.trim());
        this.loadPo();
        Swal.fire({ icon: 'success', title: 'Sync Complete!', text: 'All scans synced. Desktop GRN updated.', confirmButtonColor: '#16a34a' });
      },
      error: (err: any) => {
        this.isSyncing = false;
        this.error = err?.error?.message ?? 'Sync failed.';
        Swal.fire({ icon: 'error', title: 'Sync Failed', text: err?.error?.message ?? 'Sync failed. Please try again.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  removeScan(i: number): void {
    if (!this.isPublic && !this.perm.canCreate(this.fnId)) {
      this.error = 'You do not have permission to modify the queue.';
      return;
    }
    this.mrRows.splice(i, 1);
    this.saveOffline();
  }

  async clearQueue(): Promise<void> {
    if (!this.isPublic && !this.perm.canCreate(this.fnId)) {
      this.error = 'You do not have permission to clear the queue.';
      return;
    }
    if (!this.mrRows.length) return;
    const result = await Swal.fire({
      title: 'Clear Queue?',
      text: 'Clear all queued scans? This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, clear all!'
    });
    if (!result.isConfirmed) return;
    this.mrRows = [];
    this.saveOffline();
    this.focusBarcode();
  }

  toggleOffline(): void {
    if (!this.isPublic && !this.perm.canCreate(this.fnId)) return;
    this.mrOffline = !this.mrOffline;
  }

  addLineDirectly(line: any): void {
    if (!this.isPublic && !this.perm.canCreate(this.fnId)) {
      this.error = 'You do not have permission to add mobile receiving scans.';
      return;
    }
    this.error = '';
    const key = line.item ?? line.itemCode;
    const qty = Number(this.lineInputQty[key] || 1);
    if (qty <= 0) { this.error = 'Enter a valid qty.'; return; }

    const remaining = this.lineRemainingAfterQueue(line);
    if (remaining > 0 && qty > remaining) {
      this.error = `Cannot receive more than the balance (${remaining}).`;
      return;
    }

    // Receiving directly against a known PO line — no barcode scan / validation needed.
    this.pushRow(this.codeFrom(key), qty);
    this.saveOffline();
    this.lineInputQty[key] = 1;
  }

  saveOffline(): void {
    this.receivingSvc.saveQueue(this.mrPo.trim(), this.mrRows);
  }

  loadOffline(): void {
    const snapshot = this.receivingSvc.getQueue(this.mrPo.trim());
    const rows = snapshot?.lines?.map((line: any) => ({
      barcode: line.itemKey,
      itemName: line.itemName,
      itemCode: line.itemKey,
      qty: line.qty,
      ts: snapshot.queuedAt,
      status: 'queued'
    })) || [];
    this.mrRows = rows.map((r: any) => ({
      ...r,
      ts: r.ts ? new Date(r.ts) : new Date(),
      qty: Number(r.qty || 0),
      itemCode: r.itemCode || this.codeFrom(r.barcode),
      status: r.status || 'queued'
    }));
  }

  private validateLocal(barcode: string, qty: number): string {
    const code = this.codeFrom(barcode);
    if (!code) return 'Invalid barcode.';
    if (!this.poLines?.length) return '';
    const line = this.poLines.find(l => this.codeFrom(l?.item ?? l?.itemCode) === code);
    if (!line) return 'Item not found in this PO.';
    const queued = this.lineQueuedQty(line);
    const balance = Number(line.balanceQty ?? line.qtyRemaining ?? 0);
    if (queued + qty > balance) return `Over-receive not allowed. Balance: ${balance}, queued: ${queued}.`;
    return '';
  }

  private hydrateQueuedLineNames(): void {
    this.mrRows = this.mrRows.map(r => {
      const code = this.codeFrom(r.barcode);
      const line = this.findLine(code);
      return { ...r, itemCode: code, itemName: r.itemName || line?.item || r.barcode };
    });
  }

  private findLine(code: string): any {
    return this.poLines.find(l => this.codeFrom(l?.item ?? l?.itemCode) === code);
  }

  codeFrom(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('|')) {
      const parts = raw.split('|').map((x: string) => x.trim()).filter(Boolean);
      return (parts[parts.length - 1] ?? raw).toUpperCase();
    }
    return raw.split(' - ')[0].trim().toUpperCase();
  }

  lineQueuedQty(line: any): number {
    const code = this.codeFrom(line?.item ?? line?.itemCode);
    return this.mrRows.filter(r => this.codeFrom(r.barcode) === code).reduce((s, r) => s + r.qty, 0);
  }

  lineRemainingAfterQueue(line: any): number {
    return Math.max(0, Number(line?.balanceQty ?? line?.qtyRemaining ?? 0) - this.lineQueuedQty(line));
  }

  get queueTotalQty(): number { return +this.mrRows.reduce((s, r) => s + r.qty, 0).toFixed(4); }
  get totalOrderedQty(): number { return +this.poLines.reduce((s, l) => s + Number(l.qty ?? 0), 0).toFixed(4); }
  get totalReceivedQty(): number { return +this.poLines.reduce((s, l) => s + Number(l.receivedQty ?? 0), 0).toFixed(4); }
  get totalBalanceQty(): number { return +this.poLines.reduce((s, l) => s + Number(l.balanceQty ?? l.qtyRemaining ?? 0), 0).toFixed(4); }
  get totalRemainingAfterQueue(): number { return Math.max(0, +(this.totalBalanceQty - this.queueTotalQty).toFixed(4)); }
  get receiveProgressPct(): number {
    if (!this.totalOrderedQty) return 0;
    return Math.min(100, +(((this.totalReceivedQty + this.queueTotalQty) / this.totalOrderedQty) * 100).toFixed(2));
  }

  private focusBarcode(): void {
    setTimeout(() => {
      const el = this.barcodeInput?.nativeElement;
      if (!el) return;
      el.value = '';         // clear DOM directly (browser form-restore bypass)
      this.mrBarcode = '';   // keep model in sync
      el.focus();
    }, 50);
  }
  trackBy(i: number): number { return i; }

  ngOnDestroy(): void { this.stopCameraScanner(); }

  // ── Camera scanning ──────────────────────────────────
  async startCameraScanner(): Promise<void> {
    this.cameraError = '';
    this.showCameraScanner = true;

    if (!this.cameraSupported) {
      this.cameraError = 'BarcodeDetector not supported in this browser. Use Chrome on Android.';
      return;
    }

    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });

      // Wait for the video element to be rendered
      setTimeout(() => {
        const video = this.scanVideo?.nativeElement;
        if (!video) return;
        video.srcObject = this.videoStream!;
        video.play();
        video.addEventListener('playing', () => this.scanLoop(), { once: true });
      }, 100);
    } catch (e: any) {
      this.cameraError = e?.message ?? 'Camera access denied.';
    }
  }

  private async scanLoop(): Promise<void> {
    const video = this.scanVideo?.nativeElement;
    if (!video || !this.showCameraScanner) return;

    const detector = new (window as any).BarcodeDetector({
      formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'data_matrix']
    });

    const detect = async () => {
      if (!this.showCameraScanner) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            const value = barcodes[0].rawValue;
            this.zone.run(() => {
              this.mrBarcode = value;
              this.stopCameraScanner();
              this.mrScanMessage = `Scanned: ${value}`;
              this.focusBarcode();
            });
            return;
          }
        } catch {}
      }
      this.scanAnimFrame = requestAnimationFrame(detect);
    };

    this.scanAnimFrame = requestAnimationFrame(detect);
  }

  stopCameraScanner(): void {
    this.showCameraScanner = false;
    if (this.scanAnimFrame) { cancelAnimationFrame(this.scanAnimFrame); this.scanAnimFrame = undefined; }
    if (this.videoStream) { this.videoStream.getTracks().forEach(t => t.stop()); this.videoStream = undefined; }
    const video = this.scanVideo?.nativeElement;
    if (video) { video.srcObject = null; }
  }
}
