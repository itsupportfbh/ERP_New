import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

import { WarehouseService } from 'app/main/master/warehouse/warehouse.service';
import { StackOverviewService } from './stack-overview.service';
import { MaterialRequisitionService } from '../material-requisation/material-requisition.service';
import { StockAdjustmentService } from '../stock-adjustment/stock-adjustment.service';
import { PurchaseService } from 'app/pages/purchase/purchase.service';

/* ===================== STOCK API Interfaces ===================== */
interface ApiItemRow {
  id?: number | string;

  sku?: string;
  Sku?: string;
  itemCode?: string;
  ItemCode?: string;

  name?: string;
  itemName?: string;
  ItemName?: string;

  warehouseName?: string;
  WarehouseName?: string;

  binName?: string;
  BinName?: string;

  onHand?: number;
  OnHand?: number;

  reserved?: number;
  Reserved?: number;

  available?: number;
  Available?: number;

  warehouseId?: number;
  WarehouseId?: number;

  binId?: number;
  BinId?: number;

  supplierId?: number | null;
  SupplierId?: number | null;

  supplierName?: string | null;
  SupplierName?: string | null;

  itemId?: number | string;
  ItemId?: number | string;
}

/* ===================== UI Stock Row ===================== */
interface StockRow {
  idKey: string;
  warehouse: string;
  bin: string;
  onHand: number;
  available: number;
  sku: string | null;
  item: string;
  supplierId?: number | null;
  supplierName: string;
  warehouseId?: number;
  binId?: number;
  itemId?: number;
  apiRow?: ApiItemRow;
}

/* ===================== MR Interfaces ===================== */
interface MrLine {
  id?: number;
  materialReqId?: number;
  itemId?: number;

  itemCode?: string;
  itemName?: string;

  uomId?: number;
  uomName?: string;
  qty?: number;

  baseUomId?: number;
  baseUomName?: string;

  conversionFactor?: number;
  uomFactor?: number;
  baseQty?: number;

  receivedQty?: number;
}

type MrLineStatus = 'READY' | 'PARTIAL' | 'SHORT';

interface MrLineVM {
  itemId: number;
  sku: string;
  itemName: string;

  enteredQty: number;
  enteredUomName: string;

  baseUomId: number | null;
  baseUomName: string;
  conversionFactor: number;

  oldRequestedQty: number;
  requestedQty: number;
  receivedQty: number;
  remainingQty: number;

  availQty: number;
  maxTransferQty: number;
  transferQty: number;
  shortageQty: number;
  status: MrLineStatus;
}

interface MrListItem {
  id: number;
  mrqNo: string;
  outletId: number | null;
  display: string;
  status?: number;
  isCompleted?: boolean;
  remainingQty?: number;
}

interface FromOutletOption {
  id: number;
  name: string;
  label: string;
  reqQty: number;
  onHand: number;
}

@Component({
  standalone: false,
  selector: 'app-stack-overview',
  templateUrl: './stack-overview.component.html',
  styleUrls: ['./stack-overview.component.scss']
})
export class StackOverviewComponent implements OnInit {

  warehouses: Array<{ id: number; name: string }> = [];
  mrList: MrListItem[] = [];
  fromOutletOptions: FromOutletOption[] = [];

  private mrRawList: any[] = [];

  transferredMrIds = new Set<number>();

  selectedMrId: number | null = null;
  selectedMrNo: string | null = null;

  destinationOutletId: number | null = null;
  destinationOutletName: string | null = null;

  destinationBinId: number | null = null;
  destinationBinName: string | null = null;

  selectedFromOutletId: number | null = null;
  selectedFromOutletName: string | null = null;

  requesterName: string | null = null;
  reqDate: string | null = null;

  mrLines: MrLineVM[] = [];
  totalRemainingQty: number = 0;

  rows: StockRow[] = [];
  filteredRows: StockRow[] = [];

  shortageCount: number = 0;
  transferableLineCount: number = 0;

  toBinList: Array<{ id: number; binName: string }> = [];
  toBinLoading = false;

  showTransferModal = false;

  loading = false;
  errorMsg: string | null = null;
  transferErrorText: string | null = null;

  constructor(
    private warehouseService: WarehouseService,
    private stockService: StackOverviewService,
    private mrService: MaterialRequisitionService,
    private stockAdjService: StockAdjustmentService,
    private purchaseService: PurchaseService,
    private router: Router
  ) {}

