import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

@Component({ selector: 'erp-warehouse', standalone: false, templateUrl: './warehouse.component.html', styleUrls: ['./warehouse.component.scss'] })
export class WarehouseComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  searchText = ''; pageSize = 10; sortField = ''; sortAsc = true;
  form = { name: '', code: '', phone: '', address: '', description: '' };

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

  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.masterSvc.getWarehouses().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load data.'; this.isError = true; } }); }
  applyFilter(): void {}
  sortBy(field: string): void { if (this.sortField === field) { this.sortAsc = !this.sortAsc; } else { this.sortField = field; this.sortAsc = true; } }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { name: '', code: '', phone: '', address: '', description: '' }; this.message = ''; }
  edit(item: any): void { this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id; this.form = { name: item.name || '', code: item.code || '', phone: item.phone || '', address: item.address || '', description: item.description || '' }; this.message = ''; }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { name: '', code: '', phone: '', address: '', description: '' }; }
  onSubmit(): void {
    if (!this.form.name?.trim()) { this.message = 'Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode ? this.masterSvc.updateWarehouse({ ...this.form, id: this.selectedId }) : this.masterSvc.createWarehouse(this.form);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated successfully.' : 'Created successfully.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed. Please try again.'; this.isError = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteWarehouse(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
