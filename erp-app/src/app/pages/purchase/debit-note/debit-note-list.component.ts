import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn } from '../../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-debit-note-list',
  standalone: false,
  templateUrl: './debit-note-list.component.html',
  styleUrls: ['./debit-note-list.component.scss']
})
export class DebitNoteListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  columns: TableColumn[] = [
    { key: 'dnNumber',     header: 'DN No',         sortable: true },
    { key: 'invoiceNo',    header: 'Invoice No',     sortable: true },
    { key: 'supplierName', header: 'Supplier',        sortable: true },
    { key: 'reason',       header: 'Reason' },
    { key: 'noteDate',     header: 'Note Date',       sortable: true, type: 'date' },
    { key: 'amount',       header: 'Amount',          type: 'number', align: 'right' },
    { key: 'status',       header: 'Status',          type: 'badge',
      badgeMap: { Draft: 'default', Posted: 'success' } },
  ];

  constructor(private svc: PurchaseService, private router: Router) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.svc.getDebitNotes().subscribe({
      next: res => { this.rows = this.svc.unwrap(res); this.applyFilter(); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          (r.dnNumber ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q) ||
          (r.reason ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/debit-note/new']); }

  onRowClick(row: any): void {
    this.router.navigate(['/app/purchase/debit-note', row.id]);
  }
}
