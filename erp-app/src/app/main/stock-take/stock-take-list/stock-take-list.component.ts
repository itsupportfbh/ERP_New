import { Component, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { ColumnMode, DatatableComponent } from '@swimlane/ngx-datatable';
import { DatePipe } from '@angular/common';
import * as feather from 'feather-icons';
import { StockTakeService } from '../stock-take.service'
import { ItemMasterService } from '../../item-master/item-master.service';
import { BinService } from '../../../master/bin/bin.service'
import { StockIssueService } from 'app/main/master/stock-issue/stock-issue.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import { PeriodCloseService } from 'app/main/financial/period-close-fx/period-close-fx.service';
import { TableColumn, RowAction } from 'app/shared/components/data-table/data-table.component';

@Component({
  standalone: false,
  selector: 'app-stock-take-list',
  templateUrl: './stock-take-list.component.html',
  styleUrls: ['./stock-take-list.component.scss'],
  encapsulation: ViewEncapsulation.None,
  providers: [DatePipe]
})
export class StockTakeListComponent implements OnInit {

  @ViewChild(DatatableComponent) table: DatatableComponent;
  @ViewChild('tableRowDetails') tableRowDetails: any;
  @ViewChild('SweetAlertFadeIn') SweetAlertFadeIn: any;
  colors = ['bg-light-primary', 'bg-light-success', 'bg-light-danger', 'bg-light-warning', 'bg-light-info'];
  rows: any[] = [];
  tempData: any[] = [];
  filteredRows: any[] = [];
  tableData: any[] = [];

  columns: TableColumn[] = [
    { key: 'stockTakeDate', header: 'Date', type: 'date', sortable: true },
    { key: 'warehouseName', header: 'Warehouse', sortable: true },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    { key: 'strategyName', header: 'Type', sortable: true },
    { key: 'statusLabel', header: 'Status', type: 'badge', badgeMap: {
      'Draft': 'default', 'Approved': 'success', 'Posted': 'success'
    }}
  ];

  rowActions: RowAction[] = [
    { key: 'view', label: 'View', icon: 'view', btnClass: 'btn-outline-info' },
    { key: 'edit', label: 'Edit', icon: 'edit', btnClass: 'btn-outline-primary' },
    { key: 'delete', label: 'Delete', icon: 'delete', btnClass: 'btn-outline-danger' },
    { key: 'post', label: 'Post', icon: 'post', btnClass: 'btn-outline-success' }
  ];

  /** Per-row action visibility: Post only for Approved; hide Edit/Delete once Posted. */
  rowActionFilter = (action: string, row: any): boolean => {
    // Posting writes the inventory and its GL entry, so it needs Post permission —
    // an Inventory Executive may record a stock take but not post it.
    if (action === 'post') return row?.status === 2 && this.canPost();
    if (action === 'edit' || action === 'delete') return row?.status !== 3;
    return true;
  };

  public searchValue = '';
  public ColumnMode = ColumnMode;
  public selectedOption = 10;
  pageSize = 10;
  currentPage = 1;
  hover = false;
  passData: any;
  showLinesModal = false;
  modalLines: any[] = [];
  userId: any;
  modalTotal: any;
  itemList: any;
  takeTypes = [
    { id: 1, label: 'Full', },
    { id: 2, label: 'Cycle', }
  ];


  takeTypeMap: Record<number, string> = {};
  binList: any;
  reasonList: any

  functionId = 'stocktake-list';
  
  permission: FunctionPermission;
  isPermissionLoaded = false;
  isPageLoading = false;
 isPeriodLocked = false;
  periodName = '';
  constructor(private stockTakeService: StockTakeService, private router: Router,private StockissueService: StockIssueService,
    private datePipe: DatePipe, private itemMasterService: ItemMasterService,private BinService: BinService,
    private permissionService: PermissionService, private periodLock: PeriodCloseService
  ) { this.userId = localStorage.getItem('id');
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
   }
  ngOnInit(): void {
    this.loadPermission();
    this.checkPeriodLockForToday();
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
            this.loadLookups();
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

  private loadLookups(): void {
    this.itemMasterService.getAllItemMaster().subscribe({
      next: (res: any) => this.itemList = res?.data || res || [],
      error: (err) => {
        this.itemList = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load items'), 'error');
      }
    });
    this.BinService.getAllBin().subscribe({
      next: (res: any) => this.binList = res?.data || res || [],
      error: (err) => {
        this.binList = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load bins'), 'error');
      }
    });
    this.StockissueService.getAllStockissue().subscribe({
      next: (res: any) => this.reasonList = res?.data || res || [],
      error: (err) => {
        this.reasonList = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load stock take reasons'), 'error');
      }
    });
  }

  /**
   * Header supplier is blank when the stock take covers "ALL" suppliers (supplierId = 0);
   * in that case the actual supplier(s) live on the line items.
   */
  private deriveSupplierFromLines(req: any): string {
    const names = Array.from(
      new Set((req?.lineItems || []).map((l: any) => l?.supplierName).filter((n: any) => !!n))
    ) as string[];
    if (names.length === 1) return names[0];
    if (names.length > 1) return 'Multiple';
    return '';
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
  canPost(): boolean {
    return this.permissionService.hasPost(this.permission);
  }
  filterUpdate(event: any) {
    const val = (event?.target?.value ?? this.searchValue ?? '').toString().toLowerCase();
    this.rows = !val ? [...this.tempData] : this.tempData.filter((d) => {
      const wh = (d.warehouseName ?? '').toLowerCase();
      const tt = (d.takeTypeLabel ?? d.strategyName ?? '').toLowerCase();
      const sup = (d.supplierName ?? '').toLowerCase();
      return wh.includes(val) || tt.includes(val) || sup.includes(val);
    });
    this.applyFilter();
  }

  applyFilter(): void {
    const q = (this.searchValue || '').toLowerCase().trim();
    if (!q) {
      this.filteredRows = [...this.rows];
    } else {
      this.filteredRows = this.rows.filter(d => {
        const wh = (d.warehouseName ?? '').toLowerCase();
        const tt = (d.takeTypeLabel ?? d.strategyName ?? '').toLowerCase();
        const sup = (d.supplierName ?? '').toLowerCase();
        return wh.includes(q) || tt.includes(q) || sup.includes(q);
      });
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
    else if (e.action === 'edit') { if (this.canEdit() && e.row.status !== 3) this.editStockTake(e.row); }
    else if (e.action === 'delete') { if (this.canDelete() && e.row.status !== 3) this.deleteStockTake(e.row.id); }
    else if (e.action === 'post') { if (this.canPost()) this.post(e.row); }
  }


  loadRequests() {
    for (const t of this.takeTypes) {
      this.takeTypeMap[t.id] = t.label;
    }
    this.stockTakeService.getStockTake().subscribe({
      next: (res: any) => {
        this.rows = res.data.map((req: any) => {
          return {
            ...req,
            supplierName: req.supplierId ? (req.supplierName || this.deriveSupplierFromLines(req) || 'ALL') : 'ALL',
            strategyName: req.strategyId ? (req.strategyName || 'ALL') : 'ALL',
            statusLabel: req.status === 1 ? 'Draft' : req.status === 2 ? 'Approved' : 'Posted'
          };
        });
        this.tempData = [...this.rows];
        this.filteredRows = [...this.rows];
        this.applyPage();
      },
      error: (err: any) => {
        this.rows = [];
        this.tempData = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load stock takes'), 'error');
      }
    });
  }


  editStockTake(row: any) {
    this.router.navigateByUrl(`/app/inventory/edit-stocktake/${row.id}`)
  }

  deleteStockTake(id: number) {
    Swal.fire({
      title: 'Are you sure?',
      text: 'This will permanently delete the Stock Take.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#dc2626',
      confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
      if (result.isConfirmed) {
        this.stockTakeService.deleteStockTake(id, this.userId).subscribe({
          next: () => {
            this.loadRequests();
            Swal.fire({ icon: 'success', title: 'Deleted!', text: 'Stock Take has been deleted.', confirmButtonColor: '#16a34a' });
          },
          error: (err) => {
            Swal.fire('Error', this.getErrorMessage(err, 'Failed to delete stock take'), 'error');
          }
        });
      }
    });
  }

  openCreate() {
    this.passData = {};
    this.router.navigateByUrl('/app/inventory/create-stocktake');
  }
  openLinesModal(row: any) {
    // 1) get array safely
    const raw = Array.isArray(row?.lineItems) ? row.lineItems : JSON.parse(row?.lineItems || '[]');

    // 2) normalize to numbers + safe strings
    const N = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;
    const lines = raw.map((l: any) => ({
      barcode: (l?.barcode ?? '-') as string,
      binId: (l?.binId),
      itemId: (l?.itemId),
      supplierId: l?.supplierId,
      supplierName: l?.supplierName ?? row?.supplierName ?? 'ALL',

      itemName: l?.itemName ?? l?.name ?? this.getItemName(l?.itemId),
      onHand: N(l?.onHand ?? l?.available),
      baseUomName: l?.baseUomName ?? '',
      countedQty: N(l?.countedQty),
      badCountedQty:N(l?.badCountedQty),
      totalQty: N(l?.countedQty)+N(l?.badCountedQty), 
      variance: (l.countedQty + l.badCountedQty) - N(l.onHand),  
      reasonId: (l?.reasonId ?? '-') as string ,
      remarks: (l?.remarks ?? '-') as string
    }));

    // 3) compute totals
    this.modalTotal = {
      available: lines.reduce((s, x) => s + x.onHand, 0),
      counted: lines.reduce((s, x) => s + x.countedQty, 0),
      variance: lines.reduce((s, x) => s + x.variance, 0)
    };

    this.modalLines = lines;
    this.showLinesModal = true;
  }
  getBinName(id: number | string | null) {
    const x = this.binList?.find(i => i.id === id);
    return x?.binName ?? String(id ?? '');
  }

  getItemName(id: number | string | null) {
    const x = this.itemList?.find(i => Number(i.id) === Number(id));
    return x?.itemName ?? x?.name ?? String(id ?? '');
  }

  closeLinesModal() {
    this.showLinesModal = false;
  }

  ngAfterViewChecked(): void {
    feather.replace();  // remove the guard so icons refresh every cycle
  }
  ngAfterViewInit(): void {
    feather.replace();
  }
  private getLinesArray(row: any): any[] {
    if (Array.isArray(row?.lineItems)) return row.lineItems;
    try { return JSON.parse(row?.lineItems || '[]'); } catch { return []; }
  }

  private hasAnySelected(row: any): boolean {
    const lines = this.getLinesArray(row);
    return lines.some(l => !!l.selected);
  }

  post(row: any) {
    // Only allow when Approved (2). API also guards this.
    if (row.status !== 2) {
      Swal.fire({ icon: 'info', title: 'Not allowed', text: 'Only Approved stock takes can be posted.' });
      return;
    }
    if (!this.hasAnySelected(row)) {
      Swal.fire({
        icon: 'warning',
        title: 'No lines selected',
        text: 'Select at least one line in the Stock Review before posting.'
      });
      return;
    }

    Swal.fire({
      title: 'Post inventory?',
      text: 'This will create inventory adjustments and set OnHand.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      confirmButtonText: 'Yes, Post'
    }).then((r) => {
      if (!r.isConfirmed) return;

      row._posting = true;
      this.stockTakeService.postInventory(row.id, {
        reason : row.reason,
        remarks: row.remarks,
        applyToStock: true,
        markPosted: true,
        txnDate: null,
        onlySelected: true,  // post only rows where Selected=1
      }).subscribe({
        next: (res: any) => {
          row._posting = false;
          if (res?.isSuccess) {
            Swal.fire({ icon: 'success', title: 'Posted', text: res.message || 'Inventory posted.' });
            // reflect Posted state
            row.status = 3;
            row.statusLabel = 'Posted';
            this.applyFilter(); // rebuild tableData so the grid reflects Posted state
          } else {
            Swal.fire({ icon: 'error', title: 'Failed', text: res?.message || 'Post failed.' });
          }
        },
        error: (err) => {
          row._posting = false;
          const msg = err?.error?.message || 'Unable to post.';
          Swal.fire({ icon: 'error', title: 'Error', text: msg });
        }
      });
    });
  }
   getReason(id: number | string | null) {
    const x = this.reasonList?.find(i => i.id === id);
    return x?.stockIssuesNames ?? String(id ?? '');
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










