import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

type ApprovalDocumentType = 'PR' | 'PO' | 'PIN' | 'JOURNAL' | 'SO';

export interface ApprovalActionRequest {
  documentType: ApprovalDocumentType;
  documentId: number;
  amount?: number;
  remarks?: string;
}

@Injectable({ providedIn: 'root' })
export class PurchaseService {
  private readonly api = PurchaseService.resolveApiUrl();

  constructor(private http: HttpClient) {}

  // The Mobile Receiving QR opens this app on a phone via the PC's LAN IP
  // (e.g. http://192.168.6.188:4200). In that case the configured
  // "localhost" API host would point at the phone itself, so PO lines fail
  // to load. Rewrite the API host to match whichever host the browser
  // loaded the app from. On desktop (localhost) this is a no-op.
  private static resolveApiUrl(): string {
    const configured = environment.apiUrl;
    try {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return configured.replace('localhost', host).replace('127.0.0.1', host);
      }
    } catch { /* SSR / no window — fall back to configured */ }
    return configured;
  }

  // ── Helpers ──────────────────────────────────────────
  unwrap(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }
  unwrapOne(res: any): any {
    if (Array.isArray(res)) return res[0] ?? {};
    if (Array.isArray(res?.data)) return res.data[0] ?? {};
    return res?.data ?? res ?? {};
  }

  // ── Purchase Request ─────────────────────────────────
  getPurchaseRequests(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseRequest/GetPurchaseRequest`);
  }
  getPurchaseRequestById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseRequest/GetPurchaseRequestById/${id}`);
  }
  getAvailablePurchaseRequests(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseRequest/GetAvailablePurchaseRequests`);
  }
  approvePurchaseRequest(id: number | string, amount?: number): Observable<any> {
    return this.approveDocument({ documentType: 'PR', documentId: Number(id), amount, remarks: 'PR approved from list' });
  }
  rejectPurchaseRequest(id: number | string, amount?: number): Observable<any> {
    return this.rejectDocument({ documentType: 'PR', documentId: Number(id), amount, remarks: 'PR rejected from list' });
  }
  getPurchaseRequestDrafts(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseRequestTemp/GetPurchaseRequestTemp`);
  }
  getPurchaseRequestDraftById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseRequestTemp/GetPurchaseRequestTempById/${id}`);
  }
  createPurchaseRequestDraft(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseRequestTemp/CreatePurchaseRequestTemp`, data);
  }
  updatePurchaseRequestDraft(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/PurchaseRequestTemp/UpdatePurchaseRequestTempById/${id}`, data);
  }
  deletePurchaseRequestDraft(id: number | string, userId: number | string): Observable<any> {
    return this.http.delete(`${this.api}/PurchaseRequestTemp/DeletePurchaseRequestTempById/${id}`, {
      params: { userId: String(userId) }
    });
  }
  promotePurchaseRequestDraft(id: number | string, userId: number | string): Observable<any> {
    return this.http.post(`${this.api}/PurchaseRequestTemp/PromotePurchaseRequestTempById/${id}`, null, {
      params: { userId: String(userId) }
    });
  }
  createPurchaseRequest(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseRequest/CreatePurchaseRequest`, data);
  }
  updatePurchaseRequest(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/PurchaseRequest/UpdatePurchaseRequestById/${id}`, data);
  }
  deletePurchaseRequest(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/PurchaseRequest/DeletePurchaseRequestById/${id}`);
  }
  createPrFromSalesOrder(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseRequest/CreateFromSalesOrder`, data);
  }
  createPrFromMr(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseRequest/create-from-mr-shortage`, data);
  }

  createPrFromRecipeShortage(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseRequest/create-from-recipe-shortage`, data);
  }

  // ── Purchase Order ───────────────────────────────────
  getPurchaseOrders(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseOrder/getAll`);
  }
  getPurchaseOrdersWithGRN(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseOrder/GetAllDetailswithGRN`);
  }
  getPurchaseOrderById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseOrder/get/${id}`);
  }
  getPoPdfExtra(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseOrder/GetPoPdfExtra/${id}`);
  }
  createPurchaseOrder(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseOrder/insert`, data);
  }
  updatePurchaseOrder(data: any): Observable<any> {
    return this.http.put(`${this.api}/PurchaseOrder/update`, data);
  }
  deletePurchaseOrder(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/PurchaseOrder/delete/${id}`);
  }
  getPurchaseOrderQr(poNo: string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseOrder/${poNo}/qr`);
  }
  emailSupplierPo(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/PurchaseOrder/${id}/email-supplier`, null);
  }
  updateSoProcurementByPO(poId: number, status: number): Observable<any> {
    return this.http.put(`${this.api}/PurchaseOrder/UpdateSoProcurementStatus/${poId}`, { status });
  }
  updatePurchaseOrderApprovalStatus(id: number | string, status: number): Observable<any> {
    return this.http.put(`${this.api}/PurchaseOrder/UpdateApprovalStatus/${id}`, { approvalStatus: status });
  }
  approvePurchaseOrder(id: number | string, amount?: number): Observable<any> {
    return this.approveDocument({ documentType: 'PO', documentId: Number(id), amount, remarks: 'PO approved from list' });
  }
  rejectPurchaseOrder(id: number | string, amount?: number): Observable<any> {
    return this.rejectDocument({ documentType: 'PO', documentId: Number(id), amount, remarks: 'PO rejected from list' });
  }
  getPurchaseOrderDrafts(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseOrderTemp/getAll`);
  }
  getPurchaseOrderDraftById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseOrderTemp/get/${id}`);
  }
  createPurchaseOrderDraft(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseOrderTemp/insert`, data);
  }
  updatePurchaseOrderDraft(data: any): Observable<any> {
    return this.http.put(`${this.api}/PurchaseOrderTemp/update`, data);
  }
  deletePurchaseOrderDraft(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/PurchaseOrderTemp/Delete/${id}`);
  }
  promotePurchaseOrderDraft(id: number | string, userId?: number | string): Observable<any> {
    let params = new HttpParams();
    if (userId !== undefined && userId !== null) params = params.set('userId', String(userId));
    return this.http.post(`${this.api}/PurchaseOrderTemp/promote/${id}`, null, { params });
  }
  getItemSupplierPrices(itemId: number | string): Observable<any> {
    return this.http.get(`${this.api}/Item/GetItemById/${itemId}`);
  }

  // ── RFQ / Quotation ──────────────────────────────────
  getRfqs(): Observable<any> {
    return this.http.get(`${this.api}/Rfq/GetAll`);
  }
  getRfqById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/Rfq/GetById/${id}`);
  }
  createRfq(data: any): Observable<any> {
    return this.http.post(`${this.api}/Rfq/Create`, data);
  }
  updateRfq(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/Rfq/Update/${id}`, data);
  }
  deleteRfq(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/Rfq/Delete/${id}`);
  }
  sendRfq(data: any): Observable<any> {
    return this.http.post(`${this.api}/Rfq/Send`, data);
  }

  // ── GRN ─────────────────────────────────────────────
  getGRNs(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseGoodReceipt/GetAllGRN`);
  }
  getGRNsDetails(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseGoodReceipt/GetAllGRNDetails`);
  }
  getGRNById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseGoodReceipt/getGRNbyId/${id}`);
  }
  getGRNsByPoId(poId: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseGoodReceipt/GetAllGRNByPoId?poId=${poId}`);
  }
  getAvailableGRNsForPin(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseGoodReceipt/AvailableForPinCreate`);
  }
  getAvailableGRNsForPinEdit(pinId: number | string): Observable<any> {
    return this.http.get(`${this.api}/PurchaseGoodReceipt/AvailableForPinEdit/${pinId}`);
  }
  createGRN(data: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseGoodReceipt/insertGRN`, data);
  }
  updateGRNFlagIssues(data: any): Observable<any> {
    return this.http.put(`${this.api}/PurchaseGoodReceipt/update`, data);
  }
  deleteGRN(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/PurchaseGoodReceipt/delete/${id}`);
  }
  closeGRN(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/PurchaseGoodReceipt/Close/${id}`, null);
  }
  reopenGRN(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/PurchaseGoodReceipt/Reopen/${id}`, null);
  }
  applyGrnToSo(grnId: number | string, updatedBy: number): Observable<any> {
    return this.http.post(`${this.api}/PurchaseGoodReceipt/apply-grn-to-so/${grnId}?updatedBy=${updatedBy}`, null);
  }
  applyGrnUpdateSalesOrder(req: any): Observable<any> {
    return this.http.post(`${this.api}/PurchaseGoodReceipt/apply-grn-update-salesorder`, req);
  }
  applyGrnToInventory(req: any): Observable<any> {
    return this.http.post(`${this.api}/ItemMaster/ApplyGrn`, req);
  }
  updateWarehouseAndSupplierPrice(dto: any): Observable<any> {
    return this.http.post(`${this.api}/ItemMaster/UpdateWarehouseAndSupplierPrice`, dto);
  }

  // ── Supplier Invoice (PIN) ───────────────────────────
  getSupplierInvoices(): Observable<any> {
    return this.http.get(`${this.api}/SupplierInvoicePin/GetAll`);
  }
  getSupplierInvoiceById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/SupplierInvoicePin/GetById/${id}`);
  }
  createSupplierInvoice(data: any): Observable<any> {
    return this.http.post(`${this.api}/SupplierInvoicePin/Create`, data);
  }
  updateSupplierInvoice(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/SupplierInvoicePin/Update/${id}`, data);
  }
  deleteSupplierInvoice(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/SupplierInvoicePin/Delete/${id}`);
  }
  getThreeWayMatch(pinId: number | string): Observable<any> {
    return this.http.get(`${this.api}/SupplierInvoicePin/GetThreeWayMatch/${pinId}`);
  }
  postPinToAP(pinId: number | string): Observable<any> {
    return this.http.post(`${this.api}/SupplierInvoicePin/PostToAp/${pinId}`, {});
  }
  approveSupplierInvoice(pinId: number | string, amount?: number): Observable<any> {
    return this.approveDocument({ documentType: 'PIN', documentId: Number(pinId), amount, remarks: 'PIN approved from list' });
  }
  rejectSupplierInvoice(pinId: number | string, amount?: number): Observable<any> {
    return this.rejectDocument({ documentType: 'PIN', documentId: Number(pinId), amount, remarks: 'PIN rejected from list' });
  }
  getSupplierAdvanceByGrn(grnNos: string): Observable<any> {
    return this.http.get(`${this.api}/finance/ap/supplier-advance-by-grn?grnNos=${grnNos}`);
  }

  // ── Debit Note ───────────────────────────────────────
  getDebitNotes(): Observable<any> {
    return this.http.get(`${this.api}/SupplierDebitNote/GetAll`);
  }
  getDebitNoteById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/SupplierDebitNote/GetById/${id}`);
  }
  getDebitNoteSourceByPin(pinId: number | string): Observable<any> {
    return this.http.get(`${this.api}/SupplierDebitNote/GetSourceByPin/${pinId}`);
  }
  getDebitNoteSource(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/SupplierDebitNote/GetDebitNoteSource/${id}`);
  }
  markDebitNote(pinId: number | string): Observable<any> {
    return this.http.post(`${this.api}/SupplierInvoicePin/MarkDebitNote/${pinId}`, {});
  }
  postDebitNote(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/SupplierDebitNote/MarkDebitNote/${id}`, {});
  }
  createDebitNote(data: any): Observable<any> {
    return this.http.post(`${this.api}/SupplierDebitNote/Create`, data);
  }
  updateDebitNote(id: number | string, data: any): Observable<any> {
    return this.http.put(`${this.api}/SupplierDebitNote/Update/${id}`, data);
  }
  deleteDebitNote(id: number | string): Observable<any> {
    return this.http.delete(`${this.api}/SupplierDebitNote/Delete/${id}`);
  }

  // ── Mobile Receiving ─────────────────────────────────
  // The `token` is the signed link token from the scanned QR (URL `t` param). On the
  // anonymous phone flow it is sent as X-Mr-Token so the API can resolve the tenant DB.
  // Logged-in desktop callers pass no token and rely on their JWT — both work.
  private mrHeaders(token?: string) {
    return token ? { headers: { 'X-Mr-Token': token } } : {};
  }
  getMobileReceivingPo(poNo: string, token?: string): Observable<any> {
    return this.http.get(`${this.api}/mobile-receiving/po`, { params: { poNo }, ...this.mrHeaders(token) });
  }
  validateMobileScan(poNo: string, barcode: string, qty: number, createdBy: number, token?: string): Observable<any> {
    return this.http.post(`${this.api}/mobile-receiving/scan`, { purchaseOrderNo: poNo, itemKey: barcode, qty, createdBy }, this.mrHeaders(token));
  }
  syncMobileReceiving(body: { purchaseOrderNo: string; lines: any[] }, token?: string): Observable<any> {
    return this.http.post(`${this.api}/mobile-receiving/sync`, body, this.mrHeaders(token));
  }

  // ── Supplier Scorecard ───────────────────────────────
  getScorecardReport(fromDate: string, toDate: string, supplierId?: number | string): Observable<any> {
    let url = `${this.api}/SupplierScorecard/GetReport?fromDate=${fromDate}&toDate=${toDate}`;
    if (supplierId) url += `&supplierId=${supplierId}`;
    return this.http.get(url);
  }

  // ── Current User ─────────────────────────────────────
  getCurrentUserProfile(userId: number | string): Observable<any> {
    return this.http.get(`${this.api}/User/view/${userId}`);
  }

  // ── Purchase Alerts ──────────────────────────────────
  getPurchaseAlerts(): Observable<any> {
    return this.http.get(`${this.api}/PurchaseAlert/unread`);
  }
  markAlertRead(id: number | string): Observable<any> {
    return this.http.post(`${this.api}/PurchaseAlert/${id}/read`, {});
  }
  markAllAlertsRead(): Observable<any> {
    return this.http.post(`${this.api}/PurchaseAlert/read-all`, {});
  }

  // ── Shared Lookups ───────────────────────────────────
  getSuppliers(): Observable<any> {
    return this.http.get(`${this.api}/Suppliers/getAllSupplier`);
  }
  getCountryById(id: number | string): Observable<any> {
    return this.http.get(`${this.api}/Country/get/${id}`);
  }
  getDepartments(): Observable<any> {
    return this.http.get(`${this.api}/Department/getAll`);
  }
  getItems(): Observable<any> {
    return this.http.get(`${this.api}/Item/GetItems`);
  }
  getCategories(): Observable<any> {
    return this.http.get(`${this.api}/Catagory/GetAllCatagory`);
  }
  getUOMs(): Observable<any> {
    return this.http.get(`${this.api}/Uom/GetUoms`);
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
  getPaymentTerms(): Observable<any> {
    return this.http.get(`${this.api}/PaymentTerms/GetPaymentTerms`);
  }
  getCurrencies(): Observable<any> {
    return this.http.get(`${this.api}/Currency/GetCurrencies`);
  }
  getIncoterms(): Observable<any> {
    return this.http.get(`${this.api}/Incoterms/GetAllIncoterms`);
  }
  getTaxCodes(): Observable<any> {
    return this.http.get(`${this.api}/TaxCode/getAll`);
  }
  getChartOfAccounts(): Observable<any> {
    return this.http.get(`${this.api}/ChartOfAccount/GetChartOfAccounts`);
  }
  getExchangeRate(fromCurrencyId: number, toCurrencyId: number, rateDate: string): Observable<any> {
    return this.http.get(`${this.api}/ExchangeRate/GetRate`, {
      params: { fromCurrencyId: String(fromCurrencyId), toCurrencyId: String(toCurrencyId), rateDate }
    });
  }
  getFlagIssues(): Observable<any> {
    return this.http.get(`${this.api}/FlagIssues/GetAllFlagissue`);
  }
  checkPeriodLock(date: string): Observable<any> {
    return this.http.get(`${this.api}/PeriodClose/status?date=${date}`);
  }
  checkGstLock(date: string): Observable<any> {
    return this.http.get(`${this.api}/GstLock/Check/${date}`);
  }

  // Approval workflow shared by PR, PO and PIN screens.
  submitDocument(request: ApprovalActionRequest): Observable<any> {
    return this.http.post(`${this.api}/ApprovalWorkflow/submit`, request);
  }
  approveDocument(request: ApprovalActionRequest): Observable<any> {
    return this.http.post(`${this.api}/ApprovalWorkflow/approve`, request);
  }
  rejectDocument(request: ApprovalActionRequest): Observable<any> {
    return this.http.post(`${this.api}/ApprovalWorkflow/reject`, request);
  }
  getApprovalStatus(documentType: ApprovalDocumentType, documentId: number | string): Observable<any> {
    return this.http.get(`${this.api}/ApprovalWorkflow/status/${documentType}/${documentId}`);
  }
  getPendingApprovals(documentType?: ApprovalDocumentType): Observable<any> {
    let params = new HttpParams();
    if (documentType) params = params.set('documentType', documentType);
    return this.http.get(`${this.api}/ApprovalWorkflow/pending`, { params });
  }

  // ── OCR ──────────────────────────────────────────────
  extractOcr(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('File', file);
    fd.append('Module', 'PIN');
    return this.http.post(`${this.api}/Ocr/extract-groq-multi`, fd);
  }
  getStockAlerts(companyId: number): Observable<any> {
    return this.http.get(`${this.api}/Dashboard/StockAlerts`, { params: { companyId } });
  }
}
