import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalesService } from '../sales.service';
import { DocumentPrintService, DocumentPrintConfig, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import { PermissionService } from '../../../core/services/permission.service';
import { EmailComposeService } from '../../../core/services/email-compose.service';
import { EmailComposeModel, EmailComposeAttachment } from '../../../core/components/email-compose/email-compose.component';
import Swal from 'sweetalert2';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Approved', 3: 'Rejected', 4: 'Posted' };

@Component({
  selector: 'erp-quotation-list',
  standalone: false,
  templateUrl: './quotation-list.component.html',
  styleUrls: ['./quotation-list.component.scss']
})
export class QuotationListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  searchText = '';
  pageSize = 10;
  sortField = '';
  sortAsc = true;

  // lookups for resolving line names
  private uomMap = new Map<number, string>();
  private itemCodeMap = new Map<number, string>();
  /** customerId → billing address from the Customer master, for the print "Bill To" box */
  private custAddrMap = new Map<number, string>();

  // view-details modal
  showView = false;
  viewLoading = false;
  activeRow: any = null;
  viewTitle = '';
  viewSubtitle = '';
  viewInfo: PrintField[] = [];
  viewLines: any[] = [];
  viewTotals: PrintField[] = [];
  /** Delivery To address captured on the quotation — shown under "Order To" when printing. */
  viewDeliveryTo = '';
  /** Customer's billing address from the Customer master — shown in the print "Bill To" box. */
  viewBillAddress = '';

  /** The company's base currency (e.g. RM). Documents can be billed in another currency. */
  private readonly baseCur = (localStorage.getItem('companyCurrencyName') || '').trim() || 'SGD';

  /**
   * Extra totals row converting a foreign-currency document into the company's base currency,
   * so the view/print shows e.g. "Base (RM) @ 3.1500  667.80" under "Grand Total (SGD) 212.00".
   */
  private baseTotalRow(total: number, cur: string, fxRate: any): PrintField[] {
    const fx = Number(fxRate ?? 1) || 1;
    const isForeign = !!cur && cur.trim().toLowerCase() !== this.baseCur.toLowerCase();
    if (!isForeign || fx === 1) return [];
    return [{ label: `Base (${this.baseCur}) @ ${fx.toFixed(4)}`, value: (total * fx).toFixed(2) }];
  }

  readonly lineColumns: PrintColumn[] = [
    { header: 'Item', key: 'itemName' },
    { header: 'UOM', key: 'uomName', align: 'center' },
    { header: 'Qty', key: 'qty', align: 'right', type: 'qty' },
    { header: 'Unit Price', key: 'unitPrice', align: 'right', type: 'number' },
    { header: 'Disc %', key: 'discountPct', align: 'right', type: 'number' },
    { header: 'Net', key: 'lineNet', align: 'right', type: 'number' },
    { header: 'Tax', key: 'lineTax', align: 'right', type: 'number' },
    { header: 'Total', key: 'lineTotal', align: 'right', type: 'number' },
  ];

  readonly fnId = 'qt-list';
  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService, public perm: PermissionService, private emailSvc: EmailComposeService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getUOMs().subscribe(r => this.svc.unwrap(r).forEach((u: any) => this.uomMap.set(Number(u.id), u.uomName ?? u.name ?? '')));
    this.svc.getItems().subscribe(r => this.svc.unwrap(r).forEach((i: any) => { if (i.itemCode) this.itemCodeMap.set(Number(i.id), i.itemCode); }));
    this.svc.getCustomers().subscribe(r => this.svc.unwrap(r).forEach((c: any) =>
      this.custAddrMap.set(Number(c.id ?? c.Id), String(c.address ?? c.Address ?? '').trim())));
  }

  load(): void {
    this.loading = true;
    // Cross-check sales orders so quotations already converted to an SO are not
    // marked "Expired" even if their validity date has passed.
    forkJoin({
      quotes: this.svc.getQuotations(),
      orders: this.svc.getSalesOrders()
    }).subscribe({
      next: ({ quotes, orders }: any) => {
        const usedQuotationIds = new Set<number>(
          this.svc.unwrap(orders)
            .map((so: any) => Number(so.quotationNo ?? so.QuotationNo ?? 0))
            .filter((n: number) => n > 0)
        );
        this.rows = this.svc.unwrap(quotes).map((r: any) => this.mapRow(r, usedQuotationIds));
        this.applyFilter();
        this.loading = false;
      },
      error: () => {
        // Fallback: still list quotations, without the "used" cross-check.
        this.svc.getQuotations().subscribe({
          next: res => {
            this.rows = this.svc.unwrap(res).map((r: any) => this.mapRow(r, new Set<number>()));
            this.applyFilter();
            this.loading = false;
          },
          error: () => { this.loading = false; }
        });
      }
    });
  }

  private mapRow(r: any, usedQuotationIds: Set<number>): any {
    const id = r.id ?? r.iD;
    const status = Number(r.status ?? 0);
    const validityDate = r.validityDate ?? null;
    const expired = this.isExpired(validityDate, status, Number(id), usedQuotationIds);
    return {
      ...r,
      id,
      number: r.number ?? r.quotationNo ?? '',
      customerName: r.customerName ?? r.customer ?? '',
      currency: r.currency ?? r.currencyName ?? r.currencyCode ?? '',
      currencyId: r.currencyId ?? r.currencyID ?? 0,
      fxRate: Number(r.fxRate ?? r.fxrate ?? 1) || 1,
      grandTotal: r.grandTotal ?? 0,
      deliveryDate: r.deliveryDate ?? null,
      validityDate,
      status,
      isExpired: expired,
      statusLabel: expired ? 'Expired' : (STATUS_MAP[status] ?? 'Draft'),
    };
  }

  /**
   * Expired = validity date is strictly before today AND the quotation was never
   * used (not converted to a sales order). Rejected/Posted keep their own status.
   */
  private isExpired(validityDate: any, status: number, id: number, usedQuotationIds: Set<number>): boolean {
    if (!validityDate) return false;
    if (status === 3 || status === 4) return false;
    if (usedQuotationIds.has(id)) return false;
    const d = new Date(validityDate);
    if (isNaN(d.getTime())) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  }

  applyFilter(): void {
    const q = this.searchText.trim().toLowerCase();
    let list = q
      ? this.rows.filter(r =>
          (r.number ?? '').toLowerCase().includes(q) ||
          (r.customerName ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];

    if (this.sortField) {
      const f = this.sortField;
      list = [...list].sort((a, b) => {
        const va = (a[f] ?? '').toString().toLowerCase();
        const vb = (b[f] ?? '').toString().toLowerCase();
        return this.sortAsc ? va.localeCompare(vb, undefined, { numeric: true }) : vb.localeCompare(va, undefined, { numeric: true });
      });
    }
    this.filtered = list;
  }

  get pagedItems(): any[] { return this.filtered.slice(0, this.pageSize); }

  sortBy(field: string): void {
    if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; }
    this.applyFilter();
  }

  create(): void { this.router.navigate(['/app/sales/quotations/new']); }

  /** Approved (2) or Posted (4) quotations are locked from edit/delete. */
  isLocked(row: any): boolean { return Number(row?.status) === 2 || Number(row?.status) === 4; }

  edit(row: any): void {
    if (this.isLocked(row)) return;
    this.router.navigate(['/app/sales/quotations', row.id]);
  }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getQuotationById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.viewDeliveryTo = String(d.deliveryTo ?? d.DeliveryTo ?? '').trim();
        this.viewBillAddress = this.custAddrMap.get(Number(row.customerId ?? d.customerId ?? d.CustomerId)) || '';
        const rawLines = d.lines ?? d.Lines ?? [];
        const baseLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => ({
          itemId: Number(l.itemId ?? l.ItemId ?? 0) || 0,
          itemCode: l.itemCode ?? this.itemCodeMap.get(Number(l.itemId)) ?? '',
          itemName: l.itemName ?? '',
          uomName: l.uomName ?? this.uomMap.get(Number(l.uomId)) ?? '',
          qty: l.qty ?? 0,
          unitPrice: l.unitPrice ?? 0,
          discountPct: l.discountPct ?? 0,
          lineNet: l.lineNet ?? 0,
          lineTax: l.lineTax ?? 0,
          lineTotal: l.lineTotal ?? 0,
        }));
        const cur = row.currency || 'SGD';
        // Show the "Executive Lunch Buffet" header (money on the header) followed by its
        // package contents (Chicken Briyani, White Bread, …) listed as indented sub-items.
        this.svc.groupViewLinesByPackage(baseLines, d.itemSets ?? d.ItemSets ?? [], (s: any) => ({
          itemId: 0,
          itemCode: '',
          itemName: s.setName ?? s.SetName ?? 'Package',
          uomName: '',
          qty: +(s.qty ?? s.Qty ?? 0) || 0,
          unitPrice: +(s.unitPrice ?? s.UnitPrice ?? 0) || 0,
          discountPct: +(s.discountPct ?? s.DiscountPct ?? 0) || 0,
          lineNet: +(s.lineNet ?? s.LineNet ?? 0) || 0,
          lineTax: +(s.lineTax ?? s.LineTax ?? 0) || 0,
          lineTotal: +(s.lineTotal ?? s.LineTotal ?? 0) || 0,
        }), true).subscribe(grouped => {
          // Package children are shown for reference only — the package header already
          // carries the money, so zero the child amounts to keep the totals correct.
          this.viewLines = grouped.map((l: any) => l.isPackageChild
            ? { ...l, itemName: `— ${l.itemName}`, unitPrice: 0, discountPct: 0, lineNet: 0, lineTax: 0, lineTotal: 0 }
            : l);
          const net = this.viewLines.reduce((s, l) => s + (+l.lineNet || 0), 0);
          const tax = this.viewLines.reduce((s, l) => s + (+l.lineTax || 0), 0);
          const total = this.viewLines.reduce((s, l) => s + (+l.lineTotal || 0), 0);
          this.viewInfo = [
            { label: 'QT No', value: row.number },
            { label: 'Status', value: row.statusLabel },
            { label: 'Customer', value: row.customerName || '—' },
            { label: 'Currency', value: cur },
            { label: 'Delivery Date', value: this.fmtDate(row.deliveryDate) },
            { label: 'Validity Date', value: this.fmtDate(row.validityDate) },
            { label: 'Remarks', value: d.remarks ?? '—' },
          ];
          this.viewTotals = [
            { label: 'Subtotal', value: net.toFixed(2) },
            { label: 'Tax', value: tax.toFixed(2) },
            { label: `Grand Total (${cur})`, value: total.toFixed(2) },
            ...this.baseTotalRow(total, cur, row.fxRate),
          ];
          this.viewTitle = `Quotation Lines — ${row.number}`;
          this.viewSubtitle = `Customer: ${row.customerName || '—'} · Currency: ${cur}`;
          this.viewLoading = false;
          cb();
        });
      },
      error: () => { this.viewLoading = false; cb(); }
    });
  }

  view(row: any): void { this.showView = true; this.buildDetail(row, () => {}); }

  /** Single source of truth for the document layout, shared by Print and Email
   *  so the emailed PDF always matches exactly what Print produces. */
  private buildDocConfig(): DocumentPrintConfig {
    return {
      docTitle: 'QUOTATION',
      docNo: this.activeRow?.number ?? '',
      fields: this.viewInfo.filter(f => f.label !== 'Remarks'),
      remarks: (this.viewInfo.find(f => f.label === 'Remarks')?.value as string) || '',
      columns: this.lineColumns,
      lines: this.viewLines,
      totals: this.viewTotals,
      orderToLines: this.viewDeliveryTo ? [this.viewDeliveryTo] : [],
      billTo: {
        name: this.activeRow?.customerName || '—',
        lines: this.viewBillAddress ? [this.viewBillAddress] : [],
      },
    };
  }

  print(row: any): void {
    this.buildDetail(row, () => {
      this.printSvc.print(this.buildDocConfig());
    });
  }

  printActive(): void { if (this.activeRow) this.print(this.activeRow); }

  private fmtDate(d: any): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
  }

  // ── Delete ────────────────────────────────────────────
  async deleteRow(row: any): Promise<void> {
    if (this.isLocked(row)) return;
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Confirm Delete',
      text: 'Delete this quotation?',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#16a34a'
    });
    if (!result.isConfirmed) return;
    this.svc.deleteQuotation(row.id).subscribe({
      next: () => { void Swal.fire({ icon: 'success', title: 'Deleted', text: 'Quotation deleted.', confirmButtonColor: '#16a34a' }).then(() => this.load()); },
      error: () => { void Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to delete quotation.', confirmButtonColor: '#16a34a' }); }
    });
  }

  
  // ── Email compose dialog ──────────────────────────────
  showEmailModal = false;
  emailSending = false;
  emailLoading = false;
  emailModel: EmailComposeModel = { fromLabel: '', fromEmail: '', fromName: '', toEmail: '', ccEmail: '', subject: '', bodyHtml: '' };
  emailAttachments: EmailComposeAttachment[] = [];

  emailCustomer(row: any): void {
    if (!this.perm.canPrint(this.fnId)) return;
    const email = (localStorage.getItem('email') || '').trim();
    const name = (localStorage.getItem('username') || '').trim();
    const docNo = row.number ?? '';

    this.showEmailModal = true;
    this.emailLoading = true;
    this.emailAttachments = [];
    this.emailModel = {
      fromLabel: name ? `${name}${email ? ' <' + email + '>' : ''}` : email,
      fromEmail: email, fromName: name,
      toEmail: '', ccEmail: '',
      subject: `Quotation ${docNo}`.trim(),
      bodyHtml: `<p>Dear Customer,</p><p>Please find attached Quotation <b>${docNo}</b>.</p><p>Regards,<br/>${name || email}</p>`
    };

    this.emailSvc.getRecipient('QUOTE', row.id).subscribe({
      next: res => {
        const info = this.emailSvc.unwrapOne(res) || {};
        this.emailModel.toEmail = info.email ?? info.Email ?? '';
        const party = info.partyName ?? info.PartyName;
        if (party) this.emailModel.bodyHtml = `<p>Dear ${party},</p><p>Please find attached Quotation <b>${docNo}</b>.</p><p>Regards,<br/>${name || email}</p>`;
      },
      error: () => {}
    });

    this.buildDetail(row, async () => {
      try {
        const blob = await this.printSvc.generatePdfBlob(this.buildDocConfig());
        this.emailAttachments = [{ label: 'Quotation', sublabel: docNo, checked: true, blob, fileName: `${docNo || 'Quotation'}.pdf` }];
      } catch {}
      this.emailLoading = false;
    });
  }

  closeEmailModal(): void { if (!this.emailSending) this.showEmailModal = false; }

  sendComposedEmail(): void {
    const m = this.emailModel;
    if (!m.toEmail) { void Swal.fire({ icon: 'warning', title: 'To is required', text: 'Customer email is missing.', confirmButtonColor: '#16a34a' }); return; }
    const files = this.emailAttachments.filter(a => a.checked && a.blob).map(a => ({ fileName: a.fileName || 'document.pdf', blob: a.blob! }));
    if (!files.length) { void Swal.fire({ icon: 'warning', title: 'No document', text: 'Nothing to attach.', confirmButtonColor: '#16a34a' }); return; }

    this.emailSending = true;
    this.emailSvc.sendWithAttachments({
      toEmail: m.toEmail, ccEmail: m.ccEmail, subject: m.subject, bodyHtml: m.bodyHtml,
      fromEmail: m.fromEmail, fromName: m.fromName, files
    }).subscribe({
      next: () => { this.emailSending = false; this.showEmailModal = false; void Swal.fire({ icon: 'success', title: 'Sent!', text: `Email sent to ${m.toEmail}.`, confirmButtonColor: '#16a34a' }); },
      error: err => { this.emailSending = false; void Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to send email.', confirmButtonColor: '#16a34a' }); }
    });
  }
}
