import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StackOverviewService } from '../../stack-overview/stack-overview.service';

type StockHistoryItem = {
  id: number;                         // Stock row id (or history id if that’s what API returns)
  name: string;
  sku: string;
  fromWarehouseId: number;
  fromWarehouseName: string;
  toWarehouseId: number | null;
  toWarehouseName: string | null;
  transferQty: number;
  available: number;
  occurredAt?: string | Date | null;
};

@Component({
  standalone: false,
  selector: 'app-stock-history',
  templateUrl: './stock-history.component.html',
  styleUrls: ['./stock-history.component.scss']
})
export class StockHistoryComponent implements OnInit {
  // ✅ use stockId instead of itemId
  stockId: number | null = null;

  sku: string | null = null;
  warehouseId: number | null = null;

  stockHistory: StockHistoryItem[] = [];
  StockHistoryData: any;

  constructor(
    private route: ActivatedRoute,
    private stockservice: StackOverviewService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(p => {
      const stockIdStr = p.get('stockId') ?? p.get('StockId');   // be tolerant to casing
      const whIdStr = p.get('warehouseId') ?? p.get('WarehouseId');

      this.stockId = stockIdStr !== null ? Number(stockIdStr) : null;
      this.sku = p.get('sku');
      this.warehouseId = whIdStr !== null ? Number(whIdStr) : null;

      this.loadHistoryData();
    });
  }

  /** Map arbitrary API keys to the view model shape */
  private toViewModel(d: any): StockHistoryItem {
    return {
      id: d.id ?? d.Id ?? d.stockId ?? d.StockId, // prefer a stable id; fallback to stockId
      name: d.name ?? d.ItemName ?? '',
      sku: d.sku ?? d.Sku ?? '',
      fromWarehouseId: d.fromWarehouseId ?? d.fromWarehouseID ?? d.FromWarehouseId ?? d.FromWarehouseID,
      fromWarehouseName: d.fromWarehouseName ?? d.FromWarehouseName ?? '',
      toWarehouseId: d.toWarehouseId ?? d.toWarehouseID ?? d.ToWarehouseId ?? d.ToWarehouseID ?? null,
      toWarehouseName: d.toWarehouseName ?? d.ToWarehouseName ?? null,
      transferQty: Number(d.transferQty ?? d.TransferQty ?? 0),
      available: Number(d.available ?? d.Available ?? 0),
      occurredAt: d.occurredAt ?? d.OccurredAt ?? d.createdDate ?? d.CreatedDate ?? null
    };
  }

  /** Load by stockId (not itemId) */
  loadHistoryData(): void {
    if (!this.stockId || !Number.isFinite(this.stockId)) {
      this.stockHistory = [];
      return;
    }

    // ✅ Call your API by stockId now
    this.stockservice.GetByIdStockHistory(this.stockId).subscribe((res: any) => {
      const data = res?.data;

      if (Array.isArray(data)) {
        this.stockHistory = data.map(d => this.toViewModel(d));
      } else if (data && typeof data === 'object') {
        this.stockHistory = [this.toViewModel(data)];
      } else {
        this.stockHistory = [];
      }
    });
  }

  trackById = (_: number, it: StockHistoryItem) => it.id;

  title(it: StockHistoryItem): string {
    return `Transfer ${it.sku} (${it.name})`;
  }

  pointClass(it: StockHistoryItem): string {
    // simple example: pending if no toWarehouseId
    return it.toWarehouseId ? 'bg-success' : 'bg-warning';
  }
}

