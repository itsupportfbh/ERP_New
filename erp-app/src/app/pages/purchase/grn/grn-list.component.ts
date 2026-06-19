import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-grn-list',
  standalone: false,
  templateUrl: './grn-list.component.html',
  styleUrls: ['./grn-list.component.scss']
})
export class GrnListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  columns: TableColumn[] = [
    { key: 'grnNo',         header: 'GRN No',       sortable: true },
    { key: 'receptionDate', header: 'Receipt Date',  sortable: true, type: 'date' },
    { key: 'supplierName',  header: 'Supplier',      sortable: true },
    { key: 'poid',          header: 'PO ID',         sortable: true },
  ];

  rowActions: RowAction[] = [{ key: 'delete', label: '✕', btnClass: 'danger' }];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getGRNs().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD ?? r.ID,
          grnNo: r.grnNo ?? r.GrnNo ?? '',
          receptionDate: r.receptionDate ?? r.ReceptionDate,
          supplierName: r.supplierName ?? r.SupplierName ?? '',
          poid: r.poid ?? r.POID,
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
          (r.grnNo ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/grn/new']); }

  onRowClick(row: any): void { this.router.navigate(['/app/purchase/grn', row.id]); }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'delete') this.delete(e.row);
  }

  delete(row: any): void {
    if (!confirm(`Delete GRN ${row.grnNo}?`)) return;
    this.svc.deleteGRN(row.id).subscribe({ next: () => this.load() });
  }
}