  compareById = (a: any, b: any) => String(a) === String(b);

  ngOnInit(): void {
    this.loadWarehouses();
    this.loadStockRows();
    this.loadTransferredMrIdsAndMrList();
  }

  /* ===================== LOADS ===================== */

  private loadTransferredMrIdsAndMrList(): void {
    this.stockService.getTransferredMrIds().subscribe({
      next: (res: any) => {
        const ids = Array.isArray(res?.data) ? res.data : [];
        this.transferredMrIds = new Set<number>(ids.map((x: any) => Number(x)));
        this.loadMrList();
      },
      error: (err) => {
        console.error('Failed to load transferred MR ids', err);
        this.loadMrList();
      }
    });
  }

  private loadWarehouses(): void {
    this.warehouseService.getWarehouse().subscribe({
      next: (res: any) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);

        this.warehouses = data.map((w: any) => ({
          id: Number(w.id),
          name: w.name || w.warehouseName || `WH-${w.id}`
        }));

        this.destinationOutletName = this.getWarehouseNameById(this.destinationOutletId);
        this.selectedFromOutletName = this.getWarehouseNameById(this.selectedFromOutletId);

        this.rebuildFromOutletOptions();
      },
      error: (err) => console.error('Error loading warehouses', err)
    });
  }

private loadMrList(): void {
  this.mrService.GetMaterialRequest().subscribe({
    next: (res: any) => {
      const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);

      this.mrRawList = data || [];

      const list: MrListItem[] = (data || []).map((x: any) => {
        const id = Number(x.id ?? x.Id ?? x.mrqId ?? x.MrqId ?? 0);
        const mrqNo = String(x.reqNo ?? x.ReqNo ?? x.mrqNo ?? x.MrqNo ?? x.mrNo ?? `MRQ-${id}`);
        const outletId = x.outletId ?? x.OutletId ?? null;

        const completed = this.isMrCompleted(x);
        const remaining = this.calcMrRemaining(x);
        const status = Number(x.status ?? x.Status ?? 0);

        return {
          id,
          mrqNo,
          outletId: outletId != null ? Number(outletId) : null,
          display: mrqNo,
          status,
          isCompleted: completed,
          remainingQty: remaining
        };
      });

      // Show only MRs with status = 1 (pending/new)
      this.mrList = list.filter(m =>
        Number(m.id) > 0 &&
        m.status === 1
      );

      if (this.selectedMrId) {
        const found = this.mrList.find(m => Number(m.id) === Number(this.selectedMrId));
        if (!found) this.resetAll();
      }
    },
    error: (err) => {
      console.error('Failed to load MRQ list', err);
      this.mrList = [];
    }
  });
}
  private loadStockRows(): void {
    this.loading = true;
    this.errorMsg = null;

    this.stockService.GetAllStockList().subscribe({
      next: (res: any) => {
        if (res?.isSuccess && Array.isArray(res.data)) {
          this.rows = res.data.map((item: ApiItemRow) => this.toStockRow(item));
          this.applyGrid();
          this.rebuildFromOutletOptions();
          this.recalcMrAvailability();
        } else {
          this.rows = [];
          this.filteredRows = [];
          this.errorMsg = 'No stock data found.';
        }

        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = 'Failed to load stock list.';
        console.error('Stock list load error', err);
      }
    });
  }

  /* ===================== NORMALIZE STOCK ROW ===================== */

  private toStockRow(api: ApiItemRow): StockRow {
    const warehouse = String((api as any).warehouseName ?? (api as any).WarehouseName ?? '');
    const bin = String((api as any).binName ?? (api as any).BinName ?? '');

    const sku =
      String(
        (api as any).sku ??
        (api as any).Sku ??
        (api as any).itemCode ??
        (api as any).ItemCode ??
        ''
      ).trim() || null;

    const item =
      String(
        (api as any).name ??
        (api as any).itemName ??
        (api as any).ItemName ??
        ''
      ).trim();

    const onHand = Number((api as any).onHand ?? (api as any).OnHand ?? 0);
    const reserved = Number((api as any).reserved ?? (api as any).Reserved ?? 0);

    const availableRaw = (api as any).available ?? (api as any).Available;
    const available = Number(availableRaw != null ? availableRaw : (onHand - reserved));

    const supplierName =
      String((api as any).supplierName ?? (api as any).SupplierName ?? '').trim() || '-';

    const supplierId = (api as any).supplierId ?? (api as any).SupplierId ?? null;

    const warehouseId =
      Number((api as any).warehouseId ?? (api as any).WarehouseId ?? 0) || undefined;

    const binId =
      Number((api as any).binId ?? (api as any).BinId ?? 0) || undefined;

    const itemId =
      Number((api as any).itemId ?? (api as any).ItemId ?? 0) || undefined;

    const idKey = [
      (api as any).id ?? '',
      warehouse,
      bin,
      sku ?? '',
      item,
      String(supplierId ?? '')
    ].join('|').toLowerCase();

    return {
      idKey,
      warehouse,
      bin,
      onHand,
      available,
      sku,
      item,
      supplierName,
      supplierId: supplierId == null ? null : Number(supplierId),
      warehouseId,
      binId,
      itemId,
      apiRow: api
    };
  }

  trackByRow = (_: number, r: StockRow) => r.idKey;
  trackByMrLine = (_: number, l: MrLineVM) => `${l.itemId}|${l.sku}`;

  /* ===================== MR HELPERS ===================== */

