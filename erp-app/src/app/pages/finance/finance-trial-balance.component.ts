import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { AuditPrintService } from '../../core/services/audit-print.service';

interface TbNode {
  headCode:      string;
  headName:      string;
  headId:        any;
  parentHead:    any;
  level:         number;
  expanded:      boolean;
  isLeaf:        boolean;
  children:      TbNode[];
  openingDebit:  number;
  openingCredit: number;
  closingDebit:  number;
  closingCredit: number;
  // inline detail
  detailOpen?:   boolean;
  detailRows?:   any[];
  detailLoading?: boolean;
  // inline opening-balance edit (leaf accounts only)
  isEditingOpening?:  boolean;
  openingDebitEdit?:  number;
  openingCreditEdit?: number;
  savingOpening?:     boolean;
}

@Component({
  selector: 'erp-finance-trial-balance',
  standalone: true,
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './finance-trial-balance.component.html',
  styleUrls: ['./finance-trial-balance.component.scss']
})
export class FinanceTrialBalanceComponent implements OnInit {
  fromDate = '';
  toDate   = '';
  search   = '';
  loading  = false;
  error    = '';

  roots:       TbNode[] = [];
  displayRows: TbNode[] = [];

  totalOpeningDebit  = 0;
  totalOpeningCredit = 0;
  totalClosingDebit  = 0;
  totalClosingCredit = 0;

  // pagination
  pageSize    = 25;
  currentPage = 1;
  totalRows   = 0;

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  private endpoint = { list: '/financereport/trial-balance', listMethod: 'POST' as const };

  constructor(
    private finance: FinanceService,
    private permissionService: PermissionService,
    private auditPrint: AuditPrintService
  ) {}

  ngOnInit(): void {
    const today = new Date();
    this.fromDate = `${today.getFullYear()}-01-01`;
    this.toDate   = this.dateOnly(today);
    this.permissionService.getFunctionPermission(this.userId, 'tb').subscribe({
      next: perm => { this.permission = perm; }
    });
    // Run the report straight away with the default year-to-date range, instead of showing
    // an empty table until the user clicks Run TB.
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error   = '';
    const body   = { fromDate: this.fromDate, toDate: this.toDate };
    this.finance.list(this.endpoint, body).subscribe({
      next: res => {
        const raw: any[] = this.finance.unwrap(res);
        this.buildTree(raw);
        this.loading = false;
      },
      error: () => { this.roots = []; this.displayRows = []; this.loading = false; this.error = 'Trial Balance unavailable.'; }
    });
  }

