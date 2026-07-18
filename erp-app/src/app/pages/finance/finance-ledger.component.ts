import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { AuditPrintService } from '../../core/services/audit-print.service';
import * as XLSX from 'xlsx';

interface LedgerFlat {
  id: number;
  headCode: number;
  headName: string;
  parentHead: number;
  headType: string;
  rootHeadType: string;
  openingBalance: number;
  debit: number;
  credit: number;
  balance: number;
  debitBase: number;
  creditBase: number;
  balanceBase: number;
  isControl: boolean;
  isActive?: boolean;
  baseCurrency: string;
}

interface LedgerNode extends LedgerFlat {
  ownOpening: number;
  ownDebit: number;
  ownCredit: number;
  ownDebitBase: number;
  ownCreditBase: number;

  totalOpening: number;
  totalDebit: number;
  totalCredit: number;
  totalDebitBase: number;
  totalCreditBase: number;

  displayDebit: number;
  displayCredit: number;
  displayBalance: number;

  children: LedgerNode[];
  hasChildren: boolean;
  $$expanded: boolean;
  level: number;
  parent?: LedgerNode | null;
}

@Component({
  selector: 'erp-finance-ledger',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './finance-ledger.component.html',
  styleUrls: ['./finance-ledger.component.scss']
})
export class FinanceLedgerComponent implements OnInit {
  roots: LedgerNode[] = [];
  displayRows: LedgerNode[] = [];

  loading = false;
  fromDate = '';
  toDate = '';
  search = '';
  pageSize = 9999;   // default to "All" entries
  currentPage = 1;

  baseCurrency = localStorage.getItem('companyCurrencyName') || 'SGD';

