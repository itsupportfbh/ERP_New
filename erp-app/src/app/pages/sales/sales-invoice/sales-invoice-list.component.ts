import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalesService } from '../sales.service';
import { DocumentPrintService, DocumentPrintConfig, PrintColumn, PrintField } from '../../../core/services/document-print.service';
import { PermissionService } from '../../../core/services/permission.service';
import Swal from 'sweetalert2';

// Status -> badge code: 0 Draft (grey), 1 Printed/Pending (amber), 4 Posted (blue)
const STATUS_CODE: Record<string, number> = { Draft: 0, Printed: 1, Posted: 4 };

@Component({
  selector: 'erp-sales-invoice-list',
  standalone: false,
  templateUrl: './sales-invoice-list.component.html',
  styleUrls: ['./sales-invoice-list.component.scss']
})
export class SalesInvoiceListComponent implements OnInit {
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  searchText = '';
  pageSize = 10;
  sortField = '';
  sortAsc = true;

  showDeleteModal = false;
  itemToDelete: any = null;

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
  /** Delivery To address captured on the invoice — shown under "Deliver To" when printing. */
  viewDeliveryTo = '';
  /** Customer's billing address from the Customer master — shown in the print "Bill To" box. */
  viewBillAddress = '';

  /** The company's base currency (e.g. RM). Invoices can be billed in another currency. */
  private readonly baseCur = (localStorage.getItem('companyCurrencyName') || '').trim() || 'SGD';

  /**
   * Extra totals row converting a foreign-currency invoice into the company's base currency,
   * so the view/print shows e.g. "Base (RM) @ 3.1500  667.80" under "Grand Total (SGD) 212.00".
   */
  private baseTotalRow(total: number, cur: string, fxRate: any): PrintField[] {
    const fx = Number(fxRate ?? 1) || 1;
    const isForeign = !!cur && cur.trim().toLowerCase() !== this.baseCur.toLowerCase();
    if (!isForeign || fx === 1) return [];
    return [{ label: `Base (${this.baseCur}) @ ${fx.toFixed(4)}`, value: (total * fx).toFixed(2) }];
  }

  printBillTo: { name?: string; lines?: string[] } = {};
  printDeliverTo: { name?: string; lines?: string[] } = {};

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

  readonly fnId = 'si-list';
  constructor(private svc: SalesService, private router: Router, private printSvc: DocumentPrintService, public perm: PermissionService) {}

  ngOnInit(): void {
    this.load();
    this.svc.getCustomers().subscribe(r => this.svc.unwrap(r).forEach((c: any) =>
      this.custAddrMap.set(Number(c.id ?? c.Id), String(c.address ?? c.Address ?? '').trim())));
  }

