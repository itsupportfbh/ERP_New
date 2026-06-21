import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

const initialFormState = { itemTypeName: '', description: '' };

@Component({
  selector: 'erp-item-type',
  standalone: false,
  templateUrl: './item-type.component.html',
  styleUrls: ['./item-type.component.scss']
})
export class ItemTypeComponent implements OnInit {
  items: any[] = [];
  loading = false;
  isFormVisible = false;
  isEditMode = false;
  selectedId: any = null;
  message = '';
  isError = false;
  showDeleteModal = false;
  itemToDelete: any = null;

  form = { ...initialFormState };

  constructor(private masterSvc: MasterService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.masterSvc.getItemTypes().subscribe({
      next: (res: any) => { this.items = res?.data || res || []; this.loading = false; },
      error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; }
    });
  }

  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { ...initialFormState }; this.message = ''; }

  edit(item: any): void {
    this.isFormVisible = true;
    this.isEditMode = true;
    this.selectedId = item.id;
    this.form = { itemTypeName: item.itemTypeName || item.name || '', description: item.description || '' };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }

  clearForm(): void { this.form = { ...initialFormState }; }

  onSubmit(): void {
    if (!this.form.itemTypeName?.trim()) { this.message = 'Item Type Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode ? this.masterSvc.updateItemType(this.selectedId, this.form) : this.masterSvc.createItemType(this.form);
    obs.subscribe({
      next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); },
      error: () => { this.message = 'Save failed.'; this.isError = true; }
    });
  }

  openDelete(item: any): void {
    this.itemToDelete = item;
    this.showDeleteModal = true;
  }

  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteItemType(this.itemToDelete.id).subscribe({
      next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); },
      error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; }
    });
  }
}
