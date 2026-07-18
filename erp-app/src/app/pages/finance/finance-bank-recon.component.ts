import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import * as XLSX from 'xlsx';

type BrView    = 'dashboard' | 'flow' | 'import' | 'account';
type AcctTab   = 'rec' | 'stmts' | 'txns' | 'report';
type RecPane   = 'match' | 'create' | 'transfer' | 'discuss';

interface BankRef { id: number; name: string; acctNo?: string; ccy?: string; }
interface BankCard extends BankRef {
  loaded: boolean;
  book: number; statementNet: number; difference: number;
  total: number; matched: number; unrecon: number;
}
interface CoaRef { id: number; code: string; name: string; }

/**
 * Bank Reconciliation — the full prototype flow inside one standalone component, driven by an
 * internal `view`:  Dashboard → Flow map → Import wizard → Account (Reconcile / Bank statements /
 * Account transactions / Report). Create/Transfer post real journals to the GL; everything else is
 * derived from the existing BankReconciliation API.
 */
@Component({
  selector: 'erp-finance-bank-recon',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './finance-bank-recon.component.html',
  styleUrls: ['./finance-bank-recon.component.scss']
})
export class FinanceBankReconComponent implements OnInit {
  view: BrView = 'dashboard';
  acctTab: AcctTab = 'rec';

  loading = false;
  saving  = false;
  error   = '';
  message = '';
  toastMsg = '';
  private toastTimer: any;

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  banks: BankRef[] = [];
  cards: BankCard[] = [];
  coaAccounts: CoaRef[] = [];

  // ── Account (reconcile) view ────────────────────────────────
  selectedBankId: number | null = null;
  allRows: any[] = [];
  filtered: any[] = [];
  search = '';
  bookEntries: any[] = [];
  summary = { total: 0, matched: 0, unreconciled: 0, statementNet: 0, book: 0, difference: 0 };

  // ── Import wizard ───────────────────────────────────────────
  wizStep = 1;                 // 1 choose bank · 2 upload · 3 preview · 4 done
  wizBankId: number | null = null;
  wizFileName = '';
  wizItems: any[] = [];
  private wizExistingKeys = new Set<string>();
  private wizExistingCount = 0;
  wizImportedCount = 0;

  // Statement balances read from the file (or keyed in), used for the opening + movement = closing
  // control check before the import is allowed.
  wizBal: { opening: number | null; closing: number | null; source: string; acctNo: string; ccy: string } =
    { opening: null, closing: null, source: 'manual', acctNo: '', ccy: '' };
  wizBalInput: { opening: number | null; closing: number | null } = { opening: null, closing: null };
  wizOverride = false;
  wizMapping: any = {};   // ERP field → column the parser read it from (shown as the format profile)

  constructor(
    private finance: FinanceService,
    private permissionService: PermissionService
  ) {}

  ngOnInit(): void {
    this.loadBanks(true);
    this.loadCoa();
    this.permissionService.getFunctionPermission(this.userId, 'ledger').subscribe({
      next: p => { this.permission = p; }
    });
  }

  // Bank Reconciliation posts journals, so gate the posting actions on create/post rights.
  get canPost(): boolean { return this.permissionService.hasCreate(this.permission) || this.permissionService.hasPost(this.permission); }

  bankNameOf(id: number | null): string { return this.banks.find(b => b.id === id)?.name || ''; }
  bankOf(id: number | null): BankRef | undefined { return this.banks.find(b => b.id === id); }

  // A stable colour per bank (by name) so each account's chip is distinguishable, like the prototype.
  private readonly chipColors = ['#2E5F73', '#d1112b', '#0b3a75', '#1a1a1a', '#0067b1', '#7a0c2e', '#0e8a4c', '#b7791f'];
  bankColor(name: string): string {
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return this.chipColors[h % this.chipColors.length];
  }

