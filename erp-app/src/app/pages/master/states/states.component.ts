import { Component, OnInit } from '@angular/core';
import { MasterService } from '../../../core/services/master.service';

@Component({ selector: 'erp-states', standalone: false, templateUrl: './states.component.html', styleUrls: ['./states.component.scss'] })
export class StatesComponent implements OnInit {
  items: any[] = []; loading = false; isFormVisible = false; isEditMode = false; selectedId: any = null; message = ''; isError = false;
  showDeleteModal = false; itemToDelete: any = null;
  countries: any[] = [];
  form: { stateName: string; countryId: any } = { stateName: '', countryId: null };
  constructor(private masterSvc: MasterService) {}
  ngOnInit(): void {
    this.load();
    this.masterSvc.getCountries().subscribe({ next: (res: any) => { this.countries = res?.data || res || []; }, error: () => {} });
  }
  load(): void { this.loading = true; this.masterSvc.getStates().subscribe({ next: (res: any) => { this.items = res?.data || res || []; this.loading = false; }, error: () => { this.loading = false; this.message = 'Failed to load.'; this.isError = true; } }); }
  showForm(): void { this.isFormVisible = true; this.isEditMode = false; this.form = { stateName: '', countryId: null }; this.message = ''; }
  edit(item: any): void {
    this.isFormVisible = true; this.isEditMode = true; this.selectedId = item.id;
    const country = this.countries.find(c => (c.countryName || c.name) === item.countryName);
    this.form = { stateName: item.stateName || '', countryId: item.countryId || (country ? country.id : null) };
    this.message = '';
  }
  cancel(): void { this.isFormVisible = false; this.message = ''; }
  clearForm(): void { this.form = { stateName: '', countryId: null }; }
  onSubmit(): void {
    if (!this.form.stateName?.trim()) { this.message = 'State Name is required.'; this.isError = true; return; }
    const payload: any = { stateName: this.form.stateName, countryId: this.form.countryId };
    const obs = this.isEditMode ? this.masterSvc.updateState(this.selectedId, payload) : this.masterSvc.createState(payload);
    obs.subscribe({ next: () => { this.message = this.isEditMode ? 'Updated.' : 'Created.'; this.isError = false; this.cancel(); this.load(); }, error: () => { this.message = 'Save failed.'; this.isError = true; } });
  }
  openDelete(item: any): void { this.itemToDelete = item; this.showDeleteModal = true; }
  confirmDelete(): void {
    if (!this.itemToDelete) return;
    this.masterSvc.deleteState(this.itemToDelete.id).subscribe({ next: () => { this.showDeleteModal = false; this.itemToDelete = null; this.load(); }, error: () => { this.message = 'Delete failed.'; this.isError = true; this.showDeleteModal = false; } });
  }
}
