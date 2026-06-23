import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';
import Swal from 'sweetalert2';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected', 4: 'Draft' };

@Component({
  selector: 'erp-purchase-request-list',
  standalone: false,
  templateUrl: './purchase-request-list.component.html',
  styleUrls: ['./purchase-request-list.component.scss']
})
export class PurchaseRequestListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  alerts: any[] = [];
  drafts: any[] = [];
  pendingApprovals: any[] = [];
  showAlerts = false;
  showDrafts = false;
  sideLoading = false;

  // Lines detail modal
  showLinesModal = false;
  modalLines: any[] = [];
  modalTotalQty = 0;
  modalPrNo = '';
  modalPrStatus = '';
  modalRequester = '';
  modalDept = '';
  modalDelivery = '';

  columns: TableColumn[] = [
    { key: 'purchaseRequestNo', header: 'PR No', sortable: true },
    { key: 'requester', header: 'Requester', sortable: true },
    { key: 'departmentName', header: 'Department', sortable: true },
    { key: 'deliveryDate', header: 'Delivery Date', sortable: true, type: 'date' },
    { key: 'description', header: 'Description' },
    {
      key: 'statusLabel',
      header: 'Status',
      type: 'badge',
      badgeMap: { Pending: 'warning', Approved: 'success', Rejected: 'danger', Draft: 'default' }
    },
    { key: 'createdDate', header: 'Created', sortable: true, type: 'date' },
  ];

  rowActions: RowAction[] = [
    { key: 'edit',   label: 'Edit',   btnClass: 'default', icon: 'edit'   },
    { key: 'delete', label: 'Delete', btnClass: 'danger',  icon: 'delete' },
  ];

  prActionFilter = (action: string, row: any): boolean => {
    const s = this.prStatusNum(row);
    switch (action) {
      case 'edit':    return s !== 2 && s !== 3;
      case 'delete':  return s !== 2 && s !== 3;
      case 'approve': return s === 1;
      case 'reject':  return s === 1;
      default:        return true;
    }
  };

  private prStatusNum(row: any): number {
    const v = row.approvalStatus ?? row.status;
    if (typeof v === 'number') return v;
    const label = (row.statusLabel ?? String(v ?? '')).toLowerCase();
    if (label === 'approved') return 2;
    if (label === 'rejected') return 3;
    if (label === 'draft')    return 0;
    return 1;
  }

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void {
    this.load();
    this.loadAlerts();
    this.loadDrafts();
    this.loadPendingApprovals();
  }

  load(): void {
    this.loading = true;
    this.svc.getPurchaseRequests().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          purchaseRequestNo: r.purchaseRequestNo ?? r.pRNo,
          requester: r.requester ?? r.requestedByName ?? r.createdByName,
          statusLabel: typeof r.status === 'number'
            ? (STATUS_MAP[r.status] ?? 'Pending')
            : (r.status ?? STATUS_MAP[r.approvalStatus] ?? 'Pending'),
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
          (r.purchaseRequestNo ?? '').toLowerCase().includes(q) ||
          (r.requester ?? '').toLowerCase().includes(q) ||
          (r.departmentName ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/requests/new']); }

  onRowClick(row: any): void {
    this.router.navigate(['/app/purchase/requests', row.id]);
  }

  openLinesModal(row: any): void {
    const raw = row?.pRLines ?? row?.prLines ?? row?.PRLines ?? '[]';
    const lines: any[] = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
    this.modalLines = lines;
    this.modalTotalQty = lines.reduce((s: number, l: any) => s + (Number(l?.qty ?? l?.quantity) || 0), 0);
    this.modalPrNo = row.purchaseRequestNo ?? '';
    this.modalPrStatus = row.statusLabel ?? '';
    this.modalRequester = row.requester ?? '';
    this.modalDept = row.departmentName ?? '';
    this.modalDelivery = row.deliveryDate ?? '';
    if (!lines.length) {
      this.svc.getPurchaseRequestById(row.id).subscribe({
        next: res => {
          const d = this.svc.unwrapOne(res);
          const r2 = d.pRLines ?? d.prLines ?? d.PRLines ?? '[]';
          this.modalLines = Array.isArray(r2) ? r2 : (() => { try { return JSON.parse(r2 || '[]'); } catch { return []; } })();
          this.modalTotalQty = this.modalLines.reduce((s: number, l: any) => s + (Number(l?.qty ?? l?.quantity) || 0), 0);
        }
      });
    }
    this.showLinesModal = true;
  }

  closeLinesModal(): void { this.showLinesModal = false; }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view')   this.openLinesModal(e.row);
    if (e.action === 'edit')   this.router.navigate(['/app/purchase/requests', e.row.id]);
    if (e.action === 'delete') this.delete(e.row);
  }

  convertToPO(row: any): void {
    if (!this.isApproved(row)) {
      Swal.fire('Not Allowed', 'Only approved purchase requests can be converted to a purchase order.', 'warning');
      return;
    }
    this.router.navigate(['/app/purchase/orders/new'], { queryParams: { fromPR: row.id } });
  }

  isApproved(row: any): boolean {
    const value = row.approvalStatus ?? row.status ?? row.statusLabel;
    if (typeof value === 'number') return value === 2;
    return String(value ?? '').toLowerCase() === 'approved';
  }

  approveReject(row: any, status: 2 | 3): void {
    if (this.isFinal(row)) {
      Swal.fire('Not Allowed', 'This purchase request is already final.', 'warning');
      return;
    }
    const action = status === 2 ? 'approve' : 'reject';
    Swal.fire({ title: 'Are you sure?', text: `${action.charAt(0).toUpperCase() + action.slice(1)} PR ${row.purchaseRequestNo}?`, icon: 'question', showCancelButton: true, confirmButtonText: status === 2 ? 'Approve' : 'Reject', confirmButtonColor: status === 2 ? '#22c55e' : '#ef4444' })
      .then(r => { if (!r.isConfirmed) return;
        const amount = Number(row.netTotal ?? row.totalAmount ?? row.amount ?? 0);
        const request$ = status === 2
          ? this.svc.approvePurchaseRequest(row.id, amount)
          : this.svc.rejectPurchaseRequest(row.id, amount);
        request$.subscribe({
          next: () => { Swal.fire('Success', `Purchase request ${action}d.`, 'success'); this.load(); this.loadPendingApprovals(); },
          error: err => Swal.fire('Error', err?.error?.message || `Unable to ${action} purchase request.`, 'error')
        });
      });
  }

  delete(row: any): void {
    if (this.isFinal(row)) {
      Swal.fire('Not Allowed', 'Approved/rejected purchase requests cannot be deleted.', 'warning');
      return;
    }
    Swal.fire({ title: 'Delete PR?', text: `Delete PR ${row.purchaseRequestNo}? This cannot be undone.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.deletePurchaseRequest(row.id).subscribe({
          next: () => { Swal.fire('Deleted', 'Purchase request deleted.', 'success'); this.load(); },
          error: err => Swal.fire('Error', err?.error?.message || 'Unable to delete purchase request.', 'error')
        });
      });
  }

  loadAlerts(): void {
    this.svc.getPurchaseAlerts().subscribe({
      next: res => { this.alerts = this.svc.unwrap(res); },
      error: () => { this.alerts = []; }
    });
  }

  markAlertRead(id: number | string, e?: Event): void {
    e?.stopPropagation();
    this.svc.markAlertRead(id).subscribe({
      next: () => { this.alerts = this.alerts.filter(a => (a.id ?? a.iD) !== id); }
    });
  }

  markAllAlertsRead(): void {
    this.svc.markAllAlertsRead().subscribe({ next: () => { this.alerts = []; } });
  }

  loadDrafts(): void {
    this.sideLoading = true;
    this.svc.getPurchaseRequestDrafts().subscribe({
      next: res => { this.drafts = this.svc.unwrap(res); this.sideLoading = false; },
      error: () => { this.drafts = []; this.sideLoading = false; }
    });
  }

  openDraft(draft: any): void {
    const id = draft.id ?? draft.iD;
    this.router.navigate(['/app/purchase/requests/new'], { queryParams: { draftId: id } });
  }

  promoteDraft(draft: any, e: Event): void {
    e.stopPropagation();
    const id = draft.id ?? draft.iD;
    Swal.fire({ title: 'Promote Draft?', text: 'Convert this draft into a purchase request?', icon: 'question', showCancelButton: true, confirmButtonText: 'Promote', confirmButtonColor: '#0e7490' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.promotePurchaseRequestDraft(id, this.currentUserId()).subscribe({
          next: () => { Swal.fire('Success', 'Draft promoted to purchase request.', 'success'); this.load(); this.loadDrafts(); },
          error: err => Swal.fire('Error', err?.error?.message || 'Unable to promote purchase request draft.', 'error')
        });
      });
  }

  deleteDraft(draft: any, e: Event): void {
    e.stopPropagation();
    const id = draft.id ?? draft.iD;
    Swal.fire({ title: 'Delete Draft?', text: 'Delete this purchase request draft? This cannot be undone.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.deletePurchaseRequestDraft(id, this.currentUserId()).subscribe({
          next: () => { Swal.fire('Deleted', 'Draft deleted.', 'success'); this.loadDrafts(); },
          error: err => Swal.fire('Error', err?.error?.message || 'Unable to delete purchase request draft.', 'error')
        });
      });
  }

  loadPendingApprovals(): void {
    this.svc.getPendingApprovals('PR').subscribe({
      next: res => { this.pendingApprovals = this.svc.unwrap(res); },
      error: () => { this.pendingApprovals = []; }
    });
  }

  get draftCount(): number { return this.drafts.length; }
  get alertCount(): number { return this.alerts.length; }
  get pendingCount(): number {
    return this.rows.filter(r => !this.isFinal(r)).length || this.pendingApprovals.length;
  }
  get approvedCount(): number { return this.rows.filter(r => r.statusLabel === 'Approved').length; }

  isFinal(row: any): boolean {
    const value = row.approvalStatus ?? row.status ?? row.statusLabel;
    if (typeof value === 'number') return value === 2 || value === 3;
    const label = String(value ?? '').toLowerCase();
    return label === 'approved' || label === 'rejected';
  }

  currentUserId(): string {
    return localStorage.getItem('userId') || localStorage.getItem('userid') || '0';
  }
}
