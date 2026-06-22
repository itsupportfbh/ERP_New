import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';
import { FunctionPermission, PermissionService } from 'app/shared/permission.service';

@Component({ selector: 'erp-cities', standalone: false, templateUrl: './cities.component.html', styleUrls: ['./cities.component.scss'] })
export class CitiesComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';
  countries: any[] = [];
  allStates: any[] = [];
  filteredStates: any[] = [];
  form: { cityName: string; countryId: any; stateId: any } = { cityName: '', countryId: null, stateId: null };
  permission: FunctionPermission;
  isPermissionLoaded = false;
  userId: number = 0;
  functionId = 'cities';

  constructor(private masterSvc: MasterService, private permissionService: PermissionService) {
    this.userId = Number(localStorage.getItem('id') || 0);
    this.permission = this.permissionService.getEmptyPermission(this.functionId);
  }

  ngOnInit(): void {
    this.loadPermission();
    this.masterSvc.getCountries().subscribe({ next: (res: any) => { this.countries = res?.data || res || []; }, error: () => {} });
    this.masterSvc.getStates().subscribe({ next: (res: any) => { this.allStates = res?.data || res || []; }, error: () => {} });
  }
  onCountryChange(countryId: any): void {
    this.filteredStates = this.allStates.filter(s => s.countryId === countryId);
    this.form.stateId = null;
  }
  load(): void { this.loading = true; this.masterSvc.getCities().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { cityName: '', countryId: null, stateId: null }; this.filteredStates = []; this.message = ''; }
  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const cid = item.countryId || null;
    this.filteredStates = cid ? this.allStates.filter(s => s.countryId === cid) : [];
    this.form = { cityName: item.cityName || '', countryId: cid, stateId: item.stateId || null };
    this.message = '';
  }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { cityName: '', countryId: null, stateId: null }; this.filteredStates = []; }
  onSubmit(): void {
    if (!this.form.cityName?.trim()) { this.message = 'City Name is required.'; this.isError = true; return; }
    const payload: any = { cityName: this.form.cityName, countryId: this.form.countryId, stateId: this.form.stateId };
    const obs = this.isEditMode ? this.masterSvc.updateCity(this.selectedId, payload) : this.masterSvc.createCity(payload);
    obs.subscribe({ next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } }, error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteCity(this.itemToDelete.id).subscribe({ next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } }, error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; } });
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
