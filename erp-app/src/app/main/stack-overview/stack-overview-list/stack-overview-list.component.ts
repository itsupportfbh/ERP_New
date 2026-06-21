import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { StackOverviewService } from '../stack-overview.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import Swal from 'sweetalert2';
import { PeriodCloseService } from 'app/main/financial/period-close-fx/period-close-fx.service';
import { TableColumn, RowAction } from 'app/shared/components/data-table/data-table.component';

/** Raw row from API (per bin / per warehouse row) */
interface ApiStockRow {
  id: number;                // itemId
  sku: string;
  name: string;
  category?: string;
  uom?: string;

  warehouseId?: number;
  warehouseName?: string;
  binId?: number | null;
  binName?: string | null;

  qty?: number;
  onHand?: number;
  reserved?: number;
  available?: number;
  supplierId?: number;
  supplierName?: string;
  expiryDate?: string;       // ISO string
}

/** Location line (bin row for any warehouse) */
interface ItemLocation {
  warehouseId?: number;
  warehouseName?: string;
  binId?: number | null;
  binName?: string | null;
  supplierId?: number | null;
  supplierName?: string | null;
  onHand?: number;
  reserved?: number;
  available?: number;
  expiryDate?: string | null;
}

/** Grid row: one row per itemId (aggregated across all warehouses) */
export interface ItemWarehouseRow {
  gridKey: string;           // `${itemId}`
  id: number;                // itemId
  sku: string;
  name: string;
  category?: string;
  uom?: string;

  // totals across ALL warehouses
  totalOnHand?: number;
  totalReserved?: number;
  totalAvailable?: number;

  // all bin lines (for modal)
  locations: ItemLocation[];
}

@Component({
  standalone: false,
  selector: 'app-stack-overview-list',
  templateUrl: './stack-overview-list.component.html',
  styleUrls: ['./stack-overview-list.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class StackOverviewListComponent implements OnInit {
  showViewModal = false;

  rows: ItemWarehouseRow[] = [];
  filteredRows: ItemWarehouseRow[] = [];
  tableData: any[] = [];

  columns: TableColumn[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'name', header: 'Item Name', sortable: true },
    { key: 'category', header: 'Category', sortable: true },
    { key: 'uom', header: 'UOM', sortable: true },
    { key: 'totalOnHand', header: 'On Hand (All WH)', type: 'number', sortable: true, align: 'right' },
    { key: 'totalAvailable', header: 'Available (All WH)', type: 'number', sortable: true, align: 'right' }
  ];

  rowActions: RowAction[] = [
    { key: 'view', label: 'View', btnClass: 'btn-outline-info' }
  ];

  selectedItem: ItemWarehouseRow | null = null;

  // paging + search
  pageSizes = [10, 25, 50, 100];
  pageSize = 10;
  currentPage = 1;
  searchValue = '';

  // ui state
  loading = false;
  errorMsg: string | null = null;

     userId: number = 0;
      functionId = 'mr-list';
      
        permission: FunctionPermission;
        isPermissionLoaded = false;
        isPageLoading = false;
 isPeriodLocked = false;
  periodName = '';
  constructor(
    private router: Router,
    private stockService: StackOverviewService,
    private permissionService: PermissionService,
    private periodLock: PeriodCloseService
  ) 
  {
     this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
      this.checkPeriodLockForToday();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const current = this.currentPage;
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.applyPage();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.applyPage();
  }

  applyPage(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    this.tableData = this.filteredRows.slice(start, start + this.pageSize);
  }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view') {
      this.openViewModal(e.row, null);
    }
  }

  private getErrorMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.message || fallback;
  }

  loadPermission(): void {
      if (!this.userId || this.userId <= 0) {
        this.permission = this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
  
        Swal.fire({
          icon: 'warning',
          title: 'Access Denied',
          text: 'User not found. Please login again.',
          confirmButtonColor: '#0e3a4c'
        });
        return;
      }
  
      this.isPageLoading = true;
  
      this.permissionService.getFunctionPermission(this.userId, this.functionId).subscribe({
        next: (res: FunctionPermission) => {
          this.permission = res || this.permissionService.getEmptyPermission(this.functionId);
          this.isPermissionLoaded = true;
          this.isPageLoading = false;
  
          if (this.canView()) {
            this.loadMasterItem();  
          } else {
            this.rows = [];
            // this.isDisplay = false;
          }
        },
        error: (err) => {
          this.permission = this.permissionService.getEmptyPermission(this.functionId);
          this.isPermissionLoaded = true;
          this.isPageLoading = false;
  
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: this.getErrorMessage(err, 'Unable to load permission.'),
            confirmButtonColor: '#d33'
          });
        }
      });
    }
  
    canView(): boolean {
      return this.permissionService.hasView(this.permission);
    }
  
    canCreate(): boolean {
      return this.permissionService.hasCreate(this.permission);
    }
  
    canEdit(): boolean {
      return this.permissionService.hasEdit(this.permission);
    }
  
    canDelete(): boolean {
      return this.permissionService.hasDelete(this.permission);
    }

  /** Stable identity for ngx-datatable */
  rowIdentity = (row: ItemWarehouseRow) => row.gridKey;

