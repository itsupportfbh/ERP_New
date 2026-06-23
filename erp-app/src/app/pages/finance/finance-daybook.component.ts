import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';

@Component({
  selector: 'erp-finance-daybook',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-daybook.component.html',
  styleUrls: ['./finance-daybook.component.scss']
})
export class FinanceDaybookComponent implements OnInit {
  loading = false;
  error = '';
  message = '';

  fromDate = '';
  toDate = '';
  search = '';

  rows: any[] = [];
  filtered: any[] = [];

  summary = { totalDebit: 0, totalCredit: 0, net: 0, transactions: 0 };

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

  load(): void {
    this.loading = true;
    this.error = '';
    this.rows = [];
    this.filtered = [];
    const config = { list: '/FinanceReport/daybook', listMethod: 'POST' as 'POST', listBody: {} };
    this.finance.list(config, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        const rows = this.finance.unwrap(res);
        this.rows = rows.map((r: any) => this.normalize(r));
        this.buildSummary();
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.error = err?.error?.message || 'Unable to load daybook data.';
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          String(r.voucherNo ?? '').toLowerCase().includes(q) ||
          String(r.accountName ?? '').toLowerCase().includes(q) ||
          String(r.description ?? '').toLowerCase().includes(q)
        )
      : [...this.rows];
  }

  private buildSummary(): void {
    this.summary.transactions = this.rows.length;
    this.summary.totalDebit   = this.rows.reduce((s, r) => s + (Number(r.debit)  || 0), 0);
    this.summary.totalCredit  = this.rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    this.summary.net = this.summary.totalDebit - this.summary.totalCredit;
  }

  private normalize(r: any): any {
    const c = { ...r };
    c.postingDate  = c.postingDate  ?? c.PostingDate  ?? c.date ?? c.Date;
    c.voucherNo    = c.voucherNo    ?? c.VoucherNo    ?? c.journalNo ?? c.JournalNo ?? '-';
    c.accountCode  = c.accountCode  ?? c.AccountCode  ?? '-';
    c.accountName  = c.accountName  ?? c.AccountName  ?? '-';
    c.description  = c.description  ?? c.Description  ?? c.narration ?? '-';
    c.debit        = Number(c.debit   ?? c.Debit   ?? c.debitAmount  ?? 0);
    c.credit       = Number(c.credit  ?? c.Credit  ?? c.creditAmount ?? 0);
    c.voucherType  = c.voucherType  ?? c.VoucherType  ?? c.transactionType ?? '';
    return c;
  }
}