  toast(m: string): void {
    this.toastMsg = m;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastMsg = ''), 2600);
  }

  // ── Masters ─────────────────────────────────────────────────
  private loadBanks(buildDashboard = false): void {
    this.finance.list({ list: '/finance/ap/bankaccount' }).subscribe({
      next: res => {
        this.banks = this.finance.unwrap(res).map((b: any) => ({
          id: Number(b.bankId ?? b.BankId ?? b.id ?? b.Id),
          name: b.headName ?? b.HeadName ?? b.bankName ?? b.BankName ?? b.name ?? b.accountName ?? '—',
          acctNo: b.accountNo ?? b.AccountNo ?? b.accountNumber ?? b.AccountNumber ?? b.bankAccountNo ?? '',
          ccy: b.currency ?? b.Currency ?? b.currencyName ?? b.CurrencyName ?? ''
        })).filter((b: BankRef) => b.id);
        if (buildDashboard) this.buildDashboard();
      },
      error: () => { this.banks = []; }
    });
  }

  private loadCoa(): void {
    this.finance.list({ list: '/ChartOfAccount/GetChartOfAccounts' }).subscribe({
      next: res => {
        this.coaAccounts = this.finance.unwrap(res).map((r: any) => ({
          id: Number(r.id ?? r.Id ?? r.headId ?? 0),
          code: String(r.headCode ?? r.HeadCode ?? ''),
          name: r.headName ?? r.HeadName ?? ''
        })).filter((c: CoaRef) => c.id)
          .sort((a: CoaRef, b: CoaRef) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      },
      error: () => { this.coaAccounts = []; }
    });
  }

  // ── Navigation ──────────────────────────────────────────────
  goDashboard(): void { this.view = 'dashboard'; this.clearAlerts(); this.buildDashboard(); }
  goFlow(): void { this.view = 'flow'; this.clearAlerts(); }

  // ── Dashboard ───────────────────────────────────────────────
  private buildDashboard(): void {
    this.cards = this.banks.map(b => ({
      ...b, loaded: false, book: 0, statementNet: 0, difference: 0, total: 0, matched: 0, unrecon: 0
    }));
    this.cards.forEach(card => {
      this.finance.list({ list: '/BankReconciliation/summary' }, { bankId: card.id }).subscribe({
        next: res => {
          const s = this.finance.unwrapOne(res);
          card.book         = Number(s.bookBalance ?? s.BookBalance ?? 0);
          card.statementNet = Number(s.statementNet ?? s.StatementNet ?? 0);
          card.difference   = Number(s.difference ?? s.Difference ?? 0);
          card.total        = Number(s.totalLines ?? s.TotalLines ?? 0);
          card.matched      = Number(s.matchedLines ?? s.MatchedLines ?? 0);
          card.unrecon      = Number(s.unmatchedLines ?? s.UnmatchedLines ?? 0);
          card.loaded       = true;
        },
        error: () => { card.loaded = true; }
      });
    });
  }

  // ── Account page (tabs) ─────────────────────────────────────
  openAccount(bankId: number, tab: AcctTab = 'rec'): void {
    this.selectedBankId = bankId;
    this.view = 'account';
    this.acctTab = tab;
    this.search = '';
    this.clearAlerts();
    this.load();
  }
  openReconcile(bankId: number): void { this.openAccount(bankId, 'rec'); }
  openReport(bankId: number): void { this.openAccount(bankId, 'report'); }
  setAcctTab(tab: AcctTab): void { this.acctTab = tab; }
  onBankChange(): void { this.load(); }

  load(): void {
    if (!this.selectedBankId) { this.allRows = []; this.filtered = []; return; }
    this.loading = true;
    this.clearAlerts();
    this.finance.list({ list: '/BankReconciliation/lines' }, { bankId: this.selectedBankId }).subscribe({
      next: res => {
        this.allRows = this.finance.unwrap(res).map((r: any) => this.normalize(r));
        this.applyFilter();
        this.loading = false;
      },
      error: err => { this.error = err?.error?.message || 'Unable to load bank statement lines.'; this.loading = false; }
    });
    this.loadBookEntries();
    this.loadSummary();
  }

  private loadBookEntries(): void {
    if (!this.selectedBankId) { this.bookEntries = []; return; }
    this.finance.list({ list: '/BankReconciliation/book-entries' }, { bankId: this.selectedBankId }).subscribe({
      next: res => {
        this.bookEntries = this.finance.unwrap(res).map((e: any) => ({
          documentType: e.documentType ?? e.DocumentType ?? '',
          documentId:   Number(e.documentId ?? e.DocumentId ?? 0),
          documentNo:   e.documentNo ?? e.DocumentNo ?? '',
          documentDate: e.documentDate ?? e.DocumentDate,
          amount:       Number(e.amount ?? e.Amount ?? 0),
          partyName:    e.partyName ?? e.PartyName ?? ''
        }));
        // Re-run suggestions now that candidate entries are known.
        this.allRows.forEach(r => { r._init = false; });
        this.applyFilter();
      },
      error: () => { this.bookEntries = []; }
    });
  }

  private loadSummary(): void {
    if (!this.selectedBankId) return;
    this.finance.list({ list: '/BankReconciliation/summary' }, { bankId: this.selectedBankId }).subscribe({
      next: res => {
        const s = this.finance.unwrapOne(res);
        this.summary = {
          total: Number(s.totalLines ?? s.TotalLines ?? 0),
          matched: Number(s.matchedLines ?? s.MatchedLines ?? 0),
          unreconciled: Number(s.unmatchedLines ?? s.UnmatchedLines ?? 0),
          statementNet: Number(s.statementNet ?? s.StatementNet ?? 0),
          book: Number(s.bookBalance ?? s.BookBalance ?? 0),
          difference: Number(s.difference ?? s.Difference ?? 0)
        };
      },
      error: () => {}
    });
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    let rows = this.allRows.filter(r => !r.isMatched);
    if (q) {
      rows = rows.filter(r =>
        String(r.referenceNo ?? '').toLowerCase().includes(q) ||
        String(r.description ?? '').toLowerCase().includes(q));
    }
    rows.forEach(r => this.ensureRowState(r));
    this.filtered = rows;
  }

  // Tab data sources
  get statementRows(): any[] { return this.allRows; }
  get txnRows(): any[] { return this.allRows.filter(r => r.isMatched); }
  get reconciledRows(): any[] { return this.allRows.filter(r => r.isMatched); }

  txnType(row: any): string {
    const t = (row.matchedDocumentType || '').toLowerCase();
    if (t.includes('transfer')) return 'Transfer';
    return row.amount > 0 ? 'Receive money' : 'Spend money';
  }

  get acctStmtBalance(): number { return this.summary.book; }
  get acctSub(): string {
    const b = this.bankOf(this.selectedBankId);
    if (!b) return '';
    const bits = [b.name];
    if (b.acctNo) bits.push('A/c ' + b.acctNo);
    if (b.ccy) bits.push(b.ccy);
    return bits.join(' · ') + ' · Manual statement import';
  }

  /** Per-line UI state for the Match / Create / Transfer / Discuss panel + an auto-suggested action. */
  private ensureRowState(r: any): void {
    if (r._init) return;
    r._init = true;
    r._contraId = null;
    // Import folds payee into the description as "Payee — details"; split it back so Create's
    // Who/Why come pre-filled (the prototype's auto-suggest).
    const full = r.description && r.description !== '-' ? r.description : '';
    const dash = full.indexOf(' — ');
    r._createWho = dash > -1 ? full.slice(0, dash).trim() : '';
    r._createDesc = dash > -1 ? full.slice(dash + 3).trim() : full;
    r._counterBankId = null;
    r._note = '';

    // Auto-suggest: prefer an amount-matched ledger entry; else a transfer if the text hints it;
    // else fall to Create. Mirrors the prototype's suggest().
    const entry = this.suggestFor(r);
    r._selEntry = entry || null;
    const d = (r.description || '').toUpperCase();
    const looksTransfer = /OWN ACC|OWN ACCT|FUND TRANSFER FR|INTER ?ACCOUNT|\bTRANSFER\b/.test(d);
    if (entry) { r._pane = 'match'; r._statusHint = 'match'; }
    else if (looksTransfer) { r._pane = 'transfer'; r._statusHint = 'transfer'; }
    else { r._pane = 'create'; r._statusHint = 'unmatched'; }
  }

  setPane(row: any, pane: RecPane): void { row._pane = pane; }

  // Single OK button — reconciles according to the active pane (prototype's OK circle).
  canOk(row: any): boolean {
    if (this.saving) return false;
    switch (row._pane) {
      case 'match':    return !!row._selEntry;
      case 'create':   return !!row._contraId && this.canPost;
      case 'transfer': return !!row._counterBankId && this.canPost;
      default:         return false;   // discuss never reconciles
    }
  }
  doOk(row: any): void {
    if (row._pane === 'match')    return this.doMatch(row);
    if (row._pane === 'create')   return this.doCreate(row);
    if (row._pane === 'transfer') return this.doTransfer(row);
  }

  // ── Match ───────────────────────────────────────────────────
  suggestFor(row: any): any {
    const amt = Math.abs(Number(row?.amount) || 0);
    return this.bookEntries.find(e => Math.abs(Math.abs(e.amount) - amt) < 0.005) || null;
  }
  suggestedEntries(row: any): any[] {
    const amt = Math.abs(Number(row?.amount) || 0);
    return [...this.bookEntries].sort((a, b) => {
      const am = Math.abs(Math.abs(a.amount) - amt) < 0.005 ? 0 : 1;
      const bm = Math.abs(Math.abs(b.amount) - amt) < 0.005 ? 0 : 1;
      return am - bm;
    });
  }
  isAmountMatch(row: any, entry: any): boolean {
    return Math.abs(Math.abs(Number(entry?.amount || 0)) - Math.abs(Number(row?.amount) || 0)) < 0.005;
  }
  selectEntry(row: any, entry: any): void { row._selEntry = entry; }
  findAndMatch(): void { this.toast('Find & Match: would list open invoices / bills to combine.'); }

  doMatch(row: any): void {
    if (!row._selEntry) return;
    const payload = {
      statementLineId: row.id, id: row.id,
      documentType: row._selEntry.documentType,
      documentId: row._selEntry.documentId,
      documentNo: row._selEntry.documentNo || null,
      remarks: null
    };
    this.post(this.finance.run({ reconcile: '/BankReconciliation/reconcile' }, 'reconcile', payload), 'Line reconciled.');
  }

  // ── Create (post journal to GL) — Who / What / Why ──────────
  doCreate(row: any): void {
    if (!row._contraId) { this.error = 'Choose a GL account for this entry.'; return; }
    const who = (row._createWho || '').trim();
    const payload = {
      statementLineId: row.id,
      bankId: this.selectedBankId,
      contraAccountId: row._contraId,
      description: row._createDesc || null,
      remarks: who ? `Contact: ${who}` : null
    };
    this.post(this.finance.create({ create: '/BankReconciliation/create-entry' }, payload), 'Journal posted and line reconciled.');
  }

  // ── Transfer (post inter-account journal) ───────────────────
  transferTargets(): BankRef[] { return this.banks.filter(b => b.id !== this.selectedBankId); }
  doTransfer(row: any): void {
    if (!row._counterBankId) { this.error = 'Choose the other bank account.'; return; }
    const payload = {
      statementLineId: row.id,
      bankId: this.selectedBankId,
      counterBankId: row._counterBankId,
      remarks: null
    };
    this.post(this.finance.create({ create: '/BankReconciliation/transfer' }, payload), 'Transfer posted and line reconciled.');
  }

  // ── Discuss (note only, stays unreconciled) ─────────────────
  doNote(row: any): void {
    const payload = { statementLineId: row.id, remarks: row._note || null };
    this.post(this.finance.create({ create: '/BankReconciliation/note' }, payload), 'Note saved.', false);
  }

  unreconcile(row: any): void {
    if (!confirm(`Unreconcile this line (${row.referenceNo || row.id})?`)) return;
    this.post(
      this.finance.run({ unreconcile: '/BankReconciliation/unreconcile/' }, 'unreconcile', { statementLineId: row.id, id: row.id }),
      'Line unreconciled.');
  }

  /** Shared POST handler: run, toast, then refresh the current bank's lines. */
  private post(obs: any, okMsg: string, reload = true): void {
    this.saving = true;
    this.clearAlerts();
    obs.subscribe({
      next: () => { this.saving = false; this.toast(okMsg); if (reload) this.load(); },
      error: (err: any) => { this.saving = false; this.error = err?.error?.message || 'Action failed.'; }
    });
  }

  // ── Report ──────────────────────────────────────────────────
  get reportBankName(): string { return this.bankNameOf(this.selectedBankId); }
  get reportNote(): string {
    if (!this.summary.total) return 'Import a statement for this account to produce the report.';
    return this.summary.difference === 0
      ? 'Fully reconciled — bank statement and ERP ledger agree.'
      : 'Reconcile the remaining lines to bring the difference to zero.';
  }

  // ── Import wizard ───────────────────────────────────────────
  startImport(bankId?: number | null): void {
    this.view = 'import';
    this.clearAlerts();
    this.wizBankId = bankId ?? null;
    this.wizFileName = '';
    this.wizItems = [];
    this.wizImportedCount = 0;
    this.wizStep = bankId ? 2 : 1;
    if (bankId) this.loadExistingKeys(bankId);
  }
  wizPickBank(id: number): void { this.wizBankId = id; this.loadExistingKeys(id); this.wizStep = 2; }
  wizBack(step: number): void { this.wizStep = step; }

  private loadExistingKeys(bankId: number): void {
    this.wizExistingKeys = new Set<string>();
    this.wizExistingCount = 0;
    this.finance.list({ list: '/BankReconciliation/lines' }, { bankId }).subscribe({
      next: res => {
        const rows = this.finance.unwrap(res);
        this.wizExistingCount = rows.length;
        rows.forEach((r: any) => {
          const n = this.normalize(r);
          this.wizExistingKeys.add(this.dupKey(n.transactionDate, n.amount, n.referenceNo, n.description));
        });
      },
      error: () => {}
    });
  }

  wizFileChosen(files: FileList | null): void {
    const f = files?.[0];
    if (!f) return;
    // DBS / UOB / RHB portals often export .xls/.xlsx, not CSV. Read those with SheetJS and flatten
    // the first sheet to CSV so the same header-detection + column mapping handles every format.
    const isExcel = /\.(xlsx|xls|xlsm)$/i.test(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      let text = '';
      if (isExcel) {
        try {
          const wb = XLSX.read(new Uint8Array(reader.result as ArrayBuffer), { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          text = XLSX.utils.sheet_to_csv(sheet);
        } catch {
          this.error = 'Could not read this Excel file. Re-save it as .csv from the bank portal and try again.';
          return;
        }
      } else {
        text = String(reader.result || '');
      }
      this.buildPreview(text, f.name);
    };
    if (isExcel) reader.readAsArrayBuffer(f); else reader.readAsText(f);
  }
  wizDrop(e: DragEvent): void {
    e.preventDefault();
    (e.currentTarget as HTMLElement)?.classList.remove('drag');
    this.wizFileChosen(e.dataTransfer?.files ?? null);
  }

  // Demo file so a user can walk the flow without a real export handy (prototype "Use sample file").
  loadSample(): void {
    const ccy = this.bankOf(this.wizBankId)?.ccy || '';
    const sample =
`Date,Description,Reference,Debit,Credit
15/07/2026,INWARD TRANSFER CUSTOMER RECEIPT,RCT26196,,12500.00
16/07/2026,GIRO PAYMENT UTILITIES,BP26197,842.50,
16/07/2026,OWN ACCT TRANSFER,TR26197,10000.00,
17/07/2026,BANK CHARGES SERVICE FEE,SC26198,30.00,
17/07/2026,SUPPLIER PAYMENT ACME TRADING,PM26198,2596.00,`;
    this.buildPreview(sample, `sample-statement${ccy ? '-' + ccy : ''}.csv`);
  }

  private buildPreview(text: string, fname: string): void {
    const parsed = this.parseCsv(text);
    if (!parsed.items.length) { this.error = 'No data rows found. Expected columns: Date, Description, Reference, Debit, Credit (or Amount).'; return; }
    const seen = new Set<string>();
    this.wizItems = parsed.items.map((p, i) => {
      const key = this.dupKey(p.transactionDate, p.amount, p.referenceNo, p.description);
      const err = !p.transactionDate ? 'Bad / missing date'
        : (p.debit === 0 && p.credit === 0) ? 'No amount'
        : null;
      const dup = !err && (this.wizExistingKeys.has(key) || seen.has(key));
      if (!err) seen.add(key);
      return { row: i + 1, ...p, err, dup };
    });
    this.wizBal = parsed.bal;
    this.wizBalInput = { opening: parsed.bal.opening, closing: parsed.bal.closing };
    this.wizMapping = parsed.mapping;
    this.wizOverride = false;
    this.wizFileName = fname;
    this.wizStep = 3;
  }

  get wizValid(): any[]  { return this.wizItems.filter(x => !x.err && !x.dup); }
  get wizDup(): any[]    { return this.wizItems.filter(x => x.dup); }
  get wizErr(): any[]    { return this.wizItems.filter(x => x.err); }
  get wizNet(): number   { return this.wizValid.reduce((s, x) => s + (Number(x.amount) || 0), 0); }
  get wizIsFirstImport(): boolean { return this.wizExistingCount === 0; }

  /** The reconciliation control: opening balance + this statement's movement must equal the closing. */
  get wizControl(): { state: 'ok' | 'bad' | 'missing'; msg: string; variance: number; pass: boolean } {
    const o = this.wizBalInput.opening, c = this.wizBalInput.closing;
    if (o === null || c === null || o === undefined || c === undefined || isNaN(Number(o)) || isNaN(Number(c)))
      return { state: 'missing', msg: 'Enter opening & closing balance', variance: 0, pass: false };
    const variance = +(Number(o) + this.wizNet - Number(c)).toFixed(2);
    if (Math.abs(variance) < 0.005) return { state: 'ok', msg: 'Opening + movement = closing ✓', variance: 0, pass: true };
    return { state: 'bad', msg: `Variance ${variance.toFixed(2)}`, variance, pass: false };
  }
  get wizCanImport(): boolean {
    return this.wizValid.length > 0 && (this.wizControl.pass || this.wizOverride) && this.canPost;
  }

  wizDoImport(): void {
    const valid = this.wizValid;
    if (!this.wizBankId || !valid.length || !this.wizCanImport) return;
    this.saving = true;
    this.clearAlerts();
    const lines = valid.map(x => ({
      transactionDate: x.transactionDate,
      // Keep the payee visible after import (no separate DB column): fold it into the description.
      description: x.payee ? `${x.payee} — ${x.description}` : x.description,
      referenceNo: x.referenceNo, debit: x.debit, credit: x.credit, amount: x.amount
    }));
    this.finance.run({ import: '/BankReconciliation/import' }, 'import', { bankId: this.wizBankId, lines }).subscribe({
      next: (res: any) => {
        this.saving = false;
        this.wizImportedCount = Number(res?.data ?? res?.result ?? valid.length);
        this.wizStep = 4;
      },
      error: err => { this.saving = false; this.error = err?.error?.message || 'Import failed.'; }
    });
  }
  wizGoReconcile(): void { if (this.wizBankId) this.openReconcile(this.wizBankId); }

  // ── CSV parsing (bank export → rows) ────────────────────────
  private parseCsv(text: string): { items: any[]; bal: any; mapping: any } {
    const emptyBal = { opening: null, closing: null, source: 'manual', acctNo: '', ccy: '' };
    const rows = text.split(/\r?\n/).filter(l => l.trim().length);
    if (rows.length < 2) return { items: [], bal: emptyBal, mapping: {} };

    // Find the real header row. Many exports carry preamble rows (a BOM, an account-info block) before
    // the column header, and some (e.g. UOB) prefix every row with a record-type column (H1/H2/D1/D2/T)
    // — the header is the "D1" row, data are the "D2" rows. Score the first rows by how many known
    // column names they contain and take the best as the header; the data rows follow it.
    const SCORE = ['date', 'description', 'debit', 'credit', 'withdraw', 'deposit', 'balance', 'reference', 'narration', 'amount'];
    let headerIdx = 0, best = -1;
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const cells = this.splitLine(rows[r]).map(h => h.trim().toLowerCase());
      const score = SCORE.reduce((s, t) => s + (cells.some(c => c.includes(t)) ? 1 : 0), 0);
      if (score > best) { best = score; headerIdx = r; }
    }
    const header    = this.splitLine(rows[headerIdx]).map(h => h.trim().toLowerCase());
    const headerRaw = this.splitLine(rows[headerIdx]).map(h => h.trim());

    // Column matcher: try the specific/"… amount"/"… date" names first, then loose single words —
    // and skip summary columns (Total …, … Count, … Balance). Bank exports like DBS carry both a
    // "Total Credit Amount" summary and the real "Credit Amount", plus "Total Debit Count", so a
    // naive "first header containing debit/credit/date" grabs the wrong column.
    // Priority match: try each preferred name in order (so "Post Date" wins over "Statement Value
    // Date"), then the loose single words — skipping summary columns via `exclude`.
    const find = (prefer: string[], loose: string[], exclude: string[] = []): number => {
      const bad = (h: string) => exclude.some(x => h.includes(x));
      for (const term of [...prefer, ...loose]) {
        const i = header.findIndex(h => !bad(h) && h.includes(term));
        if (i >= 0) return i;
      }
      return -1;
    };
    const AMT_EXCL = ['count', 'total', 'balance', 'opening', 'closing', 'available', 'hold'];
    const iDate   = find(['transaction date', 'post date', 'statement date', 'value date', 'txn date'], ['date'], ['count']);
    const iDesc   = find(['statement details', 'transaction description', 'description', 'narration', 'particular', 'details'], ['info', 'remark']);
    const iRef    = find(['our ref', 'cheque', 'chq', 'reference no', 'reference'], ['ref', 'txn']);
    // 'dr'/'cr' as bare words are too greedy — 'cr' matches "des-CR-iption", 'dr' matches other text —
    // so match the parenthesised "Amount (DR)/(CR)" forms explicitly and keep the safe longer words.
    const iDebit  = find(['debit amount', 'amount (dr', 'dr amount', 'withdrawal', 'withdraw'], ['debit', '(dr)'], [...AMT_EXCL, 'credit']);
    const iCredit = find(['credit amount', 'amount (cr', 'cr amount', 'deposit'], ['credit', '(cr)'], [...AMT_EXCL, 'debit']);
    const iAmount = find(['transaction amount'], ['amount'], [...AMT_EXCL, 'debit', 'credit', '(dr', '(cr']);
    const iPayee  = find(['ref for account owner', 'account owner', 'beneficiary', 'counterparty', 'payee', 'payer'], []);
    const iOpen   = find(['opening balance'], [], ['available']);
    const iClose  = find(['closing book balance', 'closing ledger balance', 'closing balance', 'ledger balance'], [], ['available', 'opening']);
    const iRun    = find(['running balance'], ['balance'], ['opening', 'closing', 'available', 'total', 'hold', 'count']);
    const iAcct   = find(['account no', 'account number', 'a/c no'], []);
    const iCcy    = find(['account currency'], ['currency']);

    const num = (s: string) => Number(String(s || '').replace(/[^0-9.\-]/g, '')) || 0;
    const get = (cols: string[], n: number) => (n >= 0 && n < cols.length ? cols[n].trim() : '');

    const dataRows = rows.slice(headerIdx + 1).map(l => this.splitLine(l));
    const items: any[] = [];
    dataRows.forEach(cols => {
      const dateRaw = get(cols, iDate);
      if (!dateRaw) return;
      const debit = num(get(cols, iDebit)), credit = num(get(cols, iCredit));
      const amount = iAmount >= 0 ? num(get(cols, iAmount)) : credit - debit;
      const iso = this.toIso(dateRaw);
      // Skip decoration / summary rows (dash separators, "End Of File", Total, opening/closing lines):
      // no valid date AND no money. A genuine transaction with a bad date still surfaces as an error.
      if (!iso && debit === 0 && credit === 0) return;
      items.push({
        transactionDate: iso, dateRaw,
        payee: get(cols, iPayee),
        description: get(cols, iDesc), referenceNo: get(cols, iRef),
        debit, credit, amount,
        _open:  iOpen  >= 0 ? num(get(cols, iOpen))  : null,
        _close: iClose >= 0 ? num(get(cols, iClose)) : null,
        _run:   iRun   >= 0 ? num(get(cols, iRun))   : null
      });
    });

    // Statement balances: Opening (constant every row) + Closing Book Balance (running — last row is
    // the closing) from the file when the bank exports them; else derive from a running "Balance"
    // column; else leave blank for manual entry. These feed the opening + movement = closing check.
    let opening: number | null = null, closing: number | null = null, source = 'manual';
    if (items.length) {
      const first = items[0], last = items[items.length - 1];
      if (iOpen  >= 0) opening = first._open;   // constant on every row
      if (iClose >= 0) closing = last._close;   // running — last valid row is the closing
      if (opening !== null && closing !== null) {
        source = 'file';
      } else if (iRun >= 0) {
        closing = last._run;
        opening = +((first._run ?? 0) - (first.amount || 0)).toFixed(2);
        source = 'derived';
      }
    }

    // The actual column each ERP field was mapped from — shown to the user as the "format profile"
    // so they can see exactly how their file was read (works for any bank layout, no hard-coding).
    const nm = (i: number) => (i >= 0 ? headerRaw[i] : '');
    const mapping = {
      date:    nm(iDate),
      payee:   nm(iPayee),
      desc:    nm(iDesc),
      ref:     nm(iRef),
      debit:   iAmount >= 0 ? '' : nm(iDebit),
      credit:  iAmount >= 0 ? '' : nm(iCredit),
      amount:  nm(iAmount),
      opening: nm(iOpen),
      closing: iClose >= 0 ? nm(iClose) : (iRun >= 0 ? nm(iRun) + ' (running)' : ''),
      acct:    nm(iAcct),
      ccy:     nm(iCcy),
      dateFmt: this.guessDateFmt(items.length ? items[0].dateRaw : '')
    };

    return {
      items,
      bal: {
        opening, closing, source,
        acctNo: iAcct >= 0 && dataRows.length ? get(dataRows[0], iAcct) : '',
        ccy:    iCcy  >= 0 && dataRows.length ? get(dataRows[0], iCcy)  : ''
      },
      mapping
    };
  }

  private guessDateFmt(raw: string): string {
    raw = (raw || '').trim();
    if (/^\d{8}$/.test(raw)) return 'yyyymmdd';
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(raw)) return 'yyyy-mm-dd';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(raw)) return 'dd/mm/yyyy';
    if (/^\d{1,2}\s+[A-Za-z]{3}/.test(raw)) return 'dd mmm yyyy';
    return raw ? 'auto' : '';
  }
  private splitLine(line: string): string[] {
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
    // Strip Excel's text-marker apostrophe / stray quotes (RHB exports dates as '01-07-2026).
    s = (s || '').trim().replace(/^['"]+/, '').trim();
    // yyyymmdd with no separators (e.g. DBS "20260714")
    let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  // Include the description: bank statements repeat the same amount + reference across many
  // distinct rows (e.g. lots of small PayNow transfers on one day), so date+amount+ref alone
  // would wrongly collapse genuinely-separate lines. Matches the backend's dedup key.
  private dupKey(date: any, amount: number, ref: any, desc: any): string {
    return `${String(date).slice(0, 10)}|${amount}|${(ref || '').toString().trim()}|${(desc || '').toString().trim()}`;
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
      remarks: r.remarks ?? r.Remarks ?? '',
      status: isMatched ? 'Reconciled' : 'Open'
    };
  }

  private clearAlerts(): void { this.error = ''; this.message = ''; }

  get unreconciledCount(): number { return this.allRows.filter(r => !r.isMatched).length; }
  get reconciledCount(): number { return this.allRows.filter(r => r.isMatched).length; }
}
