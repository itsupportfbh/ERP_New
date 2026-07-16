import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import { TableColumn, RowAction } from '../../../shared/components/data-table/data-table.component';
import { QuickAddType, QuickAddResult } from '../../../shared/components/quick-add-modal/quick-add-modal.component';
import Swal from 'sweetalert2';

type QualityCheck = 'Pass' | 'Fail' | 'NotVerify' | '';

interface GRNLine {
  itemId: number | null;
  itemCode: string;
  itemName: string;
  supplierId: number | null;
  supplierName: string;
  warehouseId: number | null;
  binId: number | null;
  qtyOrdered: number | null;
  qtyReceived: number | null;
  qtyRemaining: number | null;
  unitPrice: number | null;
  qualityCheck: QualityCheck;
  storageType: string;
  surfaceTemp: number | null;
  batchNo: string;
  serialNo: string;
  expiryDate: string;
  time: string;
  pestSign: string;
  drySpillage: string;
  odor: string;
  plateNumber: string;
  defectLabels: string;
  damagedPackage: string;
  remarks: string;
  isPartial: boolean;
  isPosted: boolean;
  flagIssueId: number | null;
  qtyError: string;
}

@Component({
  selector: 'erp-grn-form',
  standalone: false,
  templateUrl: './grn-form.component.html',
  styleUrls: ['./grn-form.component.scss']
})
export class GrnFormComponent implements OnInit {
  isEdit = false;
  viewMode = true;   // summary view by default when opening existing GRN
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';

  // Header
  grnNo = '';
  poId: number | null = null;
  receiptDate = new Date().toISOString().substring(0, 10);
  overReceiptTolerance: number | null = null;
  supplierName = '';
  invoiceNo = '';
  taxRate = 0;
  isClosed = false;

  // Lines
  lines: GRNLine[] = [];

  // Dropdowns
  poOptions: any[] = [];
  warehouseOptions: any[] = [];
  binOptions: { [warehouseId: number]: any[] } = {};
  flagIssueOptions: any[] = [];

  qualityCheckOptions = [
    { label: 'Pass',        value: 'Pass' },
    { label: 'Fail',        value: 'Fail' },
    { label: 'Not Verified', value: 'NotVerify' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;

  // ── Inline quick-add ("+ Add new") state ──
  qaType: QuickAddType | null = null;
  qaVisible = false;
  qaName = '';
  private qaTarget = '';
  private qaRow: any = null;

  openQa(type: QuickAddType, target: string, text: string, row: any = null): void {
    this.qaType = type;
    this.qaTarget = target;
    this.qaRow = row;
    this.qaName = (text || '').trim();
    this.qaVisible = true;
  }

  qaCreated(e: QuickAddResult): void {
    if (!e?.id) { this.qaVisible = false; return; }
    switch (this.qaTarget) {
      case 'warehouse':
        this.warehouseOptions = [...this.warehouseOptions, { label: e.label, value: e.id }];
        if (this.qaRow) this.qaRow.warehouseId = e.id;
        break;
      case 'bin': {
        const wid = this.qaRow?.warehouseId;
        if (wid != null) {
          const cur = this.binOptions[wid] ?? [];
          this.binOptions[wid] = [...cur, { label: e.label, value: e.id }];
        }
        if (this.qaRow) this.qaRow.binId = e.id;
        break;
      }
      case 'flagIssue':
        this.flagIssueOptions = [...this.flagIssueOptions, { label: e.label, value: e.id }];
        if (this.qaRow) this.qaRow.flagIssueId = e.id;
        break;
    }
    this.qaVisible = false;
  }

  // ── Summary view table ──
  summaryColumns: TableColumn[] = [
    { key: 'item',        header: 'Item',          type: 'text' },
    { key: 'supplierName',header: 'Supplier',      type: 'text' },
    { key: 'batchNo',     header: 'Batch / Serial',type: 'text' },
    { key: 'qtyReceived', header: 'Qty',           type: 'number', align: 'right' },
    { key: 'unitPrice',   header: 'Unit Price',    type: 'text',   align: 'right' },
    { key: 'lineTotal',   header: 'Line Total',    type: 'text',   align: 'right' },
    { key: 'qualityCheck',header: 'Quality',       type: 'text' },
    { key: 'storageType', header: 'Storage',       type: 'text' },
    { key: 'expiryDate',  header: 'Expiry',        type: 'date' },
    { key: 'status',      header: 'Status',        type: 'badge',
      badgeMap: { 'Posted': 'success', 'Pending': 'warning' } }
  ];

  summaryActions: RowAction[] = [
    { key: 'flag', label: 'Flag Issue',       icon: 'flag', btnClass: 'warning' },
    { key: 'post', label: 'Post to Inventory',icon: 'post' }
  ];

  summaryActionFilter = (action: string, row: any): boolean => {
    if (action === 'post') return !row.isPosted;
    return true;
  };

  get summaryRows(): any[] {
    return this.lines.map((l, i) => ({
      _idx: i,
      item: l.itemCode ? `${l.itemCode} – ${l.itemName}` : (l.itemName || '—'),
      supplierName: l.supplierName || '—',
      batchNo: l.batchNo || l.serialNo || '—',
      qtyReceived: l.qtyReceived,
      unitPrice: l.unitPrice != null ? Number(l.unitPrice).toFixed(2) : '—',
      lineTotal: this.lineTotal(l).toFixed(2),
      qualityCheck: l.qualityCheck || '—',
      storageType: l.storageType || '—',
      expiryDate: l.expiryDate || null,
      status: l.isPosted ? 'Posted' : 'Pending',
      isPosted: l.isPosted,
    }));
  }

  onSummaryAction(e: { action: string; row: any }): void {
    const line = this.lines[e.row._idx];
    if (!line) return;
    if (e.action === 'view') this.viewLineDetail(line);
    if (e.action === 'flag') this.flagLine(line);
    if (e.action === 'post') this.postToInventory(line, e.row._idx);
  }

  // ── Auto-warehouse from user's outlet (locationId in localStorage) ──
  locationId         = Number(localStorage.getItem('locationId') || 0);
  defaultWarehouseId: number | null = null;
  supplierId: number | null = null;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) {
      this.id = Number(paramId);
      this.loadForEdit();
      // If navigated with ?edit=1 (from list Edit button), go straight to edit mode
      if (this.route.snapshot.queryParamMap.get('edit') === '1') {
        this.viewMode = false;
      }
    }
    this.loadLookups();
  }