loadMasterItem(): void {
  this.loading = true;
  this.errorMsg = null;

  this.stockService.GetAllStockList().subscribe({
    next: (res: any) => {
      const raw: ApiStockRow[] = Array.isArray(res?.data) ? res.data : [];

      // Group by itemId (aggregate across warehouses)
      const map = new Map<number, ItemWarehouseRow>();

      for (const r of raw) {
        const itemId = r.id;

        if (!map.has(itemId)) {
          map.set(itemId, {
            gridKey: String(itemId),
            id: itemId,
            sku: r.sku,
            name: r.name,
            category: r.category,
            uom: r.uom,

            totalOnHand: 0,
            totalReserved: 0,
            totalAvailable: 0,

            locations: []
          });
        }

        const row = map.get(itemId)!;

        // ✅ Always use qty for onHand, and available = qty - reserved
        const totalQty = Number(r.qty) || 0;
        const reserved = Number(r.reserved) || 0;
        const onHand = totalQty;
        const available = totalQty - reserved;

        // Add to totals (all rows count here)
        row.totalOnHand += onHand;
        row.totalReserved += reserved;
        row.totalAvailable += available;

        row.locations.push({
          warehouseId: r.warehouseId,
          warehouseName: r.warehouseName,
          binId: r.binId ?? null,
          binName: r.binName ?? null,
          supplierId: r.supplierId ?? null,
          supplierName: r.supplierName ?? null,
          onHand,
          reserved,
          available,
          expiryDate: r.expiryDate ?? null
        });
      }

      // ✅ Handle reserved display per warehouse (show once)
      const finalList: ItemWarehouseRow[] = [];

      for (const item of map.values()) {
        const processed = item.locations.map(l => ({ ...l }));

        const shownWarehouse = new Set<number>();

        for (const loc of processed) {
          if (loc.warehouseId == null) continue;

          if (shownWarehouse.has(loc.warehouseId)) {
            // Hide reserved visually (don't affect totals)
            loc.reserved = null;
          } else {
            shownWarehouse.add(loc.warehouseId);
            // keep the actual reserved value for this warehouse
          }

          // ✅ Recalculate available (for display) correctly
          const baseQty = Number(loc.onHand) || 0;
          const resv = Number(loc.reserved ?? 0);
          loc.available = baseQty - resv;
        }

        finalList.push({ ...item, locations: processed });
      }

      this.rows = finalList;
      this.filteredRows = [...finalList];
      this.currentPage = 1;
      this.applyPage();
      this.loading = false;
    },
    error: (err) => {
      this.loading = false;
      this.rows = [];
      this.filteredRows = [];
      this.errorMsg = this.getErrorMessage(err, 'Failed to load stock list.');
      Swal.fire('Error', this.errorMsg, 'error');
    }
  });
}



  /** Search across item fields + any warehouse/bin/supplier name via locations */
  applyFilter(): void {
    const q = (this.searchValue || '').toLowerCase().trim();
    if (!q) {
      this.filteredRows = [...this.rows];
      this.currentPage = 1;
      return;
    }

    this.filteredRows = this.rows.filter(r => {
      const baseHit =
        String(r.id ?? '').toLowerCase().includes(q) ||
        (r.sku ?? '').toLowerCase().includes(q) ||
        (r.name ?? '').toLowerCase().includes(q) ||
        (r.category ?? '').toLowerCase().includes(q) ||
        (r.uom ?? '').toLowerCase().includes(q);

      if (baseHit) return true;

      return r.locations?.some(loc =>
        (loc.warehouseName ?? '').toLowerCase().includes(q) ||
        (loc.binName ?? '').toLowerCase().includes(q) ||
        (loc.supplierName ?? '').toLowerCase().includes(q)
      );
    });
    this.currentPage = 1;
    this.applyPage();
  }

  /** Open modal with ALL warehouses/bins for the item */
openViewModal(row: ItemWarehouseRow, tpl: any): void {
  if (!row?.locations) return;

  // Make a copy so original data stays clean
  const processed = [...row.locations.map(l => ({ ...l }))];

  // Track warehouses we already displayed reserved for
  const shownWarehouse = new Set<number>();

  for (const loc of processed) {
    if (loc.warehouseId == null) continue;

    // If this warehouse already shown once, hide reserved in subsequent rows
    if (shownWarehouse.has(loc.warehouseId)) {
      loc.reserved = null; // hide reserved
    } else {
      shownWarehouse.add(loc.warehouseId); // mark as shown
      // Keep the original reserved value (don't sum)
    }
  }

  // Assign and open modal
  this.selectedItem = { ...row, locations: processed };
  this.showViewModal = true;
}



  /** Navigate to create page */
  goToCreateItem(): void {
    this.router.navigate(['/app/inventory/create-stackoverview']);
  }
   private checkPeriodLockForToday(): void {
  const today = new Date().toISOString().substring(0, 10); // yyyy-MM-dd

  this.periodLock.getStatusForDateWithName(today).subscribe({
    next: status => {
      this.isPeriodLocked = !!status?.isLocked;
      this.periodName = status?.periodName || '';
    },
    error: () => {
      this.isPeriodLocked = false;
      this.periodName = '';
    }
  });
}
}

