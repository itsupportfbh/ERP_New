import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-debit-note-list',
  standalone: false,
  templateUrl: './debit-note-list.component.html',
  styleUrls: ['./debit-note-list.component.scss']
})
export class DebitNoteListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  // Action confirm modal
  showConfirm = false;
  confirmRow: any = null;
  confirmAction = '';
  confirmLoading = false;
  confirmError = '';

  showLinesModal = false;
  modalLines: any[] = [];
  modalDnNo = '';
  modalSupplier = '';
  modalStatus = '';
  modalTotal: number | null = null;

  columns: TableColumn[] = [
    { key: 'debitNoteNo', header: 'DN No', sortable: true },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'reason', header: 'Reason' },
    { key: 'noteDate', header: 'Note Date', sortable: true, type: 'date' },
    { key: 'amount', header: 'Amount', type: 'number', align: 'right' },
    {
      key: 'status',
      header: 'Status',
      type: 'badge',
      badgeMap: { Draft: 'default', Posted: 'success' }
    },
  ];

  rowActions: RowAction[] = [
    { key: 'edit',   label: 'Edit',   btnClass: 'default', icon: 'edit'   },
    { key: 'post',   label: 'Post',   btnClass: 'success', icon: 'approve'  },
    { key: 'delete', label: 'Delete', btnClass: 'danger',  icon: 'delete' },
  ];

  dnActionFilter = (action: string, row: any): boolean => {
    const isPosted = (row.status ?? '').toLowerCase() === 'posted';
    switch (action) {
      case 'edit':   return !isPosted;
      case 'post':   return !isPosted;
      case 'delete': return !isPosted;
      default:       return true;
    }
  };

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getDebitNotes().subscribe({
      next: res => {
        const toStatusLabel = (s: any): string => {
          if (typeof s === 'string' && isNaN(Number(s))) return s;
          return ({ 0: 'Draft', 1: 'Pending', 2: 'Posted', 3: 'Posted', 4: 'Posted' } as any)[Number(s)] ?? 'Draft';
        };
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          debitNoteNo: r.debitNoteNo ?? r.DebitNoteNo ?? '',
          supplierName: r.name ?? r.supplierName ?? '',
          status: toStatusLabel(r.status),
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
          (r.debitNoteNo ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q) ||
          (r.reason ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/debit-note/new']); }

  onRowClick(row: any): void {
    this.openLinesModal(row);
  }

  openLinesModal(row: any): void {
    const raw = row?.debitNoteLines ?? row?.DebitNoteLines ?? row?.lines ?? row?.linesJson ?? row?.LinesJson ?? [];
    const lines: any[] = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
    this.modalLines = lines;
    this.modalDnNo = row.debitNoteNo ?? '';
    this.modalSupplier = row.supplierName ?? '';
    this.modalStatus = row.status ?? '';
    this.modalTotal = row.amount ?? null;
    if (!lines.length) {
      this.svc.getDebitNoteById(row.id).subscribe({
        next: res => {
          const d = this.svc.unwrapOne(res);
          const raw2 = d.debitNoteLines ?? d.DebitNoteLines ?? d.lines ?? d.linesJson ?? d.LinesJson ?? [];
          this.modalLines = Array.isArray(raw2)
            ? raw2
            : (() => { try { return JSON.parse(raw2 || '[]'); } catch { return []; } })();
          this.modalTotal = d.amount ?? d.netTotal ?? this.modalTotal;
        }
      });
    }
    this.showLinesModal = true;
  }

  closeLinesModal(): void { this.showLinesModal = false; }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view')   this.openLinesModal(e.row);
    if (e.action === 'edit')   this.router.navigate(['/app/purchase/debit-note', e.row.id]);
    if (e.action === 'post')   this.postDebitNote(e.row);
    if (e.action === 'delete') this.delete(e.row);
  }

  openConfirm(row: any, action: string): void {
    this.confirmRow = row;
    this.confirmAction = action;
    this.confirmError = '';
    this.showConfirm = true;
  }

  closeConfirm(): void { this.showConfirm = false; this.confirmRow = null; this.confirmError = ''; }

  doConfirm(): void {
    if (!this.confirmRow) return;
    this.confirmLoading = true;
    this.confirmError = '';
    const row = this.confirmRow;
    if (this.confirmAction === 'post') {
      this.svc.postDebitNote(row.id).subscribe({
        next: () => { this.confirmLoading = false; this.closeConfirm(); this.load(); },
        error: err => { this.confirmLoading = false; this.confirmError = err?.error?.message || 'Unable to post debit note.'; }
      });
    } else if (this.confirmAction === 'delete') {
      this.svc.deleteDebitNote(row.id).subscribe({
        next: () => { this.confirmLoading = false; this.closeConfirm(); this.load(); },
        error: err => { this.confirmLoading = false; this.confirmError = err?.error?.message || 'Unable to delete debit note.'; }
      });
    }
  }

  postDebitNote(row: any): void {
    const st = String(row.status ?? '').toLowerCase();
    if (st === 'posted') return;
    this.openConfirm(row, 'post');
  }

  delete(row: any): void {
    if (String(row.status ?? '').toLowerCase() === 'posted') return;
    this.openConfirm(row, 'delete');
  }

  get pendingCount(): number { return this.rows.filter(r => !r.status || String(r.status).toLowerCase() === 'pending').length; }
  get approvedCount(): number { return this.rows.filter(r => String(r.status ?? '').toLowerCase() === 'posted').length; }
}
