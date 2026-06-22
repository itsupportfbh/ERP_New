import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';
import Swal from 'sweetalert2';

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

  showLinesModal = false;
  modalLines: any[] = [];
  modalGrnNo = '';
  modalSupplier = '';
  modalPoNo = '';
  modalStatus = '';

  columns: TableColumn[] = [
    { key: 'grnNo',         header: 'GRN No',       sortable: true },
    { key: 'receptionDate', header: 'Receipt Date',  sortable: true, type: 'date' },
    { key: 'supplierName',  header: 'Supplier',      sortable: true },
    { key: 'poid',          header: 'PO',            sortable: true },
    { key: 'statusLabel',   header: 'Status',        sortable: true },
  ];

  rowActions: RowAction[] = [
    { key: 'edit',   label: 'Edit',   btnClass: 'default', icon: 'edit'   },
    { key: 'delete', label: 'Delete', btnClass: 'danger',  icon: 'delete' },
  ];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getGRNs().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => {
          const isClosed = r.isClosed ?? r.IsClosed ?? false;
          return {
            ...r,
            id: r.id ?? r.iD ?? r.ID,
            grnNo: r.grnNo ?? r.GrnNo ?? '',
            receptionDate: r.receptionDate ?? r.ReceptionDate,
            supplierName: r.supplierName ?? r.SupplierName ?? '',
            poid: r.poid ?? r.POID,
            statusLabel: isClosed ? 'Closed' : 'Open',
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
          (r.grnNo ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/grn/new']); }

  onRowClick(row: any): void { this.router.navigate(['/app/purchase/grn', row.id]); }

  openLinesModal(row: any): void {
    const raw = row?.grnLines ?? row?.GrnLines ?? row?.GRNLines ?? [];
    const lines: any[] = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
    this.modalLines = lines;
    this.modalGrnNo = row.grnNo ?? '';
    this.modalSupplier = row.supplierName ?? '';
    this.modalPoNo = row.poid ?? '';
    this.modalStatus = row.statusLabel ?? '';
    if (!lines.length) {
      this.svc.getGRNById(row.id).subscribe({
        next: res => {
          const d = this.svc.unwrapOne(res);
          const r2 = d.grnLines ?? d.GrnLines ?? d.GRNLines ?? [];
          this.modalLines = Array.isArray(r2) ? r2 : (() => { try { return JSON.parse(r2 || '[]'); } catch { return []; } })();
        }
      });
    }
    this.showLinesModal = true;
  }

  closeLinesModal(): void { this.showLinesModal = false; }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view')   this.openLinesModal(e.row);
    if (e.action === 'edit')   this.router.navigate(['/app/purchase/grn', e.row.id], { queryParams: { edit: '1' } });
    if (e.action === 'delete') this.delete(e.row);
  }

  get openCount(): number { return this.rows.filter(r => r.statusLabel === 'Open').length; }
  get closedCount(): number { return this.rows.filter(r => r.statusLabel === 'Closed').length; }

  delete(row: any): void {
    Swal.fire({ title: 'Delete GRN?', text: `Delete ${row.grnNo}? This cannot be undone.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.deleteGRN(row.id).subscribe({
          next: () => { Swal.fire('Deleted', 'GRN deleted.', 'success'); this.load(); },
          error: err => Swal.fire('Error', err?.error?.message || 'Unable to delete GRN.', 'error')
        });
      });
  }
}
