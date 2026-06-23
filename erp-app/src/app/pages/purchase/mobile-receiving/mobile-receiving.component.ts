import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

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
export class MobileReceivingComponent implements OnInit {
  @ViewChild('barcodeInput') barcodeInput?: ElementRef<HTMLInputElement>;

  mrPo = '';
  mrBarcode = '';
  mrQty: number = 1;
  mrOffline = false;
  mrScanMessage = '';
  isSyncing = false;
  error = '';

  mrRows: ScanRow[] = [];
  poLines: any[] = [];

  loginUserId = Number(localStorage.getItem('id')) || 0;
  lineInputQty: { [item: string]: number } = {};

  constructor(private svc: PurchaseService) {}

  ngOnInit(): void {
    const savedPo = sessionStorage.getItem('mrPo');
    if (savedPo) { this.mrPo = savedPo; this.loadOffline(); this.loadPo(); }
  }

  loadPo(): void {
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
      error: () => { this.poLines = []; this.error = 'Failed to load PO lines — check PO number and backend.'; }
    });
  }

  addScan(): void {
    this.error = '';
    const poNo = this.mrPo.trim();
    const barcode = this.mrBarcode.trim();
    const qty = Number(this.mrQty || 0);

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
        ts: new Date(), barcode, qty,
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
        this.mrRows = [];
        localStorage.removeItem(this.offlineKey());
        this.loadPo();
        Swal.fire({ icon: 'success', title: 'Sync Complete!', text: 'All scans synced. Desktop GRN updated.', confirmButtonColor: '#1a9db8' });
      },
      error: (err: any) => {
        this.isSyncing = false;
        this.error = err?.error?.message ?? 'Sync failed.';
        Swal.fire({ icon: 'error', title: 'Sync Failed', text: err?.error?.message ?? 'Sync failed. Please try again.', confirmButtonColor: '#1a9db8' });
      }
    });
  }

  removeScan(i: number): void { this.mrRows.splice(i, 1); this.saveOffline(); }

  async clearQueue(): Promise<void> {
    if (!this.mrRows.length) return;
    const result = await Swal.fire({
      title: 'Clear Queue?',
      text: 'Clear all queued scans? This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#1a9db8',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, clear all!'
    });
    if (!result.isConfirmed) return;
    this.mrRows = [];
    this.saveOffline();
    this.focusBarcode();
  }

  toggleOffline(): void { this.mrOffline = !this.mrOffline; }

  addLineDirectly(line: any): void {
    const key = line.item ?? line.itemCode;
    const qty = Number(this.lineInputQty[key] || 1);
    if (qty <= 0) { this.error = 'Enter a valid qty.'; return; }
    this.mrBarcode = this.codeFrom(key);
    this.mrQty = qty;
    this.addScan();
    this.lineInputQty[key] = 1;
  }

  private offlineKey(): string { return `mrRows_${this.mrPo?.trim() || 'NA'}`; }

  saveOffline(): void { localStorage.setItem(this.offlineKey(), JSON.stringify(this.mrRows)); }

  loadOffline(): void {
    const saved = localStorage.getItem(this.offlineKey());
    const rows = saved ? JSON.parse(saved) : [];
    this.mrRows = (rows || []).map((r: any) => ({
      ...r, ts: r.ts ? new Date(r.ts) : new Date(),
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

  private focusBarcode(): void { setTimeout(() => this.barcodeInput?.nativeElement?.focus(), 50); }
  trackBy(i: number): number { return i; }
}
