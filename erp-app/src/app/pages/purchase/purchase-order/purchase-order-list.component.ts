import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected' };

@Component({
  selector: 'erp-purchase-order-list',
  standalone: false,
  templateUrl: './purchase-order-list.component.html',
  styleUrls: ['./purchase-order-list.component.scss']
})
export class PurchaseOrderListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  alerts: any[] = [];
  showAlerts = false;
  alertsLoading = false;

  columns: TableColumn[] = [
    { key: 'purchaseOrderNo', header: 'PO No',         sortable: true },
    { key: 'supplierName',    header: 'Supplier',       sortable: true },
    { key: 'poDate',          header: 'PO Date',        sortable: true, type: 'date' },
    { key: 'deliveryDate',    header: 'Delivery Date',  sortable: true, type: 'date' },
    { key: 'currencyName',    header: 'Currency' },
    { key: 'netTotal',        header: 'Net Total',      type: 'number', align: 'right' },
    { key: 'statusLabel',     header: 'Status',         type: 'badge',
      badgeMap: { Pending: 'warning', Approved: 'success', Rejected: 'danger', Draft: 'default' } },
  ];

  rowActions: RowAction[] = [
    { key: 'delete', label: '✕', btnClass: 'danger' }
  ];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void {
    this.load();
    this.loadAlerts();
  }

  load(): void {
    this.loading = true;
    this.svc.getPurchaseOrders().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          purchaseOrderNo: r.purchaseOrderNo ?? r.pO_No ?? r.purchaseOrderNo,
          statusLabel: STATUS_MAP[r.approvalStatus] ?? 'Pending',
        }));
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  loadAlerts(): void {
    this.alertsLoading = true;
    this.svc.getPurchaseAlerts().subscribe({
      next: res => { this.alerts = this.svc.unwrap(res); this.alertsLoading = false; },
      error: () => { this.alertsLoading = false; }
    });
  }

  markAlertRead(id: number, e: Event): void {
    e.stopPropagation();
    this.svc.markAlertRead(id).subscribe({
      next: () => { this.alerts = this.alerts.filter(a => a.id !== id); }
    });
  }

  markAllAlertsRead(): void {
    this.svc.markAllAlertsRead().subscribe({
      next: () => { this.alerts = []; this.showAlerts = false; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          (r.purchaseOrderNo ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/orders/new']); }

  onRowClick(row: any): void {
    this.router.navigate(['/app/purchase/orders', row.id]);
  }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'delete') this.delete(e.row);
  }

  delete(row: any): void {
    if (!confirm(`Delete PO ${row.purchaseOrderNo}?`)) return;
    this.svc.deletePurchaseOrder(row.id).subscribe({ next: () => this.load() });
  }
}
