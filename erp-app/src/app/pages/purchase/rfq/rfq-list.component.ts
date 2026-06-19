import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';

const STATUS_BADGE: any = { Draft: 'default', Submitted: 'warning', Approved: 'success', Rejected: 'danger', Posted: 'success' };

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

  columns: TableColumn[] = [
    { key: 'number',       header: 'RFQ No',      sortable: true },
    { key: 'customerName', header: 'Supplier',     sortable: true },
    { key: 'deliveryDate', header: 'Valid Until',  sortable: true, type: 'date' },
    { key: 'grandTotal',   header: 'Amount',       type: 'number', align: 'right' },
    { key: 'statusLabel',  header: 'Status',       type: 'badge',
      badgeMap: { Draft: 'default', Submitted: 'warning', Approved: 'success', Rejected: 'danger', Posted: 'success' } },
  ];

  rowActions: RowAction[] = [{ key: 'delete', label: '✕', btnClass: 'danger' }];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getRfqs().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id,
          statusLabel: r.status ?? 'Draft',
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

  onRowClick(row: any): void { this.router.navigate(['/app/purchase/rfq', row.id]); }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'delete') this.delete(e.row);
  }

  delete(row: any): void {
    if (!confirm(`Delete RFQ ${row.number}?`)) return;
    this.svc.deleteRfq(row.id).subscribe({ next: () => this.load() });
  }
}
