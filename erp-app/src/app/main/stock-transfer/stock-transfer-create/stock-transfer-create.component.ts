import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { StackOverviewService } from '../../stack-overview/stack-overview.service';
import { StockAdjustmentService } from '../../stock-adjustment/stock-adjustment.service';

interface BinOpt {
  id: number | string;
  binName: string;
  code?: string;
}

type TransferHeader = {
  reqNo: string;
  mrId: number;
  sku: string;

  fromWarehouseId: number;
  fromWarehouseName: string;

  toWarehouseId: number;
  toWarehouseName: string;

  binId: number | null;
  binName: string | null;

  toBinId: number | null;
  toBinName: string | null;

  requestQty: number;
  transferQty: number | null;
  status: number;
};

interface ApiTransferRow {
  stockId?: number | string;
  itemId?: number | string;

  sku?: string;

  fromWarehouseId?: number | string;
  fromWarehouseName?: string;

  toWarehouseId?: number | string;
  toWarehouseName?: string;

  binId?: number | string | null;
  binName?: string | null;

  toBinId?: number | string | null;
  toBinName?: string | null;

  requestQty?: number | string;
  transferQty?: number | string | null;

  available?: number | string;
  onHand?: number | string;
  reserved?: number | string;

  supplierId?: number | string | null;

  status?: number | string;

  remarks?: string | null;
  isApproved?: number | string | boolean | null;
}

@Component({
  standalone: false,
  selector: 'app-stock-transfer-create',
  templateUrl: './stock-transfer-create.component.html',
  styleUrls: ['./stock-transfer-create.component.scss']
})
export class StockTransferCreateComponent implements OnInit {

  header: TransferHeader | null = null;
  rows: ApiTransferRow[] = [];

  requestedQty = 0;

  transferQty: number | null = null;
  reason = '';

  toBinId: number | null = null;
  toBinList: BinOpt[] = [];
  toBinLoading = false;

  totalAvailable = 0;
  maxQty = 0;

  loading = false;

