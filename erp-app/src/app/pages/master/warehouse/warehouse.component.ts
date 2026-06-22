import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

@Component({ selector: 'erp-warehouse', standalone: false, templateUrl: './warehouse.component.html', styleUrls: ['./warehouse.component.scss'] })
export class WarehouseComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';
  searchText = ''; pageSize = 10; sortField = ''; sortAsc = true;
  locations: any[] = []; bins: any[] = [];
  form = { name: '', code: '', phone: '', address: '', description: '', locationId: null as number | null, binIds: [] as number[] };

  get binOptions(): { label: string; value: any }[] {
    return this.bins.map(b => ({ label: b.binName || b.name || '', value: b.id }));
  }

  onLocationChange(): void {
    this.form.binIds = [];
  }

  get filteredItems(): any[] {
    let list = this.items;
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      list = list.filter(i => Object.values(i).join(' ').toLowerCase().includes(q));
    }
    if (this.sortField) {
      list = [...list].sort((a, b) => {
        const va = (a[this.sortField] || '').toString().toLowerCase();
        const vb = (b[this.sortField] || '').toString().toLowerCase();
        return this.sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }

  get pagedItems(): any[] { return this.filteredItems.slice(0, this.pageSize); }

  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'warehouse';

  constructor(private masterSvc: MasterService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }
  ngOnInit(): void {
    this.loadPermission();
    this.masterSvc.getLocations().subscribe({ next: (res: any) => { this.locations = (res?.data || res || []).filter((x: any) => x.isActive !== false); }, error: () => {} });
    this.masterSvc.getBins().subscribe({ next: (res: any) => { this.bins = res?.data || res || []; }, error: () => {} });
  }
  load(): void { this.loading = true; this.masterSvc.getWarehouses().subscribe({ next: (res: any) => { this.items = (res?.data || res || []).filter((x: any) => x.isActive !== false); this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load data.'; this.isError = true; } }); }
  applyFilter(): void {}
  sortBy(field: string): void { if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; } }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { name: '', code: '', phone: '', address: '', description: '', locationId: null, binIds: [] }; this.message = ''; }
  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const rawBinIds = item.binID || item.BinID || item.binIds || '';
    const parsedBinIds = Array.isArray(rawBinIds)
      ? rawBinIds.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x))
      : String(rawBinIds).split(',').map((x: string) => Number(x.trim())).filter((x: number) => Number.isFinite(x));
    this.form = {
      name: item.name || '',
      code: item.code || '',
      phone: item.phone || '',
      address: item.address || '',
      description: item.description || '',
      locationId: item.locationId ? Number(item.locationId) : null,
      binIds: parsedBinIds
    };
    this.message = '';
  }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { name: '', code: '', phone: '', address: '', description: '', locationId: null, binIds: [] }; }
  onSubmit(): void {
    if (!this.form.name?.trim()) { this.message = 'Name is required.'; this.isError = true; return; }
    if (!this.form.locationId) { this.message = 'Location is required.'; this.isError = true; return; }
    const payload = {
      id: this.selectedId,
      name: this.form.name.trim(),
      code: this.form.code?.trim() || '',
      phone: this.form.phone?.trim() || '',
      address: this.form.address?.trim() || null,
      description: this.form.description?.trim() || null,
      locationId: Number(this.form.locationId),
      BinID: this.form.binIds.map((x: number) => Number(x)).filter((x: number) => Number.isFinite(x)).join(',')
    };
    const obs = this.isEditMode ? this.masterSvc.updateWarehouse(payload) : this.masterSvc.createWarehouse(payload);
    obs.subscribe({ next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } }, error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteWarehouse(this.itemToDelete.id).subscribe({ next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } }, error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; } });
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
