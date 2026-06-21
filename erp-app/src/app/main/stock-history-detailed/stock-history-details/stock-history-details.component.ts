// ================================================================
// File: stock-history-details.component.ts
// ================================================================
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InventoryService } from '../../inventory.service';
import { WarehouseService } from 'app/main/master/warehouse/warehouse.service';

export interface ItemDetailHeader {
  itemId    : number;
  sku       : string;
  name      : string;
  category  : string;
  uom       : string;
  warehouse : string;
  onHand    : number;
  reserved  : number;
  available : number;
  reorderQty: number;
  status    : 'In Stock' | 'Low Stock' | 'Zero Stock';
}

export interface StockTransaction {
  txnDate      : string;
  sourceType   : string;
  referenceNo  : string;
  qtyIn        : number;
  qtyOut       : number;
  adjustment   : number;
  qtyBefore    : number;
  qtyAfter     : number;
  unitCost     : number;
  totalCost    : number;
  reason       : string;
  createdBy    : string;
  warehouseId? : number;
  warehouseName: string;
  binId?       : number;
  binName      : string;
}

@Component({
  standalone: false,
  selector   : 'app-stock-history-details',
  templateUrl: './stock-history-details.component.html',
  styleUrls  : ['./stock-history-details.component.scss']
})
export class StockHistoryDetailsComponent implements OnInit, OnDestroy {

  itemId  = 0;
  itemSku = '';

  itemDetail     : ItemDetailHeader | null = null;
  allTransactions: StockTransaction[]      = [];
  pagedHistory   : StockTransaction[]      = [];

  warehouses: any[] = [];

  // â”€â”€ Summary KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  totalIn           = 0;
  totalOut          = 0;
  totalAdj          = 0;
  totalTransactions = 0;

  // â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  currentPage  = 1;
  pageSize     = 10;
  totalPages   = 1;
  pageStart    = 0;
  pageEnd      = 0;
  visiblePages : (number | string)[] = [];