  load(): void {
    this.loading = true;
    this.svc.getSalesInvoices().subscribe({
      next: res => {
        const items = (res as any)?.data?.items;
        const list = Array.isArray(items) ? items : this.svc.unwrap(res);
        this.rows = (list ?? []).map((r: any) => {
          const statusLabel = this.statusOf(r);
          return {
            ...r,
            id: r.id ?? r.iD,
            invoiceNo: r.invoiceNo ?? r.siNo ?? r.invoiceNumber ?? '',
            customerName: r.customerName ?? '',
            invoiceDate: r.invoiceDate ?? null,
            currency: r.currency ?? r.currencyName ?? r.currencyCode ?? '',
            currencyId: r.currencyId ?? r.currencyID ?? 0,
            fxRate: Number(r.fxRate ?? r.fxrate ?? 1) || 1,
            // Stored Total is the gross grand total (net + tax + shipping); show it as-is.
            total: Number(r.total ?? 0),
            sourceRef: r.sourceRef ?? r.SourceRef ?? r.sourceNo ?? r.soNo ?? r.doNo ?? '',
            statusLabel,
            statusCode: STATUS_CODE[statusLabel] ?? 0,
          };
        });
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private statusOf(r: any): string {
    if (r.glPosted === true || r.glPosted === 1 || r.posted === true) return 'Posted';
    if (Number(r.printCount ?? 0) > 0 || r.printed === true) return 'Printed';
    return r.statusLabel ?? r.status ?? 'Draft';
  }

  applyFilter(): void {
    const q = this.searchText.trim().toLowerCase();
    let list = q
      ? this.rows.filter(r =>
          (r.invoiceNo ?? '').toLowerCase().includes(q) ||
          (r.customerName ?? '').toLowerCase().includes(q) ||
          (r.sourceRef ?? '').toLowerCase().includes(q) ||
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

  create(): void { this.router.navigate(['/app/sales/invoices/new']); }

  edit(row: any): void { this.router.navigate(['/app/sales/invoices', row.id]); }

  // ── View / Print ──────────────────────────────────────
  private buildDetail(row: any, cb: () => void): void {
    this.activeRow = row;
    this.viewLines = [];
    this.viewLoading = true;
    this.svc.getSalesInvoiceById(row.id).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        const hdr = d.header ?? d;
        this.viewDeliveryTo = String(hdr.deliveryTo ?? hdr.DeliveryTo ?? d.deliveryTo ?? d.DeliveryTo ?? '').trim();
        this.viewBillAddress = this.custAddrMap.get(Number(row.customerId ?? hdr.customerId ?? hdr.CustomerId ?? d.customerId ?? d.CustomerId)) || '';
        const rawLines = d.lines ?? hdr.lines ?? [];
        const baseLines = (Array.isArray(rawLines) ? rawLines : []).map((l: any) => {
          const qty = Number(l.qty ?? 0);
          const price = Number(l.unitPrice ?? 0);
          const disc = Number(l.discountPct ?? 0);
          const lineNet = l.lineAmount != null ? Number(l.lineAmount) : +(qty * price * (1 - disc / 100)).toFixed(2);
          const lineTax = Number(l.taxAmount ?? 0);
          return {
            itemId: Number(l.itemId ?? l.ItemId ?? 0) || 0,
            itemName: l.itemName ?? '',
            uomName: l.uom ?? l.uomName ?? '',
            qty,
            unitPrice: price,
            discountPct: disc,
            lineNet,
            lineTax,
            lineTotal: +(lineNet + lineTax).toFixed(2),
          };
        });
        // Fall back to the company's base currency (e.g. RM), not a hardcoded 'SGD'.
        const baseCur = (localStorage.getItem('companyCurrencyName') || '').trim() || 'SGD';
        const cur = row.currency ?? hdr.currency ?? hdr.currencyName ?? hdr.currencyCode ?? baseCur;
        const invDate = hdr.invoiceDate ?? row.invoiceDate;
        const custName = (hdr.customerName ?? row.customerName) || '—';
        const custAddr = hdr.customerAddress ?? hdr.CustomerAddress ?? '';
        const contact  = hdr.contactNumber ?? hdr.ContactNumber ?? '';
        const deliverTo = hdr.deliveryTo ?? hdr.DeliveryTo ?? '';

        // Package money lives on the source SO's item sets → resolve, then group the lines.
        this.svc.getSourceSoItemSets({ soId: hdr.soId ?? hdr.SoId, doId: hdr.doId ?? hdr.DoId }).subscribe(itemSets => {
          this.svc.groupViewLinesByPackage(baseLines, itemSets, (s: any) => {
            const setNet = +(s.lineNet ?? s.LineNet ?? 0) || 0;
            const setTax = +(s.lineTax ?? s.LineTax ?? 0) || 0;
            const setTotal = +(s.lineTotal ?? s.LineTotal ?? 0) || (setNet + setTax);
            return {
              itemId: 0,
              itemName: s.setName ?? s.SetName ?? 'Package',
              uomName: '',
              qty: +(s.qty ?? s.Qty ?? 0) || 0,
              unitPrice: +(s.unitPrice ?? s.UnitPrice ?? 0) || 0,
              discountPct: +(s.discountPct ?? s.DiscountPct ?? 0) || 0,
              lineNet: setNet,
              lineTax: setTax,
              lineTotal: setTotal,
            };
          }, true).subscribe(grouped => {
            // Children are shown for reference only — the header carries the money, so
            // zero the child amounts to keep the totals correct.
            this.viewLines = grouped.map((l: any) => l.isPackageChild
              ? { ...l, itemName: `— ${l.itemName}`, unitPrice: 0, discountPct: 0, lineNet: 0, lineTax: 0, lineTotal: 0 }
              : l);
            const net = this.viewLines.reduce((s, l) => s + (+l.lineNet || 0), 0);
            const tax = this.viewLines.reduce((s, l) => s + (+l.lineTax || 0), 0);
            const total = this.viewLines.reduce((s, l) => s + (+l.lineTotal || 0), 0);
            this.viewInfo = [
              { label: 'Invoice No', value: row.invoiceNo },
              { label: 'Customer', value: custName },
              { label: 'Invoice Date', value: this.fmtDate(invDate) },
              { label: 'Currency', value: cur },
            ];
            this.viewTotals = [
              { label: 'Subtotal', value: net.toFixed(2) },
              { label: 'Tax', value: tax.toFixed(2) },
              { label: `Grand Total (${cur})`, value: total.toFixed(2) },
              ...this.baseTotalRow(total, cur, row.fxRate ?? hdr.fxRate),
            ];
            this.printBillTo = { name: custName, lines: [custAddr, contact ? `Tel: ${contact}` : ''].filter(Boolean) };
            this.printDeliverTo = { name: custName, lines: [deliverTo || custAddr].filter(Boolean) };

            this.viewTitle = `Invoice Lines — ${row.invoiceNo}`;
            this.viewSubtitle = `Customer: ${custName} · Currency: ${cur}`;
            this.viewLoading = false;
            cb();
          });
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
      docTitle: 'SALES INVOICE',
      docNo: this.activeRow?.invoiceNo ?? '',
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
  openDelete(row: any): void { this.itemToDelete = row; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.svc.deleteSalesInvoice(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.showDeleteModal = false; }
    });
  }
  





  // ── Email compose dialog ──────────────────────────────
  showEmailModal = false;
  emailSending = false;
  emailLoading = false;
  /** compose-info resolved from the server (which SO/DO exist for this invoice) */
  emailInfo: { siId: number; invoiceNo: string; customerName: string; toEmail: string;
               soId: number; soNo?: string; doId: number; doNo?: string } | null = null;

  emailModel = {
    siId: 0,
    fromEmail: '',
    fromName: '',
    fromLabel: '',
    toEmail: '',
    toName: '',
    ccEmail: '',
    subject: '',
    bodyHtml: '',
    includeSalesInvoice: true,
    includeSalesOrder: false,
    includeDeliveryOrder: false
  };

  /** Opens the compose dialog: To = customer, checkboxes for SO/DO/SI. The email is sent from the
   *  company mailbox with the logged-in user shown as sender + Reply-To (no password needed). */
  emailCustomer(row: any): void {
    if (!this.perm.canPrint(this.fnId)) return;

    const fromEmail = (localStorage.getItem('email') || '').trim();
    const fromName = (localStorage.getItem('username') || '').trim();
    const fromLabel = fromName ? `${fromName}${fromEmail ? ' <' + fromEmail + '>' : ''}` : fromEmail;

    this.showEmailModal = true;
    this.emailLoading = true;
    this.emailInfo = null;
    this.emailModel = {
      siId: row.id,
      fromEmail,
      fromName,
      fromLabel,
      toEmail: '',
      toName: '',
      ccEmail: '',
      subject: `Sales Invoice ${row.invoiceNo ?? ''}`.trim(),
      bodyHtml: '',
      includeSalesInvoice: true,
      includeSalesOrder: false,
      includeDeliveryOrder: false
    };

    this.svc.getInvoiceEmailComposeInfo(row.id).subscribe({
      next: res => {
        const info = this.svc.unwrapOne(res) || {};
        this.emailInfo = {
          siId: Number(info.siId ?? info.SiId ?? row.id),
          invoiceNo: String(info.invoiceNo ?? info.InvoiceNo ?? row.invoiceNo ?? ''),
          customerName: String(info.customerName ?? info.CustomerName ?? ''),
          toEmail: String(info.toEmail ?? info.ToEmail ?? ''),
          soId: Number(info.soId ?? info.SoId ?? 0),
          soNo: info.soNo ?? info.SoNo ?? '',
          doId: Number(info.doId ?? info.DoId ?? 0),
          doNo: info.doNo ?? info.DoNo ?? ''
        };
        this.emailModel.toEmail = this.emailInfo.toEmail;
        this.emailModel.toName = this.emailInfo.customerName;
        this.emailModel.includeSalesOrder = this.emailInfo.soId > 0;
        this.emailModel.includeDeliveryOrder = this.emailInfo.doId > 0;
        this.emailModel.subject = `Sales Invoice ${this.emailInfo.invoiceNo}`.trim();
        this.emailModel.bodyHtml =
          `<p>Dear ${this.emailInfo.customerName || 'Customer'},</p>` +
          `<p>Please find attached the requested document(s).</p>` +
          `<p>Regards,<br/>${fromName || fromEmail}</p>`;
        this.emailLoading = false;
      },
      error: err => {
        this.emailLoading = false;
        this.showEmailModal = false;
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to load invoice email details.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  closeEmailModal(): void {
    if (this.emailSending) return;
    this.showEmailModal = false;
    this.emailInfo = null;
  }

  sendComposedEmail(): void {
    const m = this.emailModel;
    if (!m.toEmail) { Swal.fire({ icon: 'warning', title: 'To is required', text: 'Customer email is missing.', confirmButtonColor: '#16a34a' }); return; }
    if (!m.includeSalesInvoice && !m.includeSalesOrder && !m.includeDeliveryOrder) {
      Swal.fire({ icon: 'warning', title: 'Select a document', text: 'Tick at least one document to attach.', confirmButtonColor: '#16a34a' });
      return;
    }

    this.emailSending = true;
    const dto = {
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      toEmail: m.toEmail,
      toName: m.toName,
      ccEmail: m.ccEmail,
      subject: m.subject,
      bodyHtml: m.bodyHtml,
      includeSalesInvoice: m.includeSalesInvoice,
      includeSalesOrder: m.includeSalesOrder,
      includeDeliveryOrder: m.includeDeliveryOrder
    };

    this.svc.sendInvoiceEmailComposed(m.siId, dto).subscribe({
      next: () => {
        this.emailSending = false;
        this.showEmailModal = false;
        this.emailInfo = null;
        Swal.fire({ icon: 'success', title: 'Sent!', text: `Email sent to ${dto.toEmail}.`, confirmButtonColor: '#16a34a' });
      },
      error: err => {
        this.emailSending = false;
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to send email.', confirmButtonColor: '#16a34a' });
      }
    });
  }
}
