import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-rfq-list',
  standalone: false,
  templateUrl: './rfq-list.component.html',
  styleUrls: ['./rfq-list.component.scss']
})
export class RfqListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  showLinesModal = false;
  modalLines: any[] = [];
  modalRfqNo = '';
  modalSupplier = '';
  modalStatus = '';
  modalTotal: number | null = null;

  showActionConfirm = false;
  actionRow: any = null;
  actionType = '';
  actionLoading = false;
  actionError = '';

  columns: TableColumn[] = [
    { key: 'number', header: 'RFQ No', sortable: true },
    { key: 'customerName', header: 'Supplier', sortable: true },
    { key: 'deliveryDate', header: 'Valid Until', sortable: true, type: 'date' },
    { key: 'grandTotal', header: 'Amount', type: 'number', align: 'right' },
    {
      key: 'statusLabel',
      header: 'Status',
      type: 'badge',
      badgeMap: { Draft: 'default', Submitted: 'warning', Sent: 'warning', Approved: 'success', Rejected: 'danger', Posted: 'success' }
    },
  ];

  rowActions: RowAction[] = [
    { key: 'edit',   label: 'Edit',   btnClass: 'default', icon: 'edit'   },
    { key: 'send',   label: 'Send',   btnClass: 'success', icon: 'send'   },
    { key: 'delete', label: 'Delete', btnClass: 'danger',  icon: 'delete' },
  ];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getRfqs().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          number: r.number ?? r.rfqNo ?? r.quotationNo,
          customerName: r.customerName ?? r.supplierName,
          statusLabel: r.status ?? r.statusLabel ?? 'Draft',
        }));
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          (r.number ?? '').toLowerCase().includes(q) ||
          (r.customerName ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/rfq/new']); }

  onRowClick(row: any): void { this.openLinesModal(row); }

  openLinesModal(row: any): void {
    const raw = row?.rfqLines ?? row?.RfqLines ?? row?.lines ?? [];
    const lines: any[] = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
    this.modalLines = lines;
    this.modalRfqNo = row.number ?? '';
    this.modalSupplier = row.customerName ?? '';
    this.modalStatus = row.statusLabel ?? '';
    this.modalTotal = row.grandTotal ?? null;
    if (!lines.length) {
      this.svc.getRfqById(row.id).subscribe({
        next: res => {
          const d = this.svc.unwrapOne(res);
          const r2 = d.rfqLines ?? d.RfqLines ?? d.lines ?? [];
          this.modalLines = Array.isArray(r2) ? r2 : (() => { try { return JSON.parse(r2 || '[]'); } catch { return []; } })();
        }
      });
    }
    this.showLinesModal = true;
  }

  closeLinesModal(): void { this.showLinesModal = false; }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view')   this.openLinesModal(e.row);
    if (e.action === 'edit')   this.router.navigate(['/app/purchase/rfq', e.row.id]);
    if (e.action === 'send')   this.send(e.row);
    if (e.action === 'delete') this.delete(e.row);
  }

  send(row: any): void { this.openActionConfirm(row, 'send-rfq'); }

  delete(row: any): void { this.openActionConfirm(row, 'delete-rfq'); }

  openActionConfirm(row: any, type: string): void {
    this.actionRow = row; this.actionType = type; this.actionError = ''; this.showActionConfirm = true;
  }
  closeActionConfirm(): void { this.showActionConfirm = false; this.actionRow = null; this.actionError = ''; }
  doActionConfirm(): void {
    if (!this.actionRow) return;
    this.actionLoading = true; this.actionError = '';
    const row = this.actionRow;
    if (this.actionType === 'send-rfq') {
      this.svc.sendRfq({ ...row, status: 'Sent' }).subscribe({
        next: () => { this.actionLoading = false; this.closeActionConfirm(); this.load(); },
        error: err => { this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to send RFQ.'; }
      });
    } else if (this.actionType === 'delete-rfq') {
      this.svc.deleteRfq(row.id).subscribe({
        next: () => { this.actionLoading = false; this.closeActionConfirm(); this.load(); },
        error: err => { this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete RFQ.'; }
      });
    }
  }

  get pendingCount(): number { return this.rows.filter(r => ['Pending', 'Submitted', 'Sent'].includes(r.statusLabel ?? '')).length; }
  get approvedCount(): number { return this.rows.filter(r => r.statusLabel === 'Approved').length; }
}
