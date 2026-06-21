import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

const blank = () => ({ setName: '', selectedItemIds: [] as number[] });

@Component({ selector: 'erp-item-set', standalone: false, templateUrl: './item-set.component.html', styleUrls: ['./item-set.component.scss'] })
export class ItemSetComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;

  itemOptions: { value: any; label: string }[] = [];
  form = blank();

  constructor(private masterSvc: MasterService) {}

  ngOnInit(): void {
    this.load();
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
    this.form = { setName: item.setName || item.name || '', selectedItemIds: ids };
    this.message = '';
  }

  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = blank(); }

  onSubmit(): void {
    if (!this.form.setName?.trim()) { this.message = 'Set Name is required.'; this.isError = true; return; }
    const userId = Number(localStorage.getItem('id') || 0);
    const payload = {
      setName: this.form.setName,
      createdBy: userId,
      updatedBy: userId,
      isActive: true,
      items: this.form.selectedItemIds.map((id: number) => ({ itemId: id }))
    };
    const obs = this.isEditMode ? this.masterSvc.updateItemSet(this.selectedId, payload) : this.masterSvc.createItemSet(payload);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }

  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteItemSet(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
