import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

const blank = () => ({ catagoryName: '', itemCategoryType: null as number | null, salesParentHeadCode: null as number | null, purchaseParentHeadCode: null as number | null });

@Component({
  selector: 'erp-category',
  standalone: false,
  templateUrl: './category.component.html',
  styleUrls: ['./category.component.scss']
})
export class CategoryComponent implements OnInit {
  items: any[] = [];
  loading = false;
  isFormVisible = false;
  isEditMode = false;
  selectedId: any = null;
  message = '';
  isError = false;
  showDeleteModal = false;
  itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';

  salesBudgetLines: any[] = [];
  purchaseBudgetLines: any[] = [];

  form = blank();
  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'catagory';

  constructor(private masterSvc: MasterService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
    this.loadCoaBudgetLines();
  }

  loadCoaBudgetLines(): void {
    this.masterSvc.getChartOfAccounts().subscribe({
      next: (res: any) => {
        const all = (res?.data || res || []).filter((x: any) => x.isActive !== false);

        const buildPath = (item: any): string => {
          let path = item.headName;
          let cur = all.find((x: any) => Number(x.headCode) === Number(item.parentHead));
          while (cur) { path = `${cur.headName} >> ${path}`; cur = all.find((x: any) => Number(x.headCode) === Number(cur.parentHead)); }
          return path;
        };

        this.salesBudgetLines = all
          .filter((x: any) => String(x.headCode).startsWith('4'))
          .map((x: any) => ({ headCode: Number(x.headCode), label: `${x.headCode} - ${buildPath(x)}` }));

        this.purchaseBudgetLines = all
          .filter((x: any) => String(x.headCode).startsWith('5'))
          .map((x: any) => ({ headCode: Number(x.headCode), label: `${x.headCode} - ${buildPath(x)}` }));
      },
      error: () => {}
    });
  }

  load(): void {
    this.loading = true;
    this.masterSvc.getCategories().subscribe({
      next: (res: any) => { this.items = res?.data || res || []; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Failed to load data.'; this.isError = true; }
    });
  }

  showForm(): void {
    this.isFormVisible = true;
    this.isEditMode = false;
    this.form = blank();
    this.message = '';
  }

  edit(item: any): void {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.selectedId = item.id;
    this.form = {
      catagoryName: item.catagoryName || item.categoryName || item.name || '',
      itemCategoryType: item.itemCategoryType ? Number(item.itemCategoryType) : null,
      salesParentHeadCode: item.salesParentHeadCode ? Number(item.salesParentHeadCode) : null,
      purchaseParentHeadCode: item.purchaseParentHeadCode ? Number(item.purchaseParentHeadCode) : null
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }

  clearForm(): void { this.form = blank(); }

  get showSales(): boolean { return this.form.itemCategoryType === 1 || this.form.itemCategoryType === 3; }
  get showPurchase(): boolean { return this.form.itemCategoryType === 2 || this.form.itemCategoryType === 3; }

  onSubmit(): void {
    if (!this.form.catagoryName?.trim()) { this.message = 'Category Name is required.'; this.isError = true; return; }
    if (!this.form.itemCategoryType) { this.message = 'Item Category Type is required.'; this.isError = true; return; }

    const userId = Number(localStorage.getItem('id') || 0);
    const payload = {
      catagoryName: this.form.catagoryName,
      itemCategoryType: Number(this.form.itemCategoryType),
      salesParentHeadCode: this.showSales ? this.form.salesParentHeadCode : null,
      purchaseParentHeadCode: this.showPurchase ? this.form.purchaseParentHeadCode : null,
      createdBy: userId,
      updatedBy: userId,
      isActive: true
    };

    const obs = this.isEditMode
      ? this.masterSvc.updateCategory(this.selectedId, payload)
      : this.masterSvc.createCategory(payload);

    obs.subscribe({
      next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } },
      error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; }
    });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteCategory(this.itemToDelete.id).subscribe({
      next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } },
      error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; }
    });
  }

  loadPermission(): void {
    if (!this.userId || this.userId <= 0) {
      this.permission = this.permissionService.getEmptyPermission(this.functionId);
      this.isPermissionLoaded = true;
      return;
    }
    this.permissionService.getFunctionPermission(this.userId, this.functionId).subscribe({
      next: (res: FunctionPermission) => {
        this.permission = res || this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.load();
      },
      error: () => {
        this.permission = this.permissionService.getEmptyPermission(this.functionId);
        this.isPermissionLoaded = true;
        this.load();
      }
    });
  }
  canCreate(): boolean { return this.permissionService.hasCreate(this.permission); }
  canEdit(): boolean { return this.permissionService.hasEdit(this.permission); }
  canDelete(): boolean { return this.permissionService.hasDelete(this.permission); }
}