private getSelectedMrDto(mrId: number): any {
  return (this.mrRawList || []).find(x =>
    Number(x.id ?? x.Id ?? x.mrqId ?? x.MrqId ?? 0) === Number(mrId)
  ) || null;
}

private getLineBaseQty(l: any): number {
  const baseQty = Number(
    l?.baseQty ??
    l?.BaseQty ??
    l?.baseQuantity ??
    l?.BaseQuantity ??
    0
  );

  if (baseQty > 0) {
    return Number(baseQty.toFixed(4));
  }

  const qty = Number(l?.qty ?? l?.Qty ?? 0);

  const factor = Number(
    l?.conversionFactor ??
    l?.ConversionFactor ??
    l?.uomFactor ??
    l?.UomFactor ??
    1
  );

  return Number((qty * (factor > 0 ? factor : 1)).toFixed(4));
}

  private isMrCompleted(dto: any): boolean {
    const lines: MrLine[] = dto?.lines ?? dto?.lineItemsList ?? dto?.items ?? [];
    if (!Array.isArray(lines) || lines.length === 0) return false;

    return lines.every(l => {
      const reqBase = this.getLineBaseQty(l);
      const recBase = Number(l?.receivedQty ?? 0);

      return reqBase > 0 && recBase >= reqBase;
    });
  }

  private calcMrRemaining(dto: any): number {
    const lines: MrLine[] = dto?.lines ?? dto?.lineItemsList ?? dto?.items ?? [];
    if (!Array.isArray(lines) || lines.length === 0) return 0;

    return Number(lines.reduce((sum, l) => {
      const reqBase = this.getLineBaseQty(l);
      const recBase = Number(l?.receivedQty ?? 0);

      return sum + Math.max(0, reqBase - recBase);
    }, 0).toFixed(4));
  }

  private buildMrLines(dto: any): MrLineVM[] {
    const lines: MrLine[] = dto?.lines ?? dto?.lineItemsList ?? dto?.items ?? [];
    const out: MrLineVM[] = [];

    for (const l of (Array.isArray(lines) ? lines : [])) {
      const itemId = Number(l?.itemId ?? 0);
      const sku = String(l?.itemCode ?? '').trim();
      const itemName = String(l?.itemName ?? '').trim();

      const enteredQty = Number(l?.qty ?? 0);
      const enteredUomName = String(l?.uomName ?? '').trim();

      const baseUomId =
        l?.baseUomId != null ? Number(l.baseUomId) : null;

      const baseUomName =
        String(l?.baseUomName ?? '').trim();

      const conversionFactor =
        Number(l?.conversionFactor ?? l?.uomFactor ?? 1) || 1;

      const baseRequestedQty = this.getLineBaseQty(l);

      const receivedBaseQty = Number(l?.receivedQty ?? 0);

      const remainingBaseQty = Number(
        Math.max(0, baseRequestedQty - receivedBaseQty).toFixed(4)
      );

      if (!itemId || !sku || remainingBaseQty <= 0) continue;

      out.push({
        itemId,
        sku,
        itemName: itemName || sku,

        enteredQty,
        enteredUomName,

        baseUomId,
        baseUomName,
        conversionFactor,

        oldRequestedQty: baseRequestedQty,
        requestedQty: remainingBaseQty,
        receivedQty: receivedBaseQty,
        remainingQty: remainingBaseQty,

        availQty: 0,
        maxTransferQty: 0,
        transferQty: 0,
        shortageQty: remainingBaseQty,
        status: 'SHORT'
      });
    }

    return out;
  }

  private getMrSkuSetLower(): Set<string> {
    const set = new Set<string>();

    for (const l of (this.mrLines || [])) {
      const s = (l.sku || '').toLowerCase().trim();
      if (s) set.add(s);
    }

    return set;
  }

  getReqBaseQtyBySku(sku: string | null | undefined): number {
    const key = String(sku ?? '').toLowerCase().trim();

    const line = (this.mrLines || []).find(x =>
      String(x.sku ?? '').toLowerCase().trim() === key
    );

    return Number(line?.remainingQty ?? line?.requestedQty ?? 0);
  }

  /* ===================== EVENTS ===================== */

  onMrChanged(mrId: number | null): void {
    this.transferErrorText = null;

    if (!mrId) {
      this.resetAll();
      return;
    }

    this.selectedMrId = Number(mrId);

    this.mrService.GetMaterialRequestById(Number(mrId)).subscribe({
      next: (res: any) => {
        const apiDto = res?.data ?? res ?? {};
        const listDto = this.getSelectedMrDto(Number(mrId));

        const dto = Array.isArray(apiDto?.lines) && apiDto.lines.length
          ? apiDto
          : (listDto || apiDto);

        if (this.isMrCompleted(dto)) {
          Swal.fire({
            icon: 'warning',
            title: 'MRQ Completed',
            text: 'Received Qty already equals Requested Base Qty. This MRQ cannot be used again.'
          }).then(() => {
            this.resetAll();
            this.loadMrList();
          });
          return;
        }

        this.selectedMrNo = String(dto.reqNo ?? dto.mrqNo ?? dto.mrNo ?? `MRQ-${mrId}`);

        const outletId = dto.outletId ?? dto.OutletId ?? null;
        this.destinationOutletId = outletId != null ? Number(outletId) : null;

this.destinationOutletName =
  String(
    dto.outletName ??
    dto.OutletName ??
    dto.destinationOutletName ??
    dto.DestinationOutletName ??
    dto.warehouseName ??
    dto.WarehouseName ??
    ''
  ).trim()
  || this.getWarehouseNameById(this.destinationOutletId)
  || (this.destinationOutletId ? `Warehouse-${this.destinationOutletId}` : null);

        const bId = dto.binId ?? dto.BinId ?? null;
        this.destinationBinId = bId != null ? Number(bId) : null;
        this.destinationBinName = String(dto.binName ?? dto.BinName ?? '') || null;

        this.loadDestinationBins();

        this.requesterName = String(dto.requesterName ?? dto.RequesterName ?? '');
        this.reqDate = String(dto.reqDate ?? dto.date ?? '');

        this.mrLines = this.buildMrLines(dto);

        this.totalRemainingQty = Number(
          this.mrLines.reduce((s, x) => s + Number(x.remainingQty ?? 0), 0).toFixed(4)
        );

        if (!this.mrLines.length || this.totalRemainingQty <= 0) {
          Swal.fire({
            icon: 'warning',
            title: 'No Remaining Qty',
            text: 'This MRQ has no remaining base quantity to transfer.'
          }).then(() => {
            this.resetAll();
            this.loadMrList();
          });
          return;
        }

        if (this.selectedFromOutletId != null && this.destinationOutletId != null) {
          if (Number(this.selectedFromOutletId) === Number(this.destinationOutletId)) {
            this.selectedFromOutletId = null;
            this.selectedFromOutletName = null;
          }
        }

        this.rebuildFromOutletOptions();
        this.applyGrid();
        this.recalcMrAvailability();
      },
      error: (err) => {
        console.error('Failed to load MRQ detail', err);
        Swal.fire({
          icon: 'error',
          title: 'MRQ Load Failed',
          text: 'Could not load Material Requisition details.'
        });
      }
    });
  }

