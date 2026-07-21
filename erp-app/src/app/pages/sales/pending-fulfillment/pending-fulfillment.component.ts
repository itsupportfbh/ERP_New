import { Component, OnInit } from '@angular/core';
import { SalesService } from '../sales.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

interface PendingRow {
  lineId: number;
  salesOrderId: number;
  salesOrderNo: string;
  customerName: string;
  deliveryDate: string | null;
  itemId: number;
  itemName: string;
  uom: string;
  quantity: number;
  available: number;
  supplyMethodId: number;     // 0 pending, 1 PP, 2 Direct DO
  fulfillmentMode: number | null;
  // ui
  choice: number | null;      // 1 PP, 2 Direct DO
  saving?: boolean;
}

@Component({
  selector: 'erp-pending-fulfillment',
  standalone: false,
  templateUrl: './pending-fulfillment.component.html',
  styleUrls: ['./pending-fulfillment.component.scss']
})
export class PendingFulfillmentComponent implements OnInit {
  loading = false;
  rows: PendingRow[] = [];
  filtered: PendingRow[] = [];
  searchText = '';
  pageSize = 10;
  showAlerts = false;

  get paged(): PendingRow[] { return this.filtered.slice(0, this.pageSize); }

  readonly fnId = 'so-list';
  private locationId = Number(localStorage.getItem('locationId') || 0);
  private userId = Number(localStorage.getItem('userId') || 1) || 1;

  // Recipe / Production Planning module is hidden — a PP-routed line can never be
  // completed and would get stuck, so only Direct DO is offered here. Restore the
  // PP option when the Recipe/Production module is re-enabled.
  fulfillmentOptions = [
    // { value: 1, label: 'PP (Produce)' },
    { value: 2, label: 'Direct DO (Ship)' }
  ];

  constructor(private svc: SalesService, public perm: PermissionService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getPendingFulfillment().subscribe({
      next: (res: any) => {
        const arr: any[] = (res?.data ?? res ?? []) as any;
        this.rows = (Array.isArray(arr) ? arr : []).map((r: any) => ({
          lineId: Number(r.lineId ?? r.LineId),
          salesOrderId: Number(r.salesOrderId ?? r.SalesOrderId),
          salesOrderNo: String(r.salesOrderNo ?? r.SalesOrderNo ?? ''),
          customerName: String(r.customerName ?? r.CustomerName ?? ''),
          deliveryDate: r.deliveryDate ?? r.DeliveryDate ?? null,
          itemId: Number(r.itemId ?? r.ItemId),
          itemName: String(r.itemName ?? r.ItemName ?? ''),
          uom: String(r.uom ?? r.Uom ?? ''),
          quantity: Number(r.quantity ?? r.Quantity ?? 0),
          available: Number(r.available ?? r.Available ?? 0),
          supplyMethodId: Number(r.supplyMethodId ?? r.SupplyMethodId ?? 0),
          fulfillmentMode: r.fulfillmentMode ?? r.FulfillmentMode ?? null,
          choice: null
        }));
        // Recipe/Production hidden → always Direct DO. Short lines auto-create a PR (buy).
        for (const r of this.rows) r.choice = 2;
        this.applyFilter();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        void Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to load pending fulfillment.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  applyFilter(): void {
    const q = (this.searchText || '').trim().toLowerCase();
    this.filtered = !q
      ? this.rows.slice()
      : this.rows.filter(r =>
          r.salesOrderNo.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.itemName.toLowerCase().includes(q));
  }

  shortage(r: PendingRow): number {
    return Math.max((r.quantity || 0) - (r.available || 0), 0);
  }

  get totalPending(): number { return this.rows.length; }
  get countStockOk(): number { return this.rows.filter(r => r.available >= r.quantity).length; }
  get countShort(): number { return this.rows.filter(r => r.available < r.quantity).length; }

  resolve(r: PendingRow): void {
    if (r.choice !== 1 && r.choice !== 2) {
      void Swal.fire({ icon: 'warning', title: 'Validation', text: 'Please choose PP or Direct DO.', confirmButtonColor: '#16a34a' });
      return;
    }
    r.saving = true;
    this.svc.resolveFulfillment(r.lineId, r.choice, this.userId, this.locationId).subscribe({
      next: (res: any) => {
        r.saving = false;
        this.rows = this.rows.filter(x => x.lineId !== r.lineId);
        this.applyFilter();
        const data = res?.data ?? res ?? {};
        if (data?.prCreated) {
          void Swal.fire({ icon: 'success', title: 'Direct DO + PR created',
            text: `Shortage ${data.shortageQty ?? ''} → Purchase Request ${data.purchaseRequestNo ?? ''} created.`,
            confirmButtonColor: '#16a34a' });
        } else {
          void Swal.fire({ icon: 'info', title: 'Resolved (no PR)',
            text: `${data?.message ?? 'Fulfillment updated.'} | shortage=${data?.shortageQty ?? '?'} | locationId=${this.locationId}`,
            confirmButtonColor: '#16a34a' });
        }
      },
      error: (err: any) => {
        r.saving = false;
        void Swal.fire('Error', err?.error?.message ?? 'Update failed.', 'error');
      }
    });
  }
}
