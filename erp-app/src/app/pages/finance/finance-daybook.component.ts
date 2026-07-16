import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FinanceService } from './finance.service';
import { FinanceReportsHubComponent } from './finance-reports-hub.component';
import { AuditPrintService } from '../../core/services/audit-print.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';

@Component({
  selector: 'erp-finance-daybook',
  standalone: true,
  imports: [CommonModule, FormsModule, FinanceReportsHubComponent, MoneyPipe],
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
  viewMode: 'detailed' | 'summary' = 'detailed';

  showModal = true;
  modalFrom = '';
  modalTo = '';

  rows: any[] = [];
  filtered: any[] = [];

  summary = { totalDebit: 0, totalCredit: 0, net: 0, transactions: 0 };
  get netType(): 'Dr' | 'Cr' { return this.summary.net >= 0 ? 'Dr' : 'Cr'; }
  get netAbs(): number { return Math.abs(this.summary.net); }

  private readonly today = new Date().toISOString().slice(0, 10);
  private readonly monthAgo = (() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  })();
  private readonly baseCurrencyName = localStorage.getItem('companyCurrencyName') || 'SGD';

  constructor(private finance: FinanceService, private auditPrint: AuditPrintService, private router: Router) {}

  ngOnInit(): void {
    this.modalFrom = this.monthAgo;
    this.modalTo = this.today;
  }

  viewDaybook(): void {
    if (!this.modalFrom || !this.modalTo) return;
    this.fromDate = this.modalFrom;
    this.toDate = this.modalTo;
    this.showModal = false;
    this.load();
  }

  /** Cancelling the period picker means the user never ran a report — send them back to the
   *  Reports Center landing instead of revealing an empty "No transactions found" Daybook page. */
  cancelModal(): void {
    this.router.navigate(['/app/finance/reports']);
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
    // Summarise per document (one row per voucher), matching the Detailed register.
    const docs = this.toDocumentRows(this.rows);
    this.summary.transactions = docs.length;
    this.summary.totalDebit   = docs.reduce((s, r) => s + (Number(r.debit)  || 0), 0);
    this.summary.totalCredit  = docs.reduce((s, r) => s + (Number(r.credit) || 0), 0);
    this.summary.net = this.summary.totalDebit - this.summary.totalCredit;
  }

  exportExcel(): void {
    const header = ['Date', 'Voucher No', 'Type', 'Account', 'Debit', 'Credit', 'Running Balance'];
    let running = 0;
    const data = [header, ...this.filtered.map(r => {
      running += (r.debit || 0) - (r.credit || 0);
      return [r.postingDate, r.voucherNo, r.voucherType, r.accountName,
        (r.debit || 0).toFixed(2), (r.credit || 0).toFixed(2), running.toFixed(2)];
    })];
    const csv = data.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Daybook.csv'; a.click();
  }

  voucherTypeClass(type: string): string {
    const t = String(type).toLowerCase();
    if (t.includes('supplier') && t.includes('payment')) return 'badge-sup-pay';
    if (t.includes('supplier') && t.includes('invoice')) return 'badge-sup-inv';
    if (t.includes('supplier') && t.includes('debit'))   return 'badge-sup-dn';
    if (t.includes('sales') || t.includes('customer'))   return 'badge-sales';
    if (t.includes('journal')) return 'badge-journal';
    if (t.includes('bank')) return 'badge-bank';
    return 'badge-other';
  }

  /** Collapse a voucher's GL legs into ONE document row — the control/party leg
   *  (Accounts Receivable for a sale, Accounts Payable for a purchase) that carries
   *  the document total on its natural side. Keeps the daybook to one line per invoice
   *  instead of one line per journal leg. */
  private toDocumentRows(legs: any[]): any[] {
    const groups = new Map<string, any[]>();
    const order: string[] = [];
    for (const r of legs) {
      const key = `${r.voucherType || ''}|${r.voucherNo || ''}`;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push(r);
    }
    return order.map(key => {
      const g = groups.get(key)!;
      // The control leg is the single largest one — it balances the revenue/expense + tax
      // legs, so its amount is the document total and its account is the customer/supplier.
      const party = g.reduce((a, b) =>
        (Number(b.debit || 0) + Number(b.credit || 0)) > (Number(a.debit || 0) + Number(a.credit || 0)) ? b : a);
      return { ...party, debit: Number(party.debit || 0), credit: Number(party.credit || 0) };
    });
  }

  get runningRows(): any[] {
    let balance = 0;
    return this.toDocumentRows(this.filtered).map(r => {
      const d = Number(r.debit  || 0);
      const c = Number(r.credit || 0);
      balance += d - c;
      return {
        ...r,
        _running:     balance,
        _runningAbs:  Math.abs(balance),
        _runningType: balance >= 0 ? 'Dr' : 'Cr',
        _rowAmt:  d > 0 ? d : c,
        _rowType: d > 0 ? 'Dr' : 'Cr'
      };
    });
  }

  get summaryGroups(): any[] {
    const map = new Map<string, { type: string; debit: number; credit: number }>();
    this.filtered.forEach(r => {
      const t = r.voucherType || 'Other';
      if (!map.has(t)) map.set(t, { type: t, debit: 0, credit: 0 });
      const g = map.get(t)!;
      g.debit  += Number(r.debit  || 0);
      g.credit += Number(r.credit || 0);
    });
    return Array.from(map.values());
  }

  groupNet(g: any): number   { return g.debit - g.credit; }
  groupNetAbs(g: any): number { return Math.abs(g.debit - g.credit); }
  groupType(g: any): string  { return (g.debit - g.credit) >= 0 ? 'Dr' : 'Cr'; }

  private readonly TYPE_LABELS: Record<string, string> = {
    PIN: 'Supplier Invoice', SI: 'Sales Invoice', SDN: 'Supplier Debit Note',
    SP: 'Supplier Payment', CP: 'Customer Payment', CN: 'Credit Note',
    DN: 'Debit Note', JV: 'Journal Voucher', BPV: 'Bank Payment', BRV: 'Bank Receipt',
    CPV: 'Cash Payment', CRV: 'Cash Receipt',
  };

  typeLabel(code: string): string {
    return this.TYPE_LABELS[String(code).toUpperCase()] ?? code;
  }

  private fmtDate(d: string): string {
    if (!d) return 'All';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getFullYear()}`;
  }

  exportPdf(): void {
    const fromTxt = this.fmtDate(this.fromDate);
    const toTxt   = this.fmtDate(this.toDate);
    const metaLines = [`Date : From ${fromTxt} to ${toTxt}`, 'Sort By : Posting Date'];

    if (this.viewMode === 'summary') {
      const groups = this.summaryGroups;
      this.auditPrint.print({
        reportTitle: 'Daybook Summary',
        periodLine: `For The Period From ${fromTxt} To ${toTxt}`,
        metaLines,
        labelColumnKey: 'type',
        columns: [
          { header: 'Voucher Type', key: 'type' },
          { header: 'Debit', key: 'debit', align: 'right', type: 'number' },
          { header: 'Credit', key: 'credit', align: 'right', type: 'number' }
        ],
        rows: groups,
        totalRows: [
          { label: `Grand Total Amount (${this.baseCurrencyName})`, values: { debit: this.summary.totalDebit, credit: this.summary.totalCredit }, grand: true }
        ]
      });
      return;
    }

    this.auditPrint.print({
      reportTitle: 'Daybook',
      periodLine: `For The Period From ${fromTxt} To ${toTxt}`,
      metaLines,
      labelColumnKey: 'accountName',
      columns: [
        { header: 'Date', key: 'postingDate', type: 'date' },
        { header: 'Voucher No', key: 'voucherNo' },
        { header: 'Type', key: 'voucherType' },
        { header: 'Account', key: 'accountName' },
        { header: 'Debit', key: 'debit', align: 'right', type: 'number' },
        { header: 'Credit', key: 'credit', align: 'right', type: 'number' },
        { header: 'Running Balance', key: '_running', align: 'right', type: 'number' }
      ],
      rows: this.runningRows,
      totalRows: [
        { label: `Grand Total Amount (${this.baseCurrencyName})`, values: { debit: this.summary.totalDebit, credit: this.summary.totalCredit }, grand: true }
      ]
    });
  }

  private normalize(r: any): any {
    const c = { ...r };
    // Backend returns the date as TransDate; without it in the chain the Date column was blank.
    c.postingDate  = c.postingDate  ?? c.PostingDate  ?? c.date ?? c.Date ?? c.transDate ?? c.TransDate;
    c.voucherNo    = c.voucherNo    ?? c.VoucherNo    ?? c.journalNo ?? c.JournalNo ?? '-';
    c.accountCode  = c.accountCode  ?? c.AccountCode  ?? c.accountHeadCode ?? c.AccountHeadCode ?? '-';
    // Backend returns the account name as AccountHeadName (from ChartOfAccount.HeadName);
    // without it in the fallback chain every row showed "-" for the Account column.
    c.accountName  = c.accountName  ?? c.AccountName  ?? c.accountHeadName ?? c.AccountHeadName ?? '-';
    c.description  = c.description  ?? c.Description  ?? c.narration ?? '-';
    c.debit        = Number(c.debit   ?? c.Debit   ?? c.debitAmount  ?? 0);
    c.credit       = Number(c.credit  ?? c.Credit  ?? c.creditAmount ?? 0);
    const rawType  = c.voucherType ?? c.VoucherType ?? c.transactionType ?? c.docType ?? '';
    c.voucherType  = rawType;
    c.voucherTypeCode = rawType;
    return c;
  }
}