  isEditMode = false;
  editStockId: number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private stockService: StackOverviewService,
    private stockAdjustmentService: StockAdjustmentService
  ) {}

  ngOnInit(): void {
    const mode = (this.route.snapshot.queryParamMap.get('mode') || '').toLowerCase();
    const stockId = Number(this.route.snapshot.queryParamMap.get('stockId') || 0);

    if (mode === 'edit' && stockId > 0) {
      this.isEditMode = true;
      this.editStockId = stockId;

      const st: any = history.state?.editRow;
      if (st) {
        this.bindFromApiRow(st, 'edit');
      } else {
        this.loadListAndBindByStockId(stockId);
      }
    } else {
      this.isEditMode = false;
      this.loadFromMaterialTransferList();
    }
  }

  /* ===================== Helpers ===================== */
  private toNum(v: any, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  private toNumOrNull(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private str(v: any): string {
    return (v ?? '').toString();
  }

  private getErrorMessage(err: any, fallback: string): string {
    return err?.error?.error || err?.error?.message || err?.message || fallback;
  }

  private extractItemId(row: any): number {
    return this.toNum(
      row?.itemId ??
      row?.ItemId ??
      row?.itemID ??
      row?.ItemID ??
      0,
      0
    );
  }

  private extractStockId(row: any): number {
    return this.toNum(row?.stockId ?? row?.StockId ?? row?.id ?? row?.Id ?? 0, 0);
  }

  private getStatus(row: any): number {
    return this.toNum(row?.status ?? row?.Status ?? 0, 0);
  }

  private getIsApproved(row: any): boolean {
    const v = row?.isApproved ?? row?.IsApproved;
    if (typeof v === 'boolean') return v;
    return this.toNum(v, 0) === 1;
  }

  /* ===================== ✅ CREATE MODE ROW PICKER ===================== */
  private pickCreateRow(list: any[]): any | null {
    if (!Array.isArray(list) || !list.length) return null;

    // normalize helpers
    const sid = (x: any) => this.extractStockId(x);
    const st  = (x: any) => this.getStatus(x);
    const tq  = (x: any) => this.toNumOrNull(x?.transferQty ?? x?.TransferQty);
    const rq  = (x: any) => this.toNum(x?.requestQty ?? x?.RequestQty ?? x?.requestedQty ?? x?.RequestedQty ?? 0, 0);
    const approved = (x: any) => this.getIsApproved(x);

    // 1) Prefer PENDING row (most common: Status=1)
    // If your system uses different number for pending, adjust here.
    const pendingCandidates = list.filter(x => st(x) === 1);
    if (pendingCandidates.length) {
      // If multiple pending, pick latest stockId
      pendingCandidates.sort((a,b) => sid(b) - sid(a));
      return pendingCandidates[0];
    }

    // 2) Prefer NOT approved and transferQty is null/0 (draft/new)
    const draft = list.filter(x => !approved(x) && (tq(x) == null || tq(x) === 0));
    if (draft.length) {
      draft.sort((a,b) => sid(b) - sid(a));
      return draft[0];
    }

    // 3) If API already returns remaining requestQty, pick the one with smallest requestQty (remaining)
    // Example: after partial, remaining row might have rq=5 while original row has rq=10
    const nonZeroRq = list.filter(x => rq(x) > 0);
    if (nonZeroRq.length) {
      nonZeroRq.sort((a,b) => rq(a) - rq(b) || (sid(b) - sid(a)));
      return nonZeroRq[0];
    }

    // 4) Fallback to latest row by stockId
    const sorted = [...list].sort((a,b) => sid(b) - sid(a));
    return sorted[0];
  }

  /* ===================== EDIT load by stockId ===================== */
  private loadListAndBindByStockId(stockId: number) {
    this.loading = true;

    this.stockService.GetAllStockTransferedList().subscribe({
      next: (res: any) => {
        const list: any[] =
          (res?.isSuccess && Array.isArray(res.data)) ? res.data :
          (Array.isArray(res?.data) ? res.data :
          (Array.isArray(res) ? res : []));

        const row = list.find(x => this.extractStockId(x) === stockId);
        if (!row) {
          this.loading = false;
          Swal.fire('Not Found', 'Cannot find transfer row by stockId.', 'warning')
            .then(() => this.goToStockTransferList());
          return;
        }

        this.bindFromApiRow(row, 'edit');
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load transfer by stockId.'), 'error');
      }
    });
  }

  /* ===================== CREATE load ===================== */
  private loadFromMaterialTransferList(): void {
    this.loading = true;

    this.stockService.GetMaterialTransferList().subscribe({
      next: (res: any) => {
        const list: any[] =
          (res?.isSuccess && Array.isArray(res.data)) ? res.data :
          (Array.isArray(res?.data) ? res.data :
          (Array.isArray(res) ? res : []));

        if (!list.length) {
          this.loading = false;
          Swal.fire('No Data', 'Transfer list empty.', 'warning')
            .then(() => this.goToStockTransferList());
          return;
        }

        // ✅ IMPORTANT: pick correct row for CREATE mode (NOT list[0])
        const picked = this.pickCreateRow(list) ?? list[0];

        this.bindFromApiRow(picked, 'create');
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load transfer list.'), 'error');
      }
    });
  }

  /* ===================== MAIN BIND ===================== */
  private bindFromApiRow(row: any, source: 'create' | 'edit') {
    const requestQty = this.toNum(row.requestQty ?? row.RequestQty ?? row.requestedQty ?? row.RequestedQty ?? 0);
    const apiTransferQty = this.toNumOrNull(row.transferQty ?? row.TransferQty);

    const fromWarehouseId = this.toNum(row.fromWarehouseId ?? row.FromWarehouseId ?? 0);
    const toWarehouseId   = this.toNum(row.toWarehouseId   ?? row.ToWarehouseId   ?? 0);
    const status          = this.toNum(row.status ?? row.Status ?? 0);

    const itemId = this.extractItemId(row);
    const stockId = this.extractStockId(row);

    this.header = {
      reqNo: this.str(row.reqNo ?? row.ReqNo ?? ''),
      mrId: this.toNum(row.mrId ?? row.MrId ?? 0),
      sku: this.str(row.sku ?? row.Sku ?? ''),

      fromWarehouseId,
      fromWarehouseName: this.str(row.fromWarehouseName ?? row.FromWarehouseName ?? ''),

      toWarehouseId,
      toWarehouseName: this.str(row.toWarehouseName ?? row.ToWarehouseName ?? ''),

      binId: (row.binId ?? row.BinId) == null ? null : this.toNum(row.binId ?? row.BinId),
      binName: (row.binName ?? row.BinName ?? null),

      toBinId: (row.toBinId ?? row.ToBinId) == null ? null : this.toNum(row.toBinId ?? row.ToBinId),
      toBinName: (row.toBinName ?? row.ToBinName ?? null),

      requestQty,
      transferQty: apiTransferQty,
      status
    };

    this.requestedQty = requestQty;

    // transferQty null => show 0
    this.transferQty = (apiTransferQty == null) ? 0 : apiTransferQty;

    // reason/remarks
    this.reason = this.str(row.remarks ?? row.Remarks ?? row.reason ?? row.Reason ?? '');

    // ToBin preset
    this.toBinId = this.header.toBinId;

    // load bins
    if (this.header.toWarehouseId) this.onToOutletChanged(this.header.toWarehouseId);

    // Available calc
    const onHand = this.toNum(row.onHand ?? row.OnHand ?? 0);
    const reserved = this.toNum(row.reserved ?? row.Reserved ?? 0);
    const available = (row.available ?? row.Available) != null
      ? this.toNum(row.available ?? row.Available ?? 0)
      : (onHand - reserved);

    this.rows = [{
      stockId: stockId,
      itemId: itemId,
      sku: row.sku ?? row.Sku,

      fromWarehouseId,
      fromWarehouseName: row.fromWarehouseName ?? row.FromWarehouseName,
      toWarehouseId,
      toWarehouseName: row.toWarehouseName ?? row.ToWarehouseName,

      binId: row.binId ?? row.BinId ?? null,
      binName: row.binName ?? row.BinName ?? null,

      toBinId: row.toBinId ?? row.ToBinId ?? null,
      toBinName: row.toBinName ?? row.ToBinName ?? null,

      onHand,
      reserved,
      available,

      supplierId: row.supplierId ?? row.SupplierId ?? null,
      status,
      requestQty,
      transferQty: apiTransferQty,
      remarks: row.remarks ?? row.Remarks ?? null
    }];

    this.totalAvailable = Math.max(0, this.toNum(available, 0));
    this.maxQty = Math.max(0, Math.min(this.requestedQty, this.totalAvailable));

    // clamp transferQty to max
    const t = this.toNum(this.transferQty, 0);
    this.transferQty = Math.max(0, Math.min(t, this.maxQty));
  }

  /* ===================== Bins ===================== */
  onToOutletChanged(toWarehouseId: number | string | null | undefined): void {
    this.toBinList = [];
    if (!toWarehouseId) return;

    const wid = this.toNum(toWarehouseId, 0);
    if (!wid) return;

    this.toBinLoading = true;
    this.stockAdjustmentService.GetBinDetailsbywarehouseID(wid).subscribe({
      next: (res: any) => {
        const data = res?.data ?? res ?? [];
        this.toBinList = (Array.isArray(data) ? data : []).map((b: any) => ({
          id: b.id ?? b.Id,
          binName: b.binName ?? b.BinName ?? b.name ?? b.Name,
          code: b.code ?? b.Code ?? undefined
        }));
        this.toBinLoading = false;
      },
      error: (err: any) => {
        this.toBinLoading = false;
        this.toBinList = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load bins'), 'error');
      }
    });
  }

  /* ===================== Validate + Submit ===================== */
  private validate(): string | null {
    if (!this.header) return 'Header missing.';
    if (!this.header.toWarehouseId) return 'To Outlet missing.';
    if (!this.toBinId) return 'Select To Bin.';

    const r = this.rows?.[0];
    const itemId = this.toNum(r?.itemId, 0);
    const stockId = this.toNum(r?.stockId, 0);

    if (!itemId) return 'ItemId missing from API row.';
    if (!stockId) return 'StockId missing from API row.';

    const qty = this.toNum(this.transferQty, 0);
    if (qty <= 0) return 'Enter Transfer Qty.';
    if (!Number.isInteger(qty)) return 'Whole numbers only.';
    if (qty > Number(this.maxQty)) return `Cannot exceed ${this.maxQty}.`;

    if (this.isEditMode && Number(this.header.status) !== 1) {
      return 'Only Pending (Status=1) can edit.';
    }
    return null;
  }
submitTransferFinal(): void {
  const err = this.validate();
  if (err) {
    Swal.fire('Validation', err, 'warning');
    return;
  }

  if (!this.header) return;

  const qty = this.toNum(this.transferQty, 0);
  const remarks = (this.reason ?? '').trim() || null;

  const toId = this.toNum(this.header.toWarehouseId, 0);
  const toBinId = this.toNum(this.toBinId, 0);

  const r = this.rows[0];
  const avail = Math.max(0, this.toNum(r?.available ?? 0, 0));

  if (avail <= 0) {
    Swal.fire('No Stock', 'No available stock for this transfer.', 'warning');
    return;
  }

  const itemId = this.toNum(r?.itemId, 0);
  const stockId = this.toNum(r?.stockId, 0);

  const userId = Number(localStorage.getItem('id') ?? 0) || 0;
  const companyId = Number(localStorage.getItem('companyId') ?? localStorage.getItem('CompanyId') ?? 0) || 0;

  const payload: any[] = [{
    stockId,
    itemId,

    warehouseId: this.toNum(this.header.fromWarehouseId, 0),
    binId: r.binId == null ? null : this.toNum(r.binId, 0),

    toWarehouseId: toId,
    toBinId,

    transferQty: Math.min(qty, avail),
    requestedQty: this.requestedQty,

    remarks,
    supplierId: r.supplierId == null ? null : this.toNum(r.supplierId, 0),

    mrId: this.toNum(this.header.mrId, 0),
    reqNo: this.header.reqNo,
    sku: this.header.sku,

    companyId,
    createdBy: userId,
    updatedBy: userId
  }];

  this.loading = true;

  this.stockService.ApproveTransfersBulk(payload).subscribe({
    next: _ => {
      this.loading = false;

      Swal.fire(
        this.isEditMode ? 'Updated' : 'Submitted',
        this.isEditMode
          ? 'Stock Transfer updated successfully.'
          : 'Stock Transfer submitted successfully.',
        'success'
      ).then(() => this.goToStockTransferList());
    },
    error: (e: any) => {
      this.loading = false;
      Swal.fire(
        'Failed',
        this.getErrorMessage(e, 'Something went wrong'),
        'error'
      );
    }
  });
}

  goBack(): void {
    this.goToStockTransferList();
  }

  goToStockTransferList(): void {
    this.router.navigate(['/app/inventory/list-stocktransfer']);
  }
}

