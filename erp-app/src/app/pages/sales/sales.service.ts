import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Helpers ──────────────────────────────────────────
  unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }
  unwrapOne(res: any): any {
    if (Array.isArray(res)) return res[0] ?? {};
    if (res?.data && !Array.isArray(res.data)) return res.data;
    if (Array.isArray(res?.data)) return res.data[0] ?? {};
    return res ?? {};
  }

  /**
   * Resolve the source Sales Order's item sets (package money) for a downstream document.
   * Uses soId directly when available, otherwise resolves the SO via the delivery order.
   */
  getSourceSoItemSets(opts: { soId?: any; doId?: any }): Observable<any[]> {
    const itemSetsOf = (r: any) => {
      const d = this.unwrapOne(r);
      return d?.itemSets ?? d?.ItemSets ?? [];
    };
    const soId = Number(opts.soId ?? 0);
    if (soId > 0) return this.getSalesOrderById(soId).pipe(map(itemSetsOf));

    const doId = Number(opts.doId ?? 0);
    if (doId > 0) {
      return this.getDeliveryOrderById(doId).pipe(
        map(r => { const h = this.unwrapOne(r); return h?.header ?? h; }),
        switchMap((h: any) => {
          const sid = Number(h?.soId ?? h?.SoId ?? 0);
          return sid > 0 ? this.getSalesOrderById(sid).pipe(map(itemSetsOf)) : of([]);
        })
      );
    }
    return of([]);
  }

  /**
   * Group a document's view lines under their package header.
   * Package child lines (items that belong to one of `itemSets`) are removed and
   * replaced by a single header row built by `headerFactory` from each set — so a
   * view shows "Executive Lunch Buffet" (with its money) instead of the zero-value child.
   * When `includeChildren` is true, each header is instead followed by its own child
   * rows (tagged `isPackageChild: true`) so a view can list the package contents —
   * e.g. "Executive Lunch Buffet" then Chicken Briyani, White Bread beneath it.
   * Returns the original lines unchanged when the document has no item sets.
   */
  groupViewLinesByPackage(
    lines: any[],
    itemSets: any[],
    headerFactory: (set: any, children: any[]) => any,
    includeChildren = false
  ): Observable<any[]> {
    const sets = (itemSets || [])
      .map((x: any) => ({ raw: x, id: Number(x.itemSetId ?? x.ItemSetId ?? x.id ?? x.Id ?? 0) }))
      .filter((s: any) => s.id > 0);
    if (!sets.length) return of(lines ?? []);

    return forkJoin(sets.map((s: any) => this.getItemSetById(s.id))).pipe(
      map((responses: any[]) => {
        // Per-set child item ids (so each header can see its own children).
        const perSetMembers: Set<number>[] = responses.map((res: any) => {
          const sdto = this.unwrapOne(res);
          const rows: any[] = sdto?.items ?? sdto?.itemSetItems ?? sdto?.lines ?? [];
          const ids = new Set<number>();
          for (const r of rows) {
            const id = Number(r.itemId ?? r.ItemId ?? 0);
            if (id) ids.add(id);
          }
          return ids;
        });
        const allMembers = new Set<number>();
        perSetMembers.forEach(s => s.forEach(id => allMembers.add(id)));

        const nonPkg = (lines ?? []).filter((l: any) => !allMembers.has(Number(l.itemId ?? l.ItemId ?? 0)));
        // Resolve the package name from the item-set definition when the document's own
        // map row doesn't carry it (only Quotation stores setName on its map).
        const grouped: any[] = [];
        sets.forEach((s: any, idx: number) => {
          const sdto = this.unwrapOne(responses[idx]);
          const name = s.raw?.setName ?? s.raw?.SetName ?? sdto?.setName ?? sdto?.SetName
            ?? sdto?.itemSetName ?? sdto?.ItemSetName ?? sdto?.name ?? sdto?.Name ?? 'Package';
          const children = (lines ?? []).filter((l: any) => perSetMembers[idx].has(Number(l.itemId ?? l.ItemId ?? 0)));
          grouped.push(headerFactory({ ...s.raw, setName: name }, children));
          if (includeChildren) grouped.push(...children.map((c: any) => ({ ...c, isPackageChild: true })));
        });
        return [...grouped, ...nonPkg];
      })
    );
  }

  // ── Quotation ────────────────────────────────────────
  getQuotations(): Observable<any> {
    return this.http.get(`${this.api}/Quotation/GetAll`);
  }
  getQuotationById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/Quotation/GetById/${id}`);
  }
  createQuotation(data: any): Observable<any> {
    return this.http.post(`${this.api}/Quotation/Create`, data);
  }
  updateQuotation(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/Quotation/Update/${id}`, data);
  }
  deleteQuotation(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/Quotation/Delete/${id}`);
  }
  /** Email the quotation PDF (rendered client-side) to the customer resolved on the server. */
  emailQuotationCustomer(id: number | string, pdf: Blob): Observable<any> {
    const fd = new FormData();
    fd.append('Pdf', pdf, `${id}.pdf`);
    return this.http.post(`${this.api}/Quotation/${id}/email-customer`, fd);
  }

  // ── Sales Order ──────────────────────────────────────
  getSalesOrders(): Observable<any> {
    return this.http.get(`${this.api}/SalesOrder/getAll`);
  }
  getSalesOrderById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/SalesOrder/get/${id}`);
  }
  getQuotationDetailsForSO(quotationId: number | string): Observable<any> {
    return this.http.get(`${this.api}/SalesOrder/GetByQuatitonDetails/${quotationId}`);
  }
  createSalesOrder(data: any): Observable<any> {
    return this.http.post(`${this.api}/SalesOrder/insert`, data);
  }
  updateSalesOrder(data: any, reallocate = true): Observable<any> {
    return this.http.put(`${this.api}/SalesOrder/update?reallocate=${reallocate}`, data);
  }
  deleteSalesOrder(id: number | string, updatedBy = 1): Observable<any> {
    return this.http.delete(`${this.api}/SalesOrder/Delete/${id}?updatedBy=${updatedBy}`);
  }
  /** Email the sales order PDF (rendered client-side) to the customer resolved on the server. */
  emailSalesOrderCustomer(id: number | string, pdf: Blob): Observable<any> {
    const fd = new FormData();
    fd.append('Pdf', pdf, `${id}.pdf`);
    return this.http.post(`${this.api}/SalesOrder/${id}/email-customer`, fd);
  }

  /** Email the delivery order PDF (rendered client-side) to the customer resolved on the server. */
  emailDeliveryOrderCustomer(id: number | string, pdf: Blob): Observable<any> {
    const fd = new FormData();
    fd.append('Pdf', pdf, `${id}.pdf`);
    return this.http.post(`${this.api}/DeliveryOrder/${id}/email-customer`, fd);
  }
  approveSalesOrder(id: number | string, approvedBy = 1): Observable<any> {
    return this.http.post(`${this.api}/SalesOrder/approve/${id}?approvedBy=${approvedBy}`, {});
  }
  rejectSalesOrder(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/SalesOrder/reject/${id}`, {});
  }
  // Procurement worklist: SO lines awaiting PP / Direct DO decision (Both items)
  getPendingFulfillment(): Observable<any> {
    return this.http.get(`${this.api}/SalesOrder/pending-fulfillment`);
  }
  resolveFulfillment(lineId: number, supplyMethodId: number, updatedBy = 1, locationId = 0): Observable<any> {
    return this.http.put(`${this.api}/SalesOrder/resolve-fulfillment`, { lineId, supplyMethodId, updatedBy, locationId });
  }
  previewAllocation(lines: { itemId: number; quantity: number }[]): Observable<any> {
    return this.http.post(`${this.api}/SalesOrder/preview-allocation`, { lines });
  }
  triggerAutoPr(salesOrderId: number, createdByUserId: number, locationId: number): Observable<any> {
    return this.http.post(
      `${this.api}/SalesOrder/${salesOrderId}/auto-pr?createdByUserId=${createdByUserId}&locationId=${locationId}`,
      {}
    );
  }
  getAvailability(locationId: number, itemId: number, supplyMethodId: number): Observable<any> {
    return this.http.get(
      `${this.api}/SalesOrder/availability?locationId=${locationId}&itemId=${itemId}&supplyMethodId=${supplyMethodId}`
    );
  }

  // ── Picking / Packing ────────────────────────────────
  getPackings(): Observable<any> {
    return this.http.get(`${this.api}/Picking/getAll`);
  }
  getPackingById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/Picking/get/${id}`);
  }
  getAvailableSalesOrdersForPicking(excludePickId?: number | string | null): Observable<any> {
    const qs = excludePickId ? `?excludePickId=${excludePickId}` : '';
    return this.http.get(`${this.api}/Picking/available-salesorders${qs}`);
  }
  createPacking(data: any): Observable<any> {
    return this.http.post(`${this.api}/Picking/insert`, data);
  }
  updatePacking(data: any): Observable<any> {
    return this.http.put(`${this.api}/Picking/update`, data);
  }
  deletePacking(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/Picking/Delete/${id}`);
  }
  // Generate barcode + QR (returns { barCode, qrText, barCodeSrcBase64, qrCodeSrcBase64 })
  generatePackingCodes(soId: number | string): Observable<any> {
    return this.http.post(`${this.api}/Picking/codes`, { soId: Number(soId) });
  }

  // ── Delivery Order ───────────────────────────────────
  getDeliveryOrders(): Observable<any> {
    return this.http.get(`${this.api}/DeliveryOrder/GetAll`);
  }
  getDeliveryOrderById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/DeliveryOrder/GetById/${id}`);
  }
  getDeliveryOrderLines(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/DeliveryOrder/GetLines/${id}`);
  }
  createDeliveryOrder(data: any): Observable<any> {
    return this.http.post(`${this.api}/DeliveryOrder/Create`, data);
  }
  updateDeliveryOrderHeader(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/DeliveryOrder/Update/${id}/Header`, data);
  }
  /** Proof of delivery captured after the goods arrive: signature drawn on screen, or the signed form. */
  confirmDelivery(id: number | string, data: any): Observable<any> {
    return this.http.post(`${this.api}/DeliveryOrder/ConfirmDelivery/${id}`, data);
  }
  deleteDeliveryOrder(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/DeliveryOrder/Delete/${id}`);
  }
  submitDeliveryOrder(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/DeliveryOrder/Submit/${id}`, {});
  }
  approveDeliveryOrder(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/DeliveryOrder/Approve/${id}`, {});
  }
  rejectDeliveryOrder(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/DeliveryOrder/Reject/${id}`, {});
  }
  postDeliveryOrder(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/DeliveryOrder/Post/${id}`, {});
  }
  // Sales orders available to deliver (reuse picking source, but exclude SOs already used in a DO/SI)
  getAvailableSalesOrdersForDelivery(): Observable<any> {
    return this.http.get(`${this.api}/Picking/available-salesorders`, { params: { forDelivery: true } });
  }

  // ── Sales Invoice ────────────────────────────────────
  getSalesInvoices(): Observable<any> {
    return this.http.get(`${this.api}/salesinvoice/List`);
  }
  /** OCR: upload a PDF/image of an invoice; backend (Groq vision) returns extracted header + lines. */
  extractInvoiceOcr(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('File', file);
    fd.append('Module', 'SI');
    return this.http.post(`${this.api}/Ocr/extract-groq-si`, fd);
  }
  getSalesInvoiceById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/salesinvoice/${id}`);
  }
  // sourceType: 1 = Sales Order, 2 = Delivery Order
  getSalesInvoiceSourceLines(sourceType: number, sourceId: number | string): Observable<any> {
    const params = new HttpParams()
      .set('sourceType', String(sourceType))
      .set('sourceId', String(sourceId));
    return this.http.get(`${this.api}/salesinvoice/SourceLines`, { params });
  }
  createSalesInvoice(data: any): Observable<any> {
    return this.http.post(`${this.api}/salesinvoice/Create`, data);
  }
  deleteSalesInvoice(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/salesinvoice/Delete/${id}`);
  }
  /** Email the sales invoice PDF (rendered client-side) to the customer resolved on the server. */
  emailSalesInvoiceCustomer(id: number | string, pdf: Blob): Observable<any> {
    const fd = new FormData();
    fd.append('Pdf', pdf, `${id}.pdf`);
    return this.http.post(`${this.api}/salesinvoice/${id}/email-customer`, fd);
  }
  updateSalesInvoiceHeader(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/salesinvoice/UpdateHeader/${id}`, data);
  }
  getAvailableSalesOrdersForInvoice(): Observable<any> {
    return this.http.get(`${this.api}/SalesInvoice/available-so`);
  }
  getAvailableDeliveryOrdersForInvoice(): Observable<any> {
    return this.http.get(`${this.api}/SalesInvoice/available-do`);
  }

  // ── Credit Note (Return / Credit) ────────────────────
  getCreditNotes(): Observable<any> {
    return this.http.get(`${this.api}/CreditNote/getAll`);
  }
  getCreditNoteById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/CreditNote/get/${id}`);
  }
  getCreditNoteDoLines(doId: number | string, excludeCnId?: number | string | null): Observable<any> {
    let params = new HttpParams();
    if (excludeCnId) params = params.set('excludeCnId', String(excludeCnId));
    return this.http.get(`${this.api}/CreditNote/dolines/${doId}`, { params });
  }
  getAvailableDeliveryOrdersForCreditNote(): Observable<any> {
    return this.http.get(`${this.api}/DeliveryOrder/available-delivery-orders`);
  }
  createCreditNote(data: any): Observable<any> {
    return this.http.post(`${this.api}/CreditNote/insert`, data);
  }
  updateCreditNote(data: any): Observable<any> {
    return this.http.put(`${this.api}/CreditNote/update`, data);
  }
  deleteCreditNote(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/CreditNote/Delete/${id}`);
  }

  // ── Shared Lookups ───────────────────────────────────
  getCustomers(): Observable<any> {
    return this.http.get(`${this.api}/CustomerMaster/GetAllCustomerMaster`);
  }
  getItems(): Observable<any> {
    return this.http.get(`${this.api}/Item/GetItems`);
  }
  getUOMs(): Observable<any> {
    return this.http.get(`${this.api}/Uom/GetUoms`);
  }
  getCurrencies(): Observable<any> {
    return this.http.get(`${this.api}/Currency/GetCurrencies`);
  }
  getTaxCodes(): Observable<any> {
    return this.http.get(`${this.api}/TaxCode/getAll`);
  }
  getChartOfAccounts(): Observable<any> {
    return this.http.get(`${this.api}/ChartOfAccount/GetChartOfAccounts`);
  }
  getReturnReasons(): Observable<any> {
    return this.http.get(`${this.api}/StockIssues/GetAllStockissue`);
  }
  getPaymentTerms(): Observable<any> {
    return this.http.get(`${this.api}/PaymentTerms/GetPaymentTerms`);
  }
  getLocations(): Observable<any> {
    return this.http.get(`${this.api}/Location/getAllLocationDetails`);
  }
  getWarehouses(): Observable<any> {
    return this.http.get(`${this.api}/Warehouse/getAll`);
  }
  getWarehouseBins(warehouseId: number | string): Observable<any> {
    return this.http.get(`${this.api}/StockAdjustment/GetBinDetailsbywarehouseID/${warehouseId}`);
  }
  getDrivers(): Observable<any> {
    return this.http.get(`${this.api}/Driver/GetAllDriver`);
  }
  getVehicles(): Observable<any> {
    return this.http.get(`${this.api}/vehicle/GetVehicles`);
  }
  getCountries(): Observable<any> {
    return this.http.get(`${this.api}/Country/getAll`);
  }

  // ── Item Sets (Packages) ─────────────────────────────
  getItemSets(): Observable<any> {
    return this.http.get(`${this.api}/ItemSet/GetAllItemSet`);
  }
  getItemSetById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/ItemSet/getItemSetById/${id}`);
  }

  // ── Quotation helpers ────────────────────────────────
  getItemFlagsBulk(itemIds: number[]): Observable<any> {
    return this.http.post(`${this.api}/Quotation/item-flags/bulk`, { itemIds });
  }
  getExchangeRate(fromCurrencyId: number | string, toCurrencyId: number | string, rateDate: string): Observable<any> {
    return this.http.get(`${this.api}/ExchangeRate/GetRate`, {
      params: { fromCurrencyId: String(fromCurrencyId), toCurrencyId: String(toCurrencyId), rateDate }
    });
  }
}
