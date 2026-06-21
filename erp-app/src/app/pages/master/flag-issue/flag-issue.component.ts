import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

const blank = () => ({ flagIssuesNames: '' });

@Component({
  selector: 'erp-flag-issue',
  standalone: false,
  templateUrl: './flag-issue.component.html',
  styleUrls: ['./flag-issue.component.scss']
})
export class FlagIssueComponent implements OnInit {
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

  form = blank();

  constructor(private masterSvc: MasterService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.masterSvc.getFlagIssues().subscribe({
      next: (res: any) => { this.items = res?.data || res || []; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; }
    });
  }

  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = blank(); this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.selectedId = item.id;
    this.form = { flagIssuesNames: item.flagIssuesNames || item.flagIssueName || item.name || '' };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = blank(); }

  onSubmit(): void {
    if (!this.form.flagIssuesNames?.trim()) { this.message = 'Flag Issue Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode
      ? this.masterSvc.updateFlagIssue(this.selectedId, this.form)
      : this.masterSvc.createFlagIssue(this.form);
    obs.subscribe({
      next: (res: any) => { this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || (this.isEditMode ? 'Updated successfully.' : 'Created successfully.'); this.showResultPopup = true; if (res?.isSuccess !== false) { this.cancel(); this.load(); } },
      error: (err: any) => { this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Save failed. Please try again.'; this.showResultPopup = true; }
    });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteFlagIssue(this.itemToDelete.id).subscribe({
      next: (res: any) => { this.showDeleteModal = false; this.itemToDelete = null; this.popupIsSuccess = res?.isSuccess !== false; this.popupMessage = res?.message || 'Deleted successfully.'; this.showResultPopup = true; if (res?.isSuccess !== false) { this.load(); } },
      error: (err: any) => { this.showDeleteModal = false; this.popupIsSuccess = false; this.popupMessage = err?.error?.message || 'Delete failed. Please try again.'; this.showResultPopup = true; }
    });
  }
}
