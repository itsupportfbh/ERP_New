import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

/**
 * Purchase reporting reads the same list endpoints the purchase screens use —
 * there is no PurchaseReport API yet — and normalises them here so the shared
 * <erp-dynamic-report> renderer sees flat, consistently-named camelCase rows.
 *
 * Two things this layer has to absorb:
 *  - the API leaks PascalCase on several fields (worst on GRN and PIN), so
 *    every read goes through a fallback chain;
 *  - statuses arrive as integers and the line-level detail (counts, flagged
 *    lines, ordered vs received) only exists inside stringified JSON columns.
 *
 * Because the whole dataset is fetched and reduced in the browser, these
 * reports are only practical while purchase volumes stay modest. Moving the
 * aggregates behind a PurchaseReportController is the natural next step.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseReportsService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** unwrap { isSuccess, data } | { data } | array */
  unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  /** Matches the sales reports contract; these endpoints do not send meta yet. */
  unwrapMeta(res: any): { allowedFields?: string[]; branchLock?: string | null } | null {
    return res?.meta ?? res?.Meta ?? null;
  }

  // ================== shared helpers ==================

  private num(v: any): number {
    if (v == null || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  }

  /** The JSON line columns are strings on the wire but occasionally arrive parsed. */
  private lines(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** PR / PO approval status integers. A string status is already a label. */
  private approvalLabel(v: any): string {
    if (typeof v === 'string' && isNaN(Number(v))) return v;
    switch (Number(v ?? 0)) {
      case 1: return 'Pending Approval';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      default: return 'Draft';
    }
  }

  /** PIN adds a posted state on top of the approval ladder. */
  private invoiceLabel(v: any): string {
    if (typeof v === 'string' && isNaN(Number(v))) return v;
    switch (Number(v ?? 0)) {
      case 1: return 'Pending Approval';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      case 4: return 'Posted to A/P';
      default: return 'Draft';
    }
  }

  private debitNoteLabel(v: any): string {
    if (typeof v === 'string' && isNaN(Number(v))) return v;
    switch (Number(v ?? 0)) {
      case 1: return 'Pending Approval';
      case 2:
      case 3:
      case 4: return 'Posted';
      default: return 'Draft';
    }
  }

  private daysSince(value: any): number {
    if (!value) return 0;
    const then = new Date(value).getTime();
    if (isNaN(then)) return 0;
    return Math.max(0, Math.floor((Date.now() - then) / 86400000));
  }

  /** First of the month, so period rows still respond to the date-range filter. */
  private monthStart(value: any): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  // ================== row normalisers ==================

  private mapPr = (r: any): any => {
    const lines = this.lines(r.pRLines ?? r.prLines ?? r.PRLines);
    const prDate = r.createdDate ?? null;
    return {
      ...r,
      prNo: r.purchaseRequestNo ?? r.pRNo ?? '',
      prDate,
      deliveryDate: r.deliveryDate ?? null,
      requester: r.requester ?? r.requestedByName ?? r.createdByName ?? '',
      department: r.departmentName ?? '',
      description: r.description ?? '',
      lineCount: lines.length,
      totalQty: lines.reduce((s, l) => s + this.num(l.qty ?? l.quantity), 0),
      netTotal: this.num(r.netTotal ?? r.totalAmount ?? r.amount),
      ageDays: this.daysSince(prDate),
      status: this.approvalLabel(r.approvalStatus ?? r.status)
    };
  };

  private mapPo = (r: any): any => {
    const lines = this.lines(r.poLines ?? r.PoLines ?? r.POLines);
    const received = this.lines(r.receivedJson);

    const orderedQty = lines.reduce((s, l) => s + this.num(l.quantity ?? l.qty), 0);
    const receivedQty = received.reduce((s, l) => s + this.num(l.ReceivedQty ?? l.receivedQty), 0);
    const receivedPct = orderedQty ? Math.min(100, (receivedQty / orderedQty) * 100) : 0;
    const netTotal = this.num(r.netTotal ?? r.NetTotal);

    return {
      ...r,
      poNo: r.purchaseOrderNo ?? r.pO_No ?? '',
      poDate: r.poDate ?? null,
      deliveryDate: r.deliveryDate ?? null,
      supplierName: r.supplierName ?? '',
      location: r.location ?? r.Location ?? '',
      currency: r.currency ?? r.currencyName ?? '',
      purchaseRequestNo: r.purchaseRequestNo ?? '',
      lineCount: lines.length,
      orderedQty,
      receivedQty,
      receivedPct,
      netTotal,
      subTotal: this.num(r.subTotal ?? r.SubTotal),
      tax: this.num(r.tax ?? r.Tax),
      outstandingValue: netTotal * (1 - receivedPct / 100),
      isOverdue: !!r.deliveryDate && new Date(r.deliveryDate).getTime() < Date.now() && receivedPct < 100,
      purchaseType: r.isOverseas ? 'Overseas' : 'Local',
      status: this.approvalLabel(r.approvalStatus ?? r.status)
    };
  };

  private mapGrn = (r: any): any => {
    const lines = this.lines(r.gRNJson ?? r.GRNJson ?? r.grnJson ?? r.GrnJson);
    const flagged = lines.filter(l => l.isFlagIssue).length;
    const posted = lines.filter(l => l.isPostInventory).length;

    const orderedQty = this.num(r.orderedQty);
    const receivedQty = this.num(r.receivedQty);
    const variance = receivedQty - orderedQty;

    // No QC module on GRN — the flag-issue lines are the closest equivalent.
    const qcResult = !lines.length ? 'Not Checked'
      : flagged === 0 ? 'Passed'
      : flagged === lines.length ? 'Failed'
      : 'Partial';

    const closed = !!(r.isClosed ?? r.IsClosed);

    return {
      ...r,
      grnNo: r.grnNo ?? r.GrnNo ?? '',
      receptionDate: r.receptionDate ?? r.ReceptionDate ?? null,
      supplierName: r.supplierName ?? r.SupplierName ?? '',
      poNo: r.purchaseOrderNo ?? (r.poid ?? r.POID ?? ''),
      invoiceNo: r.invoiceNo ?? '',
      currency: r.currency ?? r.currencyName ?? '',
      lineCount: lines.length,
      flaggedLines: flagged,
      postedLines: posted,
      qcResult,
      orderedQty,
      receivedQty,
      pendingQty: this.num(r.pendingQty),
      invoicedQty: this.num(r.invoicedQty),
      remainingToInvoice: this.num(r.remainingToInvoice),
      variance,
      variancePct: orderedQty ? (variance / orderedQty) * 100 : 0,
      status: closed ? 'Closed' : (flagged ? 'Flagged' : (posted ? 'Posted' : 'Open'))
    };
  };

  private mapPin = (r: any): any => {
    const amount = this.num(r.amount ?? r.netTotal ?? r.totalAmount);
    const tax = this.num(r.tax);
    const status = this.invoiceLabel(r.status ?? r.statusId ?? r.approvalStatus);
    const posted = status === 'Posted to A/P' || !!(r.isPostedToAp || r.postedToAp || r.apPosted);

    return {
      ...r,
      invoiceNo: r.invoiceNo ?? r.pinNo ?? '',
      supplierInvoiceNo: r.supplierInvoiceNo ?? r.vendorInvoiceNo ?? r.grnInvoiceNos ?? r.invoiceNos ?? '',
      invoiceDate: r.invoiceDate ?? null,
      supplierName: r.supplierName ?? '',
      grnNos: r.grnNos ?? r.grnNo ?? '',
      currency: r.currency ?? r.currencyName ?? '',
      amount,
      tax,
      totalAmount: amount + tax,
      baseAmount: this.num(r.baseAmount) || amount * (this.num(r.fxRate ?? r.FxRate) || 1),
      matchStatus: r.matchStatus ?? 'Unknown',
      purchaseType: (r.isOverseas ?? r.IsOverseas) ? 'Overseas' : 'Local',
      linkType: r.listStatusLabel ?? r.ListStatusLabel ?? '',
      isPostedToAp: posted,
      status
    };
  };

  private mapDn = (r: any): any => ({
    ...r,
    debitNoteNo: r.debitNoteNo ?? r.DebitNoteNo ?? '',
    noteDate: r.noteDate ?? null,
    supplierName: r.name ?? r.supplierName ?? '',
    reason: r.reason ?? '',
    referenceNo: r.referenceNo ?? '',
    currency: r.currency ?? r.currencyName ?? '',
    amount: this.num(r.amount),
    amountBase: this.num(r.amountBase),
    status: this.debitNoteLabel(r.status)
  });

  // ================== detail feeds ==================

  getPurchaseRequests(): Observable<any[]> {
    return this.http.get(`${this.api}/PurchaseRequest/GetPurchaseRequest`)
      .pipe(map(res => this.unwrap(res).map(this.mapPr)));
  }

  getPendingPurchaseRequests(): Observable<any[]> {
    return this.getPurchaseRequests()
      .pipe(map(rows => rows.filter(r => r.status === 'Pending Approval')));
  }

  getPurchaseOrders(): Observable<any[]> {
    return this.http.get(`${this.api}/PurchaseOrder/getAll`)
      .pipe(map(res => this.unwrap(res).map(this.mapPo)));
  }

  /** Approved orders still short of a full receipt. */
  getOpenPurchaseOrders(): Observable<any[]> {
    return this.getPurchaseOrders()
      .pipe(map(rows => rows.filter(r => r.status === 'Approved' && r.receivedPct < 100)));
  }

  getGrns(): Observable<any[]> {
    return this.http.get(`${this.api}/PurchaseGoodReceipt/GetAllGRN`)
      .pipe(map(res => this.unwrap(res).map(this.mapGrn)));
  }

  getGrnExceptions(): Observable<any[]> {
    return this.getGrns().pipe(map(rows => rows.filter(r => r.qcResult !== 'Passed' && r.lineCount > 0)));
  }

  getGrnVariances(): Observable<any[]> {
    return this.getGrns().pipe(map(rows => rows.filter(r => r.variance !== 0)));
  }

  getSupplierInvoices(): Observable<any[]> {
    return this.http.get(`${this.api}/SupplierInvoicePin/GetAll`)
      .pipe(map(res => this.unwrap(res).map(this.mapPin)));
  }

  getMatchExceptions(): Observable<any[]> {
    return this.getSupplierInvoices()
      .pipe(map(rows => rows.filter(r => String(r.matchStatus).toUpperCase() !== 'OK')));
  }

  getOutstandingPayables(): Observable<any[]> {
    return this.getSupplierInvoices().pipe(map(rows => rows.filter(r => !r.isPostedToAp)));
  }

  getDebitNotes(): Observable<any[]> {
    return this.http.get(`${this.api}/SupplierDebitNote/GetAll`)
      .pipe(map(res => this.unwrap(res).map(this.mapDn)));
  }

  // ================== aggregates ==================

  /** Scorecard rows are already flat; the API owns the scoring and date window. */
  getSupplierScorecard(): Observable<any[]> {
    const to = new Date();
    const from = new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return this.http
      .get(`${this.api}/SupplierScorecard/GetReport?fromDate=${ymd(from)}&toDate=${ymd(to)}`)
      .pipe(map(res => this.unwrap(res).map(r => ({
        ...r,
        supplierName: r.supplierName ?? r.SupplierName ?? '',
        poCount: this.num(r.poCount ?? r.PoCount),
        grnCount: this.num(r.grnCount ?? r.GrnCount),
        poValueBase: this.num(r.poValueBase),
        orderedQty: this.num(r.orderedQty),
        receivedQty: this.num(r.receivedQty),
        pendingQty: this.num(r.pendingQty),
        fulfillmentPct: this.num(r.fulfillmentPct),
        invoiceCount: this.num(r.invoiceCount),
        invoiceValueBase: this.num(r.invoiceValueBase),
        paidValueBase: this.num(r.paidValueBase),
        outstandingValueBase: this.num(r.outstandingValueBase),
        paymentPct: this.num(r.paymentPct),
        overallScore: this.num(r.overallScore),
        rating: r.rating ?? 'D',
        purchaseType: r.purchaseType ?? 'Local'
      }))));
  }

  /** PO value bucketed by month; `periodDate` keeps the date filter meaningful. */
  getMonthlySpend(): Observable<any[]> {
    return this.getPurchaseOrders().pipe(map(rows => {
      const buckets = new Map<string, any>();
      for (const r of rows) {
        const periodDate = this.monthStart(r.poDate);
        if (!periodDate) continue;
        const period = periodDate.slice(0, 7);
        const b = buckets.get(period) ?? { period, periodDate, orders: 0, netTotal: 0, tax: 0, receivedValue: 0 };
        b.orders += 1;
        b.netTotal += r.netTotal;
        b.tax += r.tax;
        b.receivedValue += r.netTotal * (r.receivedPct / 100);
        buckets.set(period, b);
      }
      return Array.from(buckets.values())
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(b => ({ ...b, outstandingValue: b.netTotal - b.receivedValue }));
    }));
  }

  /** Document counts across PR -> PO -> GRN -> Invoice -> Debit Note. */
  getProcureToPayCycle(): Observable<any[]> {
    return forkJoin({
      prs: this.getPurchaseRequests(),
      pos: this.getPurchaseOrders(),
      grns: this.getGrns(),
      invs: this.getSupplierInvoices(),
      dns: this.getDebitNotes()
    }).pipe(map(({ prs, pos, grns, invs, dns }) => {
      const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
      return [
        { stage: '1. Purchase Requests', documents: prs.length, conversionPct: 100, note: 'Raised in period' },
        { stage: '2. Purchase Orders', documents: pos.length, conversionPct: pct(pos.length, prs.length), note: 'Issued to suppliers' },
        { stage: '3. Goods Receipts', documents: grns.length, conversionPct: pct(grns.length, pos.length), note: 'Deliveries received' },
        { stage: '4. Supplier Invoices', documents: invs.length, conversionPct: pct(invs.length, grns.length), note: 'Invoices captured' },
        { stage: '5. Debit Notes', documents: dns.length, conversionPct: pct(dns.length, invs.length), note: 'Variances claimed back' }
      ];
    }));
  }
}
