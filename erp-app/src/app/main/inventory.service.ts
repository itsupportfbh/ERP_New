// ================================================================
// File: inventory.service.ts
// ================================================================
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { Observable, forkJoin } from 'rxjs';
import { ItemMasterAPIUrls } from 'Urls/ItemMasterAPIUrls';

// ── GRN interfaces ────────────────────────────────────────────────
export interface ApplyGrnLine {
  itemCode   : string;
  supplierId ?: number | null;
  warehouseId: number;
  binId      ?: number | null;
  strategyId ?: number | null;
  qtyDelta   : number;
  batchFlag  ?: boolean;
  serialFlag ?: boolean;
  barcode    ?: string | null;
  price      ?: number | null;
  remarks    ?: string | null;
  // Recipe shortage reservation move
  sourceType?: string | null;
  isRecipeShortage?: boolean;
  reservedWarehouseId?: number | null;
  reservedBinId?: number | null;
}

export interface ApplyGrnRequest {
  grnNo         ?: string;
  receptionDate ?: string | Date;
  updatedBy     ?: any;
  lines          : ApplyGrnLine[];
}

export interface UpdateWarehouseAndSupplierPriceDto {
  itemCode   : string;
  warehouseId: number;
  binId      ?: number | null;
  strategyId ?: number | null;
  qtyDelta   : number;
  batchFlag  ?: boolean;
  serialFlag ?: boolean;
  supplierId ?: number | null;
  price      ?: number | null;
  barcode    ?: string | null;
  remarks    ?: string | null;
  updatedBy  ?: any;
   // Recipe shortage reservation move
  sourceType?: string | null;
  isRecipeShortage?: boolean;
  reservedWarehouseId?: number | null;
  reservedBinId?: number | null;
}

// ── Stock History filter interfaces ───────────────────────────────
export interface StockHistoryListFilter {
  search     ?: string | null;
  warehouseId?: number | null;
  status     ?: string | null;
  categoryId ?: number | null;
}

export interface StockHistoryDetailFilter {
  itemId      : number;
  warehouseId?: number | null;
  txnType    ?: string | null;
  fromDate   ?: string | null;
  toDate     ?: string | null;
}

@Injectable({ providedIn: 'root' })
export class InventoryService {

  private url = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── GRN ─────────────────────────────────────────────────────────
  applyGrnToInventory(req: ApplyGrnRequest): Observable<any> {
    return this.http.post<any>(this.url + ItemMasterAPIUrls.ApplyGrn, req);
  }

  updateWarehouseAndSupplierPrice(dto: UpdateWarehouseAndSupplierPriceDto): Observable<any> {
    return this.http.post<any>(this.url + ItemMasterAPIUrls.UpdateWarehouseAndSupplierPrice, dto);
  }

  batchUpdateWarehouseAndSupplierPrice(dtos: UpdateWarehouseAndSupplierPriceDto[]): Observable<any[]> {
    return forkJoin(dtos.map(d => this.updateWarehouseAndSupplierPrice(d)));
  }

  // ── Stock History List ───────────────────────────────────────────
  // GET /api/StockHistory/list
  getStockHistoryList(filters: StockHistoryListFilter): Observable<any> {
    const params: any = {};

    if (filters.search?.trim())       params.search      = filters.search.trim();
    if (filters.warehouseId != null)  params.warehouseId = filters.warehouseId;
    if (filters.status?.trim())       params.status      = filters.status.trim();
    if (filters.categoryId  != null)  params.categoryId  = filters.categoryId;

    return this.http.get<any>(`${this.url}/StockHistory/list`, { params });
  }

  // ── Stock History Detail ─────────────────────────────────────────
  // GET /api/StockHistory/detail
  getStockHistoryDetail(filters: StockHistoryDetailFilter): Observable<any> {
    const params: any = {};

    if (filters.itemId)               params.itemId      = filters.itemId;
    if (filters.warehouseId != null)  params.warehouseId = filters.warehouseId;
    if (filters.txnType?.trim())      params.txnType     = filters.txnType.trim();
    if (filters.fromDate?.trim())     params.fromDate    = filters.fromDate.trim();
    if (filters.toDate?.trim())       params.toDate      = filters.toDate.trim();

    return this.http.get<any>(`${this.url}/StockHistory/detail`, { params });
  }
}