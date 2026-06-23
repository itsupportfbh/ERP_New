import {
  Component,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  AfterViewInit,
  AfterViewChecked
} from '@angular/core';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { ColumnMode, DatatableComponent } from '@swimlane/ngx-datatable';
import * as feather from 'feather-icons';

import { StackOverviewService } from '../../stack-overview/stack-overview.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import { TableColumn, RowAction } from 'app/shared/components/data-table/data-table.component';

interface ApiRow {
  stockId?: number | string;
  itemId?: number | string;

  sku?: string;
  itemName?: string;

  fromWarehouseId?: number | string;
  toWarehouseId?: number | string;
  fromWarehouseName?: string;
  toWarehouseName?: string;

  transferQty?: number | string | null;
  TransferQty?: number | string | null;
  requestQty?: number | string;

  remarks?: string | null;

  status?: number | string;
}

interface UiRow extends ApiRow {
  stockIdNum?: number;
  itemIdNum?: number;
  fromWarehouseIdNum?: number;
  toWarehouseIdNum?: number;

  transferQtyNum: number | null;

  statusNum: number;
  statusLabel: string;
}

@Component({
  standalone: false,
  selector: 'app-stock-transfer-list',
  templateUrl: './stock-transfer-list.component.html',
  styleUrls: ['./stock-transfer-list.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class StockTransferListComponent implements OnInit, AfterViewInit, AfterViewChecked {

  @ViewChild(DatatableComponent) table: DatatableComponent;

  rows: UiRow[] = [];
  tempData: UiRow[] = [];
  tableData: any[] = [];

  get filteredRows(): UiRow[] { return this.rows; }

  columns: TableColumn[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'itemName', header: 'Item Name', sortable: true },
    { key: 'fromWarehouseName', header: 'From Warehouse', sortable: true },
    { key: 'toWarehouseName', header: 'To Warehouse', sortable: true },
    { key: 'transferQtyNum', header: 'Qty', type: 'number', align: 'right' },
    { key: 'remarks', header: 'Reason' },
    { key: 'statusLabel', header: 'Status', type: 'badge', badgeMap: {
      'Transferred complete': 'success',
      'Out of delivery': 'warning',
      'Pending': 'warning'
    }}
  ];

  rowActions: RowAction[] = [
    { key: 'edit', label: 'Edit', btnClass: 'btn-outline-primary' }
  ];

  searchValue = '';
  ColumnMode = ColumnMode;
  selectedOption = 10;
  pageSize = 10;
  currentPage = 1;

  userId: number = 0;
  functionId = 'mr-list';

  permission: FunctionPermission;
  isPermissionLoaded = false;
  isPageLoading = false;

  constructor(
    private router: Router,
    private stockService: StackOverviewService,
    private permissionService: PermissionService
  ) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
  }

  get totalPages(): number {
    const pageSize = Number(this.selectedOption) || 10;
    return Math.max(1, Math.ceil(this.rows.length / pageSize));
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
    this.tableData = this.rows.slice(start, start + this.pageSize);
  }

  applyFilter(): void {
    const val = (this.searchValue ?? '').toString().toLowerCase().trim();
    if (!val) {
      this.rows = [...this.tempData];
    } else {
      const contains = (s?: any) => (s ?? '').toString().toLowerCase().includes(val);
      this.rows = this.tempData.filter(d =>
        contains(d.sku) || contains(d.itemName) || contains(d.fromWarehouseName) ||
        contains(d.toWarehouseName) || contains(d.remarks) || contains(d.statusLabel) || contains(d.transferQtyNum)
      );
    }
    this.currentPage = 1;
    this.applyPage();
  }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'edit' && this.canCreate()) {
      this.editTransfer(e.row);
    }
  }

  loadPermission(): void {
    if (!this.userId || this.userId <= 0) {
      this.permission = this.permissionService.getEmptyPermission(this.functionId);
      this.isPermissionLoaded = true;

      Swal.fire({
        icon: 'warning',
        title: 'Access Denied',
        text: 'User not found. Please login again.',
        confirmButtonColor: '#16a34a'
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
          this.loadList();
        } else {
          this.rows = [];
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
          confirmButtonColor: '#16a34a'
        });
      }
    });
  }

  canView(): boolean { return this.permissionService.hasView(this.permission); }
  canCreate(): boolean { return this.permissionService.hasCreate(this.permission); }
  canEdit(): boolean { return this.permissionService.hasEdit(this.permission); }
  canDelete(): boolean { return this.permissionService.hasDelete(this.permission); }

  ngAfterViewInit(): void { feather.replace(); }
  ngAfterViewChecked(): void { feather.replace(); }

  private toNum(v: any): number | undefined {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  private toNumOrNull(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private getErrorMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.message || fallback;
  }

  private statusLabel(n: number): string {
    if (n === 1) return 'Pending';
    if (n === 2) return 'Out of delivery';
    if (n === 3) return 'Transferred complete';
    return '—';
  }

  private toUiRow(api: any): UiRow {
    const stockIdNum = this.toNum(api.stockId ?? api.StockId);
    const itemIdNum  = this.toNum(api.itemId  ?? api.ItemId);

    const fromWarehouseIdNum = this.toNum(api.fromWarehouseId ?? api.FromWarehouseId ?? api.warehouseId ?? api.WarehouseId);
    const toWarehouseIdNum   = this.toNum(api.toWarehouseId   ?? api.ToWarehouseId);

    const statusNum = Number(api.status ?? api.Status ?? 0);
    const transferQtyNum = this.toNumOrNull(api.transferQty ?? api.TransferQty);

    return {
      ...api,
      stockIdNum,
      itemIdNum,
      fromWarehouseIdNum,
      toWarehouseIdNum,
      itemName: api.itemName ?? api.ItemName ?? api.name ?? api.Name ?? '',
      statusNum,
      statusLabel: this.statusLabel(statusNum),
      transferQtyNum
    };
  }

  loadList(): void {
    this.stockService.GetAllStockTransferedList().subscribe({
      next: (res: any) => {
        const list: any[] =
          (res?.isSuccess && Array.isArray(res.data)) ? res.data :
          (Array.isArray(res?.data) ? res.data :
          (Array.isArray(res) ? res : []));

        this.rows = list.map(r => this.toUiRow(r));
        this.tempData = [...this.rows];
        this.currentPage = 1;
        this.applyPage();
      },
      error: (err: any) => {
        this.rows = [];
        this.tempData = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load stock transfers'), 'error');
      }
    });
  }

  filterUpdate(event: any) {
    const val = (event?.target?.value ?? this.searchValue ?? '')
      .toString().toLowerCase().trim();

    if (!val) {
      this.rows = [...this.tempData];
      this.currentPage = 1;
      if (this.table) (this.table as any).offset = 0;
      return;
    }

    const contains = (s?: any) => (s ?? '').toString().toLowerCase().includes(val);

    this.rows = this.tempData.filter(d =>
      contains(d.sku) ||
      contains(d.itemName) ||
      contains(d.fromWarehouseName) ||
      contains(d.toWarehouseName) ||
      contains(d.remarks) ||
      contains(d.statusLabel) ||
      contains(d.transferQtyNum)
    );
    this.currentPage = 1;

    if (this.table) (this.table as any).offset = 0;
  }

  openCreate() {
    this.router.navigate(['/app/inventory/create-stocktransfer']);
  }

  editTransfer(row: UiRow) {
    if (Number(row.statusNum) !== 1) {
      Swal.fire({ icon: 'warning', title: 'Not Allowed', text: 'Edit only for Pending (Status = 1).', confirmButtonColor: '#16a34a' });
      return;
    }

    const stockId = row.stockIdNum ?? this.toNum(row.stockId);
    if (!stockId) {
      Swal.fire({ icon: 'warning', title: 'Missing stockId', text: 'Cannot edit without stockId.', confirmButtonColor: '#16a34a' });
      return;
    }

    this.router.navigate(['/app/inventory/create-stocktransfer'], {
      queryParams: { mode: 'edit', stockId },
      state: { editRow: row }
    });
  }
}
