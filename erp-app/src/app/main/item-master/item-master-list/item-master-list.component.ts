import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ItemMasterService } from '../item-master.service';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import { TableColumn, RowAction } from 'app/shared/components/data-table/data-table.component';

export interface ItemMaster {
  id: number;
  sku: string;
  itemCode?: string;
  itemName: string;
  catagoryName?: string;
  uomName?: string;
  wareHouse?: string; // matches your payload key
  // add other keys if your API returns them (e.g., bin, brand, etc.)
}
interface ListRow {
  id: number;
  sku?: string;
  itemCode?: string;
  name?: string;
  itemName?: string;
}
@Component({
  standalone: false,
  selector: 'app-item-master-list',
  templateUrl: './item-master-list.component.html',
  styleUrls: ['./item-master-list.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ItemMasterListComponent implements OnInit {
  ItemMasterList: any;
 rows: ItemMaster[] = [];
  filteredRows: ItemMaster[] = [];
  tableData: any[] = [];

  columns: TableColumn[] = [
    { key: 'itemCode', header: 'Item Code', sortable: true },
    { key: 'itemName', header: 'Item Name', sortable: true },
    { key: 'catagoryName', header: 'Category', sortable: true },
    { key: 'uomName', header: 'UOM', sortable: true }
  ];

  rowActions: RowAction[] = [];

  // paging + search
  pageSizes = [10, 25, 50, 100];
  pageSize = 10;
  currentPage = 1;
  searchValue = '';

    // ui state
  loading = false;
  errorMsg: string | null = null;
   currentItem: { id: number; sku: string; name: string } | null = null;
  activeTab: 'warehouse' | 'supplier' | 'audit' = 'warehouse';
  showViewModal = false;

  warehouseRows: any[] = [];
  supplierRows: any[] = [];
  auditRows: any[] = [];
  selectedAudit: any | null = null;
  userId: number = 0;
  functionId = 'im-list';
  userCompanyId: number = 0;

    permission: FunctionPermission;
    isPermissionLoaded = false;
    isPageLoading = false;
  constructor(private itemMasterService : ItemMasterService,
    private router: Router, private permissionService: PermissionService)
     {
       this.userId = Number(localStorage.getItem('id') || 0);
       this.userCompanyId = Number(localStorage.getItem('companyId') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
     }

  get isRootCompany(): boolean { return this.userCompanyId === 1; }

  ngOnInit(): void {
    this.rowActions = [
      { key: 'view', label: 'View', icon: 'view', btnClass: 'view-action' },
      ...(this.isRootCompany ? [
        { key: 'edit', label: 'Edit', icon: 'edit', btnClass: 'warning' } as RowAction,
        { key: 'delete', label: 'Delete', icon: 'delete', btnClass: 'danger' } as RowAction
      ] : [])
    ];
    this.loadPermission();
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
    if (e.action === 'view') { this.openLinesModal(e.row); }
    else if (e.action === 'edit') { if (this.canEdit()) this.editItem(e.row.id); }
    else if (e.action === 'delete') { if (this.canDelete()) this.deleteItem(e.row.id); }
  }

  private getErrorMessage(err: any, fallback: string): string {
    return err?.error?.message || err?.message || fallback;
  }


  loadMasterItem(): void {
    this.loading = true;
    this.errorMsg = null;

    this.itemMasterService.getAllItemMaster().subscribe({
      next: (res: any) => {
        // expecting: { isSuccess: true, data: [...] }
        const list: ItemMaster[] = Array.isArray(res?.data) ? res.data : [];
        this.rows = list;
        this.filteredRows = [...list]; // initial render
        this.currentPage = 1;
        this.applyPage();
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.rows = [];
        this.filteredRows = [];
        this.errorMsg = this.getErrorMessage(err, 'Failed to load Item Master list.');
        Swal.fire('Error', this.errorMsg, 'error');
      }
    });
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
            confirmButtonColor: '#16a34a'
          });
        }
      });
    }
  
    canView(): boolean {
      return this.permissionService.hasView(this.permission);
    }
  
    canCreate(): boolean {
      return this.isRootCompany && this.permissionService.hasCreate(this.permission);
    }

    canEdit(): boolean {
      return this.isRootCompany && this.permissionService.hasEdit(this.permission);
    }

    canDelete(): boolean {
      return this.isRootCompany && this.permissionService.hasDelete(this.permission);
    }
  /** Search filter across common fields */
  applyFilter(): void {
    const q = (this.searchValue || '').toLowerCase().trim();
    if (!q) {
      this.filteredRows = [...this.rows];
      this.currentPage = 1;
      return;
    }

    this.filteredRows = this.rows.filter(r => {
      const id = String(r.id ?? '').toLowerCase();
      const sku = String(r.sku ?? '').toLowerCase();
      const code = String(r.itemCode ?? '').toLowerCase();
      const name = String(r.itemName ?? '').toLowerCase();
      const cat = String(r.catagoryName ?? '').toLowerCase();
      const uom = String(r.uomName ?? '').toLowerCase();
      const wh  = String(r.wareHouse ?? '').toLowerCase();

      return (
        id.includes(q) ||
        sku.includes(q) ||
        code.includes(q) ||
        name.includes(q) ||
        cat.includes(q) ||
        uom.includes(q) ||
        wh.includes(q)
      );
    });
    this.currentPage = 1;
    this.applyPage();
  }

  /** Eye action */
  openView(row: ItemMaster): void {
    this.openLinesModal(row as any);
  }

  /** Edit action */
  editItem(id: number): void {
   this.router.navigateByUrl(`/app/inventory/Edit-itemmaster/${id}`);
  }

 
    goToCreateItem(): void {
    this.router.navigate(['/app/inventory/Create-itemmaster']);
  }
    openLinesModal(row: ListRow) {
    this.currentItem = {
      id: Number(row.id),
      sku: row.sku || row.itemCode || '',
      name: row.name || row.itemName || ''
    };
    this.activeTab = 'warehouse';
    this.showViewModal = true;
    this.loadWarehouse();
  }

  switchTab(tab: 'warehouse' | 'supplier' | 'audit') {
    if (!this.currentItem) return;
    this.activeTab = tab;
    if (tab === 'warehouse') this.loadWarehouse();
    if (tab === 'supplier') this.loadSupplier();
    if (tab === 'audit') this.loadAudit();
  }
 closeModal() {
    this.showViewModal = false;
  }
   loadWarehouse() {
    if (!this.currentItem) return;
    this.itemMasterService.getWarehouseStock(this.currentItem.id).subscribe({
      next: (rows:any) => {
        const data = Array.isArray(rows?.data) ? rows.data : (Array.isArray(rows) ? rows : []);
        this.warehouseRows = data.map((r: any) => ({
          ...r,
          available: r.available ?? (Number(r.onHand || 0) - Number(r.reserved || 0))
        }));
      },
      error: (err) => {
        this.warehouseRows = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load warehouse stock'), 'error');
      }
    });
  }

   loadSupplier() {
    if (!this.currentItem) return;
    this.itemMasterService.getSupplierPrices(this.currentItem.id).subscribe({
      next: (rows:any) => {
        this.supplierRows = Array.isArray(rows?.data) ? rows.data : (Array.isArray(rows) ? rows : []);
      },
      error: (err) => {
        this.supplierRows = [];
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load supplier prices'), 'error');
      }
    });
  }

   loadAudit() {
    if (!this.currentItem) return;
    this.itemMasterService.getAudit(this.currentItem.id).subscribe({
      next: (rows:any) => {
        this.auditRows = Array.isArray(rows?.data) ? rows.data : (Array.isArray(rows) ? rows : []);
        this.selectedAudit = null;
      },
      error: (err) => {
        this.auditRows = [];
        this.selectedAudit = null;
        Swal.fire('Error', this.getErrorMessage(err, 'Failed to load item audit'), 'error');
      }
    });
  }

  onAuditRowSelect(row: any) { this.selectedAudit = row; }




