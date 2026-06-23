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
  modalRow: any = null;
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

  // Approval confirm modal
  showConfirm = false;
  confirmRow: any = null;
  confirmStatus: 2 | 3 = 2;
  confirmLoading = false;
  confirmError = '';

  // Action confirm modal (delete / draft actions)
  showActionConfirm = false;
  actionRow: any = null;
  actionType = '';
  actionLoading = false;
  actionError = '';

  // Success toast
  toastMsg = '';
  toastColor = '#16a34a';
  private toastTimer: any;
  showToast(msg: string, color = '#16a34a'): void {
    clearTimeout(this.toastTimer);
    this.toastMsg = msg; this.toastColor = color;
    this.toastTimer = setTimeout(() => { this.toastMsg = ''; }, 3500);
  }

  prActionFilter = (action: string, row: any): boolean => {
    const s = this.prStatusNum(row);
    switch (action) {
      case 'edit':   return s !== 2 && s !== 3;
      case 'delete': return s !== 2 && s !== 3;
      default:       return true;
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
    this.openLinesModal(row);
  }

  openLinesModal(row: any): void {
    const raw = row?.pRLines ?? row?.prLines ?? row?.PRLines ?? '[]';
    const lines: any[] = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
    this.modalRow = row;
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

  closeLinesModal(): void { this.showLinesModal = false; this.modalRow = null; }

  approveFromModal(status: 2 | 3): void {
    const row = this.modalRow;
    this.closeLinesModal();
    if (row) this.openConfirm(row, status);
  }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view')    this.openLinesModal(e.row);
    if (e.action === 'edit')    this.router.navigate(['/app/purchase/requests', e.row.id]);
    if (e.action === 'approve') this.openConfirm(e.row, 2);
    if (e.action === 'reject')  this.openConfirm(e.row, 3);
    if (e.action === 'delete')  this.delete(e.row);
  }

  openConfirm(row: any, status: 2 | 3): void {
    this.confirmRow = row;
    this.confirmStatus = status;
    this.confirmError = '';
    this.showConfirm = true;
  }

  closeConfirm(): void { this.showConfirm = false; this.confirmRow = null; this.confirmError = ''; }

  doConfirm(): void {
    if (!this.confirmRow) return;
    this.confirmLoading = true;
    this.confirmError = '';
    const row = this.confirmRow;
    const status = this.confirmStatus;
    const amount = Number(row.netTotal ?? row.totalAmount ?? row.amount ?? 0);
    const request$ = status === 2
      ? this.svc.approvePurchaseRequest(row.id, amount)
      : this.svc.rejectPurchaseRequest(row.id, amount);
    request$.subscribe({
      next: () => {
        this.confirmLoading = false; this.closeConfirm(); this.load(); this.loadPendingApprovals();
        Swal.fire({ icon: status === 2 ? 'success' : 'info', title: status === 2 ? 'Approved!' : 'Rejected', text: status === 2 ? `PR ${row.purchaseRequestNo} approved successfully.` : `PR ${row.purchaseRequestNo} rejected.`, confirmButtonColor: '#1a9db8' });
      },
      error: err => {
        this.confirmLoading = false;
        this.confirmError = err?.error?.message || 'Action failed. Please try again.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Action failed. Please try again.', confirmButtonColor: '#1a9db8' });
      }
    });
  }

  convertToPO(row: any): void {
    if (!this.isApproved(row)) return;
    this.router.navigate(['/app/purchase/orders/new'], { queryParams: { fromPR: row.id } });
  }

  openActionConfirm(row: any, type: string): void {
    this.actionRow = row; this.actionType = type; this.actionError = ''; this.showActionConfirm = true;
  }
  closeActionConfirm(): void { this.showActionConfirm = false; this.actionRow = null; this.actionError = ''; }
  doActionConfirm(): void {
    if (!this.actionRow) return;
    this.actionLoading = true; this.actionError = '';
    const row = this.actionRow;
    if (this.actionType === 'delete-pr') {
      this.svc.deletePurchaseRequest(row.id).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.load();
          Swal.fire({ icon: 'success', title: 'Deleted!', text: `PR ${row.purchaseRequestNo} deleted.`, confirmButtonColor: '#1a9db8' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete.', confirmButtonColor: '#1a9db8' });
        }
      });
    } else if (this.actionType === 'promote-draft') {
      this.svc.promotePurchaseRequestDraft(row.id ?? row.iD, this.currentUserId()).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.load(); this.loadDrafts();
          Swal.fire({ icon: 'success', title: 'Promoted!', text: 'Draft promoted to purchase request.', confirmButtonColor: '#1a9db8' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to promote draft.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to promote draft.', confirmButtonColor: '#1a9db8' });
        }
      });
    } else if (this.actionType === 'delete-draft') {
      this.svc.deletePurchaseRequestDraft(row.id ?? row.iD, this.currentUserId()).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.loadDrafts();
          Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Draft deleted.', confirmButtonColor: '#1a9db8' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete draft.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete draft.', confirmButtonColor: '#1a9db8' });
        }
      });
    }
  }

  isApproved(row: any): boolean {
    const value = row.approvalStatus ?? row.status ?? row.statusLabel;
    if (typeof value === 'number') return value === 2;
    return String(value ?? '').toLowerCase() === 'approved';
  }

  approveReject(row: any, status: 2 | 3): void {
    if (this.isFinal(row)) return;
    this.openConfirm(row, status);
  }

  async delete(row: any): Promise<void> {
    if (this.isFinal(row)) return;
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Delete PR ${row.purchaseRequestNo}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#1a9db8',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it!'
    });
    if (!result.isConfirmed) return;
    this.svc.deletePurchaseRequest(row.id).subscribe({
      next: () => {
        this.load();
        Swal.fire({ icon: 'success', title: 'Deleted!', text: `PR ${row.purchaseRequestNo} deleted.`, confirmButtonColor: '#1a9db8' });
      },
      error: err => {
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete.', confirmButtonColor: '#1a9db8' });
      }
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
    this.openActionConfirm(draft, 'promote-draft');
  }

  deleteDraft(draft: any, e: Event): void {
    e.stopPropagation();
    this.openActionConfirm(draft, 'delete-draft');
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