  // Excel export options the user ticks before downloading.
  exportMenuOpen   = false;
  exportValuesOnly = true;   // ticked → only accounts carrying a balance; unticked → full chart of accounts
  exportGrouped    = true;   // ticked → +/− drill-down outline in Excel

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));
  private endpoint = { list: '/GeneralLedger/GetGeneralLedger' };

  constructor(
    private finance: FinanceService,
    private permissionService: PermissionService,
    private auditPrint: AuditPrintService
  ) {}

  ngOnInit(): void {
    const now = new Date();
    this.fromDate = `${now.getFullYear()}-01-01`;
    this.toDate   = `${now.getFullYear()}-12-31`;
    this.load();
    this.permissionService.getFunctionPermission(this.userId, 'ledger').subscribe({
      next: perm => { this.permission = perm; }
    });
  }

  get useBaseValues(): boolean {
    return true;
  }

  load(): void {
    this.loading = true;
    this.roots = [];
    this.displayRows = [];

    this.finance.list(this.endpoint, { fromDate: this.fromDate, toDate: this.toDate }).subscribe({
      next: res => {
        const raw: any[] = this.finance.unwrap(res);

        if (raw.length) {
          this.baseCurrency = raw[0].baseCurrency ?? raw[0].BaseCurrency ?? 'SGD';
        }

        const flat: LedgerFlat[] = raw.map((x: any) => ({
          id:             Number(x.headId ?? x.HeadId ?? x.id ?? x.Id ?? 0),
          headCode:       Number(x.headCode ?? 0),
          headName:       String(x.headName ?? '').trim(),
          parentHead:     x.parentHead == null ? 0 : Number(x.parentHead),
          headType:       String(x.headType ?? ''),
          rootHeadType:   String(x.rootHeadType ?? ''),
          openingBalance: Number(x.openingBalance ?? 0),
          debit:          Number(x.debit ?? 0),
          credit:         Number(x.credit ?? 0),
          balance:        Number(x.balance ?? 0),
          debitBase:      Number(x.debitBase  ?? x.DebitBase  ?? 0),
          creditBase:     Number(x.creditBase ?? x.CreditBase ?? 0),
          balanceBase:    Number(x.balanceBase ?? x.BalanceBase ?? 0),
          isControl:      !!x.isControl,
          isActive:       x.isActive ?? true,
          baseCurrency:   String(x.baseCurrency ?? x.BaseCurrency ?? 'SGD')
        }));

        const flatActive = flat.filter(r => !!r.isActive);
        const nodesById   = new Map<number, LedgerNode>();
        const byHeadCode  = new Map<number, LedgerNode>();

        flatActive.forEach(f => {
          const node: LedgerNode = {
            ...f,
            ownOpening:   f.openingBalance,
            ownDebit:     f.debit,
            ownCredit:    f.credit,
            ownDebitBase:  f.debitBase,
            ownCreditBase: f.creditBase,
            totalOpening: 0, totalDebit: 0, totalCredit: 0,
            totalDebitBase: 0, totalCreditBase: 0,
            openingBalance: 0, debit: 0, credit: 0, balance: 0,
            debitBase: 0, creditBase: 0, balanceBase: 0,
            displayDebit: 0, displayCredit: 0, displayBalance: 0,
            children: [], hasChildren: false, $$expanded: false, level: 0, parent: null
          };
          nodesById.set(node.id, node);
          if (!byHeadCode.has(node.headCode)) byHeadCode.set(node.headCode, node);
        });

        const roots: LedgerNode[] = [];
        nodesById.forEach(node => {
          const p = node.parentHead ?? 0;
          if (!p) {
            roots.push(node);
          } else {
            const parent = byHeadCode.get(p);
            if (parent && parent.id !== node.id) { node.parent = parent; parent.children.push(node); }
            else roots.push(node);
          }
        });

        const sortAndSetLevel = (list: LedgerNode[], level: number) => {
          list.sort((a, b) => a.headCode - b.headCode);
          list.forEach(n => {
            n.level = level;
            n.hasChildren = !!(n.children && n.children.length);
            if (n.hasChildren) sortAndSetLevel(n.children, level + 1);
          });
        };
        sortAndSetLevel(roots, 0);

        roots.forEach(r => this.computeTotals(r));

        this.roots = roots;
        this.roots.forEach(r => (r.$$expanded = false));
        this.rebuildDisplayRows();
        this.loading = false;
      },
      error: () => {
        this.roots = [];
        this.displayRows = [];
        this.loading = false;
        Swal.fire({ icon: 'error', title: 'Load Failed', text: 'General Ledger data unavailable.', confirmButtonColor: '#0e4a60' });
      }
    });
  }

  /** Closing balance, signed the same way the ledger is: +ve = debit, -ve = credit.
   *  Mirrors the backend's ClosingSigned = OpeningSigned + Debit - Credit, so the two
   *  never disagree. The opening balance is part of the closing balance — leaving it out
   *  reported movement, not balance. */
  private calcBalance(opening: number, debit: number, credit: number): number {
    return opening + debit - credit;
  }

  private computeTotals(node: LedgerNode): { opening: number; debit: number; credit: number; debitBase: number; creditBase: number } {
    let opening    = node.ownOpening    ?? 0;
    let debit      = node.ownDebit      ?? 0;
    let credit     = node.ownCredit     ?? 0;
    let debitBase  = node.ownDebitBase  ?? 0;
    let creditBase = node.ownCreditBase ?? 0;

    if (node.children?.length) {
      node.children.forEach(ch => {
        const t = this.computeTotals(ch);
        opening    += t.opening;
        debit      += t.debit;
        credit     += t.credit;
        debitBase  += t.debitBase;
        creditBase += t.creditBase;
      });
    }

    node.totalOpening    = opening;
    node.totalDebit      = debit;
    node.totalCredit     = credit;
    node.totalDebitBase  = debitBase;
    node.totalCreditBase = creditBase;

    return { opening, debit, credit, debitBase, creditBase };
  }

  /**
   * Fills in the figures the template renders for one row. A collapsed parent shows its
   * rolled-up total, an expanded one shows only what was posted to it directly (its children
   * are on screen carrying the rest), and a leaf always shows its own.
   *
   * Must run for EVERY node that can reach the screen, not just the ones the collapsed tree
   * walks — search renders accounts from any depth.
   */
  private applyDisplayValues(node: LedgerNode): void {
    const hasChildren = !!(node.children?.length);
    let o = 0, d = 0, c = 0, db = 0, cb = 0;

    if (hasChildren) {
      if (node.$$expanded) {
        const hasOwn = (node.ownOpening ?? 0) !== 0 || (node.ownDebit ?? 0) !== 0 || (node.ownCredit ?? 0) !== 0;
        if (hasOwn) {
          o = node.ownOpening ?? 0; d = node.ownDebit ?? 0; c = node.ownCredit ?? 0;
          db = node.ownDebitBase ?? 0; cb = node.ownCreditBase ?? 0;
        }
      } else {
        o = node.totalOpening ?? 0; d = node.totalDebit ?? 0; c = node.totalCredit ?? 0;
        db = node.totalDebitBase ?? 0; cb = node.totalCreditBase ?? 0;
      }
    } else {
      o = node.ownOpening ?? 0; d = node.ownDebit ?? 0; c = node.ownCredit ?? 0;
      db = node.ownDebitBase ?? 0; cb = node.ownCreditBase ?? 0;
    }

    node.openingBalance = o;
    node.debit          = d;
    node.credit         = c;
    node.balance        = Math.abs(this.calcBalance(o, d, c));
    node.debitBase      = db;
    node.creditBase     = cb;
    node.balanceBase    = Math.abs(this.calcBalance(o, db, cb));

    if (this.useBaseValues) {
      node.displayDebit   = db;
      node.displayCredit  = cb;
      node.displayBalance = Math.abs(this.calcBalance(o, db, cb));
    } else {
      node.displayDebit   = d;
      node.displayCredit  = c;
      node.displayBalance = Math.abs(this.calcBalance(o, d, c));
    }
  }

  private rebuildDisplayRows(): void {
    const output: LedgerNode[] = [];

    const visit = (node: LedgerNode) => {
      this.applyDisplayValues(node);
      output.push(node);
      if (node.children?.length && node.$$expanded) node.children.forEach(ch => visit(ch));
    };

    this.roots.forEach(r => visit(r));

    const term = (this.search || '').toLowerCase();
    if (term) {
      const allFlat: LedgerNode[] = [];
      const collectAll = (node: LedgerNode) => {
        // visit() only descends into expanded rows, so a node nested under a collapsed
        // parent still holds the zeros it was built with. Search can surface it anyway.
        this.applyDisplayValues(node);
        allFlat.push(node);
        if (node.children) node.children.forEach(ch => collectAll(ch));
      };
      this.roots.forEach(r => collectAll(r));
      this.displayRows = allFlat.filter(n =>
        n.headName.toLowerCase().includes(term) || String(n.headCode).includes(term)
      );
    } else {
      this.displayRows = output;
    }
  }

  toggle(row: LedgerNode): void {
    if (!row.hasChildren) return;
    row.$$expanded = !row.$$expanded;
    this.rebuildDisplayRows();
  }

  /** The ledger is never paged — expanding an account must show every one of its lines,
   *  and a page break would hide the rest of them. */
  get pagedRows(): LedgerNode[] {
    return this.displayRows;
  }

  onSearchChange(): void {
    this.rebuildDisplayRows();
  }

  get totalOpening(): number { return this.roots.reduce((s, r) => s + (r.totalOpening    || 0), 0); }
  get totalDebit():   number { return this.roots.reduce((s, r) => s + (r.totalDebitBase  || 0), 0); }
  get totalCredit():  number { return this.roots.reduce((s, r) => s + (r.totalCreditBase || 0), 0); }
  /** Closing = opening + movement, same as every row above it. */
  get totalBalance(): number { return Math.abs(this.calcBalance(this.totalOpening, this.totalDebit, this.totalCredit)); }

  // ─── Export (Excel / PDF) ──────────────────────────────────────
  /**
   * Every account carrying a value, using its OWN figures (not the rolled-up totals) —
   * a parent plus its children would otherwise double-count. Summing these own values
   * reproduces the footer totals exactly.
   */
  private exportRows(): Array<{ code: string; name: string; opening: number; debit: number; credit: number; balance: number }> {
    const out: Array<{ code: string; name: string; opening: number; debit: number; credit: number; balance: number }> = [];
    const walk = (n: LedgerNode) => {
      const opening = n.ownOpening ?? 0;
      const debit   = n.ownDebitBase ?? 0;
      const credit  = n.ownCreditBase ?? 0;
      if (opening || debit || credit) {
        out.push({
          code: String(n.headCode),
          name: n.headName,
          opening,
          debit,
          credit,
          balance: Math.abs(debit - credit)
        });
      }
      n.children?.forEach(walk);
    };
    this.roots.forEach(walk);
    return out.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  private fmtDisplayDate(d: string): string {
    if (!d) return 'All';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  }

  /**
   * Real .xlsx with the same drill-down as the screen: every account keeps its tree depth as an
   * Excel outline level, so the sheet renders the +/− group buttons (parent on top, children under).
   * A parent shows its rolled-up total — collapse a group and you read its subtotal, expand it and
   * the children carry their own figures underneath. Grand total sits at the bottom, outside any group.
   */
  toggleExportMenu(): void { this.exportMenuOpen = !this.exportMenuOpen; }

  /** True when this account (rolled up with its children) carries any balance. */
  private glHasValue(n: LedgerNode): boolean {
    return !!((n.totalOpening ?? 0) || (n.totalDebitBase ?? 0) || (n.totalCreditBase ?? 0));
  }

  exportExcel(): void {
    const period = `From ${this.fmtDisplayDate(this.fromDate)} To ${this.fmtDisplayDate(this.toDate)}`;
    const ccy = this.baseCurrency;

    // Header block (4 rows) is ungrouped; the +/− outline only covers the account rows.
    const aoa: any[][] = [
      ['General Ledger'],
      [period],
      [],
      ['Code', 'Account Name', 'Opening Bal', `Debit (${ccy})`, `Credit (${ccy})`, `Balance (${ccy})`]
    ];
    const levels: number[] = [0, 0, 0, 0];

    const walk = (n: LedgerNode) => {
      if (this.exportValuesOnly && !this.glHasValue(n)) return; // rolled-up zero → skip the whole branch
      const parent = !!(n.children?.length);
      // Excel caps outline depth at 7; deeper accounts just share the last level.
      const depth = Math.min(n.level || 0, 7);
      const opening = parent ? (n.totalOpening ?? 0)    : (n.ownOpening ?? 0);
      const debit   = parent ? (n.totalDebitBase ?? 0)  : (n.ownDebitBase ?? 0);
      const credit  = parent ? (n.totalCreditBase ?? 0) : (n.ownCreditBase ?? 0);
      const name    = (this.exportGrouped ? '    '.repeat(depth) : '') + n.headName.trim();
      aoa.push([String(n.headCode), name, opening, debit, credit, Math.abs(debit - credit)]);
      levels.push(this.exportGrouped ? depth : 0);
      n.children?.forEach(walk);
    };
    this.roots.forEach(walk);

    aoa.push([]);
    aoa.push(['', 'Total', '', this.totalDebit, this.totalCredit, this.totalBalance]);
    levels.push(0, 0);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    if (this.exportGrouped) {
      ws['!rows'] = levels.map(l => (l ? { level: l } : {}));
      // summaryBelow=false → the group button attaches to the parent row above, matching the screen.
      (ws as any)['!outline'] = { above: true };
    }

    // Two-decimal money format on the numeric columns (C–F) of every account + total row.
    for (let r = 4; r < aoa.length; r++) {
      if (!aoa[r] || aoa[r].length < 6) continue;
      for (let c = 2; c <= 5; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        const cell = ws[ref];
        if (cell && typeof cell.v === 'number') cell.z = '#,##0.00';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'General Ledger');
    XLSX.writeFile(wb, 'GeneralLedger.xlsx');
    this.exportMenuOpen = false;
  }

  exportPdf(): void {
    const period = `From ${this.fmtDisplayDate(this.fromDate)} To ${this.fmtDisplayDate(this.toDate)}`;
    this.auditPrint.print({
      reportTitle: 'General Ledger',
      periodLine: period,
      metaLines: [`Date : ${period}`, 'Sort By : Code;Description', 'Project : All'],
      labelColumnKey: 'name',
      columns: [
        { header: 'Acc Code',    key: 'code' },
        { header: 'Description', key: 'name' },
        { header: 'Opening Bal', key: 'opening', align: 'right', type: 'number' },
        { header: `Debit (${this.baseCurrency})`,   key: 'debit',   align: 'right', type: 'number' },
        { header: `Credit (${this.baseCurrency})`,  key: 'credit',  align: 'right', type: 'number' },
        { header: `Balance (${this.baseCurrency})`, key: 'balance', align: 'right', type: 'number' }
      ],
      rows: this.exportRows(),
      totalRows: [
        {
          label: `Grand Total (${this.baseCurrency})`,
          values: { debit: this.totalDebit, credit: this.totalCredit, balance: this.totalBalance },
          grand: true
        }
      ]
    });
  }

  levelClass(row: LedgerNode): string {
    if (row.level === 0) return 'lvl-0';
    if (row.level === 1) return 'lvl-1';
    if (row.level === 2) return 'lvl-2';
    return 'lvl-deep';
  }

  indentPx(row: LedgerNode): string { return `${(row.level || 0) * 20}px`; }
}