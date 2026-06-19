import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';

const STATUS_MAP: Record<number, string> = { 1: 'Pending', 2: 'Approved', 3: 'Rejected', 4: 'Draft' };

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

  columns: TableColumn[] = [
    { key: 'purchaseRequestNo', header: 'PR No',        sortable: true },
    { key: 'requester',         header: 'Requester',    sortable: true },
    { key: 'departmentName',    header: 'Department',   sortable: true },
    { key: 'deliveryDate',      header: 'Delivery Date',sortable: true, type: 'date' },
    { key: 'description',       header: 'Description' },
    { key: 'statusLabel',       header: 'Status',       type: 'badge',
      badgeMap: { Pending: 'warning', Approved: 'success', Rejected: 'danger', Draft: 'default' } },
    { key: 'createdDate',       header: 'Created',      sortable: true, type: 'date' },
  ];

  rowActions: RowAction[] = [
    { key: 'delete', label: '✕', btnClass: 'danger' }
  ];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getPurchaseRequests().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          // normalise ID — "ID" serialises to "id" in System.Text.Json
          id: r.id ?? r.iD,
          purchaseRequestNo: r.purchaseRequestNo ?? r.pRNo,
          statusLabel: typeof r.status === 'number' ? (STATUS_MAP[r.status] ?? 'Pending') : (r.status ?? 'Pending'),
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
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/requests/new']); }

  onRowClick(row: any): void {
    this.router.navigate(['/app/purchase/requests', row.id]);
  }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'delete') this.delete(e.row);
  }

  delete(row: any): void {
    if (!confirm(`Delete PR ${row.purchaseRequestNo}?`)) return;
    this.svc.deletePurchaseRequest(row.id).subscribe({ next: () => this.load() });
  }
}
