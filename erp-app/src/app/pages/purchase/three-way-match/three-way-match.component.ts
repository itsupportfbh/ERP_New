import { Component, OnInit } from '@angular/core';
import { PurchaseService } from '../purchase.service';
import { TableColumn } from '../../../shared/components/data-table/data-table.component';
import Swal from 'sweetalert2';

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

  columns: TableColumn[] = [
    { key: 'itemName',    header: 'Item',        sortable: true },
    { key: 'itemCode',    header: 'Item Code' },
    { key: 'poQty',       header: 'PO Qty',      type: 'number', align: 'right' },
    { key: 'poPrice',     header: 'PO Price',    type: 'number', align: 'right' },
    { key: 'grnQty',      header: 'GRN Qty',     type: 'number', align: 'right' },
    { key: 'pinQty',      header: 'Invoice Qty', type: 'number', align: 'right' },
    { key: 'pinPrice',    header: 'Invoice Price', type: 'number', align: 'right' },
    { key: 'matchStatus', header: 'Match Status', type: 'badge',
      badgeMap: { OK: 'success', 'Qty Mismatch': 'warning', 'Price Variance': 'warning', 'Qty + Price': 'danger' } },
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
      next: res => { this.rows = this.svc.unwrap(res); this.applyFilter(); this.loading = false; },
      error: err => {
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to load 3-way match data.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r => (r.itemName ?? '').toLowerCase().includes(q) || (r.matchStatus ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  get okCount(): number { return this.rows.filter(r => r.matchStatus === 'OK').length; }
  get mismatchCount(): number { return this.rows.filter(r => r.matchStatus !== 'OK').length; }
}
