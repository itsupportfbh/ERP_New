import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';
import Swal from 'sweetalert2';

type QualityCheck = 'Pass' | 'Fail' | 'NotVerify' | '';

interface GRNLine {
  itemId: number | null;
  itemCode: string;
  itemName: string;
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

        const rawJson = d.gRNJson ?? d.GRNJson ?? d.grnJson ?? '[]';
        const parsed: any[] = typeof rawJson === 'string'
          ? JSON.parse(rawJson || '[]')
          : (Array.isArray(rawJson) ? rawJson : []);

        this.lines = parsed.map((l: any) => ({
          itemId: l.itemId ?? null,
          itemCode: l.itemCode ?? '',
          itemName: l.itemName ?? '',
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

    const rawLines = po.poLines ?? po.PoLines ?? '[]';
    const parsedLines: any[] = typeof rawLines === 'string'
      ? JSON.parse(rawLines || '[]')
      : (Array.isArray(rawLines) ? rawLines : []);

    this.lines = parsedLines.map((l: any) => ({
      itemId: l.itemId ?? null,
      itemCode: l.itemCode ?? '',
      itemName: l.itemSearch ?? l.itemName ?? '',
      supplierName: po.supplierName ?? '',
      warehouseId: this.defaultWarehouseId,   // ← auto from locationId
      binId: null,
      qtyOrdered: l.qty ?? l.quantity ?? null,
      qtyReceived: null,
      qtyRemaining: l.remainingQty ?? l.qtyRemaining ?? null,
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

  onQtyChange(line: GRNLine, newQty: number | null): void {
    line.qtyReceived = newQty;
    const received = Number(newQty) || 0;
    const ordered  = Number(line.qtyOrdered) || 0;

    if (ordered > 0 && received > 0) {
      const tol = Number(this.overReceiptTolerance) || 0;
      const maxAllowed = ordered * (1 + tol / 100);
      if (received > maxAllowed) {
        line.qtyError = tol > 0
          ? `Cannot exceed ${ordered} + ${tol}% tolerance (max ${maxAllowed.toFixed(2)})`
          : `Cannot exceed ordered qty (${ordered})`;
      } else {
        line.qtyError = '';
      }
    } else {
      line.qtyError = '';
    }

    line.isPartial = received > 0 && received < ordered && !line.qtyError;
  }

  addLine(): void {
    this.lines.push(this.emptyLine());
  }

  private emptyLine(): GRNLine {
    return {
      itemId: null, itemCode: '', itemName: '', supplierName: '',
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
      Swal.fire('Save First', 'Please save the GRN before posting lines to inventory.', 'warning');
      return;
    }
    Swal.fire({
      title: 'Post to Inventory?',
      html: `Post line ${i + 1} – <strong>${line.itemName}</strong>?<br><small>Qty: ${line.qtyReceived} → <em>ItemWarehouseStock</em> will be updated.</small>`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'Post', confirmButtonColor: '#0e7490'
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
      Swal.fire('Missing Item Code', 'Item code is required to post to inventory.', 'error');
      return;
    }
    if (!line.warehouseId) {
      Swal.fire('Missing Warehouse', 'Please select a warehouse before posting.', 'error');
      return;
    }
    const qtyDelta = Number(line.qtyReceived) || 0;
    if (qtyDelta <= 0) {
      Swal.fire('Invalid Qty', 'Qty received must be greater than 0 to post.', 'error');
      return;
    }

    // Step 1 — update ItemWarehouseStock via /ItemMaster/ApplyGrn
    const applyReq = {
      grnNo: this.grnNo || undefined,
      receptionDate: this.receiptDate,
      updatedBy: this.loginUserId,
      lines: [{
        itemCode: line.itemCode,
        supplierId: this.supplierId ?? null,
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
          supplierId: this.supplierId ?? null,
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
        GrnNo: this.grnNo, GRNJson: JSON.stringify(this.buildGrnLinesData()), isActive: true
      }).subscribe({
        next: () => {
          // Step 3b — run AFTER GRN JSON is saved so backend reads updated isPostInventory flags
          this.svc.applyGrnToSo(grnId, updatedBy).subscribe({ error: () => {} });
          if (this.poId) this.svc.updateSoProcurementByPO(this.poId, 3).subscribe({ error: () => {} });
        },
        error: () => {}
      });
    }

    const remaining = this.lines.filter(l => !l.isPosted).length;
    const title = remaining === 0 ? 'All Lines Posted!' : 'Posted';
    const msg   = remaining === 0
      ? 'All GRN lines have been posted to inventory successfully.'
      : `Line posted to inventory. ${remaining} line${remaining !== 1 ? 's' : ''} remaining.`;

    Swal.fire(title, msg, 'success').then(() => this.router.navigate(['/app/purchase/grn']));
  }


  private buildGrnLinesData(): any[] {
    return this.lines.map(l => ({
      itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName,
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
      remarks: l.remarks
    }));
  }

  closeGrn(): void {
    if (!this.id) return;
    Swal.fire({ title: 'Close GRN?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Close', confirmButtonColor: '#f59e0b' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.closeGRN(this.id!).subscribe({ next: () => { this.isClosed = true; Swal.fire('Closed', 'GRN closed.', 'success'); } });
      });
  }

  reopenGrn(): void {
    if (!this.id) return;
    Swal.fire({ title: 'Reopen GRN?', icon: 'question', showCancelButton: true, confirmButtonText: 'Reopen', confirmButtonColor: '#22c55e' })
      .then(r => { if (!r.isConfirmed) return;
        this.svc.reopenGRN(this.id!).subscribe({ next: () => { this.isClosed = false; Swal.fire('Reopened', 'GRN reopened.', 'success'); } });
      });
  }

  submit(): void {
    if (!this.poId) { this.error = 'Please select a Purchase Order.'; return; }
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
      remarks: l.remarks
    }));

    const payload = {
      POID: this.poId,
      ReceptionDate: this.receiptDate,
      OverReceiptTolerance: this.overReceiptTolerance ?? 0,
      GrnNo: this.grnNo || 'GRN-PENDING',
      GRNJson: JSON.stringify(grnLinesData),
      isActive: true
    };

    const obs$ = this.isEdit
      ? this.svc.updateGRNFlagIssues({ ID: this.id, ...payload })
      : this.svc.createGRN(payload);

    obs$.subscribe({
      next: (res: any) => {
        if (this.poId) this.svc.updateSoProcurementByPO(this.poId, 4).subscribe({ error: () => {} });
        this.saving = false;

        if (!this.isEdit) {
          // Navigate to the new GRN's summary page — it has Post + Flag buttons per line
          const newId = res?.data ?? res?.id ?? res;
          if (typeof newId === 'number' && newId > 0) {
            this.router.navigate(['/app/purchase/grn', newId]);
          } else {
            this.back();
          }
        } else {
          // After update: reload and show summary view (with Post + Flag buttons)
          this.viewMode = true;
          this.loadForEdit();
        }
      },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
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
    Swal.fire({ title, html: `<table style="width:100%;border-collapse:collapse">${html}</table>`, confirmButtonColor: '#0e7490', width: 500, showCloseButton: true });
  }

  get pendingLines(): GRNLine[] { return this.lines.filter(l => !l.isPosted); }
  get postedLines(): GRNLine[]  { return this.lines.filter(l => l.isPosted); }

  flagLine(line: GRNLine): void {
    if (!this.flagIssueOptions.length) {
      Swal.fire('No flag issues', 'No flag issues configured in the system.', 'info');
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
      confirmButtonColor: '#d97706',
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
        GrnNo: this.grnNo, GRNJson: JSON.stringify(this.buildGrnLinesData()), isActive: true
      }).subscribe({
        next: () => {
          Swal.fire('Flagged', 'Line flagged successfully.', 'warning')
            .then(() => this.router.navigate(['/app/purchase/grn']));
        },
        error: err => { this.error = err?.error?.message ?? 'Flag save failed.'; }
      });
    });
  }

  back(): void { this.router.navigate(['/app/purchase/grn']); }
  get title(): string { return this.isEdit ? (this.grnNo || 'GRN Detail') : 'New Good Receipt Note'; }
}
