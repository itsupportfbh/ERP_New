import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

@Component({ selector: 'erp-recurring', standalone: false, templateUrl: './recurring.component.html', styleUrls: ['./recurring.component.scss'] })
export class RecurringComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  showResultPopup = false; popupIsSuccess = false; popupMessage = '';
  form = { recurringName: '' };
  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.masterSvc.getRecurring().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { recurringName: '' }; this.message = ''; }
  edit(item: any): void { this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id; this.form = { recurringName: item.recurringName || item.name || '' }; this.message = ''; }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { recurringName: '' }; }
  onSubmit(): void {
    if (!this.form.recurringName?.trim()) { this.message = 'Recurring Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode ? this.masterSvc.updateRecurring({ ...this.form, id: this.selectedId }) : this.masterSvc.createRecurring(this.form);
    obs.subscribe({ next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } }, error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteRecurring(this.itemToDelete.id).subscribe({ next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } }, error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; } });
  }
}
