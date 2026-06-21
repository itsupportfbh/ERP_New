import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

@Component({ selector: 'erp-service', standalone: false, templateUrl: './service.component.html', styleUrls: ['./service.component.scss'] })
export class ServiceComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';
  form: { serviceName: string; description: string; tax: number | null; charges: number | null } = { serviceName: '', description: '', tax: null, charges: null };
  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.masterSvc.getServices().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { serviceName: '', description: '', tax: null, charges: null }; this.message = ''; }
  edit(item: any): void { this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id; this.form = { serviceName: item.serviceName || '', description: item.description || '', tax: item.tax ?? null, charges: item.charges ?? null }; this.message = ''; }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { serviceName: '', description: '', tax: null, charges: null }; }
  onSubmit(): void {
    if (!this.form.serviceName?.trim()) { this.message = 'Service Name is required.'; this.isError = true; return; }
    const payload = {
      Name: this.form.serviceName.trim(),
      Description: this.form.description?.trim() || '',
      Tax: Number(this.form.tax || 0),
      Charge: Number(this.form.charges || 0)
    };
    const obs = this.isEditMode ? this.masterSvc.updateService(this.selectedId, payload) : this.masterSvc.createService(payload);
    obs.subscribe({ next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } }, error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteService(this.itemToDelete.id).subscribe({ next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } }, error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; } });
  }
}
