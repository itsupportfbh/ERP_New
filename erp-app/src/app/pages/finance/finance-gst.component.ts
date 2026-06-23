import { Component, OnInit } from '@angular/core';
import * as XLSX from 'xlsx';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { FinanceService, FINANCE_PAGES } from './finance.service';
import { FunctionPermission, PermissionService } from '../../shared/permission.service';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';

type GstTab = 'taxcodes' | 'returns' | 'details';

interface GstReturnModel {
  id: number;
  periodId: number;
  box6OutputTax: number;
  box7InputTax: number;
  box8NetPayable: number;
  status: string;
  glPosted?: boolean;
  filingNo?: string;
  systemSummary: {
    periodLabel: string;
    collectedOnSales: number;
    paidOnPurchases: number;
    amountDue: number;
  };
}

interface GstAdj {
  id: number;
  periodId: number;
  lineType: number;
  amount: number;
  description: string;
}

@Component({
  selector: 'erp-finance-gst',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance-gst.component.html',
  styleUrls: ['./finance-gst.component.scss']
})
export class FinanceGstComponent implements OnInit {
  activeTab: GstTab = 'taxcodes';

  // ── Tax Codes ──────────────────────────────────────────────
  taxCodes: any[] = [];
  filteredTaxCodes: any[] = [];
  showTaxForm = false;
  taxForm: any = { code: '', description: '', rate: null, type: 'GST', isActive: true };
  savingTax = false;
  editingTax: any = null;

  // ── GST F5 Returns (Unity_ERP style) ───────────────────────
  gstYears:          any[] = [];
  selectedGstYear:   number | null = null;
  gstPeriods:        any[] = [];
  selectedGstPeriod: number | null = null;
  gstModel:          GstReturnModel | null = null;
  gstLoading        = false;
  gstSaving         = false;
  isPeriodLocked    = false;
  periodName        = '';

  // Adjustments modal
  showAdjModal  = false;
  adjustments:  GstAdj[] = [];
  editAdj:      GstAdj | null = null;
  salesDocs:    any[] = [];
  supplierDocs: any[] = [];
  docsTab: 'SALES' | 'SUPPLIER' = 'SALES';

  // ── GST Details ─────────────────────────────────────────────
  gstReport:      any[] = [];
  reportFromDate  = '';
  reportToDate    = '';
  reportSummary   = { outputTax: 0, inputTax: 0, netGST: 0, totalSales: 0, totalPurchases: 0 };
  detailDocType   = '';
  detailSearch    = '';
  detailPage      = 1;
  detailPageSize  = 10;

  search  = '';
  loading = false;
  error   = '';
  message = '';

  permission: FunctionPermission | null = null;
  private readonly userId = Number(localStorage.getItem('id'));

  private taxConfig    = FINANCE_PAGES.find(p => p.key === 'tax-gst')!;
  private reportConfig = FINANCE_PAGES.find(p => p.key === 'gst-report')!;
  private readonly base = environment.apiUrl;

  constructor(
    private finance: FinanceService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private permSvc: PermissionService
  ) {}

  ngOnInit(): void {
    const path = (this.route.snapshot.routeConfig?.path || '').toLowerCase();
    if (path.includes('gst-return')) this.activeTab = 'returns';
    else if (path.includes('gst-report') || path.includes('gst-detail')) this.activeTab = 'details';

    if (this.activeTab === 'returns') this.loadGstYears();
    else if (this.activeTab === 'details') this.loadReport();
    else this.loadTaxCodes();

    this.permSvc.getFunctionPermission(this.userId, 'tax').subscribe({
      next: p => { this.permission = p; }
    });
  }

  setTab(tab: GstTab): void {
    this.activeTab = tab;
    this.error = ''; this.message = '';
    if (tab === 'taxcodes') this.loadTaxCodes();
    else if (tab === 'returns') this.loadGstYears();
    else if (tab === 'details') this.loadReport();
  }

  // ═══════════════════ TAX CODES ═══════════════════════════

