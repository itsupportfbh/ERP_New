import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import Swal from 'sweetalert2';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-ledger.component.html',
  styleUrls: ['./finance-ledger.component.scss']
})
export class FinanceLedgerComponent implements OnInit {
  roots: LedgerNode[] = [];
  displayRows: LedgerNode[] = [];

  loading = false;
  fromDate = '';
  toDate = '';
  showFilter = false;
  search = '';
  pageSize = 10;
  currentPage = 1;

  baseCurrency = 'SGD';

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));
  private endpoint = { list: '/GeneralLedger/GetGeneralLedger' };

  constructor(private finance: FinanceService, private permissionService: PermissionService) {}

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
    return this.baseCurrency.toUpperCase() === 'SGD';
  }

  load(): void {
    this.loading = true;
    this.showFilter = false;
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

  private calcBalance(opening: number, debit: number, credit: number): number {
    return opening + credit - debit;
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

  private rebuildDisplayRows(): void {
    const output: LedgerNode[] = [];

    const visit = (node: LedgerNode) => {
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
      node.balanceBase    = Math.abs(db - cb);

      if (this.useBaseValues) {
        node.displayDebit   = db;
        node.displayCredit  = cb;
        node.displayBalance = Math.abs(db - cb);
      } else {
        node.displayDebit   = d;
        node.displayCredit  = c;
        node.displayBalance = Math.abs(this.calcBalance(o, d, c));
      }

      output.push(node);
      if (hasChildren && node.$$expanded) node.children.forEach(ch => visit(ch));
    };

    this.roots.forEach(r => visit(r));

    const term = (this.search || '').toLowerCase();
    if (term) {
      const allFlat: LedgerNode[] = [];
      const collectAll = (node: LedgerNode) => {
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

    this.currentPage = 1;
  }

  toggle(row: LedgerNode): void {
    if (!row.hasChildren) return;
    row.$$expanded = !row.$$expanded;
    this.rebuildDisplayRows();
  }

  get pagedRows(): LedgerNode[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.displayRows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.displayRows.length / this.pageSize));
  }

  get pageFrom(): number {
    return this.displayRows.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageTo(): number {
    return Math.min(this.currentPage * this.pageSize, this.displayRows.length);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages, cur = this.currentPage;
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) pages.push(i);
    return pages;
  }

  setPage(p: number): void {
    if (p >= 1 && p <= this.totalPages) this.currentPage = p;
  }

  onSearchChange(): void {
    this.rebuildDisplayRows();
  }

  get totalDebit():   number { return this.roots.reduce((s, r) => s + (r.totalDebitBase  || 0), 0); }
  get totalCredit():  number { return this.roots.reduce((s, r) => s + (r.totalCreditBase || 0), 0); }
  get totalBalance(): number { return Math.abs(this.totalDebit - this.totalCredit); }

  levelClass(row: LedgerNode): string {
    if (row.level === 0) return 'lvl-0';
    if (row.level === 1) return 'lvl-1';
    if (row.level === 2) return 'lvl-2';
    return 'lvl-deep';
  }

  indentPx(row: LedgerNode): string { return `${(row.level || 0) * 20}px`; }
}