  // â”€â”€ Filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  filters = {
    warehouseId: null as number | null,
    txnType    : null as string | null,
    fromDate   : '',
    toDate     : ''
  };

  txnTypes = [
    { label: 'GRN',          value: 'GRN'          },
    { label: 'Transfer In',  value: 'Transfer In'  },
    { label: 'Transfer Out', value: 'Transfer Out' },
    { label: 'Stock Take',   value: 'Stock Take'   }
  ];

  loading = false;

  private destroy$ = new Subject<void>();

  get avatarLetters(): string {
    if (!this.itemDetail?.name) return 'IT';
    return this.itemDetail.name.split(' ').slice(0, 2).map(x => x[0]).join('').toUpperCase();
  }

  constructor(
    private route           : ActivatedRoute,
    private router          : Router,
    private inventoryService: InventoryService,
    private warehouseService: WarehouseService
  ) {}

  // â”€â”€ Lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ngOnInit(): void {
    this.loadWarehouses();

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.itemId  = +params['itemId'] || 0;
      this.itemSku = params['sku']     || '';

      const whId = params['warehouseId'] ? +params['warehouseId'] : null;
      if (whId) this.filters.warehouseId = whId;

      if (this.itemId > 0) this.loadData();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // â”€â”€ Load warehouses for filter dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  loadWarehouses(): void {
    this.warehouseService.getWarehouse()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next : (res: any) => { this.warehouses = res?.data || res || []; },
        error: ()         => { this.warehouses = []; }
      });
  }

  // â”€â”€ Load transaction detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  loadData(): void {
    this.loading = true;

    this.inventoryService.getStockHistoryDetail({
      itemId     : this.itemId,
      warehouseId: this.filters.warehouseId,
      txnType    : this.filters.txnType,
      fromDate   : this.filters.fromDate   || null,
      toDate     : this.filters.toDate     || null
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (res: any) => {
        const data = res?.data || [];

        this.allTransactions = data.map((x: any): StockTransaction => ({
          txnDate      : x.movementDate   ?? x.MovementDate   ?? '',
          sourceType   : x.sourceType     ?? x.SourceType     ?? '',
          referenceNo  : x.sourceNo       ?? x.SourceNo       ?? '',
          qtyIn        : Number(x.inQty        ?? x.InQty        ?? 0),
          qtyOut       : Number(x.outQty       ?? x.OutQty       ?? 0),
          adjustment   : Number(x.netQty       ?? x.NetQty       ?? 0),
          qtyBefore    : Number(x.beforeQty    ?? x.BeforeQty    ?? 0),
          qtyAfter     : Number(x.afterQty     ?? x.AfterQty     ?? 0),
          unitCost     : Number(x.unitCost     ?? x.UnitCost     ?? 0),
          totalCost    : Number(x.totalCost    ?? x.TotalCost    ?? 0),
          reason       : x.remarks         ?? x.Remarks         ?? '',
          createdBy    : x.createdBy       ?? x.CreatedBy       ?? '',
          warehouseId  : Number(x.warehouseId  ?? x.WarehouseId  ?? 0),
          warehouseName: x.warehouseName   ?? x.WarehouseName   ?? '',
          binId        : Number(x.binId        ?? x.BinId        ?? 0),
          binName      : x.binName         ?? x.BinName         ?? ''
        }));

        this.totalTransactions = this.allTransactions.length;
        this.calcSummary(this.allTransactions);
        this.buildHeader(data);
        this.currentPage = 1;
        this.applyPaging();

        this.loading = false;
        this.refreshFeather();
      },
      error: () => {
        this.itemDetail        = null;
        this.allTransactions   = [];
        this.pagedHistory      = [];
        this.totalTransactions = 0;
        this.calcSummary([]);
        this.applyPaging();
        this.loading = false;
      }
    });
  }

  // â”€â”€ Build item header card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private buildHeader(data: any[]): void {
    const first = data?.[0];

    const selectedWh = this.warehouses.find(
      x => Number(x.id || x.Id) === Number(this.filters.warehouseId)
    );

    const onHand = this.getDisplayOnHand();

    this.itemDetail = {
      itemId    : this.itemId,
      sku       : first?.sku      ?? first?.Sku      ?? this.itemSku,
      name      : first?.itemName ?? first?.ItemName ?? '-',
      category  : '-',
      uom       : '-',
      warehouse : this.filters.warehouseId
        ? (selectedWh?.name || selectedWh?.Name || first?.warehouseName || '-')
        : 'All Warehouses',
      onHand    : onHand,
      reserved  : 0,
      available : onHand,
      reorderQty: 0,
      status    : onHand <= 0 ? 'Zero Stock' : 'In Stock'
    };
  }

  private getDisplayOnHand(): number {
    if (!this.allTransactions.length) return 0;

    if (this.filters.warehouseId) {
      return Number(this.allTransactions[0]?.qtyAfter || 0);
    }

    const latestByWh = new Map<number, StockTransaction>();
    this.allTransactions.forEach(row => {
      const whId = Number(row.warehouseId || 0);
      if (whId && !latestByWh.has(whId)) latestByWh.set(whId, row);
    });

    let total = 0;
    latestByWh.forEach(row => { total += Number(row.qtyAfter || 0); });
    return total;
  }

  // â”€â”€ KPI summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private calcSummary(txns: StockTransaction[]): void {
    this.totalIn  = txns.reduce((s, x) => s + Number(x.qtyIn  || 0), 0);
    this.totalOut = txns.reduce((s, x) => s + Number(x.qtyOut || 0), 0);
    this.totalAdj = txns
      .filter(x => x.sourceType === 'Stock Take')
      .reduce((s, x) => s + Number(x.adjustment || 0), 0);
  }

  // â”€â”€ Pagination â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  private applyPaging(): void {
    this.totalPages = Math.ceil(this.totalTransactions / Number(this.pageSize)) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = 1;

    const start      = (this.currentPage - 1) * Number(this.pageSize);
    this.pagedHistory = this.allTransactions.slice(start, start + Number(this.pageSize));

    this.updatePageMeta();
    this.buildVisiblePages();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.applyPaging();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.applyPaging();
  }

  private updatePageMeta(): void {
    this.pageStart = this.totalTransactions === 0
      ? 0
      : (this.currentPage - 1) * Number(this.pageSize) + 1;
    this.pageEnd = Math.min(this.currentPage * Number(this.pageSize), this.totalTransactions);
  }

  buildVisiblePages(): void {
    const pages: (number | string)[] = [];
    const total = this.totalPages, cur = this.currentPage;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cur > 3) pages.push('...');
      for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
      if (cur < total - 2) pages.push('...');
      pages.push(total);
    }

    this.visiblePages = pages;
  }

  // â”€â”€ Filter actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  applyFilters(): void {
    this.currentPage = 1;
    this.loadData();
  }

  clearFilters(): void {
    this.filters = { warehouseId: null, txnType: null, fromDate: '', toDate: '' };
    this.currentPage = 1;
    this.loadData();
  }

  // â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  goBack()    : void { this.router.navigate(['/app/inventory/list-stock-history']); }
  exportExcel(): void {
    const rows = this.allTransactions || [];
    if (!rows.length) return;

    const headers = ['Date', 'Source', 'Reference', 'Warehouse', 'Bin', 'In', 'Out', 'Adjustment', 'Qty After'];
    const csvRows = rows.map((r: any) => [
      r.txnDate ?? '',
      r.sourceType ?? '',
      r.sourceNo ?? '',
      r.warehouseName ?? '',
      r.binName ?? '',
      r.qtyIn ?? 0,
      r.qtyOut ?? 0,
      r.adjustment ?? 0,
      r.qtyAfter ?? 0
    ]);
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...csvRows].map(row => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock-history-detail.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  printPage() : void { window.print(); }

  private refreshFeather(): void {
    setTimeout(() => { if ((window as any).feather) (window as any).feather.replace(); }, 0);
  }
}


