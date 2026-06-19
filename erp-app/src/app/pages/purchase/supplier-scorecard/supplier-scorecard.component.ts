import { Component, OnInit } from '@angular/core';
import { PurchaseService } from '../purchase.service';
import { TableColumn } from '../../../shared/components/data-table/data-table.component';

@Component({
  selector: 'erp-supplier-scorecard',
  standalone: false,
  templateUrl: './supplier-scorecard.component.html',
  styleUrls: ['./supplier-scorecard.component.scss']
})
export class SupplierScorecardComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  // Filters
  fromDate = new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().substring(0, 10);
  toDate = new Date().toISOString().substring(0, 10);
  supplierId: number | null = null;
  supplierOptions: any[] = [];

  columns: TableColumn[] = [
    { key: 'supplierName',    header: 'Supplier',         sortable: true },
    { key: 'supplierCode',    header: 'Code' },
    { key: 'poCount',         header: 'PO Count',         align: 'center' },
    { key: 'approvedCount',   header: 'Approved',         align: 'center' },
    { key: 'rejectedCount',   header: 'Rejected',         align: 'center' },
    { key: 'fulfillmentPct',  header: 'Fulfillment %',    align: 'right', type: 'number' },
    { key: 'fulfillmentScore',header: 'Fulfill Score',    align: 'right', type: 'number' },
    { key: 'paymentPct',      header: 'Payment %',        align: 'right', type: 'number' },
    { key: 'paymentScore',    header: 'Pay Score',        align: 'right', type: 'number' },
    { key: 'approvalScore',   header: 'Appr Score',       align: 'right', type: 'number' },
    { key: 'overallScore',    header: 'Overall Score',    align: 'right', type: 'number', sortable: true },
    { key: 'rating',          header: 'Rating',           type: 'badge',
      badgeMap: { A: 'success', B: 'success', C: 'warning', D: 'danger', F: 'danger' } },
  ];

  constructor(private svc: PurchaseService) {}

  ngOnInit(): void {
    this.svc.getSuppliers().subscribe(r => {
      const all = this.svc.unwrap(r).map((s: any) => ({ label: s.supplierName ?? s.name, value: s.id }));
      this.supplierOptions = [{ label: 'All Suppliers', value: null }, ...all];
    });
    this.load();
  }

  load(): void {
    this.loading = true;
    this.svc.getScorecardReport(this.fromDate, this.toDate, this.supplierId ?? undefined).subscribe({
      next: res => { this.rows = this.svc.unwrap(res); this.applyFilter(); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r => (r.supplierName ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  sumField(field: string): number {
    return this.rows.reduce((s, r) => s + (r[field] ?? 0), 0);
  }

  avgField(field: string): number {
    return this.rows.length ? this.sumField(field) / this.rows.length : 0;
  }
}
