import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PurchaseService } from '../purchase.service';

type QualityCheck = 'Pass' | 'Fail' | 'NotVerify';

interface GRNLine {
  itemId: number | null;
  itemCode: string;
  itemName: string;
  warehouseId: number | null;
  binId: number | null;
  qtyOrdered: number | null;
  qtyReceived: number | null;
  qtyRemaining: number | null;
  unitPrice: number | null;
  qualityCheck: QualityCheck;
  batchNo: string;
  serialNo: string;
  expiryDate: string;
  remarks: string;
  isPartial: boolean;
  isPosted: boolean;
  flagIssueId: number | null;
}

@Component({
  selector: 'erp-grn-form',
  standalone: false,
  templateUrl: './grn-form.component.html',
  styleUrls: ['./grn-form.component.scss']
})
export class GrnFormComponent implements OnInit {
  isEdit = false;
  id: number | null = null;
  loading = false;
  saving = false;
  error = '';

  // Header
  poId: number | null = null;
  receiptDate = new Date().toISOString().substring(0, 10);
  overReceiptTolerance: number | null = null;
  supplierName = '';
  invoiceNo = '';
  isClosed = false;

  // Lines
  lines: GRNLine[] = [];

  // Dropdowns
  poOptions: any[] = [];
  warehouseOptions: any[] = [];
  binOptions: { [warehouseId: number]: any[] } = {};
  flagIssueOptions: any[] = [];

  qualityCheckOptions = [
    { label: 'Pass', value: 'Pass' },
    { label: 'Fail', value: 'Fail' },
    { label: 'Not Verified', value: 'NotVerify' }
  ];

  loginUserId = Number(localStorage.getItem('id')) || null;
  companyId = Number(localStorage.getItem('companyId')) || null;

  constructor(
    private svc: PurchaseService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!paramId && paramId !== 'new';
    if (this.isEdit) { this.id = Number(paramId); this.loadForEdit(); }
    this.loadLookups();
  }

  loadLookups(): void {
    this.svc.getPurchaseOrdersWithGRN().subscribe(r => {
      this.poOptions = this.svc.unwrap(r).map((po: any) => ({
        label: `${po.poNumber} - ${po.supplierName ?? ''}`,
        value: po.id,
        raw: po
      }));
    });
    this.svc.getWarehouses().subscribe(r => {
      this.warehouseOptions = this.svc.unwrap(r).map((w: any) => ({ label: w.warehouseName ?? w.name, value: w.id }));
    });
    this.svc.getFlagIssues().subscribe(r => {
      this.flagIssueOptions = this.svc.unwrap(r).map((f: any) => ({ label: f.issueName ?? f.name, value: f.id }));
    });
  }

