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

  search = '';

  banks: { id: number; name: string }[] = [];
  selectedBankId: number | null = null;

  allRows: any[] = [];
  filtered: any[] = [];

  summary = { total: 0, reconciled: 0, unreconciled: 0, difference: 0 };

  // Reconcile modal
  showReconcile = false;
  reconcileRow: any = null;
  reconcileForm = { documentType: 'Manual', documentNo: '', remarks: '' };
  bookEntries: any[] = [];
  selectedEntry: any = null;
  manualMode = false;

  constructor(private finance: FinanceService) {}

  ngOnInit(): void {
    this.loadBanks();
  }

  private loadBanks(): void {
    this.finance.list({ list: '/finance/ap/bankaccount' }).subscribe({
      next: res => {
        this.banks = this.finance.unwrap(res).map((b: any) => ({
          id: Number(b.bankId ?? b.BankId ?? b.id ?? b.Id),
          name: b.headName ?? b.HeadName ?? b.bankName ?? b.BankName ?? b.name ?? b.accountName ?? '—'
        })).filter((b: any) => b.id);
        if (this.banks.length && !this.selectedBankId) {
          this.selectedBankId = this.banks[0].id;
          this.load();
        }
      },
      error: () => { this.banks = []; }
    });
  }

  setTab(tab: ReconTab): void {
    this.activeTab = tab;
    this.applyFilter();
  }

  onBankChange(): void {
    this.load();
  }

  load(): void {
    if (!this.selectedBankId) { this.allRows = []; this.filtered = []; this.buildSummary(); return; }
    this.loading = true;
    this.error = '';
    this.message = '';
    this.finance.list({ list: '/BankReconciliation/lines' }, { bankId: this.selectedBankId }).subscribe({
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
    this.loadBookEntries();
  }

  private loadBookEntries(): void {
    if (!this.selectedBankId) { this.bookEntries = []; return; }
    this.finance.list({ list: '/BankReconciliation/book-entries' }, { bankId: this.selectedBankId }).subscribe({
      next: res => {
        this.bookEntries = this.finance.unwrap(res).map((e: any) => ({
          documentType: e.documentType ?? e.DocumentType ?? '',
          documentId: Number(e.documentId ?? e.DocumentId ?? 0),
          documentNo: e.documentNo ?? e.DocumentNo ?? '',
          documentDate: e.documentDate ?? e.DocumentDate,
          amount: Number(e.amount ?? e.Amount ?? 0),
          partyName: e.partyName ?? e.PartyName ?? ''
        }));
      },
      error: () => { this.bookEntries = []; }
    });
  }

  /** Book entries ordered so amount-matches for the current line appear first. */
  get suggestedEntries(): any[] {
    const amt = Math.abs(Number(this.reconcileRow?.amount) || 0);
    return [...this.bookEntries].sort((a, b) => {
      const am = Math.abs(a.amount - amt) < 0.005 ? 0 : 1;
      const bm = Math.abs(b.amount - amt) < 0.005 ? 0 : 1;
      return am - bm;
    });
  }

  isAmountMatch(entry: any): boolean {
    return Math.abs(Number(entry?.amount || 0) - Math.abs(Number(this.reconcileRow?.amount) || 0)) < 0.005;
  }

  selectBookEntry(entry: any): void {
    this.selectedEntry = entry;
    this.manualMode = false;
  }

  toggleManual(): void {
    this.manualMode = !this.manualMode;
    if (this.manualMode) this.selectedEntry = null;
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    let rows = this.activeTab === 'reconciled'
      ? this.allRows.filter(r => r.isMatched)
      : this.allRows.filter(r => !r.isMatched);
    if (q) {
      rows = rows.filter(r =>
        String(r.referenceNo ?? '').toLowerCase().includes(q) ||
        String(r.description ?? '').toLowerCase().includes(q) ||
        String(r.matchedDocumentNo ?? '').toLowerCase().includes(q)
      );
    }
    this.filtered = rows;
  }

  // ── Reconcile (manual match) ──────────────────────────────
  reconcile(row: any): void {
    this.reconcileRow = row;
    this.selectedEntry = null;
    this.manualMode = false;
    this.reconcileForm = {
      documentType: 'Manual',
      documentNo: row.referenceNo && row.referenceNo !== '-' ? row.referenceNo : '',
      remarks: ''
    };
    // Auto-suggest: pre-select a book entry whose amount matches the statement line
    const match = this.bookEntries.find(e => this.isAmountMatch(e));
    if (match) this.selectedEntry = match;
    else this.manualMode = this.bookEntries.length === 0;
    this.showReconcile = true;
  }

  closeReconcile(): void {
    this.showReconcile = false;
    this.reconcileRow = null;
    this.selectedEntry = null;
  }

  confirmReconcile(): void {
    if (!this.reconcileRow) return;
    // Either a real book entry is selected, or manual details are entered
    let documentType: string, documentId: number, documentNo: string | null, remarks: string | null;
    if (!this.manualMode && this.selectedEntry) {
      documentType = this.selectedEntry.documentType;
      documentId = this.selectedEntry.documentId;
      documentNo = this.selectedEntry.documentNo || null;
      remarks = this.reconcileForm.remarks || null;
    } else {
      if (!this.reconcileForm.documentType) { this.error = 'Select a document type.'; return; }
      documentType = this.reconcileForm.documentType;
      documentId = 0;
      documentNo = this.reconcileForm.documentNo || null;
      remarks = this.reconcileForm.remarks || null;
    }
    this.saving = true;
    this.error = '';
    const payload = {
      statementLineId: this.reconcileRow.id,
      id: this.reconcileRow.id,
      documentType,
      documentId,
      documentNo,
      remarks
    };
    this.finance.run({ reconcile: '/BankReconciliation/reconcile' }, 'reconcile', payload).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Line reconciled successfully.';
        this.closeReconcile();
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

  // ── Import statement (CSV) ────────────────────────────────
  importStatement(): void {
    if (!this.selectedBankId) { this.error = 'Please select a bank account first.'; return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const lines = this.parseCsv(String(reader.result || ''));
        if (!lines.length) { this.error = 'No valid rows found. Expected columns: Date, Description, Reference, Debit, Credit (or Amount).'; return; }
        this.saving = true;
        this.error = '';
        this.finance.run({ import: '/BankReconciliation/import' }, 'import', { bankId: this.selectedBankId, lines }).subscribe({
          next: (res: any) => {
            this.saving = false;
            const count = res?.data ?? res?.result ?? lines.length;
            this.message = `Statement imported — ${count} line(s) added.`;
            this.load();
          },
          error: err => {
            this.saving = false;
            this.error = err?.error?.message || 'Import failed.';
          }
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private parseCsv(text: string): any[] {
    const rows = text.split(/\r?\n/).filter(l => l.trim().length);
    if (rows.length < 2) return [];
    const header = this.splitLine(rows[0]).map(h => h.trim().toLowerCase());
    const idx = (names: string[]) => header.findIndex(h => names.some(n => h.includes(n)));
    const iDate   = idx(['date']);
    const iDesc   = idx(['description', 'narration', 'details', 'particular']);
    const iRef    = idx(['reference', 'ref', 'cheque', 'chq', 'txn']);
    const iDebit  = idx(['debit', 'withdraw', 'dr']);
    const iCredit = idx(['credit', 'deposit', 'cr']);
    const iAmount = idx(['amount']);

    const num = (s: string) => Number(String(s || '').replace(/[^0-9.\-]/g, '')) || 0;
    const get = (cols: string[], n: number) => (n >= 0 && n < cols.length ? cols[n].trim() : '');

    const out: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const cols = this.splitLine(rows[i]);
      const dateRaw = get(cols, iDate);
      if (!dateRaw) continue;
      const debit  = num(get(cols, iDebit));
      const credit = num(get(cols, iCredit));
      const amount = iAmount >= 0 ? num(get(cols, iAmount)) : credit - debit;
      out.push({
        transactionDate: this.toIso(dateRaw),
        description: get(cols, iDesc),
        referenceNo: get(cols, iRef),
        debit, credit, amount
      });
    }
    return out;
  }

  private splitLine(line: string): string[] {
    // simple CSV split honouring double-quoted fields
    const result: string[] = [];
    let cur = '', inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur);
    return result;
  }

  private toIso(s: string): string {
    s = s.trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
  }

  private buildSummary(): void {
    const reconciled = this.allRows.filter(r => r.isMatched);
    const unreconciled = this.allRows.filter(r => !r.isMatched);
    this.summary.total = this.allRows.length;
    this.summary.reconciled = reconciled.length;
    this.summary.unreconciled = unreconciled.length;
    // Net of unreconciled statement lines (what is still to be matched)
    this.summary.difference = unreconciled.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  }

  private normalize(r: any): any {
    const isMatched = (r.isMatched ?? r.IsMatched ?? false) === true || r.isMatched === 1 || r.IsMatched === 1;
    return {
      id: r.id ?? r.Id ?? r.statementLineId ?? r.StatementLineId,
      transactionDate: r.transactionDate ?? r.TransactionDate,
      description: r.description ?? r.Description ?? '-',
      referenceNo: r.referenceNo ?? r.ReferenceNo ?? '-',
      debit: Number(r.debit ?? r.Debit ?? 0),
      credit: Number(r.credit ?? r.Credit ?? 0),
      amount: Number(r.amount ?? r.Amount ?? 0),
      isMatched,
      matchedDocumentType: r.matchedDocumentType ?? r.MatchedDocumentType ?? '',
      matchedDocumentNo: r.matchedDocumentNo ?? r.MatchedDocumentNo ?? '',
      status: isMatched ? 'Reconciled' : 'Open'
    };
  }

  get unreconciledCount(): number { return this.allRows.filter(r => !r.isMatched).length; }
  get reconciledCount(): number { return this.allRows.filter(r => r.isMatched).length; }
}
