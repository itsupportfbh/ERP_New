import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';
import { PermissionService } from '../../../core/services/permission.service';
import { EmailComposeService } from '../../../core/services/email-compose.service';
import { EmailComposeModel, EmailComposeAttachment } from '../../../core/components/email-compose/email-compose.component';
import { CURRENT_PERIOD_LOCKED_KEY } from '../../../core/services/period-lock-state.service';
import Swal from 'sweetalert2';

const STATUS_MAP: Record<number, string> = { 0: 'Draft', 1: 'Pending', 2: 'Approved', 3: 'Rejected' };

@Component({
  selector: 'erp-purchase-order-list',
  standalone: false,
  templateUrl: './purchase-order-list.component.html',
  styleUrls: ['./purchase-order-list.component.scss']
})
export class PurchaseOrderListComponent implements OnInit {
  readonly fnId = 'po-list';
  loading = false;
  rows: any[] = [];
  filtered: any[] = [];
  search = '';

  // Pending-PR alerts (same logic as Unity ERP)
  pendingPrList: any[] = [];
  pendingPrCount = 0;
  showAlerts = false;
  alertsLoading = false;

  // Low stock alerts
  lowStockAlerts: any[] = [];
  lowStockCount = 0;
  showLowStockPanel = false;
  lowStockLoading = false;

  // Approvals panel
  showApprovals = false;

  drafts: any[] = [];
  showDrafts = false;
  draftsLoading = false;

  // Approval confirm modal
  showConfirm = false;
  confirmRow: any = null;
  confirmStatus: 2 | 3 = 2;
  confirmLoading = false;
  confirmError = '';

  // Action confirm modal (email / delete / draft actions)
  showActionConfirm = false;
  actionRow: any = null;
  actionType = '';
  actionLoading = false;
  actionError = '';

  // Success toast
  toastMsg = '';
  toastColor = '#16a34a';
  private toastTimer: any;
  showToast(msg: string, color = '#16a34a'): void {
    clearTimeout(this.toastTimer);
    this.toastMsg = msg; this.toastColor = color;
    this.toastTimer = setTimeout(() => { this.toastMsg = ''; }, 3500);
  }

  // QR code modal
  showQrModal = false;
  qrPoNo = '';
  qrSrc = '';
  qrPayloadUrl = '';
  qrLoading = false;

  // Lines detail modal
  showLinesModal = false;
  modalRow: any = null;
  modalLines: any[] = [];
  modalPoNo = '';
  modalSupplier = '';
  modalStatus = '';
  modalNetTotal: number | null = null;
  modalCurrency = '';
  modalFxRate = 1;
  baseCurrencyName = (localStorage.getItem('companyCurrencyName') || '').trim();

  /** The PO is billed in a currency other than the company's base currency. */
  get modalIsForeign(): boolean {
    const cur = (this.modalCurrency || '').trim().toLowerCase();
    return !!cur && !!this.baseCurrencyName && cur !== this.baseCurrencyName.toLowerCase();
  }
  get modalBaseTotal(): number { return +((this.modalNetTotal ?? 0) * (this.modalFxRate || 1)).toFixed(2); }

  // ── PO line maths ────────────────────────────────────
  // PoLines is stored JSON, so the keys vary by vintage (qty/quantity, taxAmt, lineTotal).
  // Prefer the stored value and only fall back to recomputing it from qty/price/disc/tax.
  lineQty(l: any): number { return Number(l?.quantity ?? l?.qty ?? 0) || 0; }
  lineGross(l: any): number { return +(this.lineQty(l) * (Number(l?.unitPrice ?? 0) || 0)).toFixed(2); }
  lineDiscAmt(l: any): number {
    const pct = Number(l?.discountPct ?? 0) || 0;
    return +(this.lineGross(l) * (pct / 100)).toFixed(2);
  }
  lineNet(l: any): number { return +(this.lineGross(l) - this.lineDiscAmt(l)).toFixed(2); }
  lineTax(l: any): number {
    const stored = Number(l?.taxAmt ?? l?.taxAmount ?? NaN);
    if (!isNaN(stored)) return +stored.toFixed(2);
    return +(this.lineNet(l) * ((Number(l?.taxRate ?? 0) || 0) / 100)).toFixed(2);
  }
  lineTotal(l: any): number {
    const stored = Number(l?.lineTotal ?? NaN);
    if (!isNaN(stored) && stored > 0) return +stored.toFixed(2);
    return +(this.lineNet(l) + this.lineTax(l)).toFixed(2);
  }
  lineBase(l: any): number { return +(this.lineTotal(l) * (this.modalFxRate || 1)).toFixed(2); }

