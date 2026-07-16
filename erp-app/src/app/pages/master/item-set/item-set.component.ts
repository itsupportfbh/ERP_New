import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';
import { UploadService } from 'app/shared/upload.service';

const blank = () => ({ setName: '', salesBudgetLineId: null as number | null, price: null as number | null, imageUrl: '', selectedItemIds: [] as number[] });

@Component({ selector: 'erp-item-set', standalone: false, templateUrl: './item-set.component.html', styleUrls: ['./item-set.component.scss'] })
export class ItemSetComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';

  itemOptions: { value: any; label: string }[] = [];
  budgetLines: any[] = [];
  form = blank();
  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'itemSet';

  uploadingImage = false;

  constructor(
    private masterSvc: MasterService,
    private permissionService: PermissionService,
    private uploadService: UploadService
  ) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  // ── Package image ────────────────────────────────────────────────────────────
  // Uploaded the moment it is picked; only the returned URL goes into the JSON payload below.
  imageSrc(url: string | null | undefined): string {
    return this.uploadService.toSrc(url);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const problem = this.uploadService.validate(file);
    if (problem) {
      this.message = problem;
      this.isError = true;
      input.value = '';
      return;
    }

    this.uploadingImage = true;
    this.uploadService.upload(file, 'itemsets').subscribe({
      next: url => {
        this.form.imageUrl = url;
        this.uploadingImage = false;
        input.value = '';   // so re-picking the same file fires 'change' again
      },
      error: () => {
        this.uploadingImage = false;
        input.value = '';
        this.message = 'The image could not be uploaded. Please try again.';
        this.isError = true;
      }
    });
  }

  removeImage(): void {
    this.form.imageUrl = '';
  }

  ngOnInit(): void {
    this.loadPermission();
    this.masterSvc.getChartOfAccounts().subscribe({
      next: (res: any) => {
        const list = res?.data || res || [];
        this.budgetLines = list.map((x: any) => ({ id: Number(x.headCode), label: `${x.headCode} - ${x.headName}` }));
      },
      error: () => {}
    });
    this.masterSvc.getItemMaster().subscribe({
      next: (res: any) => {
        const list = res?.data || res || [];
        this.itemOptions = list.map((x: any) => ({ value: x.id, label: x.itemName || x.name || String(x.id) }));
      },
      error: () => {}
    });
  }

  load(): void {
    this.loading = true;
    this.masterSvc.getItemSets().subscribe({
      next: (res: any) => { this.items = res?.data || res || []; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; }
    });
  }

  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = blank(); this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const ids = (item.items || item.itemSetItems || []).map((x: any) => Number(x.itemId || x.id));
    this.form = { setName: item.setName || item.name || '', salesBudgetLineId: item.salesParentHeadCode ?? item.salesBudgetLineId ?? null, price: item.price ?? null, imageUrl: item.imageUrl || '', selectedItemIds: ids };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = blank(); }

  onSubmit(): void {
    if (!this.form.setName?.trim()) { this.message = 'Set Name is required.'; this.isError = true; return; }
    const userId = Number(localStorage.getItem('id') || 0);
    const payload = {
      setName: this.form.setName,
      salesParentHeadCode: this.form.salesBudgetLineId,
      price: this.form.price,
      imageUrl: this.form.imageUrl || null,
      createdBy: userId,
      updatedBy: userId,
      isActive: true,
      items: this.form.selectedItemIds.map((id: number) => ({ itemId: id }))
    };
    const obs = this.isEditMode ? this.masterSvc.updateItemSet(this.selectedId, payload) : this.masterSvc.createItemSet(payload);
    obs.subscribe({ next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } }, error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; } });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteItemSet(this.itemToDelete.id).subscribe({ next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } }, error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; } });
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
