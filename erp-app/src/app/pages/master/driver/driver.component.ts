import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

const blank = () => ({ driverName: '', mobileNumber: '', licenseNumber: '', licenseExpiryDate: '', nricOrId: '' });

@Component({ selector: 'erp-driver', standalone: false, templateUrl: './driver.component.html', styleUrls: ['./driver.component.scss'] })
export class DriverComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  form = blank();

  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void { this.load(); }

  load(): void { this.loading = true; this.masterSvc.getDrivers().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }

  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = blank(); this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    this.form = {
      driverName: item.driverName || item.firstName || '',
      mobileNumber: item.mobileNumber || item.contactNumber || item.mobile || '',
      licenseNumber: item.licenseNumber || item.licenseNo || '',
      licenseExpiryDate: item.licenseExpiryDate ? item.licenseExpiryDate.substring(0, 10) : '',
      nricOrId: item.nricOrId || ''
    };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = blank(); }

  onSubmit(): void {
    if (!this.form.driverName?.trim()) { this.message = 'Driver Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode ? this.masterSvc.updateDriver(this.selectedId, this.form) : this.masterSvc.createDriver(this.form);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteDriver(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