  private loadTaxCodes(): void {
    this.loading = true;
    this.finance.list(this.taxConfig.endpoint).subscribe({
      next: res => {
        this.taxCodes = this.finance.unwrap(res).map(r => this.normalizeTax(r));
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.taxCodes = []; this.filteredTaxCodes = []; this.loading = false; this.error = 'Tax codes unavailable.'; }
    });
  }

  applyFilter(): void {
    const q = (this.search || '').toLowerCase();
    this.filteredTaxCodes = q
      ? this.taxCodes.filter(r => (r.code || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
      : [...this.taxCodes];
  }

  saveTax(): void {
    if (!this.taxForm.code || this.taxForm.rate === null) {
      Swal.fire('Required', 'Code and rate are required.', 'warning'); return;
    }
    this.savingTax = true;
    const payload = {
      id: this.editingTax?.id,
      taxCode: this.taxForm.code,
      taxName: this.taxForm.description || this.taxForm.code,
      taxRate: Number(this.taxForm.rate || 0),
      taxType: this.taxForm.type,
      description: this.taxForm.description,
      isActive: this.taxForm.isActive !== false
    };
    const obs = this.editingTax
      ? this.finance.update(this.taxConfig.endpoint, this.editingTax.id, payload)
      : this.finance.create(this.taxConfig.endpoint, payload);
    obs.subscribe({
      next: () => { this.savingTax = false; this.showTaxForm = false; this.editingTax = null; this.message = 'Tax code saved.'; this.loadTaxCodes(); },
      error: err => { this.savingTax = false; this.error = err?.error?.message || 'Unable to save tax code.'; }
    });
  }

  editTax(row: any): void {
    this.editingTax = row;
    this.taxForm = { code: row.code ?? row.taxCode, name: row.name ?? row.taxName, description: row.description ?? row.taxName, rate: row.rate ?? row.taxRate, type: row.type ?? row.taxType ?? 'GST', isActive: row.isActive !== false };
    this.showTaxForm = true; this.message = ''; this.error = '';
  }

  cancelTaxForm(): void {
    this.showTaxForm = false; this.editingTax = null;
    this.taxForm = { code: '', description: '', rate: null, type: 'GST', isActive: true };
  }

  deleteTax(row: any): void {
    Swal.fire({ title: 'Delete Tax Code?', text: `${row.code} – ${row.description || ''}`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#e74c3c', confirmButtonText: 'Delete' })
      .then(r => {
        if (r.isConfirmed) {
          this.finance.delete(this.taxConfig.endpoint, row.id).subscribe({
            next: () => { this.message = 'Tax code deleted.'; this.loadTaxCodes(); },
            error: err => { this.error = err?.error?.message || 'Unable to delete tax code.'; }
          });
        }
      });
  }

  private normalizeTax(row: any): any {
    return { ...row, id: row.id ?? row.iD, code: row.code ?? row.taxCode, name: row.name ?? row.taxName, description: row.description ?? row.taxName, rate: Number(row.rate ?? row.taxRate ?? 0), type: row.type ?? row.taxType ?? 'GST', isActive: row.isActive ?? true };
  }

  // ═══════════════════ GST F5 RETURNS ══════════════════════

  loadGstYears(): void {
    this.gstLoading = true;
    this.http.get<any[]>(`${this.base}/GstReturns/years`).subscribe({
      next: res => {
        this.gstYears = res || [];
        if (this.gstYears.length) {
          const today = new Date();
          const curFy = (today.getMonth() + 1) >= 4 ? today.getFullYear() : today.getFullYear() - 1;
          const found = this.gstYears.find(y => y.fyStartYear === curFy) || this.gstYears[0];
          this.selectedGstYear = found.fyStartYear;
          this.loadGstPeriods(found.fyStartYear);
        } else { this.gstLoading = false; }
      },
      error: () => { this.gstYears = []; this.gstLoading = false; }
    });
  }

  onGstYearChange(fyStartYear: number | null): void {
    if (!fyStartYear) { this.selectedGstYear = null; this.gstPeriods = []; this.selectedGstPeriod = null; this.gstModel = null; return; }
    this.selectedGstYear = fyStartYear;
    this.loadGstPeriods(fyStartYear);
  }

  private loadGstPeriods(fyStartYear: number): void {
    this.gstLoading = true; this.gstPeriods = []; this.selectedGstPeriod = null; this.gstModel = null;
    this.http.get<any[]>(`${this.base}/GstReturns/periods/${fyStartYear}`).subscribe({
      next: res => {
        this.gstPeriods = res || [];
        if (this.gstPeriods.length) {
          const today = new Date();
          const cur = this.gstPeriods.find(p => { const s = new Date(p.startDate); const e = new Date(p.endDate); return s <= today && today <= e; });
          const sel = cur || this.gstPeriods[0];
          this.selectedGstPeriod = sel.id;
          this.loadGstReturn(sel.id);
          this.checkPeriodLock(sel);
        } else { this.gstLoading = false; }
      },
      error: () => { this.gstPeriods = []; this.gstLoading = false; }
    });
  }

  onGstPeriodChange(periodId: number | null): void {
    if (!periodId) { this.selectedGstPeriod = null; this.gstModel = null; return; }
    this.selectedGstPeriod = periodId;
    this.loadGstReturn(periodId);
    const period = this.gstPeriods.find(p => p.id === periodId);
    if (period) this.checkPeriodLock(period);
  }

  private loadGstReturn(periodId: number): void {
    this.gstLoading = true; this.gstModel = null;
    this.http.get<GstReturnModel>(`${this.base}/GstReturns/return/${periodId}`).subscribe({
      next: res => { this.gstModel = res || null; this.gstLoading = false; },
      error: () => { this.gstModel = null; this.gstLoading = false; }
    });
  }

  private checkPeriodLock(period: any): void {
    if (!period?.startDate) return;
    this.http.get<any>(`${this.base}/PeriodClose/status?date=${period.startDate}`).subscribe({
      next: s => { this.isPeriodLocked = !!s?.isLocked; this.periodName = s?.periodName || ''; },
      error: () => { this.isPeriodLocked = false; this.periodName = ''; }
    });
  }

  // Status helpers
  get statusNo(): number {
    if (this.gstModel?.glPosted) return 3;
    const s = String((this.gstModel as any)?.status ?? '').trim().toUpperCase();
    if (s === 'GLPOSTED') return 3;
    if (s === 'FILED') return 2;
    if (s === 'LOCKED') return 1;
    return 0;
  }
  get isLocked():        boolean { return this.statusNo >= 1; }
  get isStatusLocked():  boolean { return this.statusNo === 1; }
  get isStatusFiled():   boolean { return this.statusNo === 2; }
  get isStatusGlPosted():boolean { return this.statusNo === 3; }
  get canShowApplyLock():boolean { return !!this.gstModel && this.statusNo === 0 && !!this.permission?.post; }

  get f5Net(): number {
    if (!this.gstModel) return 0;
    return this.round(Number(this.gstModel.box6OutputTax || 0) - Number(this.gstModel.box7InputTax || 0));
  }
  get systemAmountDue(): number { return this.round(Number(this.gstModel?.systemSummary?.amountDue || 0)); }
  get isMatched():  boolean { return this.round(this.f5Net) === this.round(this.systemAmountDue); }
  get diff():       number  { return this.round(this.f5Net - this.systemAmountDue); }

  matchWithSystem(): void {
    if (!this.gstModel || this.isLocked) return;
    const sys = this.gstModel.systemSummary;
    this.gstModel.box6OutputTax = this.round(Number(sys.collectedOnSales || 0));
    this.gstModel.box7InputTax  = this.round(Number(sys.paidOnPurchases || 0));
    this.gstModel.box8NetPayable = this.f5Net;
  }

  applyAndLock(): void {
    if (!this.gstModel || this.isLocked || !this.permission?.post) return;
    this.gstSaving = true;
    const payload = { periodId: this.gstModel.periodId, box6OutputTax: this.round(Number(this.gstModel.box6OutputTax || 0)), box7InputTax: this.round(Number(this.gstModel.box7InputTax || 0)) };
    this.http.post<GstReturnModel>(`${this.base}/GstReturns/apply-lock`, payload).subscribe({
      next: updated => { this.gstModel = updated || this.gstModel; if (this.gstModel) (this.gstModel as any).status = 'LOCKED'; this.gstSaving = false; },
      error: err => { this.gstSaving = false; Swal.fire('Error', err?.error?.message || 'Unable to lock.', 'error'); }
    });
  }

  reopenGstReturn(): void {
    if (!this.gstModel || !this.isLocked || !this.permission?.post) return;
    this.gstSaving = true;
    this.http.post<GstReturnModel>(`${this.base}/GstReturns/reopen/${this.gstModel.id}`, {}).subscribe({
      next: updated => { this.gstModel = updated || this.gstModel; if (this.gstModel) (this.gstModel as any).status = 'OPEN'; this.gstSaving = false; },
      error: err => { this.gstSaving = false; Swal.fire('Error', err?.error?.message || 'Unable to reopen.', 'error'); }
    });
  }

  markAsFiled(): void {
    if (!this.gstModel || this.statusNo !== 1 || !this.permission?.post) return;
    Swal.fire({ title: 'Confirm GST Filing', input: 'text', inputLabel: 'IRAS Submission / Acknowledgement No', inputPlaceholder: 'GST-F5-2026-Q1-0001', showCancelButton: true, confirmButtonText: 'Confirm Filed', confirmButtonColor: '#2e5f73', inputValidator: v => (!v?.trim() ? 'Submission no is required' : null) })
      .then(r => {
        if (!r.isConfirmed) return;
        this.gstSaving = true;
        this.http.post<GstReturnModel>(`${this.base}/GstReturns/mark-filed/${this.gstModel!.id}`, { filingNo: r.value }).subscribe({
          next: updated => { this.gstModel = updated || this.gstModel; if (this.gstModel) (this.gstModel as any).status = 'FILED'; this.gstSaving = false; Swal.fire('Filed', 'GST return marked as filed.', 'success'); },
          error: err => { this.gstSaving = false; Swal.fire('Error', err?.error?.message || 'Unable to mark filed.', 'error'); }
        });
      });
  }

  postToGl(): void {
    if (!this.gstModel || this.statusNo !== 2 || !this.permission?.post) return;
    Swal.fire({ title: 'Post GST to GL?', text: 'This will create a GST journal entry.', icon: 'question', showCancelButton: true, confirmButtonText: 'Yes, Post', confirmButtonColor: '#2e5f73' })
      .then(r => {
        if (!r.isConfirmed) return;
        this.gstSaving = true;
        this.http.post<GstReturnModel>(`${this.base}/GstReturns/${this.gstModel!.id}/post-to-gl`, {}).subscribe({
          next: updated => { this.gstModel = updated || this.gstModel; this.gstSaving = false; Swal.fire('Posted', 'GST return posted to GL.', 'success'); },
          error: err => { this.gstSaving = false; Swal.fire('Error', err?.error?.message || 'Unable to post to GL.', 'error'); }
        });
      });
  }

  // ── Adjustments ──────────────────────────────────────────
  openAdjustments(): void {
    if (!this.selectedGstPeriod) return;
    this.showAdjModal = true; this.adjustments = []; this.editAdj = null; this.salesDocs = []; this.supplierDocs = []; this.docsTab = 'SALES';
    this.http.get<GstAdj[]>(`${this.base}/GstReturns/adjustments/${this.selectedGstPeriod}`).subscribe({ next: res => { this.adjustments = res || []; }, error: () => {} });
    this.http.get<any[]>(`${this.base}/GstReturns/${this.selectedGstPeriod}/docs`).subscribe({
      next: docs => { const rows = docs || []; this.salesDocs = rows.filter(d => d.docType === 'SI'); this.supplierDocs = rows.filter(d => d.docType === 'PIN'); },
      error: () => {}
    });
  }

  closeAdjustments(): void {
    this.showAdjModal = false; this.editAdj = null;
    if (this.selectedGstPeriod) this.loadGstReturn(this.selectedGstPeriod);
  }

  newAdjustment(): void {
    if (!this.selectedGstPeriod || this.isLocked) return;
    this.editAdj = { id: 0, periodId: this.selectedGstPeriod, lineType: 1, amount: 0, description: '' };
  }

  editAdjustment(a: GstAdj): void {
    if (this.isLocked) return;
    this.editAdj = { ...a };
  }

  openDocument(d: any): void {
    const type = d.docType ?? (d.type === 'OUTPUT' ? 'SI' : 'PIN');
    if (type === 'SI') {
      this.showAdjModal = false;
      this.router.navigate(['/app/finance/ar-invoices']);
    } else if (type === 'PIN') {
      this.showAdjModal = false;
      this.router.navigate(['/app/finance/accounts-payable']);
    }
  }

  saveAdjustment(): void {
    if (!this.editAdj || !this.selectedGstPeriod || this.isLocked) return;
    if (!this.editAdj.amount || Number(this.editAdj.amount) <= 0) return;
    this.editAdj.periodId = this.selectedGstPeriod;
    this.editAdj.amount = this.round(Number(this.editAdj.amount));
    this.http.post<GstAdj>(`${this.base}/GstReturns/adjustments`, this.editAdj).subscribe({
      next: saved => {
        const idx = this.adjustments.findIndex(a => a.id === saved.id);
        if (idx >= 0) this.adjustments[idx] = saved; else this.adjustments.push(saved);
        this.editAdj = null;
        this.http.get<GstAdj[]>(`${this.base}/GstReturns/adjustments/${this.selectedGstPeriod}`).subscribe({ next: res => this.adjustments = res || [] });
        this.loadGstReturn(this.selectedGstPeriod!);
      },
      error: err => Swal.fire('Error', err?.error?.message || 'Unable to save adjustment.', 'error')
    });
  }

  deleteAdjustment(adj: GstAdj): void {
    if (!adj.id || this.isLocked) return;
    this.http.delete(`${this.base}/GstReturns/adjustments/${adj.id}`).subscribe({
      next: () => {
        this.adjustments = this.adjustments.filter(a => a.id !== adj.id);
        if (this.editAdj?.id === adj.id) this.editAdj = null;
        this.loadGstReturn(this.selectedGstPeriod!);
      },
      error: err => Swal.fire('Error', err?.error?.message || 'Unable to delete adjustment.', 'error')
    });
  }

  getAdjTypeText(lineType: number): string {
    switch (lineType) {
      case 1: return 'Increase Output'; case 2: return 'Decrease Output';
      case 3: return 'Increase Input';  case 4: return 'Decrease Input';
      default: return '-';
    }
  }

  exportGstExcel(): void {
    if (!this.selectedGstPeriod) return;
    this.http.get(`${this.base}/GstReturns/export-excel/${this.selectedGstPeriod}`, { responseType: 'blob' }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `GST-F5-${this.selectedGstPeriod}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      },
      error: err => Swal.fire('Error', err?.error?.message || 'Unable to export.', 'error')
    });
  }

  printGstReturn(): void { window.print(); }

  private round(v: number): number { return Math.round((Number(v) || 0) * 100) / 100; }

  // ═══════════════════ GST DETAILS ═════════════════════════

  get filteredGstReport(): any[] {
    let rows = this.gstReport;
    if (this.detailDocType) {
      rows = rows.filter(r => {
        const dt = r.docType ?? (r.type === 'OUTPUT' ? 'SI' : 'PIN');
        return dt === this.detailDocType;
      });
    }
    const q = this.detailSearch.toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        String(r.documentNo ?? r.invoiceNo ?? '').toLowerCase().includes(q) ||
        String(r.description ?? '').toLowerCase().includes(q) ||
        String(r.taxCode ?? '').toLowerCase().includes(q)
      );
    }
    return rows;
  }

  get pagedGstReport(): any[] {
    const start = (this.detailPage - 1) * this.detailPageSize;
    return this.filteredGstReport.slice(start, start + this.detailPageSize);
  }

  get totalDetailPages(): number {
    return Math.max(1, Math.ceil(this.filteredGstReport.length / this.detailPageSize));
  }

  get detailPages(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.detailPage - 2);
    const end   = Math.min(this.totalDetailPages, this.detailPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  resetDetailFilters(): void {
    this.detailDocType = ''; this.detailSearch = ''; this.detailPage = 1;
    this.reportFromDate = ''; this.reportToDate = '';
    this.setDefaultDetailDates();
    this.loadReport();
  }

  exportGstDetailsExcel(): void {
    const rows = this.filteredGstReport;
    if (!rows.length) return;
    const exportData = rows.map(r => ({
      'Date':           r.date ? new Date(r.date).toLocaleDateString('en-SG') : '',
      'Document No':    r.documentNo ?? '',
      'Description':    r.description ?? '',
      'Type':           r.type ?? '',
      'Tax Code':       r.taxCode ?? '',
      'Taxable Amount': Number(r.taxableAmount ?? r.amount ?? 0),
      'GST Amount':     Number(r.taxAmount ?? r.gstAmount ?? 0)
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GST Details');
    XLSX.writeFile(wb, `GstDetails-${new Date().toISOString().substring(0, 10)}.xlsx`);
  }

  private setDefaultDetailDates(): void {
    if (!this.reportFromDate && !this.reportToDate) {
      const today = new Date();
      const from  = new Date();
      from.setFullYear(from.getFullYear() - 1);
      this.reportFromDate = from.toISOString().substring(0, 10);
      this.reportToDate   = today.toISOString().substring(0, 10);
    }
  }

  loadReport(): void {
    if (!this.reportFromDate || !this.reportToDate) { this.setDefaultDetailDates(); }
    this.loading = true;
    this.error   = '';
    this.finance.list(this.reportConfig.endpoint, {
      startDate: this.reportFromDate,
      endDate:   this.reportToDate
    }).subscribe({
      next: res => {
        this.gstReport = this.finance.unwrap(res).map(r => this.normalizeDetail(r));
        this.calcReportSummary();
        this.loading = false;
      },
      error: err => {
        this.gstReport = [];
        this.loading   = false;
        this.error     = err?.error?.message || 'GST detail report unavailable.';
      }
    });
  }

  runReport(): void { this.detailPage = 1; this.loadReport(); }

  private calcReportSummary(): void {
    this.reportSummary.outputTax      = this.gstReport.reduce((s, r) => s + (r.type === 'OUTPUT' ? (r.taxAmount || 0) : 0), 0);
    this.reportSummary.inputTax       = this.gstReport.reduce((s, r) => s + (r.type === 'INPUT'  ? (r.taxAmount || 0) : 0), 0);
    this.reportSummary.totalSales     = this.gstReport.reduce((s, r) => s + (r.type === 'OUTPUT' ? (r.taxableAmount || 0) : 0), 0);
    this.reportSummary.totalPurchases = this.gstReport.reduce((s, r) => s + (r.type === 'INPUT'  ? (r.taxableAmount || 0) : 0), 0);
    this.reportSummary.netGST         = this.reportSummary.outputTax - this.reportSummary.inputTax;
  }

  private normalizeDetail(row: any): any {
    const source = String(row.source ?? row.Source ?? '').toUpperCase();
    const type   = source === 'OUTPUT' || source === 'INPUT' ? source
                 : String(row.type ?? row.docType ?? '').toUpperCase().includes('OUT') ? 'OUTPUT' : 'INPUT';
    const taxAmount = Number(row.gstAmount ?? row.taxAmount ?? row.TaxAmount ?? 0);
    return {
      ...row,
      date:          row.date ?? row.docDate ?? row.DocDate,
      documentNo:    row.documentNo ?? row.docNo ?? row.DocNo,
      description:   row.description ?? row.partyName ?? row.PartyName,
      type,
      taxCode:       row.taxCode ?? row.TaxCode ?? '',
      taxableAmount: Number(row.taxableAmount ?? row.TaxableAmount ?? row.amount ?? 0),
      taxAmount,
      gstAmount:     taxAmount
    };
  }

  // ── misc helpers still referenced in HTML ─────────────────
  yearLabel(y: any):   string { return String(y?.fyLabel ?? y?.label ?? y?.fyStartYear ?? y); }
  periodLabel(p: any): string { return String(p?.label ?? p?.periodName ?? p?.id ?? p); }
}