onFromOutletChanged(fromId: any): void {
  const idNum = fromId == null || fromId === '' ? null : Number(fromId);

  if (!idNum || Number.isNaN(idNum)) {
    this.selectedFromOutletId = null;
    this.selectedFromOutletName = null;
  } else {
    this.selectedFromOutletId = idNum;
    this.selectedFromOutletName =
      this.fromOutletOptions.find(x => Number(x.id) === idNum)?.name
      || this.getWarehouseNameById(idNum);
  }

  this.applyGrid();
  this.rebuildFromOutletOptions();
  this.recalcMrAvailability();

  if (idNum && this.selectedMrId && this.mrLines?.length) {
    this.loadDestinationBins(idNum);
    this.showTransferModal = true;
  }
}
  onTransferQtyChanged(line: MrLineVM): void {
    const v = Number(line.transferQty ?? 0);
    const safe = Number.isFinite(v) ? v : 0;

    const capped = Math.max(0, Math.min(safe, Number(line.maxTransferQty ?? 0)));
    line.transferQty = Number(capped.toFixed(4));
  }

  /* ===================== FROM OUTLET OPTIONS ===================== */

private rebuildFromOutletOptions(): void {
  const reqTotal = Number(
    (this.mrLines || []).reduce((sum, x) => {
      return sum + Number(x.remainingQty ?? x.requestedQty ?? 0);
    }, 0).toFixed(4)
  );

  const skuSet = this.getMrSkuSetLower();
  const destId = Number(this.destinationOutletId ?? -999);

  const map = new Map<number, FromOutletOption>();

  for (const r of this.rows || []) {
    const sku = (r.sku ?? '').toLowerCase().trim();

    if (skuSet.size && !skuSet.has(sku)) continue;

    const whId = Number(r.warehouseId ?? 0);
    if (!whId) continue;

    // destination warehouse avoid
    if (whId === destId) continue;

    const old = map.get(whId);

    const onHand = Number(r.onHand ?? 0);

    if (old) {
      old.onHand = Number((old.onHand + onHand).toFixed(4));
      old.reqQty = reqTotal;
      old.label = `${old.name} | Req Base Qty: ${reqTotal} | OnHand: ${old.onHand}`;
    } else {
      const name =
        r.warehouse ||
        this.getWarehouseNameById(whId) ||
        `Warehouse-${whId}`;

      map.set(whId, {
        id: whId,
        name,
        reqQty: reqTotal,
        onHand: Number(onHand.toFixed(4)),
        label: `${name} | Req Base Qty: ${reqTotal} | OnHand: ${Number(onHand.toFixed(4))}`
      });
    }
  }

  this.fromOutletOptions = Array.from(map.values())
    .sort((a, b) => a.name.localeCompare(b.name));
}
  /* ===================== GRID FILTER ===================== */

  private applyGrid(): void {
    let filtered = [...this.rows];

    const skuSet = this.getMrSkuSetLower();

    if (skuSet.size) {
      filtered = filtered.filter(r =>
        skuSet.has((r.sku ?? '').toLowerCase().trim())
      );
    }

    if (this.destinationOutletId != null) {
      const destId = Number(this.destinationOutletId);
      filtered = filtered.filter(r => Number(r.warehouseId ?? -999) !== destId);
    }

    if (this.selectedFromOutletId != null) {
      const fromId = Number(this.selectedFromOutletId);
      filtered = filtered.filter(r => Number(r.warehouseId ?? -999) === fromId);
    }

    this.filteredRows = filtered;
  }

  /* ===================== AVAILABILITY CALC ===================== */

  private recalcMrAvailability(): void {
    if (!this.mrLines?.length) {
      this.shortageCount = 0;
      this.transferableLineCount = 0;
      return;
    }

    const availBySku = new Map<string, number>();

    for (const r of (this.filteredRows || [])) {
      const sku = (r.sku ?? '').toLowerCase().trim();
      if (!sku) continue;

      const current = Number(availBySku.get(sku) ?? 0);
      availBySku.set(sku, Number((current + Number(r.available ?? 0)).toFixed(4)));
    }

    let shortage = 0;
    let transferable = 0;

    for (const l of this.mrLines) {
      const skuLower = (l.sku ?? '').toLowerCase().trim();
      const avail = Number(availBySku.get(skuLower) ?? 0);

      l.availQty = Number(avail.toFixed(4));

      const remaining = Number(l.remainingQty ?? 0);
      l.maxTransferQty = Number(Math.max(0, Math.min(remaining, avail)).toFixed(4));

      l.shortageQty = Number(Math.max(0, remaining - avail).toFixed(4));

      if (avail <= 0) {
        l.status = 'SHORT';
        l.transferQty = 0;
        shortage++;
      } else if (avail >= remaining) {
        l.status = 'READY';

        if (!l.transferQty || l.transferQty > l.maxTransferQty) {
          l.transferQty = l.maxTransferQty;
        }

        transferable++;
      } else {
        l.status = 'PARTIAL';

        if (!l.transferQty || l.transferQty > l.maxTransferQty) {
          l.transferQty = l.maxTransferQty;
        }

        transferable++;
      }

      l.transferQty = Number((l.transferQty ?? 0).toFixed(4));
    }

    this.shortageCount = shortage;
    this.transferableLineCount = transferable;
  }

  /* ===================== RAISE PR (shortage → purchase) ===================== */

  raisingPr = false;

  /**
   * Shortage items cannot be fulfilled by transfer because no warehouse stocks
   * them. This raises a Purchase Request for exactly those lines and links it
   * back to the MR (server sets SourceType=MR / SourceRefId=MrId). Idempotent -
   * a second click returns the PR already raised rather than duplicating it.
   */
  raisePr(): void {
    if (!this.selectedMrId) {
      Swal.fire({ icon: 'info', title: 'Select a material requisition first.' });
      return;
    }

    const shortageLines = (this.mrLines || [])
      .filter(l => Number(l.shortageQty ?? 0) > 0 && Number(l.itemId) > 0)
      .map(l => ({ itemId: Number(l.itemId), qty: Number(l.shortageQty) }));

    if (!shortageLines.length) {
      Swal.fire({
        icon: 'info',
        title: 'No shortage',
        text: 'Every requested item can be transferred — nothing to purchase.'
      });
      return;
    }

    const userId = Number(localStorage.getItem('id') ?? 0) || 0;
    const userName = localStorage.getItem('username') || localStorage.getItem('email') || 'System';

    const payload = {
      MrId: Number(this.selectedMrId),
      UserId: userId,
      UserName: userName,
      Location: this.destinationOutletName ?? '',
      Note: `Auto from MR ${this.selectedMrNo ?? this.selectedMrId}`,
      Lines: shortageLines
    };

    this.raisingPr = true;
    this.purchaseService.createPrFromMr(payload).subscribe({
      next: (res: any) => {
        this.raisingPr = false;
        const ok = res?.isSuccess ?? res?.issucess ?? false;
        if (ok && Number(res?.prId) > 0) {
          Swal.fire({
            icon: 'success',
            title: 'Purchase Request raised',
            text: res?.message || 'A PR was created for the shortage items.',
            showCancelButton: true,
            confirmButtonText: 'Go to Purchase Requests',
            cancelButtonText: 'Stay here',
            confirmButtonColor: '#116e73'
          }).then(r => {
            if (r.isConfirmed) this.router.navigate(['/app/purchase/requests']);
          });
        } else {
          Swal.fire({ icon: 'info', title: 'Not created', text: res?.message || 'No orderable shortage items.' });
        }
      },
      error: (err) => {
        this.raisingPr = false;
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: err?.error?.message || err?.message || 'Could not raise the PR.'
        });
      }
    });
  }

  /* ===================== TRANSFER ===================== */

  canTransfer(): boolean {
    return !!(
      this.selectedMrId &&
      this.destinationOutletId &&
      this.selectedFromOutletId &&
      this.destinationBinId &&
      this.mrLines?.length &&
      Number(this.totalRemainingQty ?? 0) > 0 &&
      (this.mrLines || []).some(l => Number(l.transferQty ?? 0) > 0)
    );
  }

  private validateTransfer(): boolean {
    this.transferErrorText = null;

    if (!this.selectedMrId) {
      this.transferErrorText = 'Select a Material Requisition.';
      return false;
    }
    if (!this.destinationOutletId) {
      this.transferErrorText = 'Destination outlet not found.';
      return false;
    }
    if (!this.selectedFromOutletId) {
      this.transferErrorText = 'Select From Outlet.';
      return false;
    }
    if (!this.destinationBinId) {
      this.transferErrorText = 'Select a From Bin.';
      return false;
    }
    if (!this.mrLines?.length) {
      this.transferErrorText = 'No MR lines found.';
      return false;
    }
    if (Number(this.totalRemainingQty ?? 0) <= 0) {
      this.transferErrorText = 'No remaining qty to transfer.';
      return false;
    }
    if (!(this.mrLines || []).some(l => Number(l.transferQty ?? 0) > 0)) {
      this.transferErrorText = 'Enter Transfer Qty for at least one line.';
      return false;
    }
    return true;
  }

  submitTransfer(): void {
    if (!this.validateTransfer()) return;

    const mrId = Number(this.selectedMrId ?? 0);
    const fromWarehouseID = Number(this.selectedFromOutletId ?? 0);
    const toWarehouseID = Number(this.destinationOutletId ?? 0);
    const toBinId = Number(this.destinationBinId ?? 0);

    const now = new Date();
    const userId = Number(localStorage.getItem('id') ?? 0) || 1001;

    const payload: any[] = [];
    const shortageSkus: Array<{ sku: string; itemName: string; need: number; avail: number }> = [];

    for (const line of (this.mrLines || [])) {
      const wantBaseQty = Number(line.transferQty ?? 0);

      if (!wantBaseQty || wantBaseQty <= 0) continue;

      const skuLower = (line.sku || '').toLowerCase().trim();
      let remainingToAllocate = wantBaseQty;

      const candidates = (this.filteredRows || [])
        .filter(r => ((r.sku ?? '').toLowerCase().trim() === skuLower))
        .filter(r => Number(r.available ?? 0) > 0)
        .sort((a, b) => Number(b.available ?? 0) - Number(a.available ?? 0));

      const totalAvail = Number(
        candidates.reduce((s, r) => s + Number(r.available ?? 0), 0).toFixed(4)
      );

      if (!candidates.length || totalAvail <= 0) {
        shortageSkus.push({
          sku: line.sku,
          itemName: line.itemName,
          need: wantBaseQty,
          avail: 0
        });
        continue;
      }

      if (totalAvail < remainingToAllocate) {
        shortageSkus.push({
          sku: line.sku,
          itemName: line.itemName,
          need: wantBaseQty,
          avail: totalAvail
        });

        remainingToAllocate = totalAvail;
      }

      for (const match of candidates) {
        if (remainingToAllocate <= 0) break;

        const avail = Number(match.available ?? 0);
        const takeBaseQty = Number(Math.min(remainingToAllocate, avail).toFixed(4));

        remainingToAllocate = Number((remainingToAllocate - takeBaseQty).toFixed(4));

        payload.push({
          ItemId: Number(line.itemId ?? 0),

          MrId: mrId,
          FromWarehouseID: fromWarehouseID,
          ToWarehouseID: toWarehouseID,
          ToBinId: toBinId,

          BinId: match.binId ?? null,
          BinName: match.bin ?? '',

          Available: Number(match.available ?? 0),
          OnHand: Number(match.onHand ?? 0),

          RequestedQty: Number(line.requestedQty ?? 0),
          OldRequestedQty: Number(line.oldRequestedQty ?? 0),
          ReceivedQty: Number(line.receivedQty ?? 0),

          TransferQty: takeBaseQty,

          EnteredQty: Number(line.enteredQty ?? 0),
          EnteredUomName: line.enteredUomName ?? '',
          BaseUomId: line.baseUomId,
          BaseUomName: line.baseUomName ?? '',
          ConversionFactor: Number(line.conversionFactor ?? 1),

          TransferNo: '',
          Status: 1,
          isApproved: false,

          CreatedBy: userId,
          CreatedDate: now,
          UpdatedBy: userId,
          UpdatedDate: now,

          FromWarehouseName: this.selectedFromOutletName ?? '',
          ItemName: line.itemName ?? match.item ?? '',
          Sku: line.sku ?? match.sku ?? '',
          Remarks: '',

          SupplierId: Number(match.supplierId ?? 0),
          IsSupplierBased: false
        });
      }
    }

    if (!payload.length) {
      Swal.fire({
        icon: 'warning',
        title: 'Nothing to Transfer',
        text: 'No transferable lines found. All lines are shortage or Transfer Qty is 0.'
      });
      return;
    }

    const companyId = Number(localStorage.getItem('companyId') ?? localStorage.getItem('CompanyId') ?? 0) || 0;

    this.loading = true;

    this.stockService.insertStock(payload).subscribe({
      next: (res: any) => {
        const insertedIds: number[] = Array.isArray(res?.data) ? res.data : [];

        if (!insertedIds.length) {
          this.loading = false;
          Swal.fire({ icon: 'error', title: 'Insert Failed', text: 'No stock IDs returned from server.' });
          return;
        }

        const approvePayload = insertedIds.map((stockId: number, i: number) => {
          const p = payload[i];
          return {
            stockId,
            itemId: p.ItemId,
            warehouseId: p.FromWarehouseID,
            binId: p.BinId ?? null,
            toWarehouseId: p.ToWarehouseID,
            toBinId: p.ToBinId,
            transferQty: Math.round(p.TransferQty),
            requestedQty: Math.round(p.RequestedQty ?? 0),
            supplierId: p.SupplierId || null,
            remarks: p.Remarks ?? null,
            mrId,
            reqNo: this.selectedMrNo ?? '',
            sku: p.Sku ?? '',
            companyId,
            createdBy: userId,
            updatedBy: userId
          };
        });

        this.stockService.ApproveTransfersBulk(approvePayload).subscribe({
          next: () => {
            this.loading = false;

            const shortageMsg = shortageSkus.length
              ? `\n\nShortage items kept pending: ${shortageSkus.map(x => x.sku).join(', ')}`
              : '';

            this.showTransferModal = false;
            Swal.fire({
              icon: 'success',
              title: 'Transfer Complete',
              text: `${payload.length} item(s) transferred successfully.${shortageMsg}`,
              confirmButtonColor: '#16a34a'
            }).then(() => {
              this.resetAll();
              this.router.navigate(['/app/inventory/list-stocktransfer']);
            });
          },
          error: (err) => {
            this.loading = false;
            console.error('Approve failed', err);
            Swal.fire({
              icon: 'error',
              title: 'Approve Failed',
              text: err?.error?.message || err?.error?.error || 'Stock inserted but approval failed.'
            });
          }
        });
      },
      error: (err) => {
        this.loading = false;
        console.error('Transfer failed', err);

        Swal.fire({
          icon: 'error',
          title: 'Transfer Failed',
          text: err?.error?.message || 'Something went wrong during transfer.'
        });
      }
    });
  }

  /* ===================== UTIL ===================== */

  private getWarehouseNameById(id: number | null | undefined): string | null {
    if (!id) return null;

    const w = this.warehouses.find(x => Number(x.id) === Number(id));
    return w ? w.name : null;
  }

  loadDestinationBins(warehouseIdOverride?: number): void {
    const whId = warehouseIdOverride ?? this.destinationOutletId;
    if (!whId) { this.toBinList = []; return; }

    const itemIds = (this.mrLines || [])
      .map(l => Number(l.itemId))
      .filter(id => id > 0);

    if (!itemIds.length) { this.toBinList = []; return; }

    this.toBinLoading = true;
    this.destinationBinId = null;

    this.stockAdjService.GetBinsByWarehouseAndItems(whId, itemIds).subscribe({
      next: (res: any) => {
        const data: any[] = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        this.toBinList = data.map((b: any) => ({
          id: Number(b.id ?? b.Id),
          binName: String(b.binName ?? b.BinName ?? b.name ?? b.Name ?? '')
        }));
        this.toBinLoading = false;
      },
      error: () => {
        this.toBinLoading = false;
        this.toBinList = [];
      }
    });
  }

  private resetAll(): void {
    this.selectedMrId = null;
    this.selectedMrNo = null;

    this.destinationOutletId = null;
    this.destinationOutletName = null;

    this.destinationBinId = null;
    this.destinationBinName = null;

    this.selectedFromOutletId = null;
    this.selectedFromOutletName = null;

    this.requesterName = null;
    this.reqDate = null;

    this.mrLines = [];
    this.totalRemainingQty = 0;

    this.shortageCount = 0;
    this.transferableLineCount = 0;
    this.transferErrorText = null;

    this.toBinList = [];
    this.toBinLoading = false;

    this.showTransferModal = false;

    this.rebuildFromOutletOptions();
    this.applyGrid();
  }

  openTransferModal(): void {
    if (this.selectedMrId && this.selectedFromOutletId) {
      this.transferErrorText = null;
      this.showTransferModal = true;
    }
  }

  closeTransferModal(): void {
    if (!this.loading) {
      this.showTransferModal = false;
      this.transferErrorText = null;
    }
  }

  goToStockOverviewList(): void {
    this.router.navigate(['/app/inventory/list-stackoverview']);
  }
}