  private sum(fn: (l: any) => number): number {
    return +(this.modalLines ?? []).reduce((s, l) => s + fn(l), 0).toFixed(2);
  }
  get modalSubTotal(): number { return this.sum(l => this.lineGross(l)); }
  get modalDiscTotal(): number { return this.sum(l => this.lineDiscAmt(l)); }
  get modalTaxTotal(): number { return this.sum(l => this.lineTax(l)); }
  get modalLinesTotal(): number { return this.sum(l => this.lineTotal(l)); }
  get modalLinesBaseTotal(): number { return +(this.modalLinesTotal * (this.modalFxRate || 1)).toFixed(2); }

  columns: TableColumn[] = [
    { key: 'purchaseOrderNo', header: 'PO No', sortable: true },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'poDate', header: 'PO Date', sortable: true, type: 'date' },
    { key: 'deliveryDate', header: 'Delivery Date', sortable: true, type: 'date' },
    { key: 'currencyName', header: 'Currency' },
    { key: 'netTotal', header: 'Net Total', type: 'money', align: 'right', currencyKey: 'currency', fxRateKey: 'fxRate' },
    {
      key: 'statusLabel',
      header: 'Status',
      type: 'badge',
      badgeMap: { Pending: 'warning', Approved: 'success', Rejected: 'danger', Draft: 'default' }
    },
  ];

  rowActions: RowAction[] = [
    { key: 'qr',    label: 'QR Code',        btnClass: 'default', icon: 'qr'    },
    { key: 'email',  label: 'Email Supplier', btnClass: 'default', icon: 'email'  },
    { key: 'print',  label: 'Print',          btnClass: 'default', icon: 'print'  },
    { key: 'edit',   label: 'Edit',           btnClass: 'default', icon: 'edit'   },
    { key: 'delete', label: 'Delete',         btnClass: 'danger',  icon: 'delete' },
  ];

  poActionFilter = (action: string, row: any): boolean => {
    if (this.isCurrentPeriodLocked && (action === 'edit' || action === 'delete')) {
      return action === 'edit' ? this.perm.canEdit(this.fnId) : this.perm.canDelete(this.fnId);
    }
    const s = this.poStatusNum(row);
    switch (action) {
      case 'email':  return this.perm.canPrint(this.fnId);
      case 'print':  return this.perm.canPrint(this.fnId);
      case 'edit':   return s !== 2 && s !== 3 && this.perm.canEdit(this.fnId);
      case 'delete': return s !== 2 && s !== 3 && this.perm.canDelete(this.fnId);
      default:       return true;
    }
  };

  poActionDisabled = (action: string, _row: any): boolean =>
    this.isCurrentPeriodLocked && (action === 'edit' || action === 'delete');

  private poStatusNum(row: any): number {
    const v = row.approvalStatus ?? row.status;
    if (typeof v === 'number') return v;
    const label = (row.statusLabel ?? String(v ?? '')).toLowerCase();
    if (label === 'approved') return 2;
    if (label === 'rejected') return 3;
    if (label === 'draft')    return 0;
    return 1;
  }

  constructor(private svc: PurchaseService, private router: Router, public perm: PermissionService, private emailSvc: EmailComposeService) {}

  ngOnInit(): void {
    this.load();
    this.loadPendingPrCount();
    this.loadDrafts();
    this.loadLowStockAlerts();
  }

  load(): void {
    this.loading = true;
    this.svc.getPurchaseOrders().subscribe({
      next: res => {
        this.rows = this.svc.unwrap(res).map((r: any) => ({
          ...r,
          id: r.id ?? r.iD,
          purchaseOrderNo: r.purchaseOrderNo ?? r.pO_No,
          currency: r.currency ?? r.currencyName ?? '',
          currencyId: r.currencyId ?? 0,
          fxRate: Number(r.fxRate ?? 1) || 1,
          statusLabel: STATUS_MAP[r.approvalStatus ?? r.status] ?? r.status ?? 'Pending',
        }));
        this.applyFilter();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // Unity ERP approach: compute pending PRs that have no PO yet
  loadPendingPrCount(): void {
    this.alertsLoading = true;
    forkJoin({
      prs: this.svc.getPurchaseRequests(),
      pos: this.svc.getPurchaseOrders()
    }).subscribe({
      next: (res: any) => {
        const prs: any[] = this.svc.unwrap(res.prs);
        const pos: any[] = this.svc.unwrap(res.pos);

        // collect all PR numbers already referenced in any PO's lines
        const usedPrNos = new Set<string>();
        pos.forEach((po: any) => {
          let lines: any[] = [];
          try { lines = Array.isArray(po.poLines) ? po.poLines : JSON.parse(po.poLines || '[]'); } catch {}
          lines.forEach((ln: any) => {
            const prNo = (ln?.prNo ?? ln?.PRNo ?? '').toString().trim();
            if (prNo) usedPrNos.add(prNo);
          });
        });

        // pending (status=1) PRs not yet converted to a PO
        this.pendingPrList = prs.filter((pr: any) => {
          const status = Number(pr.status ?? pr.approvalStatus ?? 0);
          const prNo = (pr.purchaseRequestNo ?? '').toString().trim();
          return status === 1 && !usedPrNos.has(prNo);
        });

        this.pendingPrCount = this.pendingPrList.length;
        this.alertsLoading = false;
      },
      error: () => { this.alertsLoading = false; }
    });
  }

  createPoFromPr(pr: any): void {
    if (this.isCurrentPeriodLocked) return;
    if (!this.perm.canCreate(this.fnId)) return;
    this.showAlerts = false;
    this.router.navigate(['/app/purchase/orders/new'], { queryParams: { fromPR: pr.id ?? pr.iD } });
  }

  loadDrafts(): void {
    this.draftsLoading = true;
    this.svc.getPurchaseOrderDrafts().subscribe({
      next: res => { this.drafts = this.svc.unwrap(res); this.draftsLoading = false; },
      error: () => { this.drafts = []; this.draftsLoading = false; }
    });
  }

  loadLowStockAlerts(): void {
    this.lowStockLoading = true;
    const companyId = Number(localStorage.getItem('companyId')) || 0;
    this.svc.getStockAlerts(companyId).subscribe({
      next: res => {
        this.lowStockAlerts = this.svc.unwrap(res);
        this.lowStockCount = this.lowStockAlerts.length;
        this.lowStockLoading = false;
      },
      error: () => { this.lowStockAlerts = []; this.lowStockCount = 0; this.lowStockLoading = false; }
    });
  }

  goToStockReorder(): void {
    this.showLowStockPanel = false;
    this.router.navigate(['/app/inventory/create-stockreorderplanning']);
  }

  openDraft(draft: any): void {
    if (this.isCurrentPeriodLocked) return;
    if (!this.perm.canCreate(this.fnId)) return;
    const id = draft.id ?? draft.iD;
    this.router.navigate(['/app/purchase/orders/new'], { queryParams: { draftId: id } });
  }

  promoteDraft(draft: any, e: Event): void {
    e.stopPropagation();
    if (this.isCurrentPeriodLocked) return;
    if (!this.perm.canCreate(this.fnId)) return;
    this.openActionConfirm(draft, 'promote-draft');
  }

  deleteDraft(draft: any, e: Event): void {
    e.stopPropagation();
    if (this.isCurrentPeriodLocked) return;
    if (!this.perm.canCreate(this.fnId)) return;
    this.openActionConfirm(draft, 'delete-draft');
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q
      ? this.rows.filter(r =>
          (r.purchaseOrderNo ?? '').toLowerCase().includes(q) ||
          (r.supplierName ?? '').toLowerCase().includes(q) ||
          (r.statusLabel ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  create(): void { this.router.navigate(['/app/purchase/orders/new']); }

  onRowClick(row: any): void {
    this.openLinesModal(row);
  }

  openLinesModal(row: any): void {
    const raw = row?.poLines ?? row?.PoLines ?? row?.POLines ?? '[]';
    const lines: any[] = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
    this.modalRow = row;
    this.modalLines = lines;
    this.modalPoNo = row.purchaseOrderNo ?? '';
    this.modalSupplier = row.supplierName ?? '';
    this.modalStatus = row.statusLabel ?? '';
    this.modalNetTotal = row.netTotal ?? null;
    // PO amounts are held in the supplier's currency (e.g. SGD). Without this the modal fell
    // back to the base symbol and rendered SGD figures as "RM 654.00".
    this.modalCurrency = row.currency ?? row.currencyName ?? '';
    this.modalFxRate = Number(row.fxRate ?? 1) || 1;
    if (!lines.length) {
      this.svc.getPurchaseOrderById(row.id).subscribe({
        next: res => {
          const d = this.svc.unwrapOne(res);
          const r2 = d.poLines ?? d.PoLines ?? '[]';
          this.modalLines = Array.isArray(r2) ? r2 : (() => { try { return JSON.parse(r2 || '[]'); } catch { return []; } })();
        }
      });
    }
    this.showLinesModal = true;
  }

  closeLinesModal(): void { this.showLinesModal = false; this.modalRow = null; }

  approveFromModal(status: 2 | 3): void {
    const row = this.modalRow;
    this.closeLinesModal();
    if (row) this.openConfirm(row, status);
  }

  onAction(e: { action: string; row: any }): void {
    if (this.isCurrentPeriodLocked && (e.action === 'edit' || e.action === 'delete')) return;
    if (e.action === 'view')    this.openLinesModal(e.row);
    if (e.action === 'edit')    this.router.navigate(['/app/purchase/orders', e.row.id]);
    if (e.action === 'approve') this.approveReject(e.row, 2);
    if (e.action === 'reject')  this.approveReject(e.row, 3);
    if (e.action === 'qr')      this.showQr(e.row);
    if (e.action === 'email')   this.emailSupplier(e.row);
    if (e.action === 'print')   this.printPo(e.row);
    if (e.action === 'delete')  this.delete(e.row);
  }

  showQr(row: any): void {
    const poNo = row.purchaseOrderNo ?? row.pO_No ?? '';
    this.qrPoNo = poNo;
    this.qrSrc = '';
    this.qrPayloadUrl = '';
    this.qrLoading = true;
    this.showQrModal = true;
    this.svc.getPurchaseOrderQr(poNo).subscribe({
      next: (res: any) => {
        this.qrSrc = res?.qrCodeSrcBase64 ?? res?.QrCodeSrcBase64 ?? '';
        this.qrPayloadUrl = res?.qrPayloadUrl ?? res?.QrPayloadUrl ?? '';
        this.qrLoading = false;
      },
      error: () => { this.qrLoading = false; }
    });
  }

  downloadQr(): void {
    if (!this.qrSrc) return;
    const a = document.createElement('a');
    a.href = this.qrSrc;
    a.download = `${this.qrPoNo}-QR.png`;
    a.click();
  }

  shareQrWhatsApp(): void {
    // Office staff scan the QR on the same network, so send the QR IMAGE itself, not a text link.
    // The Web Share API attaches the actual PNG to whichever app the user picks (WhatsApp included),
    // which is the only browser-side way to hand a real image to WhatsApp. The data URL is turned
    // into a File synchronously so the call stays inside the button's user-gesture (an intervening
    // await would make the browser reject share()).
    if (this.qrSrc) {
      try {
        const file = this.dataUrlToFile(this.qrSrc, `${this.qrPoNo}-QR.png`);
        const shareData: any = {
          files: [file],
          title: `Purchase Order ${this.qrPoNo}`,
          text: `Purchase Order ${this.qrPoNo} - Mobile Receiving`
        };
        const nav: any = navigator;
        if (nav.canShare && nav.canShare(shareData)) {
          nav.share(shareData).catch(() => {});
          return;
        }
      } catch { /* fall through to the link */ }
    }

    // Fallback: plain HTTP (a LAN IP, not https) blocks the file-share API, and no browser can
    // attach an image to WhatsApp automatically there. The user still wants the QR — not a link —
    // so download the QR image and open WhatsApp, then tell them to attach the file that was just
    // saved. It is one action short of automatic, but what leaves is the QR, never a text link.
    if (this.qrSrc) this.downloadQr();
    window.open('https://wa.me/', 'erpWhatsAppShare');
    Swal.fire({
      icon: 'info',
      title: 'QR ready to attach',
      html: `The QR image <b>${this.qrPoNo}-QR.png</b> was downloaded.<br>In the WhatsApp chat, tap 📎 (attach) and pick that file to send the QR.`,
      confirmButtonColor: '#2e5f73'
    });
  }

  /** Turn a base64 data URL into a File without fetch(), so it stays inside the click gesture. */
  private dataUrlToFile(dataUrl: string, filename: string): File {
    const [meta, b64] = dataUrl.split(',');
    const mime = /:(.*?);/.exec(meta)?.[1] || 'image/png';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  }

  printPo(row: any): void {
    if (!this.perm.canPrint(this.fnId)) return;
    const poNo = row.purchaseOrderNo ?? row.pO_No ?? '';
    this.svc.getPurchaseOrderById(row.id).subscribe({
      next: res => {
        const po = this.svc.unwrapOne(res);
        let lines: any[] = [];
        try { lines = Array.isArray(po.poLines) ? po.poLines : JSON.parse(po.poLines || '[]'); } catch { lines = []; }

        // Fetch QR code then open print window
        this.svc.getPurchaseOrderQr(poNo).subscribe({
          next: (qrRes: any) => {
            const qrSrc: string = qrRes?.qrCodeSrcBase64 ?? qrRes?.QrCodeSrcBase64 ?? '';
            const html = this.buildPoPrintHtml(po, lines, row, qrSrc);
            this.openPrintWindow(html);
          },
          error: () => {
            const html = this.buildPoPrintHtml(po, lines, row, '');
            this.openPrintWindow(html);
          }
        });
      },
      error: () => {}
    });
  }

  private openPrintWindow(html: string): void {
    const w = window.open('', '_blank', 'width=1050,height=800');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 700);
  }

  private buildPoPrintHtml(po: any, lines: any[], row?: any, qrSrc = ''): string {
    const fmt = (d: any) => {
      if (!d) return '—';
      try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; }
      catch { return '—'; }
    };
    const esc = (s: any) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const n2 = (v: any) => Number(v || 0).toFixed(2);

    const poNo      = esc(po.purchaseOrderNo ?? po.pO_No ?? row?.purchaseOrderNo ?? '');
    const supplier  = esc(po.supplierName ?? row?.supplierName ?? '—');
    const poDate    = fmt(po.poDate);
    const delDate   = fmt(po.deliveryDate);
    const currency  = esc(po.currencyName ?? row?.currencyName ?? 'INR');
    const location  = esc(po.location ?? po.Location ?? '');
    const contact   = esc(po.contactNumber ?? '');
    const remarks   = esc(po.remarks ?? '');
    const netTotal  = Number(po.netTotal ?? po.NetTotal ?? 0);
    const subTotal  = Number(po.subTotal ?? po.SubTotal ?? 0);
    const tax       = Number(po.tax ?? po.Tax ?? 0);
    const shipping  = Number(po.shipping ?? po.Shipping ?? 0);
    const discount  = Number(po.discount ?? po.Discount ?? 0);
    const printDate    = new Date().toLocaleDateString('en-GB');
    const companyLogo  = localStorage.getItem('companyLogoBase64')  || '';
    const coName       = localStorage.getItem('companyPrintName')    || localStorage.getItem('companyName') || '';
    const coAddress1   = localStorage.getItem('companyPrintAddress1') || '';
    const coAddress2   = localStorage.getItem('companyPrintAddress2') || '';
    const coCity       = localStorage.getItem('companyPrintCity')     || '';
    const coState      = localStorage.getItem('companyPrintState')    || '';
    const coPostal     = localStorage.getItem('companyPrintPostal')   || '';
    const coPhone      = localStorage.getItem('companyPrintPhone')    || '';
    const coEmail      = localStorage.getItem('companyPrintEmail')    || '';
    const coAddrLine   = [coAddress1, coAddress2].filter(Boolean).join(', ');
    const coCityLine   = [coCity, coState, coPostal].filter(Boolean).join(', ');

    let lineNo = 0;
    const lineRows = lines.map((l: any) => {
      lineNo++;
      const item    = esc(l.itemSearch ?? l.itemName ?? l.itemCode ?? l.description ?? '—');
      const qty     = Number(l.qty ?? l.quantity ?? 0);
      const price   = Number(l.unitPrice ?? l.price ?? 0);
      const disc    = Number(l.discountPct ?? 0);
      const amount  = qty * price * (1 - disc / 100);
      const rmk     = esc(l.remarks ?? '');
      const prNo    = esc(l.prNo ?? l.prNumber ?? '');
      const bg      = lineNo % 2 === 0 ? '#f8fafc' : '#ffffff';
      return `<tr style="background:${bg};">
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280;">${lineNo}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-weight:600;">${item}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${qty}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${n2(price)}</td>
        ${disc ? `<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${disc}%</td>` : '<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">—</td>'}
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${n2(amount)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#2563eb;font-size:11px;">${prNo}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:11px;">${rmk}</td>
      </tr>`;
    }).join('');

    const thStyle = `padding:9px 10px;color:#fff;font-size:11px;font-weight:600;border-right:1px solid rgba(255,255,255,0.2);`;
    const totRow  = (lbl: string, val: string, bold = false) =>
      `<tr><td style="padding:6px 12px;color:#6b7280;font-size:12px;border-bottom:1px solid #f1f5f9;">${lbl}</td>
           <td style="padding:6px 12px;text-align:right;font-size:12px;font-weight:${bold?'700':'600'};border-bottom:1px solid #f1f5f9;">${val}</td></tr>`;

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>PO - ${poNo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1f2937;background:#fff;padding:24px 28px;}
@page{size:A4;margin:12mm 14mm;}
@media print{
  body{padding:0;}
  -webkit-print-color-adjust:exact !important;
  print-color-adjust:exact !important;
  color-adjust:exact !important;
}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;border-bottom:3px solid #0e4a60;margin-bottom:18px;}
.co-name{font-size:20px;font-weight:800;color:#0e4a60;letter-spacing:.5px;}
.co-sub{font-size:11px;color:#6b7280;margin-top:3px;}
.doc-title{text-align:right;}
.doc-title h1{font-size:26px;font-weight:800;color:#0e4a60;letter-spacing:2px;}
.doc-title .doc-no{font-size:13px;color:#374151;margin-top:4px;}
.doc-title .doc-no span{font-weight:700;color:#0e4a60;}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:18px;}
.info-cell{padding:10px 14px;border-bottom:1px solid #e5e7eb;}
.info-cell:nth-child(odd){background:#f8fafc;border-right:1px solid #e5e7eb;}
.info-key{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}
.info-val{font-size:13px;font-weight:700;color:#111827;}
table.lines{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;}
table.lines thead tr{background:#0e4a60 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
table.lines thead th{${thStyle}}
table.lines thead th:last-child{border-right:none;}
.tot-wrap{display:flex;justify-content:flex-end;margin-top:14px;}
.tot-table{width:280px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;}
.grand-row td{background:#0e4a60 !important;color:#fff !important;font-weight:700;font-size:14px;padding:8px 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.remark-box{margin-top:16px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;background:#fffbeb;}
.remark-lbl{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
.sig-row{display:flex;justify-content:space-between;margin-top:50px;gap:16px;}
.sig-box{flex:1;text-align:center;border-top:1.5px solid #374151;padding-top:6px;font-size:11px;color:#6b7280;}
.footer{margin-top:24px;text-align:center;font-size:10px;color:#9ca3af;border-top:1px solid #f1f5f9;padding-top:8px;}
</style></head><body>

<div class="hdr">
  <div style="display:flex;align-items:flex-start;gap:12px;">
    ${companyLogo ? `<img src="${companyLogo}" style="height:64px;width:auto;object-fit:contain;border-radius:6px;flex-shrink:0;" alt="logo"/>` : ''}
    <div>
      <div class="co-name">${coName || 'Purchase Order'}</div>
      ${coAddrLine ? `<div class="co-sub">${esc(coAddrLine)}</div>` : ''}
      ${coCityLine ? `<div class="co-sub">${esc(coCityLine)}</div>` : ''}
      ${coPhone    ? `<div class="co-sub">Tel: ${esc(coPhone)}${coEmail ? '  |  Email: ' + esc(coEmail) : ''}</div>` : (coEmail ? `<div class="co-sub">Email: ${esc(coEmail)}</div>` : '')}
    </div>
  </div>
  <div class="doc-title" style="display:flex;align-items:center;gap:16px;">
    ${qrSrc ? `<div style="text-align:center;"><img src="${qrSrc}" style="width:72px;height:72px;display:block;" /><div style="font-size:9px;color:#9ca3af;margin-top:2px;">Scan to receive</div></div>` : ''}
    <div>
      <h1>PURCHASE ORDER</h1>
      <div class="doc-no">PO No: <span>${poNo}</span></div>
    </div>
  </div>
</div>

<div class="info-grid">
  <div class="info-cell"><div class="info-key">Supplier</div><div class="info-val">${supplier}</div></div>
  <div class="info-cell"><div class="info-key">PO Date</div><div class="info-val">${poDate}</div></div>
  <div class="info-cell"><div class="info-key">Delivery Date</div><div class="info-val">${delDate}</div></div>
  <div class="info-cell"><div class="info-key">Currency</div><div class="info-val">${currency}</div></div>
  ${location ? `<div class="info-cell"><div class="info-key">Location / Outlet</div><div class="info-val">${location}</div></div>` : ''}
  ${contact  ? `<div class="info-cell"><div class="info-key">Contact</div><div class="info-val">${contact}</div></div>` : ''}
</div>

<table class="lines">
  <thead><tr>
    <th style="${thStyle}width:36px;text-align:center;">#</th>
    <th style="${thStyle}">Item / Description</th>
    <th style="${thStyle}width:60px;text-align:right;">Qty</th>
    <th style="${thStyle}width:95px;text-align:right;">Unit Price</th>
    <th style="${thStyle}width:65px;text-align:right;">Disc%</th>
    <th style="${thStyle}width:105px;text-align:right;">Amount (${currency})</th>
    <th style="${thStyle}width:80px;">PR No</th>
    <th style="${thStyle}width:110px;border-right:none;">Remarks</th>
  </tr></thead>
  <tbody>
    ${lineRows || `<tr><td colspan="8" style="padding:20px;text-align:center;color:#9ca3af;font-style:italic;">No line items found</td></tr>`}
  </tbody>
</table>

<div class="tot-wrap"><table class="tot-table">
  ${subTotal  ? totRow('Sub Total', n2(subTotal)) : ''}
  ${discount  ? totRow(`Discount`, `-${n2(discount)}`) : ''}
  ${tax       ? totRow('Tax', n2(tax)) : ''}
  ${shipping  ? totRow('Shipping', n2(shipping)) : ''}
  <tr class="grand-row">
    <td>Net Total (${currency})</td>
    <td style="text-align:right;">${n2(netTotal)}</td>
  </tr>
</table></div>

${remarks ? `<div class="remark-box"><div class="remark-lbl">Remarks</div>${remarks}</div>` : ''}

<div class="sig-row">
  <div class="sig-box">Prepared By</div>
  <div class="sig-box">Checked By</div>
  <div class="sig-box">Approved By</div>
  <div class="sig-box">Received By</div>
</div>

<div class="footer">This is a computer-generated document &nbsp;|&nbsp; Printed on ${printDate}</div>
</body></html>`;
  }

  openConfirm(row: any, status: 2 | 3): void {
    this.confirmRow = row;
    this.confirmStatus = status;
    this.confirmError = '';
    this.showConfirm = true;
  }

  closeConfirm(): void { this.showConfirm = false; this.confirmRow = null; this.confirmError = ''; }

  doConfirm(): void {
    if (!this.confirmRow) return;
    this.confirmLoading = true;
    this.confirmError = '';
    const row = this.confirmRow;
    const status = this.confirmStatus;
    const amount = Number(row.netTotal ?? row.totalAmount ?? row.amount ?? 0);
    const request$ = status === 2
      ? this.svc.approvePurchaseOrder(row.id, amount)
      : this.svc.rejectPurchaseOrder(row.id, amount);
    request$.subscribe({
      next: () => {
        this.confirmLoading = false; this.closeConfirm(); this.load();
        Swal.fire({ icon: status === 2 ? 'success' : 'info', title: status === 2 ? 'Approved!' : 'Rejected', text: status === 2 ? `PO ${row.purchaseOrderNo} approved successfully.` : `PO ${row.purchaseOrderNo} rejected.`, confirmButtonColor: '#16a34a' });
        this.syncLinkedPrStatus(row.id, status);
      },
      error: () => {
        this.svc.updatePurchaseOrderApprovalStatus(row.id, status).subscribe({
          next: () => {
            this.confirmLoading = false; this.closeConfirm(); this.load();
            Swal.fire({ icon: status === 2 ? 'success' : 'info', title: status === 2 ? 'Approved!' : 'Rejected', text: status === 2 ? `PO ${row.purchaseOrderNo} approved successfully.` : `PO ${row.purchaseOrderNo} rejected.`, confirmButtonColor: '#16a34a' });
            this.syncLinkedPrStatus(row.id, status);
          },
          error: err => {
            this.confirmLoading = false;
            this.confirmError = err?.error?.message || 'Action failed. Please try again.';
            Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Action failed. Please try again.', confirmButtonColor: '#16a34a' });
          }
        });
      }
    });
  }

  approveReject(row: any, status: 2 | 3): void {
    if (this.isFinal(row)) return;
    this.showApprovals = false;
    this.openConfirm(row, status);
  }

  // ── Email compose dialog (server renders the PO PDF) ──
  showEmailModal = false;
  emailSending = false;
  emailLoading = false;
  emailModel: EmailComposeModel = { fromLabel: '', fromEmail: '', fromName: '', toEmail: '', ccEmail: '', subject: '', bodyHtml: '' };
  emailAttachments: EmailComposeAttachment[] = [];
  private emailDocId = 0;
  private emailDocNo = '';

  emailSupplier(row: any): void {
    if (!this.perm.canPrint(this.fnId)) return;
    const email = (localStorage.getItem('email') || '').trim();
    const name = (localStorage.getItem('username') || '').trim();
    const docNo = row.purchaseOrderNo ?? row.pO_No ?? '';
    this.emailDocId = row.id;
    this.emailDocNo = docNo;

    this.showEmailModal = true;
    this.emailLoading = true;
    this.emailAttachments = [{ label: 'Purchase Order', sublabel: docNo, checked: true, disabled: true }];
    this.emailModel = {
      fromLabel: name ? `${name}${email ? ' <' + email + '>' : ''}` : email,
      fromEmail: email, fromName: name,
      toEmail: '', ccEmail: '',
      subject: `Purchase Order ${docNo}`.trim(),
      bodyHtml: `<p>Dear Supplier,</p><p>Please find attached Purchase Order <b>${docNo}</b>.</p><p>Regards,<br/>${name || email}</p>`
    };

    this.emailSvc.getRecipient('PO', row.id).subscribe({
      next: res => {
        const info = this.emailSvc.unwrapOne(res) || {};
        this.emailModel.toEmail = info.email ?? info.Email ?? '';
        const party = info.partyName ?? info.PartyName;
        if (party) this.emailModel.bodyHtml = `<p>Dear ${party},</p><p>Please find attached Purchase Order <b>${docNo}</b>.</p><p>Regards,<br/>${name || email}</p>`;
        this.emailLoading = false;
      },
      error: () => { this.emailLoading = false; }
    });
  }

  closeEmailModal(): void { if (!this.emailSending) this.showEmailModal = false; }

  sendComposedEmail(): void {
    const m = this.emailModel;
    if (!m.toEmail) { void Swal.fire({ icon: 'warning', title: 'To is required', text: 'Supplier email is missing.', confirmButtonColor: '#16a34a' }); return; }
    this.emailSending = true;
    this.emailSvc.sendComposeDoc('PO', this.emailDocId, {
      toEmail: m.toEmail, ccEmail: m.ccEmail, subject: m.subject, bodyHtml: m.bodyHtml,
      fromEmail: m.fromEmail, fromName: m.fromName, invoiceNo: this.emailDocNo
    }).subscribe({
      next: () => { this.emailSending = false; this.showEmailModal = false; void Swal.fire({ icon: 'success', title: 'Sent!', text: `Email sent to ${m.toEmail}.`, confirmButtonColor: '#16a34a' }); },
      error: err => { this.emailSending = false; void Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to send email.', confirmButtonColor: '#16a34a' }); }
    });
  }

  async delete(row: any): Promise<void> {
    if (this.isFinal(row)) return;
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Delete PO ${row.purchaseOrderNo}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, delete it!'
    });
    if (!result.isConfirmed) return;
    this.svc.deletePurchaseOrder(row.id).subscribe({
      next: () => {
        this.load();
        Swal.fire({ icon: 'success', title: 'Deleted!', text: `PO ${row.purchaseOrderNo} deleted.`, confirmButtonColor: '#16a34a' });
      },
      error: err => {
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  async promoteDraftWithSwal(draft: any, e: Event): Promise<void> {
    e.stopPropagation();
    const result = await Swal.fire({
      title: 'Promote Draft?',
      text: 'Promote this draft to a purchase order?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, promote it!'
    });
    if (!result.isConfirmed) return;
    this.svc.promotePurchaseOrderDraft(draft.id ?? draft.iD, this.currentUserId()).subscribe({
      next: () => {
        this.load(); this.loadDrafts();
        Swal.fire({ icon: 'success', title: 'Promoted!', text: 'Draft promoted to purchase order.', confirmButtonColor: '#16a34a' });
      },
      error: err => {
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to promote draft.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  async deleteDraftWithSwal(draft: any, e: Event): Promise<void> {
    e.stopPropagation();
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: 'Delete this draft? This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, delete it!'
    });
    if (!result.isConfirmed) return;
    this.svc.deletePurchaseOrderDraft(draft.id ?? draft.iD).subscribe({
      next: () => {
        this.loadDrafts();
        Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Draft deleted.', confirmButtonColor: '#16a34a' });
      },
      error: err => {
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete draft.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  openActionConfirm(row: any, type: string): void {
    this.actionRow = row; this.actionType = type; this.actionError = ''; this.showActionConfirm = true;
  }
  closeActionConfirm(): void { this.showActionConfirm = false; this.actionRow = null; this.actionError = ''; }
  doActionConfirm(): void {
    if (!this.actionRow) return;
    this.actionLoading = true; this.actionError = '';
    const row = this.actionRow;
    if (this.actionType === 'delete-po') {
      this.svc.deletePurchaseOrder(row.id).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.load();
          Swal.fire({ icon: 'success', title: 'Deleted!', text: `PO ${row.purchaseOrderNo} deleted.`, confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete.', confirmButtonColor: '#16a34a' });
        }
      });
    } else if (this.actionType === 'email-supplier') {
      // Route through the compose dialog instead of a blind send.
      this.actionLoading = false;
      this.closeActionConfirm();
      this.emailSupplier(row);
    } else if (this.actionType === 'promote-draft') {
      this.svc.promotePurchaseOrderDraft(row.id ?? row.iD, this.currentUserId()).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.load(); this.loadDrafts();
          Swal.fire({ icon: 'success', title: 'Promoted!', text: 'Draft promoted to purchase order.', confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to promote draft.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to promote draft.', confirmButtonColor: '#16a34a' });
        }
      });
    } else if (this.actionType === 'delete-draft') {
      this.svc.deletePurchaseOrderDraft(row.id ?? row.iD).subscribe({
        next: () => {
          this.actionLoading = false; this.closeActionConfirm(); this.loadDrafts();
          Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Draft deleted.', confirmButtonColor: '#16a34a' });
        },
        error: err => {
          this.actionLoading = false; this.actionError = err?.error?.message || 'Unable to delete draft.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Unable to delete draft.', confirmButtonColor: '#16a34a' });
        }
      });
    }
  }

  get draftCount(): number { return this.drafts.length; }
  get alertCount(): number { return this.pendingPrCount; }
  get pendingCount(): number { return this.rows.filter(r => r.statusLabel === 'Pending').length; }
  get approvedCount(): number { return this.rows.filter(r => r.statusLabel === 'Approved').length; }
  get pendingApprovalPOs(): any[] { return this.rows.filter(r => r.statusLabel === 'Pending'); }
  get approvalCount(): number { return this.pendingApprovalPOs.length; }

  isFinal(row: any): boolean {
    const value = row.approvalStatus ?? row.status ?? row.statusLabel;
    if (typeof value === 'number') return value === 2 || value === 3;
    const label = String(value ?? '').toLowerCase();
    return label === 'approved' || label === 'rejected';
  }

  currentUserId(): string {
    return localStorage.getItem('userId') || localStorage.getItem('userid') || '0';
  }

  get isCurrentPeriodLocked(): boolean {
    try {
      return localStorage.getItem(CURRENT_PERIOD_LOCKED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private syncLinkedPrStatus(poId: number | string, status: 2 | 3): void {
    this.svc.getPurchaseOrderById(poId).subscribe({
      next: res => {
        const po = this.svc.unwrapOne(res);
        let lines: any[] = [];
        try { lines = Array.isArray(po.poLines) ? po.poLines : JSON.parse(po.poLines || '[]'); } catch { lines = []; }
        const prIds = [...new Set(lines.map((l: any) => l.prId ?? l.PrId).filter((id: any) => id != null && id !== 0))];
        prIds.forEach((prId: any) => {
          const req$ = status === 2
            ? this.svc.approvePurchaseRequest(prId)
            : this.svc.rejectPurchaseRequest(prId);
          req$.subscribe({ error: () => {} });
        });
      }
    });
  }
}
