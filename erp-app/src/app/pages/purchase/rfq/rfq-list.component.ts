import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'erp-rfq-list',
  standalone: false,
  templateUrl: './rfq-list.component.html',
  styleUrls: ['./rfq-list.component.scss']
})
export class RfqListComponent implements OnInit {
  readonly fnId = 'rfq';
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

  rowActionFilter = (action: string, _row: any): boolean => {
    switch (action) {
      case 'edit':   return this.perm.canEdit(this.fnId);
      case 'delete': return this.perm.canDelete(this.fnId);
      default:       return true;
    }
  };

  constructor(private svc: PurchaseService, private router: Router, public perm: PermissionService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getRfqs().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          let supplierNames = '';
          try {
            const sups: any[] = JSON.parse(r.suppliersJson || '[]');
            supplierNames = sups.map(s => s.name).filter(Boolean).join(', ');
          } catch { supplierNames = ''; }
          return {
            ...r,
            id: r.id,
            number: r.rfqNo ?? r.number ?? '',
            customerName: supplierNames,
            deliveryDate: r.validUntil ?? r.deliveryDate,
            grandTotal: r.total ?? r.grandTotal ?? null,
            statusLabel: r.status ?? 'Draft',
          };
        });
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
    this.modalLines = [];
    this.modalRfqNo = row.number ?? '';
    this.modalSupplier = row.customerName ?? '';
    this.modalStatus = row.statusLabel ?? '';
    this.modalTotal = row.grandTotal ?? null;
    this.showLinesModal = true;

    // Always fetch fresh from API to get latest itemsJson
    this.svc.getRfqById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        try {
          this.modalLines = JSON.parse(d.itemsJson || '[]');
        } catch { this.modalLines = []; }
      }
    });
  }

  closeLinesModal(): void { this.showLinesModal = false; }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view')   this.openLinesModal(e.row);
    if (e.action === 'edit')   this.router.navigate(['/app/purchase/rfq', e.row.id]);
    if (e.action === 'send')   this.send(e.row);
    if (e.action === 'delete') this.delete(e.row);
  }

  async send(row: any): Promise<void> {
    let suppliers: any[] = [];
    try { suppliers = JSON.parse(row.suppliersJson || '[]'); } catch { suppliers = []; }

    if (!suppliers.length) {
      Swal.fire({ icon: 'warning', title: 'No Suppliers', text: 'Add at least one supplier with email/phone before sending.', confirmButtonColor: '#16a34a' });
      return;
    }

    const hasContact = suppliers.some((s: any) => s.email?.trim() || s.phone?.trim());
    if (!hasContact) {
      Swal.fire({ icon: 'warning', title: 'No Contact Info', text: 'Suppliers have no email or phone. Edit the RFQ and fill in supplier contact details.', confirmButtonColor: '#16a34a' });
      return;
    }

    const supplierList = suppliers.map((s: any) => `• ${s.name}${s.email ? ' (' + s.email + ')' : ''}${s.phone ? ' / ' + s.phone : ''}`).join('<br>');
    const result = await Swal.fire({
      title: 'Send RFQ?',
      html: `Send <b>${row.number}</b> via <b>${row.sendVia ?? 'Email'}</b> to:<br><br><div style="text-align:left;font-size:13px;color:#374151">${supplierList}</div>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, send it!'
    });
    if (!result.isConfirmed) return;
    const sendPayload = {
      RfqNo: row.number,
      ValidUntil: row.deliveryDate,
      SendVia: row.sendVia ?? 'Email',
      ItemsJson: row.itemsJson ?? '[]',
      Suppliers: suppliers
    };
    Swal.fire({ title: 'Sending…', html: 'Sending RFQ to suppliers.<br/>Please wait.', allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    this.svc.sendRfq(sendPayload).subscribe({
      next: (res: any) => {
        this.load();
        const data = res?.data ?? res;
        const results: any[] = data?.results ?? [];
        const sandboxResults = results.filter((r: any) => r.message?.toLowerCase().includes('sandbox'));
        const hasSandbox = sandboxResults.length > 0;
        const sent = data?.sentCount ?? 0;
        const failed = data?.failedCount ?? 0;

        if (hasSandbox) {
          const sandboxNames = sandboxResults.map((r: any) => r.supplier).join(', ');
          Swal.fire({
            icon: 'warning',
            title: 'WhatsApp Not Configured',
            html: `WhatsApp is in <b>sandbox mode</b> — messages are logged but not delivered to the phone.<br><br>
                   <b>To fix:</b> Add your Meta WhatsApp Business API credentials to <code>appsettings.json</code>:<br>
                   <code style="font-size:12px">WhatsApp:AccessToken</code> and <code style="font-size:12px">WhatsApp:PhoneNumberId</code><br><br>
                   <b>Tip:</b> Change <b>Send Via</b> to <b>Email</b> in the RFQ — email is already configured and will work immediately.`,
            confirmButtonColor: '#16a34a'
          });
        } else if (failed === 0 && sent > 0) {
          const detail = results.map((r: any) => `${r.supplier}: ${r.message}`).join('\n');
          Swal.fire({ icon: 'success', title: 'Sent!', text: `RFQ ${row.number} sent to ${sent} supplier(s).\n${detail}`, confirmButtonColor: '#16a34a' });
        } else {
          const msgs = results.map((r: any) => `${r.supplier}: ${r.message}`).join('\n');
          Swal.fire({ icon: 'warning', title: `Sent ${sent}, Failed ${failed}`, text: msgs || 'Some suppliers could not be reached.', confirmButtonColor: '#16a34a' });
        }
      },
      error: err => {
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to send RFQ.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  async delete(row: any): Promise<void> {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Delete RFQ ${row.number}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, delete it!'
    });
    if (!result.isConfirmed) return;
    this.svc.deleteRfq(row.id).subscribe({
      next: () => {
        this.load();
        Swal.fire({ icon: 'success', title: 'Deleted!', text: `RFQ ${row.number} deleted.`, confirmButtonColor: '#16a34a' });
      },
      error: err => {
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete RFQ.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  openActionConfirm(row: any, type: string): void {
    this.actionRow = row; this.actionType = type; this.actionError = ''; this.showActionConfirm = true;
  }
  closeActionConfirm(): void { this.showActionConfirm = false; this.actionRow = null; this.actionError = ''; }
  doActionConfirm(): void {
    if (!this.actionRow) return;
    this.actionLoading = true; this.actionError = '';
    const row = this.actionRow;
    if (this.actionType === 'send-rfq') {
      let suppliers: any[] = [];
      try { suppliers = JSON.parse(row.suppliersJson || '[]'); } catch { suppliers = []; }
      const sendPayload = {
        RfqNo: row.number,
        ValidUntil: row.deliveryDate,
        SendVia: row.sendVia ?? 'Email',
        ItemsJson: row.itemsJson ?? '[]',
        Suppliers: suppliers
      };
      this.svc.sendRfq(sendPayload).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.load();
          Swal.fire({ icon: 'success', title: 'Sent!', text: `RFQ ${row.number} sent to supplier.`, confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to send RFQ.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to send RFQ.', confirmButtonColor: '#16a34a' });
        }
      });
    } else if (this.actionType === 'delete-rfq') {
      this.svc.deleteRfq(row.id).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.load();
          Swal.fire({ icon: 'success', title: 'Deleted!', text: `RFQ ${row.number} deleted.`, confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete RFQ.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete RFQ.', confirmButtonColor: '#16a34a' });
        }
      });
    }
  }

  get pendingCount(): number { return this.rows.filter(r => ['Pending', 'Submitted', 'Sent'].includes(r.statusLabel ?? '')).length; }
  get approvedCount(): number { return this.rows.filter(r => r.statusLabel === 'Approved').length; }
}