  // ─── Tree build (same logic as Unity_ERP) ───────────────────────
  private buildTree(raw: any[]): void {
    const byHeadCode = new Map<string, TbNode>();
    const byHeadId   = new Map<any, TbNode>();

    raw.forEach(r => {
      const node: TbNode = {
        headCode:      String(r.headCode ?? r.accountCode ?? r.code ?? ''),
        headName:      r.headName ?? r.accountName ?? r.name ?? '',
        headId:        r.headId ?? r.id ?? r.accountId,
        parentHead:    r.parentHead ?? r.parentAccountId ?? r.parentId ?? null,
        level:         0,
        expanded:      false,
        isLeaf:        true,
        children:      [],
        openingDebit:  Number(r.openingDebit  ?? r.OpeningDebit  ?? 0),
        openingCredit: Number(r.openingCredit ?? r.OpeningCredit ?? 0),
        closingDebit:  Number(r.closingDebit  ?? r.ClosingDebit  ?? 0),
        closingCredit: Number(r.closingCredit ?? r.ClosingCredit ?? 0),
      };
      byHeadId.set(node.headId, node);
      if (!byHeadCode.has(node.headCode)) byHeadCode.set(node.headCode, node);
    });

    const roots: TbNode[] = [];

    byHeadId.forEach(node => {
      const parentKey = (node.parentHead != null && node.parentHead !== 0 && node.parentHead !== '')
        ? String(node.parentHead)
        : '';

      if (parentKey && byHeadCode.has(parentKey)) {
        const parent = byHeadCode.get(parentKey)!;
        if (parent.headId !== node.headId) {
          parent.children.push(node);
          parent.isLeaf = false;
          node.level    = parent.level + 1;
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    // sort children by headCode
    byHeadId.forEach(n => {
      if (n.children.length) n.children.sort((a, b) => a.headCode.localeCompare(b.headCode));
    });
    roots.sort((a, b) => a.headCode.localeCompare(b.headCode));

    this.roots = roots;
    // roll-up parent totals from leaves
    this.roots.forEach(r => this.recalcTotals(r));
    // recompute levels after tree links are set
    byHeadId.forEach(n => { n.level = this.getLevel(n, byHeadCode); });

    this.computeSummaryTotals();
    this.currentPage = 1;
    this.rebuildDisplayRows();
  }

  private getLevel(node: TbNode, map: Map<string, TbNode>): number {
    let level = 0;
    let current = node;
    const seen = new Set<string>();
    while (current.parentHead != null && current.parentHead !== 0 && current.parentHead !== '') {
      const parentKey = String(current.parentHead);
      if (seen.has(parentKey)) break;
      seen.add(parentKey);
      const parent = map.get(parentKey);
      if (!parent) break;
      level++;
      current = parent;
    }
    return level;
  }

  private recalcTotals(node: TbNode): void {
    if (!node.children.length) return;
    node.children.forEach(c => this.recalcTotals(c));
    const ownOD = node.openingDebit;
    const ownOC = node.openingCredit;
    const ownCD = node.closingDebit;
    const ownCC = node.closingCredit;
    node.openingDebit  = ownOD + node.children.reduce((s, c) => s + (c.openingDebit  || 0), 0);
    node.openingCredit = ownOC + node.children.reduce((s, c) => s + (c.openingCredit || 0), 0);
    node.closingDebit  = ownCD + node.children.reduce((s, c) => s + (c.closingDebit  || 0), 0);
    node.closingCredit = ownCC + node.children.reduce((s, c) => s + (c.closingCredit || 0), 0);
  }

  private computeSummaryTotals(): void {
    this.totalOpeningDebit  = this.roots.reduce((s, r) => s + (r.openingDebit  || 0), 0);
    this.totalOpeningCredit = this.roots.reduce((s, r) => s + (r.openingCredit || 0), 0);
    this.totalClosingDebit  = this.roots.reduce((s, r) => s + (r.closingDebit  || 0), 0);
    this.totalClosingCredit = this.roots.reduce((s, r) => s + (r.closingCredit || 0), 0);
  }

  // ─── Flatten tree for display (DFS) ────────────────────────────
  rebuildDisplayRows(): void {
    const flat: TbNode[] = [];
    const term = (this.search || '').toLowerCase();

    const visit = (n: TbNode) => {
      if (term && !String(n.headCode).toLowerCase().includes(term) && !n.headName.toLowerCase().includes(term)) {
        if (n.children.length) n.children.forEach(c => visit(c));
        return;
      }
      flat.push(n);
      if (n.expanded && n.children.length) n.children.forEach(c => visit(c));
    };

    this.roots.forEach(r => visit(r));

    this.totalRows   = flat.length;
    const start      = (this.currentPage - 1) * this.pageSize;
    this.displayRows = flat.slice(start, start + this.pageSize);
  }

  onSearchChange(): void {
    this.currentPage = 1;
    this.rebuildDisplayRows();
  }

  // ─── Toggle expand / collapse ───────────────────────────────────
  toggleNode(node: TbNode, event?: Event): void {
    if (event) event.stopPropagation();
    if (!node.children.length) return;
    node.expanded = !node.expanded;
    this.rebuildDisplayRows();
  }

  expandAll(): void {
    const set = (n: TbNode) => { if (n.children.length) { n.expanded = true; n.children.forEach(set); } };
    this.roots.forEach(set);
    this.currentPage = 1;
    this.rebuildDisplayRows();
  }

  collapseAll(): void {
    const clear = (n: TbNode) => { n.expanded = false; n.children.forEach(clear); };
    this.roots.forEach(clear);
    this.currentPage = 1;
    this.rebuildDisplayRows();
  }

  // ─── Click on leaf: load detail transactions ────────────────────
  onRowClick(node: TbNode): void {
    if (!node.isLeaf || !node.children.length === false) return;
    if (node.detailOpen) { node.detailOpen = false; return; }
    node.detailOpen    = true;
    node.detailRows    = [];
    node.detailLoading = true;
    const body = { headId: node.headId, fromDate: this.fromDate, toDate: this.toDate };
    this.finance.list({ list: '/financereport/trial-balance-detail', listMethod: 'POST' as const }, body).subscribe({
      next: res => { node.detailRows = this.finance.unwrap(res); node.detailLoading = false; },
      error: ()  => { node.detailRows = [];  node.detailLoading = false; }
    });
  }

  // ─── Inline opening-balance edit (leaf accounts) ───────────────
  canEdit(): boolean { return this.permissionService.hasEdit(this.permission); }

  startEditOpening(node: TbNode, event?: Event): void {
    if (event) event.stopPropagation();
    if (!this.canEdit() || !node.isLeaf) return;
    node.isEditingOpening  = true;
    node.openingDebitEdit  = node.openingDebit  || 0;
    node.openingCreditEdit = node.openingCredit || 0;
  }

  cancelEditOpening(node: TbNode, event?: Event): void {
    if (event) event.stopPropagation();
    node.isEditingOpening  = false;
    node.openingDebitEdit  = node.openingDebit  || 0;
    node.openingCreditEdit = node.openingCredit || 0;
  }

  saveOpening(node: TbNode, event?: Event): void {
    if (event) event.stopPropagation();
    if (!this.canEdit() || !node.isLeaf) return;
    node.savingOpening = true;
    const body = {
      headId:        Number(node.headId),
      openingDebit:  Number(node.openingDebitEdit)  || 0,
      openingCredit: Number(node.openingCreditEdit) || 0,
      asOfDate:      this.fromDate || null,
      userName:      localStorage.getItem('username') || ''
    };
    this.finance.saveOpeningBalance(body).subscribe({
      next: () => {
        node.isEditingOpening = false;
        node.savingOpening    = false;
        // Opening balance feeds into closing balance, so reload the whole report
        // to keep every debit/credit/closing figure consistent with the server.
        this.load();
      },
      error: (err: any) => {
        node.savingOpening = false;
        // Surface the real backend reason (e.g. "Permission denied. Required tb:Edit."
        // for a 403, or the server exception for a 500) instead of a generic message.
        const backendMsg = err?.error?.message || err?.error?.title;
        this.error = backendMsg
          ? `Unable to save opening balance: ${backendMsg}`
          : `Unable to save opening balance (HTTP ${err?.status ?? '?'}).`;
      }
    });
  }

  // ─── Export (Excel / PDF) ──────────────────────────────────────
  // Leaf accounts carrying any value — the actual trial-balance lines.
  private exportLeaves(): TbNode[] {
    const out: TbNode[] = [];
    const walk = (n: TbNode) => {
      if (!n.children.length) {
        if ((n.openingDebit || 0) || (n.openingCredit || 0) || (n.closingDebit || 0) || (n.closingCredit || 0)) out.push(n);
      } else {
        n.children.forEach(walk);
      }
    };
    this.roots.forEach(walk);
    return out;
  }

  private fmtDisplayDate(d: string): string {
    if (!d) return 'All';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  }

  exportExcel(): void {
    const leaves = this.exportLeaves();
    const rows: any[][] = [
      ['Trial Balance'],
      [`From ${this.fmtDisplayDate(this.fromDate)} To ${this.fmtDisplayDate(this.toDate)}`],
      [],
      ['Account Code', 'Account', 'Opening Debit', 'Opening Credit', 'Closing Debit', 'Closing Credit'],
      ...leaves.map(n => [
        n.headCode, n.headName,
        (n.openingDebit || 0).toFixed(2), (n.openingCredit || 0).toFixed(2),
        (n.closingDebit || 0).toFixed(2), (n.closingCredit || 0).toFixed(2)
      ]),
      [],
      ['', 'Total',
        this.totalOpeningDebit.toFixed(2), this.totalOpeningCredit.toFixed(2),
        this.totalClosingDebit.toFixed(2), this.totalClosingCredit.toFixed(2)]
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'TrialBalance.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  exportPdf(): void {
    const period = `From ${this.fmtDisplayDate(this.fromDate)} To ${this.fmtDisplayDate(this.toDate)}`;
    this.auditPrint.print({
      reportTitle: 'Trial Balance',
      periodLine: period,
      metaLines: [`Date : ${period}`, 'Sort By : Code;Description', 'Project : All'],
      labelColumnKey: 'name',
      columns: [
        { header: 'Acc Code',       key: 'code' },
        { header: 'Description',    key: 'name' },
        { header: 'Opening Debit',  key: 'openingDebit',  align: 'right', type: 'number' },
        { header: 'Opening Credit', key: 'openingCredit', align: 'right', type: 'number' },
        { header: 'Closing Debit',  key: 'closingDebit',  align: 'right', type: 'number' },
        { header: 'Closing Credit', key: 'closingCredit', align: 'right', type: 'number' }
      ],
      rows: this.exportLeaves().map(n => ({
        code: n.headCode, name: n.headName,
        openingDebit: n.openingDebit || 0, openingCredit: n.openingCredit || 0,
        closingDebit: n.closingDebit || 0, closingCredit: n.closingCredit || 0
      })),
      totalRows: [
        {
          label: 'Total',
          values: {
            openingDebit: this.totalOpeningDebit, openingCredit: this.totalOpeningCredit,
            closingDebit: this.totalClosingDebit, closingCredit: this.totalClosingCredit
          },
          grand: true
        }
      ]
    });
  }

  // ─── Display helpers (show 0 on parent when expanded) ──────────
  openingDebit(n: TbNode):  number { return (n.children.length && n.expanded) ? 0 : (n.openingDebit  || 0); }
  openingCredit(n: TbNode): number { return (n.children.length && n.expanded) ? 0 : (n.openingCredit || 0); }
  closingDebit(n: TbNode):  number { return (n.children.length && n.expanded) ? 0 : (n.closingDebit  || 0); }
  closingCredit(n: TbNode): number { return (n.children.length && n.expanded) ? 0 : (n.closingCredit || 0); }

  indentPx(node: TbNode): string { return `${(node.level || 0) * 20}px`; }

  // ─── Pagination ─────────────────────────────────────────────────
  get totalPages(): number { return Math.max(1, Math.ceil(this.totalRows / this.pageSize)); }

  get pages(): number[] {
    const total = this.totalPages;
    const cur   = this.currentPage;
    // show at most 5 page buttons centered on current
    const start = Math.max(1, cur - 2);
    const end   = Math.min(total, start + 4);
    const arr: number[] = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }

  changePage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.currentPage = p;
    this.rebuildDisplayRows();
  }

  get startIndex(): number { return this.totalRows === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get endIndex():   number { return Math.min(this.currentPage * this.pageSize, this.totalRows); }

  private dateOnly(d: Date): string { return d.toISOString().slice(0, 10); }
}
