import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn } from '../../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-supplier-invoice-list',
  standalone: false,
  templateUrl: './supplier-invoice-list.component.html',
  styleUrls: ['./supplier-invoice-list.component.scss']
})
export class SupplierInvoiceListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  columns: TableColumn[] = [
    { key: 'invoiceNo',    header: 'Invoice No',   sortable: true },
    { key: 'supplierName', header: 'Supplier',      sortable: true },
    { key: 'invoiceDate',  header: 'Invoice Date',  sortable: true, type: 'date' },
    { key: 'currencyCode', header: 'Currency' },
    { key: 'grandTotal',   header: 'Total',         type: 'number', align: 'right' },
    { key: 'isOverseas',   header: 'Overseas',      type: 'boolean', align: 'center' },
    { key: 'isGlPosted',   header: 'GL Posted',     type: 'boolean', align: 'center' },
    { key: 'status',       header: 'Status',        type: 'badge',
      badgeMap: { Draft: 'default', Posted: 'success', Partial: 'warning' } },
  ];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getSupplierInvoices().subscribe({
      next: res => { this.rows = this.svc.unwrap(res); this.applyFilter(); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          (r.invoiceNo ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q) ||
          (r.status ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/supplier-invoice/new']); }

  onRowClick(row: any): void {
    this.router.navigate(['/app/purchase/supplier-invoice', row.id]);
  }
}
