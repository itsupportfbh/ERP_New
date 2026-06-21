import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

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

  salesBudgetLines: any[] = [];
  purchaseBudgetLines: any[] = [];

  form = blank();

  constructor(private masterSvc: MasterService) {}

  ngOnInit(): void {
    this.load();
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
      next: () => { this.message = this.isEditMode ? 'Updated successfully.' : 'Created successfully.'; this.isError = false; this.cancel(); this.load(); },
      error: () => { this.message = 'Save failed. Please try again.'; this.isError = true; }
    });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteCategory(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; }
    });
  }
}
