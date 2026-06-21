import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

@Component({ selector: 'erp-taxcode', standalone: false, templateUrl: './taxcode.component.html', styleUrls: ['./taxcode.component.scss'] })
export class TaxcodeComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  form: { name: string; description: string; type: string; rate: number | null } = { name: '', description: '', type: '', rate: null };
  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.masterSvc.getTaxCodes().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { name: '', description: '', type: '', rate: null }; this.message = ''; }
  edit(item: any): void { this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id; this.form = { name: item.name || item.taxCode || '', description: item.description || '', type: item.type || item.taxType || '', rate: item.rate ?? null }; this.message = ''; }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { name: '', description: '', type: '', rate: null }; }
  onSubmit(): void {
    if (!this.form.name?.trim()) { this.message = 'Name is required.'; this.isError = true; return; }
    const obs = this.isEditMode ? this.masterSvc.updateTaxCode({ ...this.form, id: this.selectedId }) : this.masterSvc.createTaxCode(this.form);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteTaxCode(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
