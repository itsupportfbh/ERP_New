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


  showLinesModal = false;
  modalLines: any[] = [];
  modalGrnNo = '';
  modalSupplier = '';
  modalPoNo = '';
  modalStatus = '';

  showActionConfirm = false;
  actionRow: any = null;
  actionType = '';
  actionLoading = false;
  actionError = '';

  columns: TableColumn[] = [
    { key: 'grnNo',         header: 'GRN No',      sortable: true },
    { key: 'receptionDate', header: 'Receipt Date', sortable: true, type: 'date' },
    { key: 'supplierName',  header: 'Supplier',     sortable: true },
    { key: 'poid',          header: 'PO',           sortable: true },
    { key: 'linesSummary',  header: 'Lines',        sortable: false },
    { key: 'statusLabel',   header: 'Status',       sortable: true, type: 'badge',
      badgeMap: { 'Open': 'default', 'Partial': 'warning', 'Posted': 'success', 'Flagged': 'danger', 'Closed': 'success' }
    },
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

          // Parse GRN line JSON to compute per-line status
          const rawJson = r.gRNJson ?? r.GRNJson ?? r.grnJson ?? r.GrnJson ?? '[]';
          let lines: any[] = [];
          try { lines = typeof rawJson === 'string' ? JSON.parse(rawJson || '[]') : (Array.isArray(rawJson) ? rawJson : []); } catch { lines = []; }

          const total      = lines.length;
          const postedCnt  = lines.filter((l: any) => !!l.isPostInventory).length;
          const flaggedCnt = lines.filter((l: any) => !!l.isFlagIssue).length;
          const allPosted  = total > 0 && postedCnt === total;
          const anyFlagged = flaggedCnt > 0;

          let statusLabel: string;
          if (isClosed)        statusLabel = 'Closed';
          else if (allPosted)  statusLabel = 'Posted';
          else if (anyFlagged) statusLabel = 'Flagged';
          else if (postedCnt)  statusLabel = 'Partial';
          else                 statusLabel = 'Open';

          const linesSummary = total > 0
            ? `${postedCnt}/${total} Posted${flaggedCnt ? ', ' + flaggedCnt + ' Flagged' : ''}`
            : '—';

          return {
            ...r,
            id: r.id ?? r.iD ?? r.ID,
            grnNo: r.grnNo ?? r.GrnNo ?? '',
            receptionDate: r.receptionDate ?? r.ReceptionDate,
            supplierName: r.supplierName ?? r.SupplierName ?? '',
            poid: r.poid ?? r.POID,
            statusLabel,
            linesSummary,
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

  onRowClick(row: any): void { this.openLinesModal(row); }

  openLinesModal(row: any): void {
    const parseGrnJson = (raw: any): any[] => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim()) {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
      }
      return [];
    };
    // GRN lines are saved as JSON in gRNJson by buildGrnLinesData()
    const rawJson = row?.gRNJson ?? row?.GRNJson ?? row?.grnJson ?? row?.GrnJson ?? '';
    const lines = parseGrnJson(rawJson);
    this.modalLines = lines;
    this.modalGrnNo = row.grnNo ?? '';
    this.modalSupplier = row.supplierName ?? '';
    this.modalPoNo = row.poid ?? '';
    this.modalStatus = row.statusLabel ?? '';
    if (!lines.length) {
      this.svc.getGRNById(row.id).subscribe({
        next: res => {
          const d = this.svc.unwrapOne(res);
          const raw2 = d.gRNJson ?? d.GRNJson ?? d.grnJson ?? d.GrnJson ?? '';
          this.modalLines = parseGrnJson(raw2);
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

  get openCount():    number { return this.rows.filter(r => r.statusLabel === 'Open').length; }
  get partialCount(): number { return this.rows.filter(r => r.statusLabel === 'Partial').length; }
  get postedCount():  number { return this.rows.filter(r => r.statusLabel === 'Posted').length; }
  get flaggedCount(): number { return this.rows.filter(r => r.statusLabel === 'Flagged').length; }
  get closedCount():  number { return this.rows.filter(r => r.statusLabel === 'Closed').length; }

  delete(row: any): void {
    this.openActionConfirm(row, 'delete-grn');
  }

  openActionConfirm(row: any, type: string): void {
    this.actionRow = row; this.actionType = type; this.actionError = ''; this.showActionConfirm = true;
  }
  closeActionConfirm(): void { this.showActionConfirm = false; this.actionRow = null; this.actionError = ''; }
  doActionConfirm(): void {
    if (!this.actionRow) return;
    this.actionLoading = true; this.actionError = '';
    const row = this.actionRow;
    if (this.actionType === 'delete-grn') {
      this.svc.deleteGRN(row.id).subscribe({
        next: () => { this.actionLoading = false; this.closeActionConfirm(); this.load(); },
        error: err => { this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete GRN.'; }
      });
    }
  }
}
