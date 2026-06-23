// stock-reorder-planning-list.component.ts
import {
  Component, OnInit, ViewChild, ViewEncapsulation, AfterViewInit, AfterViewChecked
} from '@angular/core';
import { Router } from '@angular/router';
import { ColumnMode, DatatableComponent } from '@swimlane/ngx-datatable';
import { DatePipe } from '@angular/common';
import * as feather from 'feather-icons';
import { ReorderPlanningService } from '../stock-reorder-planning.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import Swal from 'sweetalert2';
import { PeriodCloseService } from 'app/main/financial/period-close-fx/period-close-fx.service';
import { TableColumn, RowAction } from 'app/shared/components/data-table/data-table.component';

const METHOD_NAME: Record<number, string> = { 1: 'MinMax', 2: 'ROP', 3: 'MRP' };

type PreviewRow = {
  prNo: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  requestedQty: number;
  supplierId?: number | null;
  warehouseId?: number | null;
  location?: string | null;
  deliveryDate?: string | null;
  onHand: number;
  min: number;
  max: number;
  reorderQty: number;
  status:number;
};

@Component({
  standalone: false,
  selector: 'app-stock-reorder-planning-list',
  templateUrl: './stock-reorder-planning-list.component.html',
  styleUrls: ['./stock-reorder-planning-list.component.scss'],
  encapsulation: ViewEncapsulation.None,
  providers: [DatePipe]
})
export class StockReorderPlanningListComponent implements OnInit, AfterViewInit, AfterViewChecked {

  @ViewChild(DatatableComponent) table!: DatatableComponent;

  public ColumnMode = ColumnMode;
  public selectedOption = 10;
  public searchValue = '';

  rows: any[] = [];
  tempData: any[] = [];
  filteredRows: any[] = [];
  tableData: any[] = [];

  columns: TableColumn[] = [
    { key: 'warehouseName', header: 'Warehouse', sortable: true },
    { key: 'methodName', header: 'Method', sortable: true }
  ];

  rowActions: RowAction[] = [
    { key: 'view', label: 'View', btnClass: 'btn-outline-info' }
  ];

  pageSize = 10;
  currentPage = 1;

  userId: any

  // Modal
  showLinesModal = false;
  modalLines: PreviewRow[] = [];
  functionId = 'reorder-list';
    
  permission: FunctionPermission;
  isPermissionLoaded = false;
  isPageLoading = false;
 isPeriodLocked = false;
  periodName = '';
  constructor(
    private reorderPlanningService: ReorderPlanningService,
    private router: Router,
    private datePipe: DatePipe, private permissionService: PermissionService,private periodLock: PeriodCloseService
  ) {this.userId = localStorage.getItem('id');
    this.permission = this.permissionService.getEmptyPermission(this.functionId);}

  ngOnInit(): void { this.loadPermission(); this.checkPeriodLockForToday(); }
  ngAfterViewInit(): void { feather.replace(); }
  ngAfterViewChecked(): void { feather.replace(); }

  private N(v: any, d = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
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
              this.loadRequests();
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
            confirmButtonColor: '#16a34a'
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
  canExport(): boolean {
    return this.permissionService.hasExport(this.permission);
  }

  loadRequests(): void {
    this.reorderPlanningService.getStockReorder().subscribe({
      next: (res: any) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        this.rows = list.map((req: any) => ({
          ...req,
          warehouseName: req?.warehouseName ?? req?.warehouse ?? '-',
          methodName: METHOD_NAME[this.N(req?.methodId)] || '-',
        }));
        this.tempData = [...this.rows];
        this.filteredRows = [...this.rows];
        this.applyPage();
      },
      error: (err: any) => {
        this.rows = [];
        this.tempData = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load reorder planning list'), 'error');
      },
    });
  }

  filterUpdate(event: any): void {
    const val = (event?.target?.value ?? this.searchValue ?? '').toString().toLowerCase();
    const has = (s: any) => (s ?? '').toString().toLowerCase().includes(val);
    this.rows = this.tempData.filter(d => !val || has(d?.warehouseName) || has(d?.methodName));
    this.applyFilter();
  }

  applyFilter(): void {
    const q = (this.searchValue || '').toLowerCase().trim();
    if (!q) {
      this.filteredRows = [...this.rows];
    } else {
      const has = (s: any) => (s ?? '').toString().toLowerCase().includes(q);
      this.filteredRows = this.rows.filter(d => has(d?.warehouseName) || has(d?.methodName));
    }
    this.currentPage = 1;
    this.applyPage();
  }

  onPageChange(page: number): void { this.currentPage = page; this.applyPage(); }
  onPageSizeChange(size: number): void { this.pageSize = size; this.currentPage = 1; this.applyPage(); }

  applyPage(): void {
    const start = (this.currentPage - 1) * this.pageSize;
    this.tableData = this.filteredRows.slice(start, start + this.pageSize);
  }

  onAction(e: { action: string; row: any }): void {
    if (e.action === 'view') { this.openLinesModal(e.row); }
  }

  openCreate(): void {
    this.router.navigateByUrl('/app/inventory/create-stockreorderplanning');
  }

  editStockReorder(row: any): void {
    if (!row?.id) return;
    this.router.navigateByUrl(`/app/inventory/edit-stockreorderplanning/${row.id}`);
  }

 openLinesModal(row: any): void {
  const id = Number(row?.id ?? row?.Id);
  if (!Number.isFinite(id) || id <= 0) return;

  this.reorderPlanningService.getReorderPreview(id).subscribe({
    next: (res: any) => {
      // handle both {isSuccess,message,data:[...]} and {data:{...}}
      const payload = Array.isArray(res?.data) ? res.data
                    : Array.isArray(res?.data?.data) ? res.data.data
                    : [];

      const list: PreviewRow[] = payload.map((x: any) => ({
        prNo: String(x?.prNo ?? ''),
        itemId: this.N(x?.itemId),
        itemCode: String(x?.itemCode ?? ''),
        itemName: String(x?.itemName ?? ''),
        requestedQty: this.N(x?.requestedQty),
        supplierId: x?.supplierId ?? null,
        warehouseId: x?.warehouseId ?? null,
        location: String(x?.location ?? '-'),
        deliveryDate: x?.deliveryDate ? String(x.deliveryDate).substring(0, 10) : '-',
        onHand: this.N(x?.onHand),
        min: this.N(x?.minQty),
        max: this.N(x?.maxQty),
        reorderQty: this.N(x?.reorderQty),
        status: this.N(x?.status)
      }));

      this.modalLines = list;          // <-- two rows will show
      this.showLinesModal = true;
    },
    error: (err) => {
      this.modalLines = [];
      this.showLinesModal = false;
      Swal.fire('Error', this.getErrorMessage(err, 'Failed to load reorder preview'), 'error');
    }
  });
}

  closeLinesModal(): void { this.showLinesModal = false; }
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


