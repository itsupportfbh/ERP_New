import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import * as feather from 'feather-icons';
import Swal from 'sweetalert2';

import { StockTakeService } from '../stock-take.service';
import { WarehouseService } from 'app/main/master/warehouse/warehouse.service';
import { StrategyService } from 'app/main/master/strategies/strategy.service';
import { ItemMasterService } from '../../item-master/item-master.service';
import { BinService } from '../../../master/bin/bin.service';
import { StockIssueService } from 'app/main/master/stock-issue/stock-issue.service';
import { SupplierService } from 'app/main/businessPartners/supplier/supplier.service';
import { QuickAddType, QuickAddResult } from 'app/shared/components/quick-add-modal/quick-add-modal.component';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

interface StockTakeLine {
  id: number;
  stockTakeId?: number;
  itemId: number | string | null;
  warehouseTypeId?: number;
  WarehouseTypeId?: number;
  supplierId: number;
  supplierName?: string | null;

  itemName: string | null;
  binId: number;
  binName?: string | null;

  onHand: number | null;
  badOnHand?: number | null;
  purchaseQty?: number | null;

  baseUomId?: number | null;
  purchaseUomId?: number | null;
  baseUomName?: string | null;
  purchaseUomName?: string | null;
  uomFactor?: number | null;

  countedQty: number | null;
  badCountedQty: number | null;
  barcode?: string | null;
  reasonId: number | string | null;
  remarks?: string | null;

  _error?: string | null;
  selected: boolean;
  status?: any;
}

@Component({
  standalone: false,
  selector: 'app-stock-take',
  templateUrl: './stock-take.component.html',
  styleUrls: ['./stock-take.component.scss']
})
export class StockTakeComponent implements OnInit {

  warehouseTypes: any[] = [];
  LocationTypes: any[] = [];
  strategies: any[] = [];
  itemList: any[] = [];
  reasonList: any[] = [];
  supplierList: any[] = [];

  stockTakeDate: string = new Date().toISOString().substring(0, 10);
  warehouseTypeId: any = null;
  supplierId: number | null = null;
  strategyId: number | null = null;
  freeze = false;
  status: any;

  lines: StockTakeLine[] = [];
  reviewRows: StockTakeLine[] = [];

  showStockReview = false;

  qaType: QuickAddType | null = null;
  qaVisible = false;
  qaName = '';
  private qaTarget = '';

  selectAllReview = false;
  strategyCheck = false;
  stockTakeId: number = 0;

  functionId = 'stocktake-list';
  permission: FunctionPermission;

  @ViewChild('reviewTpl', { static: true }) reviewTpl!: any;
  @ViewChild('chkSelectAllRef') chkSelectAllRef!: ElementRef<HTMLInputElement>;
  private reviewRef?: NgbModalRef;