  get currentUsername(): string {
    return localStorage.getItem('username') ?? localStorage.getItem('userName') ?? localStorage.getItem('name') ?? '';
  }

  loadLookups(): void {
    this.svc.getPurchaseOrdersWithGRN().subscribe(r => {
      this.poOptions = this.svc.unwrap(r)
        .map((po: any) => ({
          label: `${po.purchaseOrderNo ?? po.pO_No ?? 'PO'} - ${po.supplierName ?? ''}`,
          value: po.id,
          raw: po
        }));
    });
    this.svc.getWarehouses().subscribe(r => {
      const all = this.svc.unwrap(r).map((w: any) => ({
        label: w.warehouseName ?? w.name ?? '',
        value: w.id,
        locationId: Number(w.locationId ?? w.outletId ?? w.LocationId ?? 0)
      }));

      // filter to user's outlet if locationId is set in localStorage
      const filtered = this.locationId > 0
        ? all.filter(w => w.locationId === this.locationId)
        : all;

      this.warehouseOptions = (filtered.length ? filtered : all);

      // set first warehouse as default and pre-apply to any existing lines
      if (this.warehouseOptions.length) {
        this.defaultWarehouseId = Number(this.warehouseOptions[0].value);
        this.applyDefaultWarehouse();
      }
    });
    this.svc.getFlagIssues().subscribe(r => {
      this.flagIssueOptions = this.svc.unwrap(r).map((f: any) => ({
        label: f.flagIssuesNames ?? f.issueName ?? f.name,
        value: f.iD ?? f.id
      }));
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getGRNById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.grnNo = d.grnNo ?? d.GrnNo ?? '';
        this.poId = d.poid ?? d.poId ?? null;
        this.supplierId = d.supplierId ?? d.SupplierId ?? null;
        this.receiptDate = d.receptionDate
          ? d.receptionDate.substring(0, 10)
          : (d.receiptDate ? d.receiptDate.substring(0, 10) : this.receiptDate);
        this.overReceiptTolerance = d.overReceiptTolerance ?? null;
        this.supplierName = d.supplierName ?? '';
        this.invoiceNo = d.invoiceNo ?? d.InvoiceNo ?? '';

        const rawJson = d.gRNJson ?? d.GRNJson ?? d.grnJson ?? '[]';
        const parsed: any[] = typeof rawJson === 'string'
          ? JSON.parse(rawJson || '[]')
          : (Array.isArray(rawJson) ? rawJson : []);

        if (parsed.length) this.taxRate = Number(parsed[0].taxRate ?? 0);
        this.lines = parsed.map((l: any) => ({
          itemId: l.itemId ?? null,
          itemCode: l.itemCode ?? '',
          itemName: l.itemName ?? '',
          supplierId: l.supplierId ?? this.supplierId,
          supplierName: l.supplierName ?? '',
          warehouseId: l.warehouseId ?? null,
          binId: l.binId ?? null,
          qtyOrdered: l.qtyOrdered ?? null,
          qtyReceived: l.qtyReceived ?? null,
          qtyRemaining: l.qtyRemaining ?? null,
          unitPrice: l.unitPrice ?? null,
          qualityCheck: l.qualityCheck ?? 'Pass',
          storageType: l.storageType ?? '',
          surfaceTemp: l.surfaceTemp ?? null,
          batchNo: l.batchSerial ?? l.batchNo ?? '',
          serialNo: l.serialNo ?? '',
          expiryDate: l.expiry ? l.expiry.substring(0, 10) : (l.expiryDate ? l.expiryDate.substring(0, 10) : ''),
          time: l.time ?? '',
          pestSign: l.pestSign ?? '',
          drySpillage: l.drySpillage ?? '',
          odor: l.odor ?? '',
          plateNumber: l.plateNumber ?? '',
          defectLabels: l.defectLabels ?? '',
          damagedPackage: l.damagedPackage ?? '',
          remarks: l.remarks ?? '',
          isPartial: l.isPartial ?? false,
          isPosted: l.isPostInventory ?? l.isPosted ?? false,
          flagIssueId: l.isFlagIssue ? (l.flagIssueId ?? 1) : null,
          qtyError: ''
        }));

        if (!this.lines.length) this.addLine();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  // Apply the default warehouse (from locationId) to all lines that have no warehouseId yet
  private applyDefaultWarehouse(): void {
    if (!this.defaultWarehouseId) return;
    this.lines = this.lines.map(l => ({
      ...l,
      warehouseId: l.warehouseId ?? this.defaultWarehouseId
    }));
    // pre-load bins for the default warehouse
    if (!this.binOptions[this.defaultWarehouseId]) {
      this.svc.getWarehouseBins(this.defaultWarehouseId).subscribe(r => {
        this.binOptions[this.defaultWarehouseId!] = this.svc.unwrap(r).map((b: any) => ({
          label: b.binName ?? b.binCode ?? b.name, value: b.id
        }));
      });
    }
  }

  onPoChange(): void {
    const found = this.poOptions.find(o => o.value === this.poId);
    if (!found) return;
    const po = found.raw;
    this.supplierName = po.supplierName ?? '';
    this.supplierId = po.supplierId ?? po.SupplierId ?? null;
    this.taxRate = Number(po.tax ?? po.gstPct ?? po.taxRate ?? po.taxPct ?? 0);

    const rawLines = po.poLines ?? po.PoLines ?? '[]';
    const parsedLines: any[] = typeof rawLines === 'string'
      ? JSON.parse(rawLines || '[]')
      : (Array.isArray(rawLines) ? rawLines : []);

    // Qty already received across previous GRNs for this PO, keyed by item.
    const receivedMap = this.buildReceivedMap(po.receivedJson ?? po.ReceivedJson);

    this.lines = parsedLines
      .map((l: any) => {
        const ordered = Number(l.qty ?? l.quantity ?? 0) || 0;
        const already = this.lookupReceived(receivedMap, l.itemCode, l.itemId);
        const remaining = ordered > 0 ? Math.max(0, +(ordered - already).toFixed(4)) : null;
        return { l, ordered, already, remaining };
      })
      // Drop lines that are already fully received; keep lines with qty still due.
      .filter(x => x.remaining === null || x.remaining > 0)
      .map(({ l, ordered, already, remaining }) => ({
      itemId: l.itemId ?? null,
      itemCode: l.itemCode ?? '',
      itemName: l.itemSearch ?? l.itemName ?? '',
      supplierId: this.supplierId,
      supplierName: po.supplierName ?? '',
      warehouseId: this.defaultWarehouseId,   // ← auto from locationId
      binId: null,
      qtyOrdered: ordered || null,
      // Pre-fill with the remaining qty once part of the order was already received,
      // so the user sees exactly how much is still due.
      qtyReceived: already > 0 ? remaining : null,
      qtyRemaining: remaining,
      unitPrice: l.unitPrice ?? null,
      qualityCheck: 'Pass' as QualityCheck,
      storageType: '',
      surfaceTemp: null,
      batchNo: '',
      serialNo: '',
      expiryDate: '',
      time: '',
      pestSign: '',
      drySpillage: '',
      odor: '',
      plateNumber: '',
      defectLabels: '',
      damagedPackage: '',
      remarks: '',
      isPartial: false,
      isPosted: false,
      flagIssueId: null,
      qtyError: ''
    }));
    if (!this.lines.length) this.addLine();
    // pre-load bins for the auto-set warehouse
    if (this.defaultWarehouseId) {
      this.applyDefaultWarehouse();
    }
  }

  // Build a lookup of already-received qty per item from the PO's ReceivedJson
  // (aggregated by the backend across all prior GRNs for this PO).
  private buildReceivedMap(receivedJson: any): Map<string, number> {
    const map = new Map<string, number>();
    if (!receivedJson) return map;
    let arr: any[] = [];
    try { arr = typeof receivedJson === 'string' ? JSON.parse(receivedJson || '[]') : (Array.isArray(receivedJson) ? receivedJson : []); }
    catch { arr = []; }
    arr.forEach((r: any) => {
      const qty = Number(r.receivedQty ?? r.ReceivedQty ?? 0) || 0;
      const code = String(r.itemCode ?? r.ItemCode ?? '').trim().toUpperCase();
      const id = r.itemId ?? r.ItemId;
      if (code) map.set('C:' + code, (map.get('C:' + code) ?? 0) + qty);
      if (id != null && id !== '') map.set('I:' + String(id), (map.get('I:' + String(id)) ?? 0) + qty);
    });
    return map;
  }

  private lookupReceived(map: Map<string, number>, itemCode: any, itemId: any): number {
    const code = String(itemCode ?? '').trim().toUpperCase();
    if (code && map.has('C:' + code)) return map.get('C:' + code)!;
    if (itemId != null && itemId !== '' && map.has('I:' + String(itemId))) return map.get('I:' + String(itemId))!;
    return 0;
  }

  onQtyChange(line: GRNLine, newQty: number | null): void {
    line.qtyReceived = newQty;
    const received = Number(newQty) || 0;
    const ordered  = Number(line.qtyOrdered) || 0;
    // Remaining still due after previous GRNs (falls back to ordered when unknown).
    const remaining = line.qtyRemaining != null ? Number(line.qtyRemaining) : ordered;
    const already   = Math.max(0, +(ordered - remaining).toFixed(4));

    if (ordered > 0 && received > 0) {
      const tol = Number(this.overReceiptTolerance) || 0;
      // Tolerance is an over-receipt allowance on the ordered qty; apply that slack
      // on top of what is still remaining for this receipt.
      const maxAllowed = +(remaining + ordered * (tol / 100)).toFixed(4);
      if (received > maxAllowed) {
        line.qtyError = already > 0
          ? (tol > 0
              ? `Only ${remaining} left to receive (already received ${already} of ${ordered}; max ${maxAllowed.toFixed(2)} with ${tol}% tolerance)`
              : `Only ${remaining} left to receive (already received ${already} of ${ordered})`)
          : (tol > 0
              ? `Cannot exceed ${ordered} + ${tol}% tolerance (max ${maxAllowed.toFixed(2)})`
              : `Cannot exceed ordered qty (${ordered})`);
      } else {
        line.qtyError = '';
      }
    } else {
      line.qtyError = '';
    }

    line.isPartial = received > 0 && received < remaining && !line.qtyError;
  }

  addLine(): void {
    this.lines.push(this.emptyLine());
  }

  private emptyLine(): GRNLine {
    return {
      itemId: null, itemCode: '', itemName: '', supplierId: null, supplierName: '',
      warehouseId: this.defaultWarehouseId,   // ← auto from locationId
      binId: null,
      qtyOrdered: null, qtyReceived: null, qtyRemaining: null, unitPrice: null,
      qualityCheck: 'Pass', storageType: '', surfaceTemp: null,
      batchNo: '', serialNo: '', expiryDate: '', time: '',
      pestSign: '', drySpillage: '', odor: '',
      plateNumber: '', defectLabels: '', damagedPackage: '',
      remarks: '', isPartial: false, isPosted: false, flagIssueId: null,
      qtyError: ''
    };
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  onWarehouseChange(line: GRNLine): void {
    if (!line.warehouseId) return;
    if (!this.binOptions[line.warehouseId]) {
      this.svc.getWarehouseBins(line.warehouseId).subscribe(r => {
        this.binOptions[line.warehouseId!] = this.svc.unwrap(r).map((b: any) => ({
          label: b.binName ?? b.binCode ?? b.name, value: b.id
        }));
      });
    }
    line.binId = null;
  }

  getBinOptions(warehouseId: number | null): any[] {
    return warehouseId ? (this.binOptions[warehouseId] ?? []) : [];
  }

  postToInventory(line: GRNLine, i: number): void {
    if (!this.id) {
      Swal.fire({ icon: 'warning', title: 'Save First', text: 'Please save the GRN before posting lines to inventory.', confirmButtonColor: '#16a34a' });
      return;
    }
    Swal.fire({
      title: 'Post to Inventory?',
      html: `Post line ${i + 1} – <strong>${line.itemName}</strong>?<br><small>Qty: ${line.qtyReceived} → <em>ItemWarehouseStock</em> will be updated.</small>`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'Post', confirmButtonColor: '#16a34a'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.svc.checkPeriodLock(this.receiptDate).subscribe({
        next: (res: any) => {
          const d = res?.data ?? res ?? {};
          if (d.isClosed || d.IsClosed || d.status === 'Closed' || d.Status === 'Closed') {
            Swal.fire('Period Closed', `The accounting period for ${this.receiptDate} is closed. Contact Finance to post.`, 'error');
            return;
          }
          this.doPost(line);
        },
        error: () => this.doPost(line)
      });
    });
  }

  private doPost(line: GRNLine): void {
    if (!line.itemCode) {
      Swal.fire({ icon: 'error', title: 'Missing Item Code', text: 'Item code is required to post to inventory.', confirmButtonColor: '#16a34a' });
      return;
    }
    if (!line.warehouseId) {
      Swal.fire({ icon: 'error', title: 'Missing Warehouse', text: 'Please select a warehouse before posting.', confirmButtonColor: '#16a34a' });
      return;
    }
    const qtyDelta = Number(line.qtyReceived) || 0;
    if (qtyDelta <= 0) {
      Swal.fire({ icon: 'error', title: 'Invalid Qty', text: 'Qty received must be greater than 0 to post.', confirmButtonColor: '#16a34a' });
      return;
    }

    // Step 1 — update ItemWarehouseStock via /ItemMaster/ApplyGrn
    const applyReq = {
      grnNo: this.grnNo || undefined,
      receptionDate: this.receiptDate,
      updatedBy: this.loginUserId,
      lines: [{
        itemCode: line.itemCode,
        supplierId: line.supplierId ?? this.supplierId ?? null,
        warehouseId: line.warehouseId,
        binId: line.binId ?? null,
        qtyDelta,
        price: line.unitPrice ?? null,
        batchFlag: !!line.batchNo,
        serialFlag: !!line.serialNo,
        barcode: line.batchNo || line.serialNo || null,
        remarks: line.remarks || null
      }]
    };

    this.svc.applyGrnToInventory(applyReq).subscribe({
      next: () => {
        // Step 2 — update supplier price record (non-critical; continue on error)
        const priceDto = {
          itemCode: line.itemCode,
          warehouseId: line.warehouseId,
          binId: line.binId ?? null,
          qtyDelta,
          supplierId: line.supplierId ?? this.supplierId ?? null,
          price: line.unitPrice ?? null,
          batchFlag: !!line.batchNo,
          serialFlag: !!line.serialNo,
          barcode: line.batchNo || line.serialNo || null,
          remarks: line.remarks || null,
          updatedBy: this.loginUserId
        };
        this.svc.updateWarehouseAndSupplierPrice(priceDto).subscribe({
          next: () => this.markLinePosted(line),
          error: () => this.markLinePosted(line)  // non-critical — proceed
        });
      },
      error: err => {
        this.error = err?.error?.message ?? 'Failed to post to inventory.';
        Swal.fire('Post Failed', this.error, 'error');
      }
    });
  }

  private markLinePosted(line: GRNLine): void {
    line.isPosted = true;

    if (this.id) {
      // Step 3a — persist isPostInventory flag back to GRN JSON, THEN update procurement status
      const grnId = this.id;
      const updatedBy = this.loginUserId ?? 0;
      this.svc.updateGRNFlagIssues({
        ID: grnId, POID: this.poId, ReceptionDate: this.receiptDate,
        OverReceiptTolerance: this.overReceiptTolerance ?? 0,
        GrnNo: this.grnNo, GRNJson: JSON.stringify(this.buildGrnLinesData()), InvoiceNo: this.invoiceNo || null, isActive: true
      }).subscribe({
        next: () => {
          // Step 3b — run AFTER GRN JSON is saved so backend reads updated isPostInventory flags
          this.svc.applyGrnToSo(grnId, updatedBy).subscribe({ error: () => {} });
          if (this.poId) this.svc.updateSoProcurementByPO(this.poId, 3).subscribe({ error: () => {} });
        },
        error: () => {}
      });
    }

    const remaining = this.lines.filter(l => !l.isPosted && !l.flagIssueId).length;
    const title = remaining === 0 ? 'All Lines Done!' : 'Posted';
    const msg   = remaining === 0
      ? 'All GRN lines have been posted to inventory successfully.'
      : `Line posted to inventory. ${remaining} line${remaining !== 1 ? 's' : ''} remaining.`;

    Swal.fire(title, msg, 'success').then(() => {
      if (remaining === 0) this.router.navigate(['/app/purchase/grn']);
    });
  }


  private buildGrnLinesData(): any[] {
    return this.lines.map(l => ({
      itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName,
      supplierId: l.supplierId ?? this.supplierId,
      supplierName: l.supplierName, warehouseId: l.warehouseId,
      binId: l.binId, qtyReceived: l.qtyReceived ?? 0, qtyOrdered: l.qtyOrdered,
      qtyRemaining: l.qtyRemaining, unitPrice: l.unitPrice,
      qualityCheck: l.qualityCheck, storageType: l.storageType,
      surfaceTemp: l.surfaceTemp, batchSerial: l.batchNo,
      serialNo: l.serialNo, expiry: l.expiryDate || null, time: l.time,
      pestSign: l.pestSign, drySpillage: l.drySpillage, odor: l.odor,
      plateNumber: l.plateNumber, defectLabels: l.defectLabels,
      damagedPackage: l.damagedPackage,
      isPostInventory: l.isPosted,
      isFlagIssue: !!l.flagIssueId, flagIssueId: l.flagIssueId,
      isPartial: l.isPartial, initial: this.currentUsername,
      invoiceNo: this.invoiceNo || null,
      taxRate: this.taxRate,
      remarks: l.remarks
    }));
  }

  closeGrn(): void {
    if (!this.id) return;
    Swal.fire({ title: 'Close GRN?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Close', confirmButtonColor: '#16a34a' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.closeGRN(this.id!).subscribe({ next: () => { this.isClosed = true; Swal.fire({ icon: 'success', title: 'Closed', text: 'GRN closed.', confirmButtonColor: '#16a34a' }); } });
      });
  }

  reopenGrn(): void {
    if (!this.id) return;
    Swal.fire({ title: 'Reopen GRN?', icon: 'question', showCancelButton: true, confirmButtonText: 'Reopen', confirmButtonColor: '#16a34a' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.reopenGRN(this.id!).subscribe({ next: () => { this.isClosed = false; Swal.fire({ icon: 'success', title: 'Reopened', text: 'GRN reopened.', confirmButtonColor: '#16a34a' }); } });
      });
  }

  submit(): void {
    if (!this.poId) { this.error = 'Please select a Purchase Order.'; return; }
    if (!this.invoiceNo?.trim()) { this.error = 'Invoice No is required.'; return; }
    const overQty = this.lines.find(l => l.qtyError);
    if (overQty) { this.error = `Line "${overQty.itemName || overQty.itemCode}": ${overQty.qtyError}`; return; }
    this.saving = true;
    this.error = '';
    this.svc.checkPeriodLock(this.receiptDate).subscribe({
      next: (res: any) => {
        const d = res?.data ?? res ?? {};
        if (d.isClosed || d.IsClosed || d.status === 'Closed' || d.Status === 'Closed') {
          this.saving = false;
          this.error = `The accounting period for ${this.receiptDate} is closed. Please contact Finance.`;
          return;
        }
        this.doSubmit();
      },
      error: () => this.doSubmit()
    });
  }

  private doSubmit(): void {
    const grnLinesData = this.lines.map(l => ({
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemName: l.itemName,
      supplierId: l.supplierId ?? this.supplierId,
      supplierName: l.supplierName,
      warehouseId: l.warehouseId,
      binId: l.binId,
      qtyReceived: l.qtyReceived ?? 0,
      qtyOrdered: l.qtyOrdered,
      qtyRemaining: l.qtyRemaining,
      unitPrice: l.unitPrice,
      qualityCheck: l.qualityCheck,
      storageType: l.storageType,
      surfaceTemp: l.surfaceTemp,
      batchSerial: l.batchNo,
      serialNo: l.serialNo,
      expiry: l.expiryDate || null,
      time: l.time,
      pestSign: l.pestSign,
      drySpillage: l.drySpillage,
      odor: l.odor,
      plateNumber: l.plateNumber,
      defectLabels: l.defectLabels,
      damagedPackage: l.damagedPackage,
      isPostInventory: l.isPosted,
      isFlagIssue: !!l.flagIssueId,
      flagIssueId: l.flagIssueId,
      isPartial: l.isPartial,
      initial: this.currentUsername,
      invoiceNo: this.invoiceNo || null,
      taxRate: this.taxRate,
      remarks: l.remarks
    }));

    const payload = {
      POID: this.poId,
      ReceptionDate: this.receiptDate,
      OverReceiptTolerance: this.overReceiptTolerance ?? 0,
      GrnNo: this.grnNo || 'GRN-PENDING',
      GRNJson: JSON.stringify(grnLinesData),
      InvoiceNo: this.invoiceNo || null,
      isActive: true
    };

    const obs$ = this.isEdit
      ? this.svc.updateGRNFlagIssues({ ID: this.id, ...payload })
      : this.svc.createGRN(payload);

    obs$.subscribe({
      next: (res: any) => {
        if (this.poId) this.svc.updateSoProcurementByPO(this.poId, 3).subscribe({ error: () => {} });
        this.saving = false;

        if (!this.isEdit) {
          // Navigate to the new GRN's summary page — it has Post + Flag buttons per line
          const newId = res?.data ?? res?.id ?? res;
          Swal.fire({ icon: 'success', title: 'Saved!', text: 'GRN saved successfully.', confirmButtonColor: '#16a34a' }).then(() => {
            if (typeof newId === 'number' && newId > 0) {
              this.router.navigate(['/app/purchase/grn', newId]);
            } else {
              this.back();
            }
          });
        } else {
          // After update: reload and show summary view (with Post + Flag buttons)
          this.viewMode = true;
          this.loadForEdit();
          Swal.fire({ icon: 'success', title: 'Updated!', text: 'GRN updated successfully.', confirmButtonColor: '#16a34a' });
        }
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message ?? 'Save failed.';
        Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'Save failed.', confirmButtonColor: '#16a34a' });
      }
    });
  }

  lineTotal(line: GRNLine): number {
    return (Number(line.qtyReceived) || 0) * (Number(line.unitPrice) || 0);
  }

  get totalQtyOrdered(): number {
    return this.lines.reduce((s, l) => s + (Number(l.qtyOrdered) || 0), 0);
  }
  get totalQtyReceived(): number {
    return this.lines.reduce((s, l) => s + (Number(l.qtyReceived) || 0), 0);
  }
  get totalValue(): number {
    return this.lines.reduce((s, l) => s + this.lineTotal(l), 0);
  }

  viewLineDetail(line: GRNLine): void {
    this.showDetailSwal(line.itemName || 'Line Detail', [
      ['Item Code', line.itemCode],
      ['Item Name', line.itemName],
      ['Supplier', line.supplierName],
      ['Qty Ordered', line.qtyOrdered],
      ['Qty Received', line.qtyReceived],
      ['Unit Price', line.unitPrice != null ? Number(line.unitPrice).toFixed(2) : null],
      ['Line Total', this.lineTotal(line).toFixed(2)],
      ['Quality Check', line.qualityCheck],
      ['Storage Type', line.storageType],
      ['Surface Temp', line.surfaceTemp != null ? `${line.surfaceTemp} °C` : null],
      ['Batch No', line.batchNo],
      ['Serial No', line.serialNo],
      ['Expiry Date', line.expiryDate],
      ['Pest / Sign', line.pestSign],
      ['Dry / Spillage', line.drySpillage],
      ['Odor', line.odor],
      ['Vehicle #', line.plateNumber],
      ['Defect Labels', line.defectLabels],
      ['Damaged Package', line.damagedPackage],
      ['Time', line.time],
      ['Partial', line.isPartial ? 'Yes' : 'No'],
      ['Status', line.isPosted ? 'Posted' : 'Pending'],
      ['Remarks', line.remarks],
    ]);
  }

  private showDetailSwal(title: string, rows: [string, any][]): void {
    const html = rows.filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><td style="padding:5px 12px;color:#6b7280;font-size:12px;font-weight:600;white-space:nowrap;text-align:left;border-bottom:1px solid #f1f5f9">${k}</td><td style="padding:5px 12px;font-size:12px;text-align:left;border-bottom:1px solid #f1f5f9">${v}</td></tr>`).join('');
    Swal.fire({ title, html: `<table style="width:100%;border-collapse:collapse">${html}</table>`, confirmButtonColor: '#16a34a', width: 500, showCloseButton: true });
  }

  get pendingLines(): GRNLine[] { return this.lines.filter(l => !l.isPosted); }
  get postedLines(): GRNLine[]  { return this.lines.filter(l => l.isPosted); }

  flagLine(line: GRNLine): void {
    if (!this.flagIssueOptions.length) {
      Swal.fire({ icon: 'info', title: 'No flag issues', text: 'No flag issues configured in the system.', confirmButtonColor: '#16a34a' });
      return;
    }
    const opts = this.flagIssueOptions
      .map(o => `<option value="${o.value}" ${line.flagIssueId === o.value ? 'selected' : ''}>${o.label}</option>`)
      .join('');
    Swal.fire({
      title: 'Set Flag Issue',
      html: `<select id="swal-flag-sel" class="swal2-input" style="width:100%;padding:6px 10px">
               <option value="">— None —</option>${opts}
             </select>`,
      showCancelButton: true,
      confirmButtonText: 'Save Flag',
      confirmButtonColor: '#16a34a',
      preConfirm: () => {
        const sel = document.getElementById('swal-flag-sel') as HTMLSelectElement;
        return sel ? (sel.value ? Number(sel.value) : null) : null;
      }
    }).then(r => {
      if (!r.isConfirmed) return;
      line.flagIssueId = r.value;
      if (!this.id) return;
      this.svc.updateGRNFlagIssues({
        ID: this.id, POID: this.poId, ReceptionDate: this.receiptDate,
        OverReceiptTolerance: this.overReceiptTolerance ?? 0,
        GrnNo: this.grnNo, GRNJson: JSON.stringify(this.buildGrnLinesData()), InvoiceNo: this.invoiceNo || null, isActive: true
      }).subscribe({
        next: () => {
          const remaining = this.lines.filter(l => !l.isPosted && !l.flagIssueId).length;
          Swal.fire({ icon: 'warning', title: 'Flagged', text: 'Line flagged successfully.', confirmButtonColor: '#16a34a' })
            .then(() => { if (remaining === 0) this.router.navigate(['/app/purchase/grn']); });
        },
        error: err => {
          this.error = err?.error?.message ?? 'Flag save failed.';
          Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message ?? 'Flag save failed.', confirmButtonColor: '#16a34a' });
        }
      });
    });
  }

  back(): void { this.router.navigate(['/app/purchase/grn']); }
  get title(): string { return this.isEdit ? (this.grnNo || 'GRN Detail') : 'New Good Receipt Note'; }
}
