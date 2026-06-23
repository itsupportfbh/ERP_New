import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';

type ReconTab = 'unreconciled' | 'reconciled';

@Component({
  selector: 'erp-finance-bank-recon',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-bank-recon.component.html',
  styleUrls: ['./finance-bank-recon.component.scss']
})
export class FinanceBankReconComponent implements OnInit {
  activeTab: ReconTab = 'unreconciled';

  loading = false;
  saving = false;
  error = '';
  message = '';

  fromDate = '';
  toDate = '';
  search = '';

  allRows: any[] = [];
  filtered: any[] = [];

  summary = { total: 0, reconciled: 0, unreconciled: 0, difference: 0 };

  private readonly today = new Date().toISOString().slice(0, 10);
  private readonly monthAgo = (() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  })();

  constructor(private finance: FinanceService) {}

  ngOnInit(): void {
    this.fromDate = this.monthAgo;
    this.toDate = this.today;
    this.load();
  }

  setTab(tab: ReconTab): void {
    this.activeTab = tab;
    this.applyFilter();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.message = '';
    const config = { list: '/BankReconciliation/lines' };
    this.finance.list(config, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        const rows = this.finance.unwrap(res);
        this.allRows = rows.map((r: any) => this.normalize(r));
        this.buildSummary();
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.error = err?.error?.message || 'Unable to load bank reconciliation data.';
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    const status = this.activeTab === 'reconciled' ? 'Reconciled' : '';
    let rows = this.activeTab === 'reconciled'
      ? this.allRows.filter(r => r.status === 'Reconciled')
      : this.allRows.filter(r => r.status !== 'Reconciled');
    if (q) {
      rows = rows.filter(r =>
        String(r.bankName ?? '').toLowerCase().includes(q) ||
        String(r.referenceNo ?? '').toLowerCase().includes(q) ||
        String(r.description ?? '').toLowerCase().includes(q)
      );
    }
    this.filtered = rows;
  }

  reconcile(row: any): void {
    if (!confirm(`Reconcile this line (${row.referenceNo || row.id})?`)) return;
    this.saving = true;
    const config = { reconcile: '/BankReconciliation/reconcile' };
    this.finance.run(config, 'reconcile', { statementLineId: row.id, id: row.id }).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Line reconciled successfully.';
        this.load();
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || 'Reconcile failed.';
      }
    });
  }

  unreconcile(row: any): void {
    if (!confirm(`Unreconcile this line (${row.referenceNo || row.id})?`)) return;
    this.saving = true;
    const config = { unreconcile: '/BankReconciliation/unreconcile/' };
    this.finance.run(config, 'unreconcile', { statementLineId: row.id, id: row.id }).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Line unreconciled.';
        this.load();
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || 'Unreconcile failed.';
      }
    });
  }

  importStatement(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.saving = true;
      this.error = '';
      const config = { import: '/BankReconciliation/import' };
      this.finance.run(config, 'import', { fileName: file.name, lines: [] }).subscribe({
        next: () => {
          this.saving = false;
          this.message = 'Statement imported successfully.';
          this.load();
        },
        error: err => {
          this.saving = false;
          this.error = err?.error?.message || 'Import failed.';
        }
      });
    };
    input.click();
  }

  private buildSummary(): void {
    const reconciled = this.allRows.filter(r => r.status === 'Reconciled');
    const unreconciled = this.allRows.filter(r => r.status !== 'Reconciled');
    const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
    this.summary.total = this.allRows.length;
    this.summary.reconciled = reconciled.length;
    this.summary.unreconciled = unreconciled.length;
    const totalBank = sum(this.allRows, 'bankAmount');
    const totalLedger = sum(this.allRows, 'ledgerAmount');
    this.summary.difference = totalBank - totalLedger;
  }

  private normalize(r: any): any {
    const c = { ...r };
    c.id = c.id ?? c.statementLineId ?? c.StatementLineId;
    c.bankName = c.bankName ?? c.BankName ?? '-';
    c.statementDate = c.statementDate ?? c.StatementDate;
    c.referenceNo = c.referenceNo ?? c.ReferenceNo ?? '-';
    c.description = c.description ?? c.Description ?? '-';
    c.ledgerAmount = Number(c.ledgerAmount ?? c.LedgerAmount ?? 0);
    c.bankAmount = Number(c.bankAmount ?? c.BankAmount ?? 0);
    c.status = c.status ?? c.Status ?? 'Open';
    return c;
  }

  get unreconciledCount(): number { return this.allRows.filter(r => r.status !== 'Reconciled').length; }
  get reconciledCount(): number { return this.allRows.filter(r => r.status === 'Reconciled').length; }
}
