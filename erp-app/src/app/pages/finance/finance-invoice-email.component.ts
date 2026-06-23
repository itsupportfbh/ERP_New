import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';

@Component({
  selector: 'erp-finance-invoice-email',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-invoice-email.component.html',
  styleUrls: ['./finance-invoice-email.component.scss']
})
export class FinanceInvoiceEmailComponent implements OnInit {
  loading = false;
  error = '';
  message = '';

  search = '';
  statusFilter: 'all' | 'Sent' | 'Pending' = 'all';

  rows: any[] = [];
  filtered: any[] = [];

  sendingIds = new Set<number>();

  summary = { total: 0, sent: 0, pending: 0 };

  constructor(private finance: FinanceService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const config = { list: '/invoiceemail/invoices?docType=SI' };
    this.finance.list(config, {}).subscribe({
      next: res => {
        const rows = this.finance.unwrap(res);
        this.rows = rows.map((r: any) => this.normalize(r));
        this.buildSummary();
        this.applyFilter();
        this.loading = false;
      },
      error: err => {
        this.error = err?.error?.message || 'Unable to load invoice email list.';
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    let rows = [...this.rows];
    if (this.statusFilter !== 'all') {
      rows = rows.filter(r => r.status === this.statusFilter);
    }
    if (q) {
      rows = rows.filter(r =>
        String(r.invoiceNo ?? '').toLowerCase().includes(q) ||
        String(r.customerName ?? '').toLowerCase().includes(q) ||
        String(r.emailTo ?? '').toLowerCase().includes(q)
      );
    }
    this.filtered = rows;
  }

  setStatus(status: 'all' | 'Sent' | 'Pending'): void {
    this.statusFilter = status;
    this.applyFilter();
  }

  sendEmail(row: any): void {
    if (!confirm(`Send invoice ${row.invoiceNo} to ${row.emailTo}?`)) return;
    this.sendingIds.add(row.id);
    this.message = '';
    this.error = '';
    const config = { email: '/invoiceemail/sales/' };
    this.finance.run(config, 'email', { id: row.id, invoiceId: row.id }).subscribe({
      next: () => {
        this.sendingIds.delete(row.id);
        this.message = `Invoice ${row.invoiceNo} sent to ${row.emailTo}.`;
        this.load();
      },
      error: err => {
        this.sendingIds.delete(row.id);
        this.error = err?.error?.message || `Failed to send email for ${row.invoiceNo}.`;
      }
    });
  }

  isSending(id: number): boolean {
    return this.sendingIds.has(id);
  }

  private buildSummary(): void {
    this.summary.total   = this.rows.length;
    this.summary.sent    = this.rows.filter(r => r.status === 'Sent').length;
    this.summary.pending = this.rows.filter(r => r.status !== 'Sent').length;
  }

  private normalize(r: any): any {
    const c = { ...r };
    c.id           = c.id ?? c.invoiceId ?? c.InvoiceId;
    c.invoiceNo    = c.invoiceNo    ?? c.InvoiceNo    ?? '-';
    c.customerName = c.customerName ?? c.CustomerName ?? '-';
    c.emailTo      = c.emailTo      ?? c.EmailTo      ?? c.email ?? '-';
    c.sentDate     = c.sentDate     ?? c.SentDate;
    c.invoiceDate  = c.invoiceDate  ?? c.InvoiceDate;
    c.amount       = Number(c.amount ?? c.Amount ?? c.totalAmount ?? 0);
    c.status       = c.status ?? c.Status ?? 'Pending';
    return c;
  }
}