deleteItem(id: number) {
  if (!id) return;

  Swal.fire({
    title: 'Delete this item?',
    text: 'This action cannot be undone.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel',
    reverseButtons: true,
    buttonsStyling: false,         // we will fully style via didOpen
    didOpen: (el) => {
      // add spacing between buttons
      const actions = el.querySelector('.swal2-actions') as HTMLElement | null;
      if (actions) {
        actions.style.display = 'flex';
        actions.style.gap = '14px';
        actions.style.marginTop = '10px';
      }

      // style confirm button
      const confirmBtn = el.querySelector('.swal2-confirm') as HTMLButtonElement | null;
      if (confirmBtn) {
        confirmBtn.style.background = '#dc2626';
        confirmBtn.style.color = '#fff';
        confirmBtn.style.border = 'none';
        confirmBtn.style.borderRadius = '10px';
        confirmBtn.style.padding = '10px 16px';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.fontWeight = '600';
      }

      // style cancel button
      const cancelBtn = el.querySelector('.swal2-cancel') as HTMLButtonElement | null;
      if (cancelBtn) {
        cancelBtn.style.background = '#6b7280';
        cancelBtn.style.color = '#fff';
        cancelBtn.style.border = 'none';
        cancelBtn.style.borderRadius = '10px';
        cancelBtn.style.padding = '10px 16px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontWeight = '600';
      }
    }
  }).then(result => {
    if (!result.isConfirmed) return;

    Swal.fire({
      title: 'Deleting…',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.itemMasterService.deleteItemMaster(id).subscribe({
      next: (res) => {
        Swal.close();
        Swal.fire({
          icon: 'success',
          title: 'Deleted',
          text: (res?.message) || 'Item deleted successfully.',
          timer: 1200,
          showConfirmButton: false
        });
        this.loadMasterItem();
      },
      error: (err) => {
        Swal.close();
        let msg = this.getErrorMessage(err, 'Failed to delete the item.');
        if (err?.status === 409) msg = 'Cannot delete: item is referenced by other records.';
        else if (err?.status === 404) msg = 'Item not found (maybe already deleted).';

        Swal.fire({ icon: 'error', title: 'Error', text: msg });
      }
    });
  });
}


}

