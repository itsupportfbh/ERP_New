import { Component, OnInit } from '@angular/core';
import { PurchaseService } from '../purchase.service';
import { TableColumn } from '../../../shared/components/data-table/data-table.component';
import Swal from 'sweetalert2';

const STATUS_LABELS: Record<string, string> = {
  OK: 'OK',
  PARTIAL: 'Partial',
  NOT_INVOICED: 'Not invoiced',
  FAV_PRICE: 'Below PO rate',
  PRICE_MISMATCH: 'Price mismatch',
  OVER_BILL: 'Over-billed',
  AMOUNT_MISMATCH: 'Amount error',
  NO_PO_LINE: 'Not on PO'
};

@Component({
  selector: 'erp-three-way-match',
  standalone: false,
  templateUrl: './three-way-match.component.html',
  styleUrls: ['./three-way-match.component.scss']
})
export class ThreeWayMatchComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  pinId: number | null = null;
  pinOptions: any[] = [];

  /** Header rollup for the selected invoice — carries canPostToAp / blockReason. */
  match: any = null;

  columns: TableColumn[] = [
    { key: 'itemName',     header: 'Item',        sortable: true },
    { key: 'poQty',        header: 'PO Qty',      type: 'number', align: 'right' },
    { key: 'poRate',       header: 'PO Rate',     type: 'number', align: 'right' },
    { key: 'grnQty',       header: 'Received',    type: 'number', align: 'right' },
    { key: 'billableQty',  header: 'Billable',    type: 'number', align: 'right' },
    { key: 'invQty',       header: 'Invoice Qty', type: 'number', align: 'right' },
    { key: 'invRate',      header: 'Invoice Rate', type: 'number', align: 'right' },
    { key: 'priceVariancePct', header: 'Price Var %', type: 'number', align: 'right' },
    { key: 'statusLabel',  header: 'Match Status', type: 'badge',
      badgeMap: {
        'OK': 'success',
        'Partial': 'default',
        'Not invoiced': 'default',
        'Below PO rate': 'warning',
        'Price mismatch': 'danger',
        'Over-billed': 'danger',
        'Amount error': 'danger',
        'Not on PO': 'danger'
      } },
  ];

  constructor(private svc: PurchaseService) {}

  ngOnInit(): void {
    this.svc.getSupplierInvoices().subscribe(r => {
      this.pinOptions = this.svc.unwrap(r).map((p: any) => ({
        label: `${p.invoiceNo} - ${p.supplierName ?? ''}`,
        value: p.id
      }));
    });
  }

  loadMatch(): void {
    if (!this.pinId) return;
    this.loading = true;
    this.svc.getThreeWayMatch(this.pinId).subscribe({
      next: res => {
        // GetThreeWayMatch returns a single header object whose `lines` array holds the
        // per-item detail this grid renders.
        this.match = this.svc.unwrapOne(res) ?? null;
        this.rows = (this.match?.lines ?? []).map((l: any) => ({
          ...l,
          statusLabel: STATUS_LABELS[l.status] ?? l.status
        }));
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        this.match = null;
        this.rows = [];
        this.filtered = [];
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to load 3-way match data.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r => (r.itemName ?? '').toLowerCase().includes(q) || (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  get okCount(): number { return this.rows.filter(r => !r.isBlocking).length; }
  get mismatchCount(): number { return this.rows.filter(r => r.isBlocking).length; }
}
