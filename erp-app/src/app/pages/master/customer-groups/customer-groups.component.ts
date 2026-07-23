import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

const initialFormState = {
  name: '', description: '',
  discountPct: null as number | null,
  defaultPaymentTermId: null as number | null,
  defaultCreditAmount: null as number | null,
};

@Component({
  selector: 'erp-customer-groups',
  standalone: false,
  templateUrl: './customer-groups.component.html',
  styleUrls: ['./customer-groups.component.scss']
})
export class CustomerGroupsComponent implements OnInit {
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

  form = { ...initialFormState };
  paymentTermOptions: any[] = [];
  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'customergroups';

  constructor(private masterSvc: MasterService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
    this.masterSvc.getPaymentTerms().subscribe((r: any) => this.paymentTermOptions = r?.data || r || []);
  }

  load(): void {
    this.loading = true;
    this.masterSvc.getCustomerGroups().subscribe({
      next: (res: any) => { this.items = res?.data || res || []; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Failed to load data.'; this.isError = true; }
    });
  }

  showForm(): void {
    this.isFormVisible = true;
    this.isEditMode = false;
    this.form = { ...initialFormState };
    this.message = '';
  }

  edit(item: any): void {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.selectedId = item.id;
    this.form = {
      name: item.name || '', description: item.description || '',
      discountPct: item.discountPct ?? null,
      defaultPaymentTermId: item.defaultPaymentTermId ?? null,
      defaultCreditAmount: item.defaultCreditAmount ?? null,
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }

  clearForm(): void { this.form = { ...initialFormState }; }

  onSubmit(): void {
    if (!this.form.name?.trim()) { this.message = 'Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode
      ? this.masterSvc.updateCustomerGroup(this.selectedId, this.form)
      : this.masterSvc.createCustomerGroup(this.form);
    obs.subscribe({
      next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } },
      error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; }
    });
  }

  openDelete(item: any): void {
    this.itemToDelete = item;
    this.showDeleteModal = true;
  }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteCustomerGroup(this.itemToDelete.id).subscribe({
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