  constructor(
    private router: Router,
    private modal: NgbModal,
    private stockTakeService: StockTakeService,
    private warehouseService: WarehouseService,
    private BinService: BinService,
    private strategyService: StrategyService,
    private itemMasterService: ItemMasterService,
    private route: ActivatedRoute,
    private StockissueService: StockIssueService,
    private supplierService: SupplierService,
    private cd: ChangeDetectorRef,
    private permissionService: PermissionService
  ) {
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  /** Approving the variance is a supervisor step — an Executive only records the count. */
  canApprove(): boolean {
    return this.permissionService.hasApprove(this.permission);
  }

  private loadPermission(): void {
    const userId = Number(localStorage.getItem('id') || 0);
    if (userId <= 0) return;
    this.permissionService.getFunctionPermission(userId, this.functionId).subscribe({
      next: res => { this.permission = res || this.permissionService.getEmptyPermission(this.functionId); },
      error: () => { this.permission = this.permissionService.getEmptyPermission(this.functionId); }
    });
  }

  ngOnInit(): void {
    this.loadPermission();
    forkJoin({
      warehouse: this.warehouseService.getWarehouse(),
      bin: this.BinService.getAllBin(),
      strategy: this.strategyService.getStrategy(),
      item: this.itemMasterService.getAllItemMaster(),
      reason: this.StockissueService.getAllStockissue(),
      supplier: this.supplierService.GetAllSupplier(),
    }).subscribe((results: any) => {
      this.warehouseTypes = results.warehouse ?? [];        // already mapped to array
      this.LocationTypes = results.bin ?? [];               // already mapped to array
      this.strategies = results.strategy ?? [];             // already mapped to array
      this.itemList = results.item?.data ?? [];             // raw API response
      this.reasonList = results.reason ?? [];               // already mapped to array
      this.supplierList = results.supplier ?? [];           // already mapped to array

      this.loadEditDataIfAny();
    }, (err: any) => {
      Swal.fire({ icon: 'error', title: 'Error', text: err?.error?.message || 'Failed to load data.', confirmButtonColor: '#16a34a' });
    });
  }

  ngAfterViewInit(): void {
    feather.replace();
  }

  ngAfterViewChecked(): void {
    feather.replace();
  }

  private loadEditDataIfAny(): void {
    this.route.paramMap.subscribe((params: any) => {
      const idStr = params.get('id');
      this.stockTakeId = idStr ? Number(idStr) : 0;

      if (!this.stockTakeId) return;

      this.stockTakeService.getStockTakeById(this.stockTakeId).subscribe((res: any) => {
        const data = res?.data;
        if (!data) return;

        this.warehouseTypeId = data.warehouseTypeId;
        this.stockTakeDate = (data.stockTakeDate || '').substring(0, 10);
        this.supplierId = data.supplierId ? Number(data.supplierId) : null;
        this.strategyId = data.strategyId ? Number(data.strategyId) : null;
        this.freeze = !!data.freeze;
        this.status = data.status;

        this.lines = (data.lineItems || []).map((x: any) => this.mapLine(x));
        this.reviewRows = this.lines.map(l => ({ ...l, selected: !!l.selected }));

        this.updateSelectAllFromRows();
      });
    });
  }

  openQa(type: QuickAddType, target: string, text: string): void {
    this.qaType = type;
    this.qaTarget = target;
    this.qaName = text || '';
    this.qaVisible = true;
  }

  qaCreated(e: QuickAddResult): void {
    if (!e?.id) { this.qaVisible = false; return; }
    switch (this.qaTarget) {
      case 'warehouse':
        this.warehouseTypes = [...this.warehouseTypes, { name: e.label, id: e.id }];
        this.warehouseTypeId = e.id;
        break;
    }
    this.qaVisible = false;
  }

  onSupplierChanged(v: number | null): void {
    this.supplierId = v ?? null;
    this.resetLines();
  }

  onTypeChanged(v: number | null): void {
    this.strategyId = v ?? null;
    this.resetLines();
  }

  private resetLines(): void {
    this.lines = [];
    this.reviewRows = [];
    this.selectAllReview = false;
    this.showStockReview = false;
    this.cd.detectChanges();
  }

  onSubmit(): void {
    this.showStockReview = false;
    this.resetLines();

    if (!this.warehouseTypeId) {
      Swal.fire({
        title: 'Failed',
        text: 'Please Fill Mandatory Fields',
        icon: 'error',
        allowOutsideClick: false,
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    const req = this.buildPlanReq();

    this.stockTakeService.getWarehouseItems(req).subscribe({
      next: (res: any) => {
        const raw = res?.data || [];
        this.lines = raw.map((l: any) => this.mapLine(l));

        if (!this.lines.length) {
          Swal.fire({
            icon: 'warning',
            title: 'No Items in Stocktake list.',
            confirmButtonColor: '#16a34a'
          });
        }
      },
      error: (err) => {
        this.lines = [];
        const msg = err?.error?.message || err?.message || 'Unable to load stock take items.';
        Swal.fire({
          icon: 'warning',
          title: 'Warning',
          text: msg,
          confirmButtonText: 'OK',
          confirmButtonColor: '#16a34a'
        });
      }
    });
  }

  private buildPlanReq() {
    return {
      warehouseTypeId: this.warehouseTypeId ?? null,
      supplierId: Number(this.supplierId ?? 0),
      strategyId: Number(this.strategyId ?? 0),
      freeze: !!this.freeze,
    };
  }

  private mapLine(dto: any): StockTakeLine {
    return {
      id: Number(dto.id ?? 0),
      stockTakeId: Number(dto.stockTakeId ?? 0),
      itemId: dto.itemId ?? null,
      itemName: dto.itemName ?? null,

      binId: Number(dto.binId ?? 0),
      binName: dto.binName ?? null,

      supplierId: Number(dto.supplierId ?? 0),
      supplierName: dto.supplierName ?? '',

      warehouseTypeId: Number(dto.warehouseTypeId ?? dto.WarehouseTypeId ?? this.warehouseTypeId ?? 0),
      WarehouseTypeId: Number(dto.warehouseTypeId ?? dto.WarehouseTypeId ?? this.warehouseTypeId ?? 0),

      onHand: this.toNum(dto.onHand),
      badOnHand: this.toNum(dto.badOnHand),
      purchaseQty: this.toNum(dto.purchaseQty),

      baseUomId: dto.baseUomId ?? null,
      purchaseUomId: dto.purchaseUomId ?? null,
      baseUomName: dto.baseUomName ?? '',
      purchaseUomName: dto.purchaseUomName ?? '',
      uomFactor: Number(dto.uomFactor ?? 1),

      countedQty: this.toNum(dto.countedQty),
      badCountedQty: this.toNum(dto.badCountedQty),

      barcode: dto.barcode ?? '',
      reasonId: dto.reasonId ?? 0,
      remarks: dto.remarks ?? '',
      selected: !!dto.selected,
      status: dto.status ?? this.status,
      _error: null
    };
  }

  private normalizeQty(value: any): number | null {
    if (value === null || value === undefined || value === '') return 0;

    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;

    return Number(n.toFixed(4));
  }

  onCountChange(r: StockTakeLine): void {
    this.showStockReview = false;
    const n = this.normalizeQty(r.countedQty);

    if (n === null) {
      r.countedQty = null;
      r._error = 'Enter a valid number (â‰¥ 0)';
      return;
    }

    r.countedQty = n;
    r._error = null;
    this.syncReviewRow(r);
  }

  onUnCountChange(r: StockTakeLine): void {
    this.showStockReview = false;
    const n = this.normalizeQty(r.badCountedQty);

    if (n === null) {
      r.badCountedQty = null;
      r._error = 'Enter a valid number (â‰¥ 0)';
      return;
    }

    r.badCountedQty = n;
    r._error = null;
    this.syncReviewRow(r);
  }

  private syncReviewRow(line: StockTakeLine): void {
    const idx = this.reviewRows.findIndex(x =>
      x.id === line.id &&
      x.itemId === line.itemId &&
      x.binId === line.binId &&
      x.supplierId === line.supplierId
    );

    if (idx >= 0) {
      this.reviewRows[idx] = {
        ...this.reviewRows[idx],
        ...line,
        selected: this.reviewRows[idx].selected ?? false
      };
      this.reviewRows = [...this.reviewRows];
    }
  }

  toNum(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  getTotalQty(r: StockTakeLine): number {
    return this.toNum(r.countedQty) + this.toNum(r.badCountedQty);
  }

  getVariance(r: StockTakeLine): number {
    return this.getTotalQty(r) - this.toNum(r.onHand);
  }

  signed(n: number): string {
    return (n >= 0 ? '+' : '') + Number(n.toFixed(4));
  }

  getItemName(id: number | string | null): string {
    const x = this.itemList?.find(i => Number(i.id) === Number(id));
    return x?.itemName ?? String(id ?? '');
  }

  getBinName(id: number | string | null): string {
    const x = this.LocationTypes?.find(i => Number(i.id) === Number(id));
    return x?.binName ?? String(id ?? '');
  }

  onCheckReview(): void {
    this.showStockReview = false;
  }

  toggleStockReview(): void {
    this.showStockReview = !this.showStockReview;

    if (this.showStockReview) {
      this.reviewRows = (this.lines || []).map(l => ({
        ...l,
        selected: l.selected ?? false
      }));
      this.updateSelectAllFromRows();
    }
  }

  toggleSelectAllReview(): void {
    (this.reviewRows || []).forEach(r => r.selected = this.selectAllReview);
    if (this.chkSelectAllRef) {
      this.chkSelectAllRef.nativeElement.indeterminate = false;
    }
  }

  onRowSelectedChanged(): void {
    this.updateSelectAllFromRows();
  }

  private updateSelectAllFromRows(): void {
    const total = this.reviewRows?.length || 0;
    const selectedCount = (this.reviewRows || []).filter(r => !!r.selected).length;

    this.selectAllReview = total > 0 && selectedCount === total;

    const indeterminate = selectedCount > 0 && selectedCount < total;
    if (this.chkSelectAllRef) {
      this.chkSelectAllRef.nativeElement.indeterminate = indeterminate;
    }
  }

  onSave(status: number): void {
    this.status = status;

    const errs: string[] = [];

    if (!this.lines.length) errs.push('No lines to save.');

    this.lines.forEach((L, i) => {
      if (!L.itemId) errs.push(`Line ${i + 1}: Item is required.`);
      if (L.countedQty == null || !Number.isFinite(Number(L.countedQty)) || Number(L.countedQty) < 0) {
        errs.push(`Line ${i + 1}: Accepted Qty must be â‰¥ 0.`);
      }
      if (L.badCountedQty == null || !Number.isFinite(Number(L.badCountedQty)) || Number(L.badCountedQty) < 0) {
        errs.push(`Line ${i + 1}: Faulty Qty must be â‰¥ 0.`);
      }
      if (this.toNum(L.badCountedQty) > 0 && !L.reasonId) {
        errs.push(`Line ${i + 1}: Reason is required for faulty qty.`);
      }
    });

    if (errs.length) {
      this.showErrors(errs);
      return;
    }

    const payload = this.buildSavePayload(this.lines, status, false);

    const req$ = this.stockTakeId
      ? this.stockTakeService.updateStockTake(payload)
      : this.stockTakeService.insertStockTake(payload);

    req$.subscribe({
      next: (res: any) => {
        if (res?.isSuccess) {
          Swal.fire({
            title: 'Success',
            text: res.message || 'Stock take saved.',
            icon: 'success',
            allowOutsideClick: false,
            confirmButtonColor: '#16a34a'
          });
          this.router.navigateByUrl('/app/inventory/list-stocktake');
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Failed',
            text: res?.message || 'Unable to save.',
            confirmButtonColor: '#16a34a'
          });
        }
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err?.error?.message || 'Something went wrong while saving.',
          confirmButtonColor: '#16a34a'
        });
      }
    });
  }

  onSaveStockReview(status: number): void {
    this.status = status;

    if (!this.reviewRows.length) {
      Swal.fire({
        icon: 'info',
        title: 'No lines',
        text: 'There are no lines to send.',
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    if (!this.hasAnySelected(this.reviewRows)) {
      Swal.fire({
        icon: 'warning',
        title: 'No lines selected',
        text: 'Select at least one line in the Stock Review before Approved.',
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    const errs: string[] = [];

    this.reviewRows.forEach((L, i) => {
      if (L.selected && this.toNum(L.badCountedQty) > 0 && !L.reasonId) {
        errs.push(`Review Line ${i + 1}: Reason is required for faulty qty.`);
      }
    });

    if (errs.length) {
      this.showErrors(errs);
      return;
    }

    const payload = this.buildSavePayload(this.reviewRows, status, true);

    const req$ = this.stockTakeId
      ? this.stockTakeService.updateStockTake(payload)
      : this.stockTakeService.insertStockTake(payload);

    req$.subscribe({
      next: (res: any) => {
        if (res?.isSuccess) {
          Swal.fire({
            icon: 'success',
            title: 'Review updated',
            text: res.message || 'Lines saved.',
            confirmButtonColor: '#16a34a'
          });
          this.showStockReview = false;
          this.router.navigateByUrl('/app/inventory/list-stocktake');
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Failed',
            text: res?.message || 'Unable to save review.',
            confirmButtonColor: '#16a34a'
          });
        }
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: err?.error?.message || 'Something went wrong while saving review.',
          confirmButtonColor: '#16a34a'
        });
      }
    });
  }

  private buildSavePayload(rows: StockTakeLine[], status: number, keepSelected: boolean): any {
    return {
      id: this.stockTakeId ?? 0,
      warehouseTypeId: this.warehouseTypeId,
      stockTakeDate: this.stockTakeDate,
      supplierId: Number(this.supplierId ?? 0),
      strategyId: Number(this.strategyId ?? 0),
      freeze: !!this.freeze,
      status: status,

      lineItems: rows.map(L => {
        const good = this.toNum(L.countedQty);
        const bad = this.toNum(L.badCountedQty);
        const total = good + bad;

        return {
          id: Number(L.id ?? 0),
          itemId: L.itemId,
          binId: L.binId,
          warehouseTypeId: this.warehouseTypeId,
          WarehouseTypeId: this.warehouseTypeId,
          supplierId: Number(L.supplierId ?? this.supplierId ?? 0),
          status: status,
          onHand: this.toNum(L.onHand),
          countedQty: good,
          badCountedQty: bad,
          varianceQty: total - this.toNum(L.onHand),
          reasonId: bad > 0 ? Number(L.reasonId ?? 0) : 0,
          barcode: (L.barcode ?? '').trim() || null,
          remarks: (L.remarks ?? '').trim() || null,
          selected: keepSelected ? !!L.selected : false
        };
      })
    };
  }

  private showErrors(errs: string[]): void {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    Swal.fire({
      title: 'Fix these issues',
      icon: 'error',
      html: `<div style="text-align:left"><ul>${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`,
      confirmButtonText: 'OK',
      allowOutsideClick: false,
      confirmButtonColor: '#16a34a'
    });
  }

  private hasAnySelected(rows: StockTakeLine[]): boolean {
    return rows.some(l => !!l.selected);
  }

  goToStockTakeList(): void {
    this.router.navigate(['/app/inventory/list-stocktake']);
  }

  openReview(): void {
    if (!this.lines.length) {
      Swal.fire({
        title: 'Failed',
        text: 'Please Fill Line Items',
        icon: 'error',
        allowOutsideClick: false,
        confirmButtonColor: '#16a34a'
      });
      return;
    }

    this.reviewRef = this.modal.open(this.reviewTpl, {
      size: 'lg',
      centered: true,
      backdrop: 'static'
    });
  }
}