  loadForEdit(): void {
    this.loading = true;
    this.svc.getGRNById(this.id!).subscribe({
      next: res => {
        const d = this.svc.unwrapOne(res);
        this.poId = d.poId ?? null;
        this.receiptDate = d.receiptDate ? d.receiptDate.substring(0, 10) : this.receiptDate;
        this.overReceiptTolerance = d.overReceiptTolerance ?? null;
        this.supplierName = d.supplierName ?? '';
        this.invoiceNo = d.invoiceNo ?? '';
        this.isClosed = d.isClosed ?? false;
        this.lines = (d.lines ?? d.items ?? []).map((l: any) => ({
          itemId: l.itemId ?? null,
          itemCode: l.itemCode ?? '',
          itemName: l.itemName ?? '',
          warehouseId: l.warehouseId ?? null,
          binId: l.binId ?? null,
          qtyOrdered: l.qtyOrdered ?? l.quantityOrdered ?? null,
          qtyReceived: l.qtyReceived ?? l.quantityReceived ?? null,
          qtyRemaining: l.qtyRemaining ?? null,
          unitPrice: l.unitPrice ?? null,
          qualityCheck: l.qualityCheck ?? 'Pass',
          batchNo: l.batchNo ?? '',
          serialNo: l.serialNo ?? '',
          expiryDate: l.expiryDate ? l.expiryDate.substring(0, 10) : '',
          remarks: l.remarks ?? '',
          isPartial: l.isPartial ?? false,
          isPosted: l.isPosted ?? false,
          flagIssueId: l.flagIssueId ?? null
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  onPoChange(): void {
    const found = this.poOptions.find(o => o.value === this.poId);
    if (!found) return;
    const po = found.raw;
    this.supplierName = po.supplierName ?? '';
    // Load PO lines to populate GRN lines
    this.lines = (po.lines ?? po.items ?? []).map((l: any) => ({
      itemId: l.itemId ?? null,
      itemCode: l.itemCode ?? '',
      itemName: l.itemName ?? '',
      warehouseId: null,
      binId: null,
      qtyOrdered: l.quantity ?? l.qty ?? null,
      qtyReceived: null,
      qtyRemaining: null,
      unitPrice: l.unitPrice ?? null,
      qualityCheck: 'Pass' as QualityCheck,
      batchNo: '',
      serialNo: '',
      expiryDate: '',
      remarks: '',
      isPartial: false,
      isPosted: false,
      flagIssueId: null
    }));
    if (!this.lines.length) this.addLine();
  }

  addLine(): void {
    this.lines.push({ itemId: null, itemCode: '', itemName: '', warehouseId: null, binId: null, qtyOrdered: null, qtyReceived: null, qtyRemaining: null, unitPrice: null, qualityCheck: 'Pass', batchNo: '', serialNo: '', expiryDate: '', remarks: '', isPartial: false, isPosted: false, flagIssueId: null });
  }

  removeLine(i: number): void { this.lines.splice(i, 1); }

  onWarehouseChange(line: GRNLine): void {
    if (!line.warehouseId) return;
    if (!this.binOptions[line.warehouseId]) {
      this.svc.getWarehouseBins(line.warehouseId).subscribe(r => {
        this.binOptions[line.warehouseId!] = this.svc.unwrap(r).map((b: any) => ({ label: b.binCode ?? b.name, value: b.id }));
      });
    }
    line.binId = null;
  }

  getBinOptions(warehouseId: number | null): any[] {
    return warehouseId ? (this.binOptions[warehouseId] ?? []) : [];
  }

  postToInventory(line: GRNLine, i: number): void {
    if (!confirm(`Post line ${i + 1} (${line.itemName}) to inventory?`)) return;
    this.svc.postGRNToInventory({
      grnId: this.id,
      itemId: line.itemId,
      warehouseId: line.warehouseId,
      binId: line.binId,
      qty: line.qtyReceived
    }).subscribe({
      next: () => { line.isPosted = true; },
      error: err => { this.error = err?.error?.message ?? 'Post failed.'; }
    });
  }

  closeGrn(): void {
    if (!this.id || !confirm('Close this GRN?')) return;
    this.svc.closeGRN(this.id).subscribe({ next: () => { this.isClosed = true; } });
  }

  reopenGrn(): void {
    if (!this.id || !confirm('Reopen this GRN?')) return;
    this.svc.reopenGRN(this.id).subscribe({ next: () => { this.isClosed = false; } });
  }

  submit(): void {
    this.saving = true;
    this.error = '';
    const payload = {
      poId: this.poId,
      receiptDate: this.receiptDate,
      overReceiptTolerance: this.overReceiptTolerance,
      invoiceNo: this.invoiceNo,
      companyId: this.companyId,
      createdBy: this.loginUserId,
      updatedBy: this.loginUserId,
      lines: this.lines.map(l => ({
        itemId: l.itemId,
        warehouseId: l.warehouseId,
        binId: l.binId,
        qtyOrdered: l.qtyOrdered,
        qtyReceived: l.qtyReceived,
        unitPrice: l.unitPrice,
        qualityCheck: l.qualityCheck,
        batchNo: l.batchNo,
        serialNo: l.serialNo,
        expiryDate: l.expiryDate || null,
        remarks: l.remarks,
        isPartial: l.isPartial,
        flagIssueId: l.flagIssueId
      }))
    };

    const obs$ = this.isEdit
      ? this.svc.updateGRNFlagIssues({ id: this.id, ...payload })
      : this.svc.createGRN(payload);

    obs$.subscribe({
      next: () => { this.saving = false; this.back(); },
      error: err => { this.saving = false; this.error = err?.error?.message ?? 'Save failed.'; }
    });
  }

  back(): void { this.router.navigate(['/app/purchase/grn']); }
  get title(): string { return this.isEdit ? 'View / Edit GRN' : 'New Good Receipt Note'; }
}
